import { appendEvent, nowIso } from './state.js';

export const BLOCKER_STATUS = {
  READY: 'ready',
  RETRYABLE: 'deferred_retryable',
  PROBEABLE: 'deferred_probeable',
  MANUAL: 'deferred_manual',
  CANCELLED: 'dead_or_cancelled'
};

export function createDeferredTask({
  title,
  type = 'unknown',
  scope = 'task',
  provider = 'local',
  evidence = '',
  blockedCapability = null,
  retryAt = null,
  retryAfterSeconds = null,
  requiresUserAction = false,
  attempts = 0,
  maxAttempts = 5,
  now = new Date()
}) {
  if (!title || !title.trim()) {
    throw new Error('deferred task title is required');
  }

  const resolvedRetryAt = resolveRetryAt({ retryAt, retryAfterSeconds, now });
  const retryable = Boolean(resolvedRetryAt) && !requiresUserAction;
  const status = requiresUserAction
    ? BLOCKER_STATUS.MANUAL
    : retryable
      ? BLOCKER_STATUS.RETRYABLE
      : BLOCKER_STATUS.PROBEABLE;

  return {
    id: stableId(title, now),
    title: title.trim(),
    status,
    blockedCapability,
    blocker: {
      type,
      scope,
      provider,
      evidence,
      retryAt: resolvedRetryAt,
      retryStrategy: retryable ? 'respect_retry_at_then_exponential_backoff' : 'manual_or_probe',
      attempts,
      maxAttempts
    },
    resumePolicy: {
      safeToProbe: status === BLOCKER_STATUS.PROBEABLE,
      requiresUserAction
    },
    createdAt: nowIso(now),
    updatedAt: nowIso(now)
  };
}

export function deferTask(state, task) {
  state.queues.deferred.push(task);
  appendEvent(state, 'task_deferred', {
    taskId: task.id,
    title: task.title,
    status: task.status,
    blockerType: task.blocker.type
  });
  return task;
}

export function classifyStopFailure(input, { now = new Date() } = {}) {
  const error = input?.error ?? 'unknown';
  const details = input?.error_details ?? input?.last_assistant_message ?? '';
  const title = `Host failure: ${error}`;

  switch (error) {
    case 'rate_limit':
      return createDeferredTask({
        title,
        type: 'rate_limit',
        scope: 'global',
        provider: 'agent_host',
        evidence: details,
        retryAfterSeconds: parseRetryAfter(details) ?? 60,
        now
      });
    case 'server_error':
      return createDeferredTask({
        title,
        type: 'server_error',
        scope: 'global',
        provider: 'agent_host',
        evidence: details,
        retryAfterSeconds: parseRetryAfter(details) ?? 120,
        now
      });
    case 'authentication_failed':
    case 'oauth_org_not_allowed':
    case 'billing_error':
      return createDeferredTask({
        title,
        type: error,
        scope: 'global',
        provider: 'agent_host',
        evidence: details,
        requiresUserAction: true,
        now
      });
    case 'max_output_tokens':
      return createDeferredTask({
        title,
        type: 'max_output_tokens',
        scope: 'task',
        provider: 'agent_host',
        evidence: details,
        retryAfterSeconds: 0,
        now
      });
    default:
      return createDeferredTask({
        title,
        type: error,
        scope: 'global',
        provider: 'agent_host',
        evidence: details,
        requiresUserAction: true,
        now
      });
  }
}

export function recoverRetryableDeferred(state, { now = new Date() } = {}) {
  const nowMs = now.getTime();
  const remaining = [];
  const recovered = [];

  for (const task of state.queues.deferred) {
    if (task.status !== BLOCKER_STATUS.RETRYABLE) {
      remaining.push(task);
      continue;
    }

    const retryAt = task.blocker?.retryAt ? Date.parse(task.blocker.retryAt) : NaN;
    if (Number.isFinite(retryAt) && retryAt <= nowMs) {
      const readyTask = {
        id: task.id,
        title: task.title,
        fromDeferred: true,
        recoveredAt: nowIso(now),
        previousBlocker: task.blocker
      };
      recovered.push(readyTask);
      continue;
    }

    remaining.push(task);
  }

  if (recovered.length > 0) {
    state.queues.deferred = remaining;
    state.queues.ready.push(...recovered);
    appendEvent(state, 'retryable_tasks_recovered', {
      count: recovered.length,
      taskIds: recovered.map((task) => task.id)
    }, { now });
  }

  return recovered;
}

export function resolveRetryAt({ retryAt, retryAfterSeconds, now = new Date() }) {
  if (retryAt) {
    const parsed = new Date(retryAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`invalid retryAt value: ${retryAt}`);
    }
    return parsed.toISOString();
  }

  if (retryAfterSeconds !== null && retryAfterSeconds !== undefined) {
    const seconds = Number(retryAfterSeconds);
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error(`invalid retryAfterSeconds value: ${retryAfterSeconds}`);
    }
    return new Date(now.getTime() + seconds * 1000).toISOString();
  }

  return null;
}

export function parseRetryAfter(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const retryAfter = text.match(/retry-after[:= ]+(\d+)/i);
  if (retryAfter) {
    return Number(retryAfter[1]);
  }

  const reset = text.match(/x-ratelimit-reset[:= ]+(\d+)/i);
  if (reset) {
    const resetMs = Number(reset[1]) * 1000;
    const delta = Math.ceil((resetMs - Date.now()) / 1000);
    return Math.max(delta, 0);
  }

  return null;
}

function stableId(title, now) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'task';
  return `${slug}-${now.getTime().toString(36)}`;
}

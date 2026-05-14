import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const STATE_VERSION = 1;

export function defaultStatePath(cwd = process.cwd()) {
  return path.join(cwd, '.agent-loop', 'state.json');
}

export function nowIso(now = new Date()) {
  return now.toISOString();
}

export function createInitialState({
  objective,
  cwd = process.cwd(),
  budgets = {},
  now = new Date()
}) {
  if (!objective || !objective.trim()) {
    throw new Error('loop objective is required');
  }

  const timestamp = nowIso(now);
  return {
    version: STATE_VERSION,
    active: true,
    objective: objective.trim(),
    cwd,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastContinuationAt: null,
    completedAt: null,
    terminal: null,
    budgets: {
      maxContinuations: numberOrDefault(budgets.maxContinuations, 20),
      maxWallMinutes: numberOrDefault(budgets.maxWallMinutes, 240),
      maxNoProgressRepeats: numberOrDefault(budgets.maxNoProgressRepeats, 2)
    },
    counters: {
      continuations: 0,
      noProgressRepeats: 0
    },
    currentTask: null,
    queues: {
      ready: [],
      deferred: [],
      done: []
    },
    evidence: {
      lastProgressAt: null,
      items: []
    },
    events: [
      {
        type: 'loop_started',
        at: timestamp,
        objective: objective.trim()
      }
    ]
  };
}

export async function loadState(statePath) {
  try {
    const raw = await readFile(statePath, 'utf8');
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function saveState(statePath, state) {
  const normalized = normalizeState(state);
  normalized.updatedAt = nowIso();
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export function normalizeState(state) {
  if (!state || typeof state !== 'object') {
    throw new Error('invalid loop state');
  }

  return {
    version: state.version ?? STATE_VERSION,
    active: Boolean(state.active),
    objective: state.objective ?? '',
    cwd: state.cwd ?? process.cwd(),
    createdAt: state.createdAt ?? nowIso(),
    updatedAt: state.updatedAt ?? nowIso(),
    lastContinuationAt: state.lastContinuationAt ?? null,
    completedAt: state.completedAt ?? null,
    terminal: state.terminal ?? null,
    budgets: {
      maxContinuations: numberOrDefault(state.budgets?.maxContinuations, 20),
      maxWallMinutes: numberOrDefault(state.budgets?.maxWallMinutes, 240),
      maxNoProgressRepeats: numberOrDefault(state.budgets?.maxNoProgressRepeats, 2)
    },
    counters: {
      continuations: numberOrDefault(state.counters?.continuations, 0),
      noProgressRepeats: numberOrDefault(state.counters?.noProgressRepeats, 0)
    },
    currentTask: state.currentTask ?? null,
    queues: {
      ready: Array.isArray(state.queues?.ready) ? state.queues.ready : [],
      deferred: Array.isArray(state.queues?.deferred) ? state.queues.deferred : [],
      done: Array.isArray(state.queues?.done) ? state.queues.done : []
    },
    evidence: {
      lastProgressAt: state.evidence?.lastProgressAt ?? null,
      items: Array.isArray(state.evidence?.items) ? state.evidence.items : []
    },
    events: Array.isArray(state.events) ? state.events : []
  };
}

export function recordProgress(state, summary, { now = new Date(), artifact = null } = {}) {
  if (!summary || !summary.trim()) {
    throw new Error('progress summary is required');
  }
  const item = {
    at: nowIso(now),
    summary: summary.trim(),
    artifact
  };
  state.evidence.items.push(item);
  state.evidence.items = state.evidence.items.slice(-50);
  state.evidence.lastProgressAt = item.at;
  state.counters.noProgressRepeats = 0;
  appendEvent(state, 'progress_recorded', item);
  return item;
}

export function completeLoop(state, reason = 'completed', { now = new Date() } = {}) {
  const timestamp = nowIso(now);
  state.active = false;
  state.completedAt = timestamp;
  state.terminal = {
    type: 'completed',
    reason,
    at: timestamp
  };
  appendEvent(state, 'loop_completed', state.terminal);
  return state.terminal;
}

export function stopLoop(state, reason = 'stopped', { now = new Date() } = {}) {
  const timestamp = nowIso(now);
  state.active = false;
  state.terminal = {
    type: 'stopped',
    reason,
    at: timestamp
  };
  appendEvent(state, 'loop_stopped', state.terminal);
  return state.terminal;
}

export function appendEvent(state, type, data = {}, { now = new Date() } = {}) {
  state.events.push({
    type,
    at: nowIso(now),
    ...data
  });
  state.events = state.events.slice(-100);
}

export function summarizeState(state, {
  statePath = null,
  deferredOnly = false,
  now = new Date()
} = {}) {
  if (!state) {
    return 'No loop state found.';
  }

  if (deferredOnly) {
    return formatFollowUpReport(state, { statePath, now });
  }

  const lines = [
    'Loop Surfers Status',
    '===================',
    `State: ${state.active ? 'active' : 'inactive'}`,
    `Objective: ${state.objective || '(none)'}`,
    statePath ? `State file: ${statePath}` : null,
    '',
    'Budget',
    '------',
    `Continuations: ${state.counters.continuations}/${state.budgets.maxContinuations}`,
    `No-progress repeats: ${state.counters.noProgressRepeats}/${state.budgets.maxNoProgressRepeats}`,
    `Wall-clock: ${formatElapsedBudget(state, now)}`,
    '',
    'Queues',
    '------',
    `Ready to retry: ${state.queues.ready.length}`,
    `Deferred: ${state.queues.deferred.length}`,
    `Done: ${state.queues.done.length}`,
    `Last progress: ${state.evidence.lastProgressAt ?? '(none)'}`
  ];

  if (state.terminal) {
    lines.push('', 'Terminal', '--------', `${state.terminal.type}: ${state.terminal.reason}`);
  }

  lines.push('', formatFollowUpReport(state, { statePath: null, now }));

  const progress = formatRecentProgress(state);
  if (progress) {
    lines.push('', progress);
  }

  return lines.filter((line) => line !== null).join('\n');
}

function formatFollowUpReport(state, { statePath = null, now = new Date() } = {}) {
  const lines = [
    'Follow-up Needed',
    '----------------'
  ];

  if (statePath) {
    lines.push(`State file: ${statePath}`, '');
  }

  const ready = state.queues.ready ?? [];
  const deferred = state.queues.deferred ?? [];

  if (ready.length === 0 && deferred.length === 0) {
    lines.push('No ready or deferred work is currently recorded.');
    return lines.join('\n');
  }

  if (ready.length > 0) {
    lines.push('Ready to retry now:');
    for (const [index, task] of ready.entries()) {
      lines.push(...formatReadyTask(task, index));
    }
  }

  if (deferred.length > 0) {
    if (ready.length > 0) {
      lines.push('');
    }
    lines.push('Deferred work:');
    for (const [index, task] of deferred.entries()) {
      lines.push(...formatDeferredTask(task, index, now));
    }
  }

  return lines.join('\n');
}

function formatReadyTask(task, index) {
  const blocker = task.previousBlocker ?? {};
  return [
    `${index + 1}. ${task.title}`,
    `   Status: ready`,
    `   Why it was blocked: ${formatBlockerLabel(blocker)}`,
    `   Next action: Retry this task now. If it still fails, defer it again with fresh evidence.`,
    task.recoveredAt ? `   Recovered at: ${task.recoveredAt}` : null
  ].filter(Boolean);
}

function formatDeferredTask(task, index, now) {
  const blocker = task.blocker ?? {};
  return [
    `${index + 1}. ${task.title}`,
    `   Status: ${formatDeferredStatus(task, now)}`,
    `   Why blocked: ${formatBlockerLabel(blocker)}`,
    `   Evidence: ${formatEvidence(blocker.evidence)}`,
    task.blockedCapability ? `   Blocked capability: ${task.blockedCapability}` : null,
    blocker.retryAt ? `   Retry after: ${blocker.retryAt} (${formatRetryWindow(blocker.retryAt, now)})` : null,
    `   Next action: ${formatNextAction(task, now)}`
  ].filter(Boolean);
}

function formatDeferredStatus(task, now) {
  if (task.resumePolicy?.requiresUserAction) {
    return `${task.status} - needs user action`;
  }

  const retryAt = task.blocker?.retryAt;
  if (retryAt) {
    const retryAtMs = Date.parse(retryAt);
    if (Number.isFinite(retryAtMs) && retryAtMs <= now.getTime()) {
      return `${task.status} - retry window is open`;
    }
  }

  if (task.resumePolicy?.safeToProbe) {
    return `${task.status} - safe to probe carefully`;
  }

  return task.status;
}

function formatBlockerLabel(blocker = {}) {
  const type = blocker.type ?? 'unknown';
  const provider = blocker.provider ?? 'unknown provider';
  const scope = blocker.scope ?? 'unknown scope';
  return `${type} from ${provider} (${scope})`;
}

function formatEvidence(evidence) {
  if (!evidence || !String(evidence).trim()) {
    return '(none recorded)';
  }
  return truncate(String(evidence).replace(/\s+/g, ' ').trim(), 220);
}

function formatNextAction(task, now) {
  if (task.resumePolicy?.requiresUserAction) {
    return 'A user or maintainer must resolve the blocker, then rerun or manually retry the task.';
  }

  const retryAt = task.blocker?.retryAt;
  if (retryAt) {
    const retryAtMs = Date.parse(retryAt);
    if (Number.isFinite(retryAtMs) && retryAtMs > now.getTime()) {
      return 'Wait until the retry time, then let the loop recover it into the ready queue.';
    }
    return 'Retry now. If the blocker repeats, defer it again with updated evidence and retry metadata.';
  }

  if (task.resumePolicy?.safeToProbe) {
    return 'Probe carefully when a safe opportunity appears, and record progress or fresh blocker evidence.';
  }

  return 'Review the evidence and decide whether this task is safe to retry.';
}

function formatRetryWindow(retryAt, now) {
  const retryAtMs = Date.parse(retryAt);
  if (!Number.isFinite(retryAtMs)) {
    return 'invalid retry time';
  }
  const deltaMs = retryAtMs - now.getTime();
  if (deltaMs <= 0) {
    return 'ready now';
  }
  return `in ${formatDuration(deltaMs)}`;
}

function formatElapsedBudget(state, now) {
  const createdAt = Date.parse(state.createdAt);
  if (!Number.isFinite(createdAt)) {
    return `unknown/${state.budgets.maxWallMinutes}m`;
  }
  return `${formatDuration(now.getTime() - createdAt)}/${state.budgets.maxWallMinutes}m`;
}

function formatRecentProgress(state) {
  const items = state.evidence.items.slice(-3);
  if (items.length === 0) {
    return '';
  }

  return [
    'Recent Progress',
    '---------------',
    ...items.map((item, index) => `${index + 1}. ${item.summary} (${item.at})`)
  ].join('\n');
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function numberOrDefault(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

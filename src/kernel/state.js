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

export function summarizeState(state) {
  if (!state) {
    return 'No loop state found.';
  }

  const lines = [
    `active: ${state.active}`,
    `objective: ${state.objective || '(none)'}`,
    `continuations: ${state.counters.continuations}/${state.budgets.maxContinuations}`,
    `no_progress_repeats: ${state.counters.noProgressRepeats}/${state.budgets.maxNoProgressRepeats}`,
    `ready: ${state.queues.ready.length}`,
    `deferred: ${state.queues.deferred.length}`,
    `done: ${state.queues.done.length}`,
    `last_progress_at: ${state.evidence.lastProgressAt ?? '(none)'}`
  ];

  if (state.terminal) {
    lines.push(`terminal: ${state.terminal.type} - ${state.terminal.reason}`);
  }

  return lines.join('\n');
}

function numberOrDefault(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

import { recoverRetryableDeferred } from './blockers.js';
import { appendEvent, nowIso, stopLoop } from './state.js';
import { buildContinuationPrompt } from './prompts.js';

export function evaluateStop(state, input = {}, { now = new Date(), statePath = null } = {}) {
  if (!state || !state.active) {
    return {
      shouldContinue: false,
      reason: null,
      state,
      stopReason: 'loop is not active'
    };
  }

  const recovered = recoverRetryableDeferred(state, { now });
  const budgetStop = checkBudget(state, now);
  if (budgetStop) {
    stopLoop(state, budgetStop, { now });
    return {
      shouldContinue: false,
      reason: null,
      state,
      stopReason: budgetStop
    };
  }

  updateNoProgressCounter(state, now);
  if (state.counters.noProgressRepeats > state.budgets.maxNoProgressRepeats) {
    const reason = 'stopped: no progress evidence recorded across repeated continuations';
    stopLoop(state, reason, { now });
    return {
      shouldContinue: false,
      reason: null,
      state,
      stopReason: reason
    };
  }

  state.counters.continuations += 1;
  state.lastContinuationAt = nowIso(now);
  appendEvent(state, 'continuation_requested', {
    turnId: input.turn_id ?? null,
    stopHookActive: Boolean(input.stop_hook_active)
  }, { now });

  return {
    shouldContinue: true,
    reason: buildContinuationPrompt(state, { statePath, recovered }),
    state,
    stopReason: null
  };
}

export function formatStopHookOutput(result) {
  if (!result?.shouldContinue) {
    return '';
  }

  return `${JSON.stringify({
    decision: 'block',
    reason: result.reason
  })}\n`;
}

function checkBudget(state, now) {
  if (state.counters.continuations >= state.budgets.maxContinuations) {
    return `stopped: max continuation budget reached (${state.budgets.maxContinuations})`;
  }

  const started = Date.parse(state.createdAt);
  if (Number.isFinite(started)) {
    const elapsedMinutes = (now.getTime() - started) / 60000;
    if (elapsedMinutes > state.budgets.maxWallMinutes) {
      return `stopped: max wall-clock budget reached (${state.budgets.maxWallMinutes} minutes)`;
    }
  }

  return null;
}

function updateNoProgressCounter(state, now) {
  if (!state.lastContinuationAt) {
    return;
  }

  const lastContinuation = Date.parse(state.lastContinuationAt);
  const lastProgress = state.evidence.lastProgressAt ? Date.parse(state.evidence.lastProgressAt) : NaN;
  if (!Number.isFinite(lastProgress) || lastProgress <= lastContinuation) {
    state.counters.noProgressRepeats += 1;
    appendEvent(state, 'no_progress_repeat', {
      count: state.counters.noProgressRepeats
    }, { now });
    return;
  }

  state.counters.noProgressRepeats = 0;
}

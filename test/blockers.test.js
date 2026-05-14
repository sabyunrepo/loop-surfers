import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyStopFailure, createDeferredTask, recoverRetryableDeferred } from '../src/kernel/blockers.js';
import { createInitialState } from '../src/kernel/state.js';

test('rate limit StopFailure becomes retryable deferred task', () => {
  const now = new Date('2026-05-14T00:00:00.000Z');
  const task = classifyStopFailure({
    error: 'rate_limit',
    error_details: '429 Too Many Requests retry-after: 120'
  }, { now });

  assert.equal(task.status, 'deferred_retryable');
  assert.equal(task.blocker.type, 'rate_limit');
  assert.equal(task.blocker.retryAt, '2026-05-14T00:02:00.000Z');
});

test('billing StopFailure becomes manual deferred task', () => {
  const task = classifyStopFailure({
    error: 'billing_error',
    error_details: 'billing required'
  }, { now: new Date('2026-05-14T00:00:00.000Z') });

  assert.equal(task.status, 'deferred_manual');
  assert.equal(task.resumePolicy.requiresUserAction, true);
});

test('retryable deferred task moves to ready after retry_at', () => {
  const state = createInitialState({
    objective: 'test objective',
    now: new Date('2026-05-14T00:00:00.000Z')
  });
  state.queues.deferred.push(createDeferredTask({
    title: 'retry api call',
    type: 'rate_limit',
    retryAfterSeconds: 10,
    now: new Date('2026-05-14T00:00:00.000Z')
  }));

  const recovered = recoverRetryableDeferred(state, {
    now: new Date('2026-05-14T00:00:10.000Z')
  });

  assert.equal(recovered.length, 1);
  assert.equal(state.queues.ready.length, 1);
  assert.equal(state.queues.deferred.length, 0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateStop, formatStopHookOutput } from '../src/kernel/scheduler.js';
import { createInitialState, recordProgress } from '../src/kernel/state.js';

test('inactive or missing state allows stop', () => {
  const result = evaluateStop(null, {}, {});
  assert.equal(result.shouldContinue, false);
  assert.equal(formatStopHookOutput(result), '');
});

test('active state returns continuation hook output', () => {
  const state = createInitialState({
    objective: 'keep working',
    now: new Date('2026-05-14T00:00:00.000Z')
  });
  const result = evaluateStop(state, { turn_id: 't1' }, {
    now: new Date('2026-05-14T00:00:01.000Z'),
    statePath: '/tmp/state.json'
  });

  assert.equal(result.shouldContinue, true);
  assert.equal(state.counters.continuations, 1);
  assert.match(formatStopHookOutput(result), /"decision":"block"/);
  assert.match(result.reason, /Objective: keep working/);
});

test('no-progress budget stops repeated continuation', () => {
  const state = createInitialState({
    objective: 'keep working',
    budgets: { maxNoProgressRepeats: 0 },
    now: new Date('2026-05-14T00:00:00.000Z')
  });
  evaluateStop(state, {}, {
    now: new Date('2026-05-14T00:00:01.000Z'),
    statePath: '/tmp/state.json'
  });
  const result = evaluateStop(state, {}, {
    now: new Date('2026-05-14T00:00:02.000Z'),
    statePath: '/tmp/state.json'
  });

  assert.equal(result.shouldContinue, false);
  assert.equal(state.active, false);
  assert.match(result.stopReason, /no progress/);
});

test('progress evidence resets no-progress counter', () => {
  const state = createInitialState({
    objective: 'keep working',
    budgets: { maxNoProgressRepeats: 1 },
    now: new Date('2026-05-14T00:00:00.000Z')
  });
  evaluateStop(state, {}, {
    now: new Date('2026-05-14T00:00:01.000Z'),
    statePath: '/tmp/state.json'
  });
  recordProgress(state, 'made progress', {
    now: new Date('2026-05-14T00:00:02.000Z')
  });
  const result = evaluateStop(state, {}, {
    now: new Date('2026-05-14T00:00:03.000Z'),
    statePath: '/tmp/state.json'
  });

  assert.equal(result.shouldContinue, true);
  assert.equal(state.counters.noProgressRepeats, 0);
});

export function buildContinuationPrompt(state, { statePath, recovered = [] } = {}) {
  const readyLines = state.queues.ready
    .slice(0, 5)
    .map((task, index) => `${index + 1}. ${task.title}`)
    .join('\n');

  const deferredLines = state.queues.deferred
    .slice(0, 8)
    .map((task, index) => {
      const retry = task.blocker?.retryAt ? ` retry_at=${task.blocker.retryAt}` : '';
      return `${index + 1}. ${task.title} [${task.status}/${task.blocker?.type ?? 'unknown'}]${retry}`;
    })
    .join('\n');

  const recoveredLines = recovered
    .map((task, index) => `${index + 1}. ${task.title}`)
    .join('\n');

  return [
    'Agent Loop Kit is active. Continue the original objective without asking for a new instruction.',
    '',
    `Objective: ${state.objective}`,
    `State file: ${statePath}`,
    `Continuation budget: ${state.counters.continuations}/${state.budgets.maxContinuations}`,
    '',
    'Safety rules:',
    '- Do not revive or override a user interrupt, /loop-stop, or explicit stop request.',
    '- Do not bypass authentication, billing, permission, sandbox, or repository policy blockers.',
    '- If a task is blocked, record it with `agent-loop defer` and move to another safe task if one exists.',
    '- If you make meaningful progress, record evidence with `agent-loop progress "<what changed>"`.',
    '- If all useful work is done or only manual blockers remain, run `agent-loop complete --reason "<summary>"`.',
    '',
    recoveredLines ? `Recovered retryable tasks:\n${recoveredLines}\n` : '',
    readyLines ? `Ready queue:\n${readyLines}\n` : '',
    deferredLines ? `Deferred queue:\n${deferredLines}\n` : 'Deferred queue: empty\n',
    'Before acting, choose the next safe task and state why it is not blocked.'
  ].filter(Boolean).join('\n');
}

export function buildUserPromptContext(state, statePath) {
  if (!state?.active) {
    return '';
  }

  return [
    'Agent Loop Kit loop state is active for this workspace.',
    `Objective: ${state.objective}`,
    `State file: ${statePath}`,
    'Use `agent-loop progress`, `agent-loop defer`, or `agent-loop complete` to keep the loop state accurate.'
  ].join('\n');
}

# Agent Loop Kit Design

## Goal

Create a distributable project that lets Codex and Claude Code continue an
agentic task across Stop hook boundaries while respecting safety budgets,
explicit user stops, permission boundaries, and retryable blockers.

## Non-Goals

- No built-in workflow packs in the kernel.
- No automatic bypass of authentication, billing, permission, sandbox, or repo
  policy failures.
- No forced recovery from user interrupt or `/loop-stop`.
- No merge/deploy automation without project policy supplied by the user.

## Architecture

Agent Loop Kit has four layers:

1. Kernel: state, progress evidence, deferred queue, budget, scheduler.
2. Host templates: Claude Code and Codex hook wrappers plus slash commands.
3. Policies: user- or repo-authored instructions that constrain capabilities.
4. Examples: optional recipes that demonstrate common objectives without being
   core workflow types.

The Stop hook reads `.agent-loop/state.json`, recovers retryable deferred tasks
whose `retry_at` has passed, checks budgets and progress evidence, then returns
`decision: "block"` only when continuation is still safe.

## State Model

The state file stores:

- `objective`: original user directive.
- `budgets`: continuation count, wall-clock minutes, no-progress repeats.
- `queues.ready`: tasks that can be retried now.
- `queues.deferred`: blocked tasks with blocker metadata.
- `evidence`: recent progress records.
- `terminal`: stop or completion reason.

Deferred tasks use one of these statuses:

- `deferred_retryable`: retry after a known time.
- `deferred_probeable`: safe read-only probe may determine readiness.
- `deferred_manual`: user or maintainer action is required.
- `dead_or_cancelled`: no automatic recovery.

## Hook Behavior

`Stop`:

- Allows stop when no active loop exists.
- Recovers retryable deferred tasks whose retry time has passed.
- Stops when continuation or wall-clock budget is exhausted.
- Stops when repeated continuations produce no progress evidence.
- Otherwise returns a continuation prompt.

`StopFailure`:

- Records host API failures into the deferred queue.
- Rate limits and server errors become retryable.
- Authentication, organization, and billing failures become manual blockers.
- Does not attempt to continue immediately because host APIs do not provide
  decision control for failure hooks.

`UserPromptSubmit`:

- Adds lightweight context when a loop is active.
- Does not activate workflows by itself.

## Safety Rules

- User interruption wins.
- Manual blockers are never retried automatically.
- Retryable blockers must respect `retry_at`.
- Repeated no-progress continuations stop the loop.
- The continuation prompt instructs the agent to record progress, defer
  blockers, and complete the loop when only manual work remains.

## Distribution

The package is dependency-free Node.js ESM with a single `agent-loop` binary.
It can be installed globally, linked from source, or vendored into a project.
The `agent-loop install` command copies host templates into a target project but
does not silently merge active hook settings; users review the generated example
files first.

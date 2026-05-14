# Agent Loop Kit

Safe continuation loop kernel for Codex and Claude Code hooks.

Agent Loop Kit is not a workflow-pack framework. It does not ship built-in
domain workflows such as "GitHub issues", "QA", or "repo maintenance" as core
state machines. Instead, it provides a small continuation kernel:

- `/loop-start` stores the original objective and safety budget.
- Stop hooks decide whether the agent may continue.
- Retryable blockers move into a deferred queue with `retry_at` metadata.
- Manual blockers stay visible without being bypassed.
- The agent records progress evidence so the loop can stop when it is not
  making progress.

## Install From Source

```bash
git clone <your-fork-url> agent-loop-kit
cd agent-loop-kit
npm test
npm link
```

Then install host templates into a target project:

```bash
agent-loop install --host all --target /path/to/project
```

Review the generated `*.example` files and merge the hook configuration into
your Codex or Claude Code settings.

## Quick Start

```bash
agent-loop start --max-continuations 20 --max-wall-minutes 240 \
  "Work through available project tasks. Defer blocked work and continue safe available work."
```

During work, the agent should record evidence:

```bash
agent-loop progress "Fixed parser tests and added regression coverage"
```

When a task is blocked but later retryable:

```bash
agent-loop defer \
  --task "Retry GitHub issue sync" \
  --type rate_limit \
  --provider github \
  --scope capability \
  --capability github.api \
  --retry-after-seconds 120 \
  --evidence "HTTP 429 retry-after: 120"
```

When the loop should stop:

```bash
agent-loop stop --reason "manual stop"
```

When the objective is finished or only manual blockers remain:

```bash
agent-loop complete --reason "all safe work completed; remaining blockers require maintainer action"
```

## Core Safety Model

Agent Loop Kit treats blockers by scope:

- `global`: the host or environment cannot continue safely.
- `capability`: one capability is unavailable, such as GitHub write access.
- `task`: only the current task is blocked.
- `policy`: repository or user policy requires a human gate.
- `user-stop`: a human explicitly stopped the loop.

Only user stops and exhausted safety budgets terminate immediately. Retryable
blockers are stored with retry metadata. Manual blockers are never bypassed.

## Host Support

Claude Code and Codex both support `decision: "block"` with a continuation
reason for `Stop` hooks. Agent Loop Kit uses that shared shape.

The generated templates include:

- Slash command prompts for `/loop-start`, `/loop-stop`, and `/loop-status`.
- Hook wrappers for `Stop`, `StopFailure`, and `UserPromptSubmit`.
- Example host configuration snippets.

## Project Layout

```text
bin/                 CLI entry point
src/kernel/          State, blocker, scheduler, and prompt logic
src/templates/       Claude Code and Codex install templates
docs/specs/          Design specs
examples/recipes/    Optional examples, not core workflows
test/                Node test runner coverage
```

## Design Principle

The core loop should know how to continue safely. It should not know what kind
of work the user prefers. Domain-specific behavior belongs in user prompts,
repo policy, adapters, or optional examples.

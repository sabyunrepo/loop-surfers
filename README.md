# Loop Surfers

Safe continuation-loop skills, prompt commands, and hooks for Codex and Claude Code.

Loop Surfers helps coding agents keep working on a user-approved objective
without turning into an uncontrolled infinite loop. It stores the original
objective, applies a safety budget, records progress evidence, defers blocked
work, and lets Stop hooks continue only when it is still safe and useful.

Translations:

- [한국어](docs/README.ko.md)
- [中文](docs/README.zh.md)
- [日本語](docs/README.ja.md)

## Purpose

Loop Surfers is a hook and skill kit for safely continuing Codex and Claude Code
work after `/loop-start`. It is designed for long-running agent sessions where
the user has approved an objective, but the agent must still respect clear stop
conditions.

It does not blindly revive interrupted work. Instead, it keeps a loop state,
safety budget, progress evidence, and deferred blocker queue. Stop hooks only
ask the agent to continue when the loop is active, the budget is still valid,
and there is no user stop or manual blocker that must be respected.

Use Loop Surfers when you want an agent to keep working through available safe
tasks, record what it did, defer blocked work, and stop cleanly when useful work
is finished or unsafe.

## Slash Command Availability

Claude Code supports direct slash invocation for installed skills. The installed
project skills live at `.claude/skills/loop-start`, `.claude/skills/loop-stop`,
and `.claude/skills/loop-status`, so they are intended to be used as:

```text
/loop-start Fix failing tests and perform a focused code review.
/loop-status
/loop-stop
```

Codex support depends on the Codex build and plugin/skill loader behavior. Loop
Surfers installs both Codex skills under `.agents/skills/` and compatibility
prompt files under `.codex/prompts/`. If your Codex environment exposes project
prompts as slash commands, use the same `/loop-start`, `/loop-status`, and
`/loop-stop` commands. If it does not, use the skill by name or run the CLI
commands directly.

## Requirements

- Git
- Node.js 20 or newer
- Codex or Claude Code
- Permission to merge hook configuration into the target project

## Install From Git

```bash
git clone --depth 1 git@github.com:sabyunrepo/loop-surfers.git ~/.loop-surfers
~/.loop-surfers/setup --host all --target /path/to/project
```

Install only Codex templates:

```bash
~/.loop-surfers/setup --host codex --target /path/to/project
```

Install only Claude Code templates:

```bash
~/.loop-surfers/setup --host claude --target /path/to/project
```

After installation, review and merge the generated example config:

- Codex: merge `.codex/hooks.agent-loop.example.json` into `.codex/hooks.json`
- Claude Code: merge `.claude/settings.agent-loop.example.json` into `.claude/settings.json`

The installer renders each hook, skill, and prompt command with an absolute
`node /absolute/path/bin/agent-loop.js` command, so hooks do not depend on the
interactive shell `PATH`.

## npm Global Install

```bash
npm install -g git+ssh://git@github.com/sabyunrepo/loop-surfers.git
agent-loop install --host all --target /path/to/project
```

## Usage

Start a loop:

```text
/loop-start Fix failing tests and perform a focused code review.
```

Users only need to provide the work objective. Blocker handling, deferred queue
updates, progress evidence, and the default safety budget are applied by the
installed `/loop-start` skill/prompt and Stop hooks.

Start from shell:

```bash
agent-loop start --max-continuations 20 --max-wall-minutes 240 \
  "Fix failing tests and perform a focused code review."
```

Record progress:

```bash
agent-loop progress "Fixed parser tests and added regression coverage"
```

Defer retryable blocked work:

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

Check status:

```text
/loop-status
```

```bash
agent-loop status
```

Inspect only deferred work and follow-up actions:

```bash
agent-loop deferred
agent-loop status --deferred
```

The report shows `Why blocked`, `Evidence`, `Retry after`, and `Next action` for
each deferred task, so the user can see what failed, whether user action is
required, and when retryable work can resume.

Stop the loop:

```text
/loop-stop
```

```bash
agent-loop stop --reason "manual stop"
```

Mark the objective complete:

```bash
agent-loop complete --reason "all safe work completed; remaining blockers require maintainer action"
```

## Example Prompt

```text
/loop-start Fix failing tests and perform a focused code review.
```

The user does not need to include the operational boilerplate below. Loop
Surfers applies it automatically:

- Do not bypass auth, permission, rate limit, billing, sandbox, or repo policy blockers.
- Defer blocked work with evidence.
- Continue another safe available task when one task is blocked.
- Record progress after meaningful changes.
- Use the default budget of 20 continuations or 4 hours.

## Safety Model

Blocker scopes:

- `global`: the host or environment cannot safely continue
- `capability`: one capability is unavailable, such as GitHub write access
- `task`: only the current task is blocked
- `policy`: repository or user policy requires a human gate
- `user-stop`: the user explicitly stopped the loop

User stops and exhausted safety budgets terminate immediately. Retryable
blockers remain in the deferred queue with retry metadata. Manual blockers are
never bypassed.

## Marketplace Status

This repository is installable through Git clone plus `setup`, or through a Git
URL npm global install. It is not yet a native Codex or Claude Code marketplace
plugin. Marketplace distribution requires `.codex-plugin/plugin.json`,
`.claude-plugin/plugin.json`, marketplace manifests, and host-specific
validation.

## Development

```bash
npm run check
npm test
npm pack --dry-run
```

Project layout:

```text
bin/                 CLI entry point
src/kernel/          State, blocker, scheduler, and prompt logic
src/templates/       Claude Code and Codex install templates
docs/specs/          Design specs and distribution notes
examples/recipes/    Optional examples, not core workflows
test/                Node test runner coverage
```

## Design Principle

The core loop should know how to continue safely. It should not know what kind
of work the user prefers. Domain-specific behavior belongs in user prompts,
repository policy, adapters, or optional examples.

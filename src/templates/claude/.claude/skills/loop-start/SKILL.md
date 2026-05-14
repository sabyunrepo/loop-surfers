---
name: loop-start
description: Start Agent Loop Kit for the current project with an objective and safety budget.
---

Start Agent Loop Kit for the current project.

Usage:
`/loop-start <objective>`

The user only needs to provide the objective. Apply the loop safety defaults
from this skill and the installed Stop hooks; do not require the user to repeat
defer, progress, blocker, or budget instructions in the objective.

Run:
```bash
{{AGENT_LOOP_COMMAND}} start --max-continuations 20 --max-wall-minutes 240 "$ARGUMENTS"
```

Then continue the objective. After each meaningful step, record evidence with:
```bash
{{AGENT_LOOP_COMMAND}} progress "<what changed>"
```

If work is blocked, defer it instead of bypassing the blocker:
```bash
{{AGENT_LOOP_COMMAND}} defer --task "<blocked task>" --type "<blocker type>" --evidence "<evidence>"
```

Built-in safety defaults:
- Do not revive or override a user interrupt, `/loop-stop`, or explicit stop request.
- Do not bypass authentication, billing, permission, sandbox, or repository policy blockers.
- If one task is blocked, defer it and continue another safe available task.
- Stop when the continuation budget, wall-clock budget, or no-progress budget is exhausted.

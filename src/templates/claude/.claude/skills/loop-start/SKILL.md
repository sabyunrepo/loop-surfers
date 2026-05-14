---
name: loop-start
description: Start Agent Loop Kit for the current project with an objective and safety budget.
---

Start Agent Loop Kit for the current project.

Usage:
`/loop-start <objective>`

Run:
```bash
{{AGENT_LOOP_COMMAND}} start "$ARGUMENTS"
```

Then continue the objective. After each meaningful step, record evidence with:
```bash
{{AGENT_LOOP_COMMAND}} progress "<what changed>"
```

If work is blocked, defer it instead of bypassing the blocker:
```bash
{{AGENT_LOOP_COMMAND}} defer --task "<blocked task>" --type "<blocker type>" --evidence "<evidence>"
```

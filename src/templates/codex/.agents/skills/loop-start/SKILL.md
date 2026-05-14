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

Then continue the objective. Record meaningful progress with:
```bash
{{AGENT_LOOP_COMMAND}} progress "<what changed>"
```

Defer blocked work instead of bypassing auth, permission, billing, sandbox, or
repo policy blockers:
```bash
{{AGENT_LOOP_COMMAND}} defer --task "<blocked task>" --type "<blocker type>" --evidence "<evidence>"
```

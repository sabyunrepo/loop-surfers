Start Agent Loop Kit for the current project.

Usage:
`/loop-start <objective>`

Run:
```bash
agent-loop start "$ARGUMENTS"
```

Then continue the objective. After each meaningful step, record evidence with:
```bash
agent-loop progress "<what changed>"
```

If work is blocked, defer it instead of bypassing the blocker:
```bash
agent-loop defer --task "<blocked task>" --type "<blocker type>" --evidence "<evidence>"
```

Start Agent Loop Kit for the current project.

Usage:
`/loop-start <objective>`

Run:
```bash
agent-loop start "$ARGUMENTS"
```

Then continue the objective. Record meaningful progress with:
```bash
agent-loop progress "<what changed>"
```

Defer blocked work instead of bypassing auth, permission, billing, sandbox, or
repo policy blockers:
```bash
agent-loop defer --task "<blocked task>" --type "<blocker type>" --evidence "<evidence>"
```

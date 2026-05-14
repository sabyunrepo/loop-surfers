Show Loop Surfers state for the current project.

Run:
```bash
{{AGENT_LOOP_COMMAND}} status
```

Summarize active, ready, deferred, done, and terminal state for the user.
When deferred work exists, highlight:
- why the task is blocked,
- what evidence was recorded,
- whether it needs user action or can retry later,
- the next follow-up action.

To inspect only blocked and retryable work, run:
```bash
{{AGENT_LOOP_COMMAND}} deferred
```

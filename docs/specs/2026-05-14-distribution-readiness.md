# Distribution Readiness Check

Date: 2026-05-14

## Sources Checked

- Codex hooks: https://developers.openai.com/codex/hooks
- Codex plugin build/distribution: https://developers.openai.com/codex/plugins/build
- Codex skills: https://developers.openai.com/codex/skills
- Claude Code plugins: https://code.claude.com/docs/en/plugins
- Claude Code plugin marketplaces: https://code.claude.com/docs/en/plugin-marketplaces
- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Claude Code skills/slash commands: https://code.claude.com/docs/en/slash-commands
- Superpowers local reference: official plugin marketplace and custom marketplace install flows
- gstack local reference: Git clone plus `./setup --host ...` skill installation flow

## Result

Agent Loop Kit is distributable by Git as a CLI/template installer:

```bash
git clone --depth 1 <git-url> ~/.agent-loop-kit
~/.agent-loop-kit/setup --host all --target /path/to/project
```

The setup flow renders host templates with an absolute `node <repo>/bin/agent-loop.js`
command. This avoids relying on an interactive shell `PATH` inside hook commands.

## Host Mapping

- Codex hooks: `.codex/hooks.agent-loop.example.json` plus hook scripts in `.codex/hooks/`.
- Codex skills: `.agents/skills/loop-start`, `loop-stop`, and `loop-status`.
- Claude Code hooks: `.claude/settings.agent-loop.example.json` plus hook scripts in `.claude/hooks/`.
- Claude Code skills: `.claude/skills/loop-start`, `loop-stop`, and `loop-status`.

## Not Yet Marketplace-Ready

The repository is not currently a native marketplace plugin.

- Codex marketplace packaging requires `.codex-plugin/plugin.json` and a marketplace entry.
- Claude Code marketplace packaging requires `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` or another marketplace source.
- Hook-bearing plugins should be validated through the host plugin loader before claiming one-command `/plugin install` support.

Until those manifests and validation steps exist, the supported distribution path is Git clone plus `setup`, or global npm install from Git plus `agent-loop install`.

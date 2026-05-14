# Loop Surfers

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

Loop Surfers 是面向 Codex 和 Claude Code 的安全连续执行 skill、prompt command
和 hook 工具包。

它帮助代理在用户明确授权的目标上继续工作，同时避免失控的无限循环。Loop Surfers
会保存原始目标、安全预算、进度证据和阻塞队列，并且只有在安全且有用时，Stop hook
才会要求代理继续。

## 目的

Loop Surfers 适用于长时间代理任务。用户通过 `/loop-start` 提供目标后，代理可以在
安全预算内继续推进，但仍然必须尊重明确的停止条件。

- 用户明确停止时，绝不自动恢复。
- 不绕过认证、计费、权限、sandbox 或 repository policy 问题。
- rate limit 等可重试 blocker 会进入 deferred queue。
- 没有进度证据或超过安全预算时，循环会停止。
- GitHub issue、QA、research 等领域 workflow 不写死在核心逻辑中，而由用户 prompt 和 repo policy 决定。

这个项目的目标不是让 AI 代理无限运行，而是提供一个通用的安全循环层：继续推进用户
批准的目标，记录被阻塞的工作，并在应该停止时停止。

## Slash 命令可用性

Claude Code 支持直接用 `/skill-name` 调用已安装的 skill。安装后会生成
`.claude/skills/loop-start`、`.claude/skills/loop-status` 和
`.claude/skills/loop-stop`，因此可以这样使用：

```text
/loop-start Fix failing tests and perform a focused code review.
/loop-status
/loop-stop
```

Codex 是否支持同样的 slash 形式取决于你的 Codex build 和 skill/prompt loader。
Loop Surfers 会同时安装 `.agents/skills/` 和兼容用的 `.codex/prompts/`。如果你的
Codex 环境将 project prompt 暴露为 slash command，就可以使用 `/loop-start`、
`/loop-status` 和 `/loop-stop`。否则可以通过 skill 名称触发，或直接运行
`agent-loop` CLI。

## 安装要求

- Git
- Node.js 20 或更高版本
- Codex 或 Claude Code
- 能够修改目标项目 hook 配置的权限

## 通过 Git 安装

```bash
git clone --depth 1 git@github.com:sabyunrepo/loop-surfers.git ~/.loop-surfers
~/.loop-surfers/setup --host all --target /path/to/project
```

只安装 Codex 模板：

```bash
~/.loop-surfers/setup --host codex --target /path/to/project
```

只安装 Claude Code 模板：

```bash
~/.loop-surfers/setup --host claude --target /path/to/project
```

安装后需要合并示例配置：

- Codex: 将 `.codex/hooks.agent-loop.example.json` 合并到 `.codex/hooks.json`
- Claude Code: 将 `.claude/settings.agent-loop.example.json` 合并到 `.claude/settings.json`

安装器会把 hook、skill 和 prompt command 中的命令渲染成绝对路径，例如
`node /absolute/path/bin/agent-loop.js`，因此 hook 不依赖用户 shell 的 `PATH`。

## npm 全局安装

```bash
npm install -g git+ssh://git@github.com/sabyunrepo/loop-surfers.git
agent-loop install --host all --target /path/to/project
```

## 使用方法

启动循环：

```text
/loop-start Fix failing tests and perform a focused code review.
```

用户只需要输入工作目标。阻塞处理、deferred queue、进度记录和默认安全预算由已安装
的 `/loop-start` skill/prompt 与 Stop hook 自动应用。

从 shell 启动：

```bash
agent-loop start --max-continuations 20 --max-wall-minutes 240 \
  "Fix failing tests and perform a focused code review."
```

记录进度：

```bash
agent-loop progress "Fixed parser tests and added regression coverage"
```

记录可重试阻塞：

```bash
agent-loop defer \
  --task "Retry GitHub issue sync" \
  --type rate_limit \
  --provider github \
  --retry-after-seconds 120 \
  --evidence "HTTP 429 retry-after: 120"
```

查看状态：

```text
/loop-status
```

```bash
agent-loop status
```

只查看阻塞任务和后续处理：

```bash
agent-loop deferred
agent-loop status --deferred
```

报告会显示每个保留任务的 `Why blocked`、`Evidence`、`Retry after` 和
`Next action`，方便用户判断失败原因、是否需要人工处理，以及何时可以重试。

停止循环：

```text
/loop-stop
```

```bash
agent-loop stop --reason "manual stop"
```

完成目标：

```bash
agent-loop complete --reason "all safe work completed; remaining blockers require maintainer action"
```

## 安全模型

- `global`: 整个环境不能安全继续
- `capability`: 某个能力不可用，例如 GitHub 写权限
- `task`: 只有当前任务被阻塞
- `policy`: 仓库或用户策略需要人工确认
- `user-stop`: 用户明确停止

用户停止和预算耗尽会立即终止。可重试阻塞会保留在 deferred queue 中。需要人工处理
的阻塞不会被自动绕过。

## 当前发布状态

此仓库可以通过 Git clone + `setup` 安装，也可以通过 Git URL 做 npm 全局安装。它
目前还不是 Codex 或 Claude Code 的 native plugin marketplace package。Marketplace
发布还需要 `.codex-plugin/plugin.json`、`.claude-plugin/plugin.json`、marketplace
manifest 以及按 host 进行验证。

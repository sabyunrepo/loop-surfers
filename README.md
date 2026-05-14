# Loop Surfers

Safe continuation-loop skills and hooks for Codex and Claude Code.

Loop Surfers helps coding agents keep working on a user-approved objective
without turning into an uncontrolled infinite loop. It stores the original
objective, applies a safety budget, records progress evidence, defers blocked
work, and lets Stop hooks continue only when it is still safe and useful.

Languages: [한국어](#한국어) | [English](#english) | [中文](#中文) | [日本語](#日本語)

## 한국어

### 목적

Loop Surfers는 Codex와 Claude Code에서 `/loop-start`로 시작한 작업 목표를
안전하게 이어가기 위한 hook/skill 키트입니다. 에이전트가 작업 중간에 Stop
hook에 걸렸을 때, 무조건 되살리는 것이 아니라 다음 조건을 확인한 뒤에만
계속 진행하도록 돕습니다.

- 사용자가 명시적으로 중단한 경우에는 절대 재개하지 않습니다.
- 인증, 결제, 권한, sandbox, repository policy 같은 blocker는 우회하지 않습니다.
- rate limit처럼 나중에 다시 시도할 수 있는 blocker는 deferred queue에 남깁니다.
- 진행 증거가 없거나 safety budget을 초과하면 루프를 종료합니다.
- GitHub issue, QA, research 같은 도메인 workflow는 core에 고정하지 않고 사용자의 prompt와 repo policy에 맡깁니다.

즉, 이 프로젝트의 목적은 "AI 에이전트를 무한히 돌리는 것"이 아니라,
**사용자가 승인한 목표를 안전 예산 안에서 계속 진행하고, 막힌 일은 기록하며,
멈춰야 할 때는 멈추는 공통 루프 레이어**를 제공하는 것입니다.

### 설치 요구사항

- Git
- Node.js 20 이상
- Codex 또는 Claude Code
- hook 설정을 병합할 수 있는 프로젝트 권한

### Git으로 설치

```bash
git clone --depth 1 git@github.com:sabyunrepo/loop-surfers.git ~/.loop-surfers
~/.loop-surfers/setup --host all --target /path/to/project
```

Codex만 설치:

```bash
~/.loop-surfers/setup --host codex --target /path/to/project
```

Claude Code만 설치:

```bash
~/.loop-surfers/setup --host claude --target /path/to/project
```

설치 후 생성되는 파일:

```text
.agents/skills/loop-start/SKILL.md      # Codex skill
.agents/skills/loop-stop/SKILL.md       # Codex skill
.agents/skills/loop-status/SKILL.md     # Codex skill
.codex/hooks/*.sh                       # Codex hook wrappers
.codex/hooks.agent-loop.example.json    # Codex hook config example

.claude/skills/loop-start/SKILL.md      # Claude Code skill
.claude/skills/loop-stop/SKILL.md       # Claude Code skill
.claude/skills/loop-status/SKILL.md     # Claude Code skill
.claude/hooks/*.sh                      # Claude Code hook wrappers
.claude/settings.agent-loop.example.json # Claude Code hook config example
```

생성된 `*.example` 파일은 바로 활성 설정이 아닙니다. 각 host의 실제 설정 파일에
hook 설정을 병합해야 합니다.

- Codex: `.codex/hooks.agent-loop.example.json` 내용을 `.codex/hooks.json`에 병합
- Claude Code: `.claude/settings.agent-loop.example.json` 내용을 `.claude/settings.json`에 병합

`setup`은 hook과 skill 파일 안에 `node /absolute/path/bin/agent-loop.js` 형태의
절대 경로를 렌더링합니다. 그래서 hook 실행 시 사용자의 interactive shell `PATH`에
`agent-loop`가 없어도 동작합니다.

### npm global 방식

```bash
npm install -g git+ssh://git@github.com/sabyunrepo/loop-surfers.git
agent-loop install --host all --target /path/to/project
```

### 사용 방법

루프 시작:

```bash
/loop-start 현재 프로젝트에서 실패하는 테스트를 고치고, 가능한 범위의 코드 리뷰를 수행해.
```

사용자는 작업 목표만 입력하면 됩니다. 인증/권한/rate limit/sandbox blocker 처리,
deferred queue 기록, progress 기록, 기본 budget 같은 운영 규칙은 설치된
`/loop-start` skill과 Stop hook이 자동으로 적용합니다.

또는 shell에서 직접 시작:

```bash
agent-loop start --max-continuations 20 --max-wall-minutes 240 \
  "현재 프로젝트에서 실패하는 테스트를 고치고, 가능한 범위의 코드 리뷰를 수행해."
```

진행 증거 기록:

```bash
agent-loop progress "Fixed parser tests and added regression coverage"
```

나중에 재시도 가능한 blocker 기록:

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

상태 확인:

```bash
/loop-status
agent-loop status
```

보류 작업과 후속조치만 확인:

```bash
agent-loop deferred
agent-loop status --deferred
```

출력에는 보류된 작업마다 `Why blocked`, `Evidence`, `Retry after`,
`Next action`이 표시됩니다. 사용자는 왜 실패했는지, 본인이 처리해야 하는지,
나중에 자동 재시도 가능한지 바로 확인할 수 있습니다.

사용자가 루프 중단:

```bash
/loop-stop
agent-loop stop --reason "manual stop"
```

목표 완료:

```bash
agent-loop complete --reason "all safe work completed; remaining blockers require maintainer action"
```

### 예시 prompt

```text
/loop-start 현재 프로젝트에서 실패하는 테스트를 고치고, 가능한 범위의 코드 리뷰를 수행해.
```

아래 내용은 사용자가 prompt에 매번 넣을 필요가 없습니다. Loop Surfers가
자동으로 적용하는 기본 운영 규칙입니다.

- 인증/권한/rate limit/sandbox/repository policy blocker는 우회하지 않습니다.
- 막힌 작업은 evidence와 함께 deferred queue에 남깁니다.
- 다른 안전한 작업이 있으면 계속 진행합니다.
- 의미 있는 변경 후에는 progress를 기록합니다.
- 기본 budget은 20회 continuation 또는 4시간입니다.

### 안전 모델

Loop Surfers는 blocker를 다음 범위로 분류합니다.

- `global`: host 또는 환경 전체가 안전하게 계속될 수 없음
- `capability`: GitHub write access처럼 특정 기능만 사용 불가
- `task`: 현재 task만 막힘
- `policy`: repo 또는 사용자 policy상 human gate 필요
- `user-stop`: 사용자가 명시적으로 중단

사용자 중단과 safety budget 초과는 즉시 종료합니다. Retry 가능한 blocker는
재시도 시간과 함께 보류하고, manual blocker는 절대 자동 우회하지 않습니다.

### 현재 배포 상태

이 저장소는 Git clone + `setup` 방식으로 설치 가능합니다. 아직 Codex 또는
Claude Code의 native plugin marketplace package는 아닙니다. Marketplace 배포를
하려면 `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, marketplace
manifest, host별 validation이 추가로 필요합니다.

## English

### Purpose

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

### Requirements

- Git
- Node.js 20 or newer
- Codex or Claude Code
- Permission to merge hook configuration into the target project

### Install From Git

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

The installer renders each hook and skill with an absolute
`node /absolute/path/bin/agent-loop.js` command, so hooks do not depend on the
interactive shell `PATH`.

### npm Global Install

```bash
npm install -g git+ssh://git@github.com/sabyunrepo/loop-surfers.git
agent-loop install --host all --target /path/to/project
```

### Usage

Start a loop:

```bash
/loop-start Fix failing tests and perform a focused code review.
```

Users only need to provide the work objective. Blocker handling, deferred queue
updates, progress evidence, and the default safety budget are applied by the
installed `/loop-start` skill and Stop hooks.

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

```bash
/loop-status
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

```bash
/loop-stop
agent-loop stop --reason "manual stop"
```

Mark the objective complete:

```bash
agent-loop complete --reason "all safe work completed; remaining blockers require maintainer action"
```

### Example Prompt

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

### Safety Model

Blocker scopes:

- `global`: the host or environment cannot safely continue
- `capability`: one capability is unavailable, such as GitHub write access
- `task`: only the current task is blocked
- `policy`: repository or user policy requires a human gate
- `user-stop`: the user explicitly stopped the loop

User stops and exhausted safety budgets terminate immediately. Retryable
blockers remain in the deferred queue with retry metadata. Manual blockers are
never bypassed.

### Marketplace Status

This repository is installable through Git clone plus `setup`, or through a Git
URL npm global install. It is not yet a native Codex or Claude Code marketplace
plugin. Marketplace distribution requires `.codex-plugin/plugin.json`,
`.claude-plugin/plugin.json`, marketplace manifests, and host-specific
validation.

## 中文

### 目的

Loop Surfers 是面向 Codex 和 Claude Code 的安全连续执行工具包。它让用户通过
`/loop-start` 明确授权一个目标，然后让代理在安全预算内继续推进工作。

它不是无限循环工具。Loop Surfers 会保存原始目标、继续次数、时间预算、进度证据
和阻塞任务队列。只有在没有用户主动停止、没有必须人工处理的阻塞、并且预算仍然
有效时，Stop hook 才会要求代理继续工作。

适用场景：

- 连续修复测试失败
- 按安全边界继续处理多个任务
- 遇到 rate limit 后记录并稍后重试
- 遇到认证、权限、计费、sandbox 或仓库策略问题时停止绕过行为
- 为长时间代理工作保留可审计的状态和进度证据

### 安装要求

- Git
- Node.js 20 或更高版本
- Codex 或 Claude Code
- 能够修改目标项目 hook 配置的权限

### 通过 Git 安装

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

安装器会把 hook 和 skill 中的命令渲染成绝对路径，例如
`node /absolute/path/bin/agent-loop.js`，因此 hook 不依赖用户 shell 的 `PATH`。

### 使用方法

启动循环：

```bash
/loop-start Fix failing tests and perform a focused code review.
```

用户只需要输入工作目标。阻塞处理、deferred queue、进度记录和默认安全预算由
已安装的 `/loop-start` skill 与 Stop hook 自动应用。

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

```bash
/loop-status
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

```bash
/loop-stop
agent-loop stop --reason "manual stop"
```

完成目标：

```bash
agent-loop complete --reason "all safe work completed; remaining blockers require maintainer action"
```

### 安全模型

- `global`: 整个环境不能安全继续
- `capability`: 某个能力不可用，例如 GitHub 写权限
- `task`: 只有当前任务被阻塞
- `policy`: 仓库或用户策略需要人工确认
- `user-stop`: 用户明确停止

用户停止和预算耗尽会立即终止。可重试阻塞会保留在 deferred queue 中。需要人工处理
的阻塞不会被自动绕过。

## 日本語

### 目的

Loop Surfers は Codex と Claude Code のための安全な継続実行 hook/skill キット
です。ユーザーが `/loop-start` で承認した目標を、予算と安全条件の範囲内で
継続できるようにします。

これは無制限にエージェントを動かすための仕組みではありません。元の目標、継続
回数、時間制限、進捗証拠、保留中の blocker を状態として保存し、Stop hook は
安全に続けられる場合だけ継続指示を返します。

主な用途：

- 失敗しているテストを継続的に修正する
- 安全な次のタスクへ進む
- rate limit のような再試行可能な blocker を保留する
- 認証、権限、課金、sandbox、repository policy の問題を自動で回避しない
- 長時間のエージェント作業を監査可能な状態として残す

### 必要条件

- Git
- Node.js 20 以上
- Codex または Claude Code
- 対象プロジェクトの hook 設定を編集できる権限

### Git からインストール

```bash
git clone --depth 1 git@github.com:sabyunrepo/loop-surfers.git ~/.loop-surfers
~/.loop-surfers/setup --host all --target /path/to/project
```

Codex のみ：

```bash
~/.loop-surfers/setup --host codex --target /path/to/project
```

Claude Code のみ：

```bash
~/.loop-surfers/setup --host claude --target /path/to/project
```

インストール後、生成された設定例を実際の設定にマージしてください。

- Codex: `.codex/hooks.agent-loop.example.json` を `.codex/hooks.json` にマージ
- Claude Code: `.claude/settings.agent-loop.example.json` を `.claude/settings.json` にマージ

インストーラーは hook と skill のコマンドを
`node /absolute/path/bin/agent-loop.js` のような絶対パスに変換します。そのため
hook 実行時に `agent-loop` が shell の `PATH` に存在する必要はありません。

### 使い方

ループ開始：

```bash
/loop-start Fix failing tests and perform a focused code review.
```

ユーザーは作業目標だけを入力します。blocker の処理、deferred queue、進捗記録、
デフォルトの安全予算は、インストール済みの `/loop-start` skill と Stop hook が
自動的に適用します。

進捗記録：

```bash
agent-loop progress "Fixed parser tests and added regression coverage"
```

再試行可能な blocker を保留：

```bash
agent-loop defer \
  --task "Retry GitHub issue sync" \
  --type rate_limit \
  --provider github \
  --retry-after-seconds 120 \
  --evidence "HTTP 429 retry-after: 120"
```

状態確認：

```bash
/loop-status
agent-loop status
```

保留中の作業と次の対応だけを確認：

```bash
agent-loop deferred
agent-loop status --deferred
```

レポートには各タスクの `Why blocked`、`Evidence`、`Retry after`、
`Next action` が表示されます。ユーザーは失敗理由、人間の対応が必要かどうか、
いつ再試行できるかを確認できます。

停止：

```bash
/loop-stop
agent-loop stop --reason "manual stop"
```

完了：

```bash
agent-loop complete --reason "all safe work completed; remaining blockers require maintainer action"
```

### 安全モデル

- `global`: host または環境全体が安全に継続できない
- `capability`: GitHub write access など特定の能力が使えない
- `task`: 現在の task のみが block されている
- `policy`: repository またはユーザー policy により人間の確認が必要
- `user-stop`: ユーザーが明示的に停止した

ユーザー停止と予算超過は即時終了します。再試行可能な blocker は deferred queue
に残されます。人間の対応が必要な blocker は自動的に回避しません。

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

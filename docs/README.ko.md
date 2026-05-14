# Loop Surfers

[English](../README.md) | [中文](README.zh.md) | [日本語](README.ja.md)

Codex와 Claude Code를 위한 안전한 continuation-loop skill, prompt command, hook 키트입니다.

Loop Surfers는 사용자가 승인한 목표를 AI 에이전트가 계속 진행하되, 통제되지 않는
무한 루프로 변하지 않도록 돕습니다. 원래 목표, 안전 예산, 진행 증거, 보류 작업을
상태로 저장하고, Stop hook은 안전하고 유용할 때만 계속 진행하도록 지시합니다.

## 목적

Loop Surfers는 Codex와 Claude Code에서 `/loop-start`로 시작한 작업 목표를
안전하게 이어가기 위한 도구입니다. 에이전트가 작업 중간에 Stop hook에 걸렸을 때,
무조건 되살리는 것이 아니라 다음 조건을 확인한 뒤에만 계속 진행하도록 합니다.

- 사용자가 명시적으로 중단한 경우에는 절대 재개하지 않습니다.
- 인증, 결제, 권한, sandbox, repository policy 같은 blocker는 우회하지 않습니다.
- rate limit처럼 나중에 다시 시도할 수 있는 blocker는 deferred queue에 남깁니다.
- 진행 증거가 없거나 safety budget을 초과하면 루프를 종료합니다.
- GitHub issue, QA, research 같은 도메인 workflow는 core에 고정하지 않고 사용자의 prompt와 repo policy에 맡깁니다.

즉, 이 프로젝트의 목적은 "AI 에이전트를 무한히 돌리는 것"이 아니라,
**사용자가 승인한 목표를 안전 예산 안에서 계속 진행하고, 막힌 일은 기록하며,
멈춰야 할 때는 멈추는 공통 루프 레이어**를 제공하는 것입니다.

## 슬래시 명령어 사용 가능 여부

Claude Code는 설치된 skill을 `/skill-name` 형태로 직접 호출할 수 있습니다. 설치 후
`.claude/skills/loop-start`, `.claude/skills/loop-status`, `.claude/skills/loop-stop`
이 생성되므로 다음처럼 사용합니다.

```text
/loop-start 현재 프로젝트에서 실패하는 테스트를 고치고, 가능한 범위의 코드 리뷰를 수행해.
/loop-status
/loop-stop
```

Codex는 사용 중인 빌드와 skill/prompt loader 동작에 따라 다릅니다. Loop Surfers는
Codex용 `.agents/skills/`와 호환용 `.codex/prompts/`를 함께 설치합니다. Codex 환경이
project prompt를 slash command로 노출하면 같은 `/loop-start`, `/loop-status`,
`/loop-stop`을 사용할 수 있습니다. 그렇지 않은 환경에서는 skill 이름으로 호출하거나
`agent-loop` CLI를 직접 실행하면 됩니다.

## 설치 요구사항

- Git
- Node.js 20 이상
- Codex 또는 Claude Code
- hook 설정을 병합할 수 있는 프로젝트 권한

## Git으로 설치

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

설치 후 생성되는 `*.example` 파일은 바로 활성 설정이 아닙니다. 각 host의 실제 설정
파일에 hook 설정을 병합해야 합니다.

- Codex: `.codex/hooks.agent-loop.example.json` 내용을 `.codex/hooks.json`에 병합
- Claude Code: `.claude/settings.agent-loop.example.json` 내용을 `.claude/settings.json`에 병합

`setup`은 hook, skill, prompt command 안에 `node /absolute/path/bin/agent-loop.js`
형태의 절대 경로를 렌더링합니다. 그래서 hook 실행 시 사용자의 interactive shell
`PATH`에 `agent-loop`가 없어도 동작합니다.

## npm global 방식

```bash
npm install -g git+ssh://git@github.com/sabyunrepo/loop-surfers.git
agent-loop install --host all --target /path/to/project
```

## 사용 방법

루프 시작:

```text
/loop-start 현재 프로젝트에서 실패하는 테스트를 고치고, 가능한 범위의 코드 리뷰를 수행해.
```

사용자는 작업 목표만 입력하면 됩니다. 인증/권한/rate limit/sandbox blocker 처리,
deferred queue 기록, progress 기록, 기본 budget 같은 운영 규칙은 설치된
`/loop-start` skill/prompt와 Stop hook이 자동으로 적용합니다.

shell에서 직접 시작:

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

```text
/loop-status
```

```bash
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

```text
/loop-stop
```

```bash
agent-loop stop --reason "manual stop"
```

목표 완료:

```bash
agent-loop complete --reason "all safe work completed; remaining blockers require maintainer action"
```

## 예시 prompt

```text
/loop-start 현재 프로젝트에서 실패하는 테스트를 고치고, 가능한 범위의 코드 리뷰를 수행해.
```

아래 내용은 사용자가 prompt에 매번 넣을 필요가 없습니다. Loop Surfers가 자동으로
적용하는 기본 운영 규칙입니다.

- 인증/권한/rate limit/sandbox/repository policy blocker는 우회하지 않습니다.
- 막힌 작업은 evidence와 함께 deferred queue에 남깁니다.
- 다른 안전한 작업이 있으면 계속 진행합니다.
- 의미 있는 변경 후에는 progress를 기록합니다.
- 기본 budget은 20회 continuation 또는 4시간입니다.

## 안전 모델

- `global`: host 또는 환경 전체가 안전하게 계속될 수 없음
- `capability`: GitHub write access처럼 특정 기능만 사용 불가
- `task`: 현재 task만 막힘
- `policy`: repo 또는 사용자 policy상 human gate 필요
- `user-stop`: 사용자가 명시적으로 중단

사용자 중단과 safety budget 초과는 즉시 종료합니다. Retry 가능한 blocker는 재시도
시간과 함께 보류하고, manual blocker는 절대 자동 우회하지 않습니다.

## 현재 배포 상태

이 저장소는 Git clone + `setup` 방식으로 설치 가능합니다. 아직 Codex 또는 Claude
Code의 native plugin marketplace package는 아닙니다. Marketplace 배포를 하려면
`.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, marketplace manifest,
host별 validation이 추가로 필요합니다.

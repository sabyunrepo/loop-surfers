# Loop Surfers

[English](../README.md) | [한국어](README.ko.md) | [中文](README.zh.md)

Loop Surfers は Codex と Claude Code のための安全な continuation-loop skill、
prompt command、hook キットです。

ユーザーが承認した目標をエージェントが継続できるようにしながら、制御不能な
無限ループにならないようにします。元の目標、安全予算、進捗証拠、保留中の作業を
状態として保存し、Stop hook は安全で有用な場合だけ継続を指示します。

## 目的

Loop Surfers は `/loop-start` で開始した作業を安全に継続するためのものです。
エージェントが途中で Stop hook に到達しても、無条件に復帰するのではなく、明確な
停止条件を確認したうえで継続します。

- ユーザーが明示的に停止した場合は、絶対に再開しません。
- 認証、課金、権限、sandbox、repository policy の blocker を回避しません。
- rate limit のような再試行可能な blocker は deferred queue に残します。
- 進捗証拠がない場合や safety budget を超えた場合は停止します。
- GitHub issue、QA、research のような domain workflow は core に固定せず、ユーザー prompt と repo policy に任せます。

目的は AI エージェントを無限に動かすことではありません。ユーザーが承認した目標を
安全予算内で進め、詰まった作業を記録し、止まるべきときに止まる共通レイヤーを
提供することです。

## Slash command の利用可否

Claude Code はインストール済み skill を `/skill-name` として直接呼び出せます。
インストール後に `.claude/skills/loop-start`、`.claude/skills/loop-status`、
`.claude/skills/loop-stop` が作成されるため、次のように使います。

```text
/loop-start Fix failing tests and perform a focused code review.
/loop-status
/loop-stop
```

Codex で同じ slash 形式が使えるかは、Codex build と skill/prompt loader の挙動に
依存します。Loop Surfers は `.agents/skills/` と互換用の `.codex/prompts/` を両方
インストールします。Codex 環境が project prompt を slash command として公開する
場合は、`/loop-start`、`/loop-status`、`/loop-stop` を使えます。そうでない場合は
skill 名で呼び出すか、`agent-loop` CLI を直接実行してください。

## 必要条件

- Git
- Node.js 20 以上
- Codex または Claude Code
- 対象プロジェクトの hook 設定を編集できる権限

## Git からインストール

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

インストーラーは hook、skill、prompt command のコマンドを
`node /absolute/path/bin/agent-loop.js` のような絶対パスに変換します。そのため
hook 実行時に shell の `PATH` に `agent-loop` が存在する必要はありません。

## npm global install

```bash
npm install -g git+ssh://git@github.com/sabyunrepo/loop-surfers.git
agent-loop install --host all --target /path/to/project
```

## 使い方

ループ開始：

```text
/loop-start Fix failing tests and perform a focused code review.
```

ユーザーは作業目標だけを入力します。blocker の処理、deferred queue、進捗記録、
デフォルトの安全予算は、インストール済みの `/loop-start` skill/prompt と Stop
hook が自動的に適用します。

shell から開始：

```bash
agent-loop start --max-continuations 20 --max-wall-minutes 240 \
  "Fix failing tests and perform a focused code review."
```

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

```text
/loop-status
```

```bash
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

```text
/loop-stop
```

```bash
agent-loop stop --reason "manual stop"
```

完了：

```bash
agent-loop complete --reason "all safe work completed; remaining blockers require maintainer action"
```

## 安全モデル

- `global`: host または環境全体が安全に継続できない
- `capability`: GitHub write access など特定の能力が使えない
- `task`: 現在の task のみが block されている
- `policy`: repository またはユーザー policy により人間の確認が必要
- `user-stop`: ユーザーが明示的に停止した

ユーザー停止と予算超過は即時終了します。再試行可能な blocker は deferred queue
に残されます。人間の対応が必要な blocker は自動的に回避しません。

## 現在の配布状態

このリポジトリは Git clone + `setup`、または Git URL からの npm global install で
インストールできます。まだ Codex または Claude Code の native plugin marketplace
package ではありません。Marketplace 配布には `.codex-plugin/plugin.json`、
`.claude-plugin/plugin.json`、marketplace manifest、host ごとの検証が必要です。

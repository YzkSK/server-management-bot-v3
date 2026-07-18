# Workspace Bootstrap: Bun Migration Design

**Status:** Approved
**Scope:** issue #1 (ワークスペース基盤の作成)相当の範囲のみ。Task 2以降(各パッケージのpackage.json、CI、Dockerfile等)は本設計の方針に従い、実装時に個別issueで段階的に追従する。

## Background

`docs/plans/rewrite-foundation.md` の Task 1 は pnpm workspace + Node.js 24 を前提に書かれていたが、パッケージ管理・実行ランタイムを Bun に統一する方針に変更した。本ドキュメントはその変更をルートワークスペース定義に限定して記録する。

## Decisions

| 項目 | Before (pnpm/Node) | After (Bun) |
|---|---|---|
| パッケージ管理 | `pnpm-workspace.yaml` | `package.json` の `"workspaces"` フィールド |
| ロックファイル | `pnpm-lock.yaml` | `bun.lock`(コミット対象、gitignoreしない) |
| 実行ランタイム | Node.js `>=24 <25` | Bun `>=1.3.0 <2.0.0` |
| テストランナー(後続タスク) | `node:test` | `bun:test`(describe/it/expect、Jest互換API) |
| モジュール解決 | `NodeNext` | `bundler`(`module: "Preserve"`) |
| フィルタ実行 | `pnpm --filter <pkg> <script>` | `bun run --filter <pkg> <script>` |
| ビルドオーケストレーション | Turborepo | Turborepo(継続、bun workspaces上で動作) |
| Bun型定義 | `@types/node` | `@types/bun`(Bunランタイムの型を提供) |

`packageManager` フィールドは、Turborepo がパッケージマネージャー検出に使用するため設定が必須(未設定だと `turbo run` が `Could not resolve workspace` エラーで失敗することを実機検証で確認済み)。`packageManager: "bun@1.3.14"` のように**完全固定バージョン**で指定し、`engines.bun` の方はメジャーバージョン範囲(`>=1.3.0 <2.0.0`)で緩く指定する。

## `package.json` (root)

```json
{
  "name": "server-management-bot-v3",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "packageManager": "bun@1.3.14",
  "engines": {
    "bun": ">=1.3.0 <2.0.0"
  },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev --parallel",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "db:generate": "bun run --filter @sm-bot/db db:generate",
    "db:migrate": "bun run --filter @sm-bot/db db:migrate"
  },
  "devDependencies": {
    "@types/bun": "^1.3.14",
    "turbo": "^2.10.5",
    "typescript": "^7.0.2"
  }
}
```

## `tsconfig.base.json`

- `module: "Preserve"` / `moduleResolution: "bundler"`(Bun公式推奨設定)
- `lib: ["ES2022"]` のみ(DOM/DOM.Iterableは含めない — Dashboard等ブラウザ向けコードは各パッケージの`tsconfig.json`で個別に追加する。base に混入させると Node/Bot 側パッケージでも `window`/`document` が型として見えてしまい、実行時に存在しないAPI使用を静的検出できなくなるため)
- `types: ["bun"]`
- strict系オプション(`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)は元プラン通り維持

## `turbo.json`

- `lint` / `typecheck` は `^build` に依存させない(型チェック・静的解析のために毎回ビルドを要求しない)
- `test` は `^build` 依存を維持しつつ `outputs: ["coverage/**"]` を追加
- `build` / `dev` は元プラン通り

## `.gitignore`

- `.env` 系は `.env.*` + `!.env.example` パターンに変更し、`.env.development` 等の取りこぼしを防ぐ
- `bun.lock` は無視しない(ロックファイルはコミット対象)
- `pnpm-lock.yaml` は本移行に伴い作業ツリーから削除し、`bun install` で `bun.lock` を再生成する

## ドキュメント更新

- `docs/superpowers/plans/rewrite-foundation.md` Task 1 のコードブロック(package.json, workspace定義, tsconfig.base.json, turbo.json)をBun仕様に置換
- `docs/rewrite-architecture-design.md` の Tech Stack 記述中、パッケージ管理・ランタイムの記載をBunに更新
- Task 2 以降の各パッケージ`package.json`(`pnpm --filter`呼び出し、`node --test`実行など)は、実装時に本設計の方針(`bun run --filter`, `bun:test`)へ都度読み替える。本ドキュメントでは先行して書き換えない

## Out of Scope

- 各パッケージ(`packages/*`, `apps/*`)の package.json / スクリプト書き換え(Task 2以降で対応)
- Dockerfile のベースイメージ変更(`oven/bun`への切り替え、Task 9で対応)
- GitHub Actions CI の Bun セットアップ
- devDependencies のバージョン固定方針の全体レビュー(typescript/turbo以外の依存は今回対象外)

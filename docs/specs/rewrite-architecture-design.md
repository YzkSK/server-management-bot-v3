# 新アーキテクチャ設計(フルリライト) — 設計仕様書

作成日: 2026-07-16
前提資料: `docs/current-state-audit.md`(実装ベースの現状棚卸し。旧`discord_bot_complete_detailed_specification.md`はこの設計では参照しない — 棚卸しで乖離が確認されているため)

## 1. 背景・目的

現行リポジトリはPhase0〜12を経て機能的には成熟しているが、以下の問題が棚卸しで確認された:

- Dashboard主要コンポーネントの肥大化(God component、fan-out過多)
- 設定タブ4種のfetch/save定型コード重複
- bot commandsが低レベルなComponents V2ビルダーに直接依存する層分離の欠如
- tRPC構想の未実装(実態はREST route handlersで認証チェックが各ルートに重複)
- RBACが「明示的付与」前提の設計思想と「全メンバー自動viewer付与」の実装で矛盾
- Git運用の乱れ(187ブランチ残骸、マージ戦略不統一)

これらを踏まえ、新規リポジトリでスクラッチフルリライトを行う。技術スタックは大枠維持しつつ、上記の構造的問題を設計レベルで解消する。

## 2. 技術スタック

現行から維持: TypeScript, discord.js v14+, Drizzle ORM, PostgreSQL, Redis, Socket.io, zod, Next.js, TailwindCSS, shadcn/ui, Docker Compose, VOICEVOX, GitHub Actions。

追加の変更点(Bunワークスペース化): 実行ランタイム・パッケージ管理をNode.js + pnpm workspaceからBun workspaceに変更(詳細は`docs/specs/bun-migration-design.md`を参照)。

変更点: **API層をtRPCに変更**(旧仕様書は元々tRPCを想定していたが実装はRESTだった)。Dashboardの唯一のクライアントはNext.jsフロント自身であり外部公開APIの要件がないため、型共有と認証集約の両方でtRPCが有利と判断。

## 3. モノレポ構成(機能ドメイン別パッケージ)

```
apps/
  bot/        - Discordクライアント起動、コマンド登録、interaction受付のみ
  dashboard/  - Next.js、tRPCサーバー、Socket.io、OAuth

packages/
  core/             - discord.js薄いラッパー、Components V2ビルダーの基盤
  logging/          - ログ取り込み、Redis Stream、realtime振り分け、Audit Log相関
  voice/            - Temp VC + 通話可視化(密結合のため統合)
  recruitment/      - 募集ドメイン
  tts/              - TTS
  dashboard-access/ - RBAC、認証、tRPC共通ミドルウェア
  db/               - schema, migrations, repositories
  shared/           - zodスキーマ、イベント名、定数(DB/discord.js非依存を維持)
  config/           - env validation
```

各機能ドメインパッケージ(voice/recruitment/tts/logging)は内部を4層に分割する:

- `domain/` — 状態遷移・ビジネスロジック。discord.js非依存・DB非依存・純粋関数中心。単体テスト対象
- `application/` — ユースケース層。`domain/`のロジックと`packages/db`のrepository呼び出し・トランザクションを組み合わせて「募集を作成する」「Temp VCオーナーを移譲する」等の一操作を完結させる。discord.jsには依存しない。`discord/`(bot側interaction)と`router/`(tRPC)の両方から呼ばれる共通の実行窓口とし、同じ業務ロジックがbotコマンドとDashboard APIで二重実装されるのを防ぐ
- `discord/` — discord.js接続。そのドメイン専用の高レベルComponents V2メッセージ生成と、interaction(ボタン/モーダル)ハンドラの実体。`application/`を呼び出す
- `router/` — tRPC router定義。`application/`を呼び出す。認証は`packages/dashboard-access`の`protectedProcedure`を使う

**依存方向のルール**: `router/` → `application/` → `domain/`、`discord/` → `application/` → `domain/`(`discord/`と`router/`は互いに依存しない、`domain/`は他の3層に依存しない)。

**層分離の強制ルール**: `packages/core`が公開する低レベルなComponents V2ビルダーは、各ドメインパッケージの`discord/`層のみが利用する。`apps/bot/src/commands/*`は`packages/core`も各ドメインの`discord/`も直接importせず、必ず対応するドメインパッケージの`discord/`層が公開する高レベル関数経由でメッセージを組み立てる。これにより現行で見られた「コマンドが低レベルビルダーを毎回再実装する」パターンを構造的に禁止する。

**パッケージ間の依存方向**: `packages/core`, `packages/db`, `packages/shared`, `packages/config`, `packages/dashboard-access`を「基盤パッケージ」と位置づけ、各ドメインパッケージ(voice/recruitment/tts/logging)はこれらに依存してよい。ドメインパッケージ同士は原則相互依存しない(voiceがrecruitmentをimportしない等)。基盤パッケージは逆方向にドメインパッケージへ依存してはならない(循環禁止)。`dashboard-access`はDiscordロール解決のために`core`のDiscord API薄いラッパーには依存してよいが、voice/tts/recruitment/loggingのいずれにも依存しない。

**`apps/bot`とドメイン`discord/`層の責務分担**: `apps/bot`はDiscordクライアントのbootstrap、Gatewayイベント登録、slash command登録、およびinteraction(customId)を見て適切なドメインの`discord/`層ハンドラへ振り分けるルーティングのみを担う(現行の`runtime.ts`の役割に近い)。実際のメッセージ組み立てとinteractionの処理ロジック自体は各ドメインの`discord/`層が持つ。「interaction受付のみ」とは「ルーティングのみ行い、業務ロジックは持たない」という意味であり、Gatewayイベントの配線自体は`apps/bot`の責務として残る。

## 4. API層: tRPC

- `packages/dashboard-access`が能力ベースの`protectedProcedure`ファクトリ(`requireCapability(cap)`、詳細は§6)を提供し、全routerがこれを使う
- 各ドメインパッケージの`router/`をdashboard側で`appRouter`に集約
- Socket.ioによるrealtimeログ配信は現行実装を踏襲(tRPC subscriptionへの置き換えはスコープ外)。Socket.io接続の認証は既存同様NextAuthセッションCookieを共有する形とし、tRPCとは別チャネルのまま統合しない

**Next.js側の配置**:
- fetch adapter: `apps/dashboard/src/app/api/trpc/[trpc]/route.ts` 1箇所に集約(App Router route handler)
- Server Components/SSRからは、HTTPを経由しない`createCaller(ctx)`によるサーバー内呼び出しを使う(自分自身へのHTTPループバックを避ける)
- Client Componentsは`@trpc/react-query`の`httpBatchLink` + Providerを`app/providers.tsx`的な単一箇所に置く
- `createContext`(1リクエスト1回生成)がNextAuthセッション取得・能力解決(§6)をまとめて行い、同一バッチ内の全procedureがこの結果を再利用する
- エラーフォーマットは`TRPCError`のcode(`UNAUTHORIZED`/`FORBIDDEN`等)をそのままフロントのトースト表示にマッピングする薄いadapterを`packages/dashboard-access`に置く

## 5. フロントエンド: データ取得とコンポーネント設計

- tRPC + `@trpc/react-query`でデータ取得を統一。現行の「タブごとにuseState+useEffectでfetch/save」パターンは全廃し、`useQuery`/`useMutation`に置き換える
- ページコンポーネント(`*-dashboard.tsx`)は「レイアウト+データ取得」のみに責務を絞り、表示・フォームロジックは`components/`配下の小さいプレゼンテーショナルコンポーネントへ分割する
- 目安: 1コンポーネントのJSX出力は150行以内。out-degreeが高くなる(多数のUIプリミティブ・ドメイン型を1ファイルで扱う)場合は分割を検討する

**ID直接入力の禁止**: ユーザー・Discordチャンネル・VOICEVOX話者など、Discord/外部APIから取得可能なエンティティを指定する箇所では、生IDのテキスト入力を一切許可しない。必ず対象一覧(ギルドメンバー、ギルドチャンネル、VOICEVOX話者リスト等)をAPI経由で取得し、名前・アイコン等を表示するセレクター(コンボボックス/ドロップダウン)経由で選択させる。現行`AccessGrantsTab`のユーザーID手入力フィールド(`grantTargetId`テキスト入力)はこの規約に違反しており、新実装ではメンバーピッカーコンポーネントに置き換える。チャンネル指定(ログ対象チャンネル、Temp VC作成チャンネル、募集投稿先チャンネル等)も同様に、既存の`ChannelSelect`のようなセレクターコンポーネントを必ず経由し、チャンネルID手入力欄を設けない。この規約は新規UI全てに適用する。

## 6. 権限モデル: 能力ベース・ロール連携RBAC

現行の`viewer/admin/owner`固定3階層と`member-auto-grant.ts`による個別ユーザー自動付与ロジックを廃止し、以下に置き換える:

### 6.1 データ構造

- `dashboardAccessGrants`相当のテーブルは維持しつつ、`role: 'viewer'|'admin'`カラムを`capabilities: bigint`(ビットフラグ、OR結合)に変更。`targetType: 'user'|'role'`(Discordロール)構造はそのまま流用する
- **ビット番号の固定表**は`packages/shared/src/capabilities.ts`に一度だけ定義し、以後は追記のみ(既存ビット位置の再利用・並べ替え禁止)。初期セット:
  - `1n << 0n` = `view_logs`
  - `1n << 1n` = `view_logs_raw`
  - `1n << 2n` = `view_voice`
  - `1n << 3n` = `manage_voice`
  - `1n << 4n` = `view_recruitment`
  - `1n << 5n` = `manage_recruitment`
  - `1n << 6n` = `view_tts`
  - `1n << 7n` = `manage_tts`
  - `1n << 8n` = `manage_logging_settings`
  - `1n << 9n` = `manage_access`(他者への権限付与)
  - `1n << 10n` = `manage_guild_settings`
- **シリアライズ方針**: DBカラムはDrizzleの`bigint({ mode: "bigint" })`。tRPCの入出力境界(zodスキーマ)では`bigint`をそのまま送らず**10進文字列**として表現し、境界(router層)でのみ`BigInt(str)`⇄`str`の変換を行う。フロント側はcapabilitiesを基本的に不透明な文字列として扱い、ビット演算が必要な箇所(セレクター等でのチェック状態表示)だけ`BigInt`に変換する共通ヘルパー(`packages/shared`)を経由する

### 6.2 自動ベースライン付与(`@everyone`)

- Botがギルドに参加した時点(`GuildCreate`イベント)で、そのギルドの`@everyone`ロールに対する`dashboardAccessGrants`行が**まだ存在しない場合に限り**、閲覧系能力(`view_logs`, `view_voice`, `view_recruitment`, `view_tts`)を初期値としてgrantする(初回シードのみ、以後は自動で再付与・上書きしない)
- 管理者が`@everyone`のgrantを削除・縮小した場合、それはオプトアウトの意思表示として尊重し、bot起動時の整合性チェックやギルド再参加時に強制的に復元しない
- DB書き込み失敗時は次回`GuildCreate`(bot再起動時の再登録等)で再試行される(「grantが存在しない場合のみ作る」ロジックなので自然に冪等)
- ギルドオーナーは常に全ビット保持(DB非保存、Discordギルドオーナーとの動的比較は現行踏襲)

### 6.3 権限解決とロール一覧の取得元

- 実効権限 = 本人へのuser-level grantのビット + 本人が保持する全Discordロールのrole-level grantのビットをOR結合したもの
- ダッシュボードアクセス時のロール一覧取得は、現行の`dashboard-auth.ts`と同じ方式(bot tokenを使ったDiscord REST `GET /guilds/{guild.id}/members/{user.id}`のライブ呼び出し)を踏襲する。OAuthの`guilds`スコープではメンバーのロール一覧は取得できないため、bot側のREST呼び出しが必須。呼び出し結果は60秒TTLの短命キャッシュ(Redis)を挟み、認可チェックのたびに毎回APIを叩くことを避ける
- 退会済みユーザーはREST呼び出しが404となるため、その場合は認可なし(全権限なし)として扱う

### 6.4 `manage_access`の委任制約

- 権限昇格を防ぐため、以下を強制する:
  - あるユーザーは、**自分が現在保持している能力ビットのサブセットしか**他者に付与できない(持っていない能力を付与できない)
  - `manage_access`ビット自体は、ギルドオーナーのみが付与・剥奪できる(`manage_access`を持つ非オーナーが他人に`manage_access`を渡すことはできない)
  - user-level grantとrole-level grantの操作権限は同一の`manage_access`ルールに従う(対象がユーザーかロールかで区別しない)
  - オーナー自身の権限(動的判定・全ビット)は編集・削除の対象にならない

### 6.5 tRPCでの検査

- `protectedProcedure`は単純なロールランク比較ではなく、特定の能力ビットの有無を検査する(`requireCapability(CAP.MANAGE_VOICE)`)

## 7. 新リポジトリとGit運用ルール

- 新規git リポジトリでゼロから開始する。現行リポジトリは参照用として変更せず保持する
- issue→PRを徹底する(全ての変更はissueに対応するPR経由でmainへ入る)ことを前提に、**通常のmerge commitに統一**する。squashは使わない — PR内のコミット履歴を残すことでissue単位の実装過程を追跡できるようにし、マージコミット自体をissue/PRへの参照点とする
- マージ済みブランチは削除しない(履歴・比較・参照用として保持する。現行リポジトリの運用を踏襲)
- worktree/エージェント作業用ブランチは作業完了後に削除する(こちらは一時的な作業用であり、マージ済み機能ブランチとは区別する)

## 8. スコープ外(この設計書には含めない)

- 各機能(bot基盤 → ロギング → Temp VC → 通話可視化 → 募集 → TTS → Dashboard)の詳細な再実装設計・実装順序は、本設計を入力として機能ごとに別セッションでspec→plan→実装サイクルを回す。棚卸しで見つかった機能差分(ログpartition/ACK、i18n継続可否、System Healthの実装方針、Backup/Archive形式、Temp VC bitrate、募集auto_close等)の採否判断も、その機能別セッションで決定する
- セレクターコンポーネントの詳細要件(ページング・検索・rate limit対策・削除済みID表示等)、React Queryのキャッシュ無効化方針、GitHub側でのmerge commit強制設定(branch protection等)は、実装計画(writing-plans)またはDashboard機能セッションで詰める
- 既存リポジトリの変更(参照用として維持するのみ)

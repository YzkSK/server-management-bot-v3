# 現状棚卸しレポート (Current State Audit)

作成日: 2026-07-16
目的: フルリライトを検討するにあたり、実装ベースで「今動いているもの」を正確に把握する。既存の `discord_bot_complete_detailed_specification.md`(以下「旧仕様書」)は実装から乖離しているため、本ドキュメントが今後のリライト設計における一次情報源となる。

調査方法: code-review-graph MCP(313ファイル / 1729ノード / 12004エッジ / 18コミュニティ)によるアーキテクチャ解析 + ソースコード直接精査 + git履歴調査。

---

## 1. 概要

複数Discordサーバー向けの統合運用Bot + Dashboard。pnpm workspaceモノレポ(`apps/bot`, `apps/dashboard`, `packages/{config,db,discord-core,logger,redis,shared}`)。README記載ではPhase0〜Phase12まで実装済み、現在は`feat/settings-redesign`ブランチで設定タブの再設計が進行中。

**技術スタックは旧仕様書と一部乖離している**(詳細は§6):
- tRPCは採用されておらず、実際はNext.js Route Handlers(REST API)。
- それ以外(discord.js v14, Drizzle ORM, PostgreSQL, Redis, Socket.io, zod, Next.js, TailwindCSS, shadcn/ui, Docker Compose, VOICEVOX)は概ね仕様書通り。

---

## 2. モノレポ構造・コミュニティ分析

code-review-graphが検出した18コミュニティ:

| id | 実体 | ディレクトリ | サイズ(ノード) | 凝集度 |
|----|------|-----|------|----------|
| 20 | discord-voice(bot本体) | `apps/bot/src/discord` | 533 | 0.35 |
| 22 | dashboardページ群 | `apps/dashboard/src/app` | 346 | 0.14 |
| 26 | dashboard lib | `apps/dashboard/src/lib` | 122 | 0.25 |
| 30 | db repositories | `packages/db/src/repositories` | 110 | 0.09 |
| 19 | bot commands | `apps/bot/src/commands` | 73 | 0.25 |
| 23 | dashboard auth系ルート | `apps/dashboard/src`直下(auth.ts, dashboard-auth.ts, discord-api.ts) | 38 | 0.18 |
| 24 | dashboard UIコンポーネント | `apps/dashboard/src/components` | 37 | 0.02 |
| 36 | shared | `packages/shared/src` | 36 | 0.45 |
| 34 | logger | `packages/logger/src` | 34 | 0.35 |
| 28/29/31 | db drizzle/maintenance/schema | `packages/db/{drizzle,maintenance,schema}` | 12/12/10 | 低〜中 |
| 21 | bot起動 | `apps/bot/src`(runtime.ts) | 9 | 0.07 |
| 27 | config | `packages/config/src` | 9 | 0.10 |
| 32/33 | discord-core | `packages/discord-core/src` | 6/4 | 0.27/0 |
| 25 | dashboard hooks | `apps/dashboard/src/hooks` | 4 | 0 |
| 35 | redis | `packages/redis/src` | 2 | 0.13 |

`components-handle`(0.02)と`repositories-guild`(0.09)は凝集度が極端に低く、「フォルダが同じだから同じコミュニティ」なだけで、実際には互いをあまり呼び合っていない = フォルダ境界がモジュール境界として機能していない兆候。

### クロスコミュニティ結合(6件の警告、すべて実際のエッジをサンプリングして検証済み)

1. dashboardページ群 ↔ UIコンポーネント(278エッジ) — shadcnプリミティブへの参照。想定内、問題なし。
2. dashboardページ群 → dashboard lib(135エッジ) — 特に`logs-explorer.tsx`単体で`event-display.ts`へ24エッジ。`logs-explorer.tsx`がイベント整形ロジックを抱え込みすぎている兆候。
3. dashboardページ群 → auth系(53エッジ) — 全APIルートが共通ミドルウェアを使わず、個別に認証呼び出しを手書きしているパターンを裏付け。
4. **bot commands → discord-voice(46エッジ)** — 実質的な問題あり。`commands/{setup,recruitment,tts}.ts`が`discord/components-v2.ts`のComponents V2組み立てロジックへ直接依存。コマンドハンドラごとに「Components V2メッセージを作る」処理を再実装している。
5. UIコンポーネント → dashboard lib(27エッジ) — `cn()`ヘルパー依存、shadcn標準パターンで問題なし。
6. bot起動 → discord-voice(17エッジ) — `runtime.ts`がbot全体の配線を担う構成ルートファイル。想定内だが、bot全体の単一障害点になっている。

### ブリッジノード(アーキテクチャ上のチョークポイント、介在中心性が高い順)

- `handleTempVoiceControlInteraction`(`apps/bot/src/discord/temp-voice-controls.ts`) — グラフ全体で最高スコア
- `handleRecruitmentButtonInteraction`(`apps/bot/src/discord/recruitment-interactions.ts`)
- `handleSetupCommand`(`apps/bot/src/commands/setup.ts`)
- `handleTtsMessage`(`apps/bot/src/discord/tts-message-reader.ts`)
- `cn`(`apps/dashboard/src/lib/utils.ts`)、`getDashboardLocale`(`apps/dashboard/src/lib/locale.ts`)がdashboard側のブリッジ

### 影響半径(2-hop、すべて"high"判定)

| 変更対象 | 影響ノード数 | 影響ファイル数 |
|---|---|---|
| `apps/dashboard/src/app/overview-client.tsx` | 466 | 180 |
| `apps/bot/src/discord/components-v2.ts` | 386 | 132 |
| `apps/dashboard/src/lib/locale.ts` | 309 | 111 |
| `apps/dashboard/src/app/settings/components/TtsSettingsTab.tsx` | 207 | 127 |

`locale.ts`(in-degree 45)と`components-v2.ts`(in-degree 53)は、ほぼ全機能から参照される「載荷ユーティリティ」であり、形状を変えると100ファイル以上に影響する。

---

## 3. 機能ごとの実態仕様(旧仕様書との差分)

### 3.1 ロギング

**実態**: Discordゲートウェイイベント → `apps/bot/src/discord/gateway-logs/*.ts`のカテゴリ別ハンドラ(channel, role, guild, message, voice, thread/invite, emoji/sticker, automod, integration, poll/audit, scheduled-event, stage) → `log-writer.ts` → Postgres `logs`テーブル + Redis Stream。**`message.create/update/delete`のみ**が汎用`EventDispatcher`(`packages/discord-core/src/dispatcher.ts`)を通り、それ以外の全カテゴリは`gateway-logs/*.ts`で`client.on(...)`に直接ハンドラを繋いでおり、dispatcherを経由しない。

Audit Log相関機能(`apps/bot/src/discord/audit-log.ts`) — actor不明のイベントに対しGuild Audit Logを取得し`payload.auditLog`を付与(権限不足時は`status: "missing_permission"`)。**旧仕様書に一切記載なし**。

**DBスキーマ**(`packages/db/src/schema/core.ts:109-134`): 単一`logs`テーブル。`eventName, guildId, actorId, channelId, messageId, eventTimestamp, receivedAt, realtimeEnabled, payload jsonb`。**月次パーティションは未実装**(btreeインデックスのみ)。

realtime振り分けは`packages/shared/src/events.ts`。Redis Stream(`packages/logger/src/log-stream.ts`)はキー`logs:events`/`rt:logs:<guildId>`で単純な`xAdd`/`xRead`。**コンシューマグループ・XACK・pending recovery機構は存在しない**(リポジトリ全体をgrepして確認)。

**主な乖離**:
- §7「月次partition」→ 未実装
- §17「ACK / pending recovery」→ 未実装、fire-and-forgetな`xAdd`/`xRead`のみ
- §8 realtime OFFリストの`voice.session.join/leave`は実際は**ON**(逆転)
- `member.join/leave/update`、`voice.session.move`、`recruitment.reopened/expired`など仕様書未記載のイベントが多数追加済み

**未記載の追加機能**: Audit Log相関、thread/invite/emoji/sticker/webhook/automod/integration/poll/scheduled-event/stage系の広範なゲートウェイカテゴリ、`guildConfigs.logMode`(full/metadata_only/disabled)。

---

### 3.2 一時VC(Temp VC)

**実態**: `guildConfigs.tempVoiceCreateChannelId`への入室で`🎮 {displayName}`のVCと専用テキスト制御チャンネル`control-🎮 {displayName}`(オーナー専用)を作成。Components V2パネルのボタン: **rename, lock/unlock, hide/show, user-limit, user-management**。空室5秒後削除(仕様書通り)。オーナー退出後**10分の猶予タイマー**後に`joinedAt`→`joinOrder`順で次オーナーへ再割当(**この10分猶予は旧仕様書に記載なし**)。

**重大な欠落**: **ビットレート制御はコード上どこにも存在しない**。旧仕様書§10は「ビットレート(8〜384kbps)」を明記しており、現行の`docs/features/temp-vc.md`も(誤って)これを記載し続けている。ドキュメントと実装が両方とも旧仕様書を引き継いで書かれ、実装漏れに気づいていない状態。

**未記載の追加機能**:
- ユーザー個別の許可/拒否ボタン(`allow-target`/`deny-target`) — チャンネル全体のlock/unlockとは別に、特定メンバーのConnect権限を個別制御
- **手動オーナー移譲**(`transfer-target`ボタン) — 自動再割当とは独立して、オーナーが任意のタイミングで誰かに移譲可能
- Bot再起動時の孤児Temp VC自動クリーンアップ(`reconcileTempVoiceChannels`)

---

### 3.3 通話可視化(Voice Activity)

**実態**: 全VCの人間の入退室を追跡。最初の入室でCall Session作成、"Started"のComponents V2メッセージを投稿。1分経過で"Active"に編集、以降**60秒ごとに自動更新**(旧仕様書未記載)。1分未満で終了した通話はActiveを経ずStarted→Endedへ遷移。

**DBスキーマ**: `callSessions`(`status: active|ended`、guildId+channelIdでアクティブ1件のみの部分ユニークインデックス)、`callSessionMembers`(joinOrder, joinedAt, leftAt)。`callSessions`はTemp VCの`call_session_id`と共有されており、この機能間結合は旧仕様書に記載なし。

---

### 3.4 募集(Recruitment)

**実態**: `/recruitment create`モーダル(title 80字, capacity 1-99, content 1000字, **deadline_days**)。`deadline_days`は`.setRequired(false)`で**入力任意**(`apps/bot/src/commands/recruitment.ts:182`)、未入力時は`RECRUITMENT_DEADLINE_DEFAULT_DAYS`(7日、`packages/shared/src/settings.ts:3`)が適用される(`recruitment.ts:229-232`)。DB側`deadlineAt`カラムも`.notNull()`ではない(`packages/db/src/schema/core.ts:260`)。実質的にほぼ全ての募集にデッドラインが設定される運用になるが、「必須項目」ではなく「未入力時デフォルト適用」という設計である点に注意。バックグラウンドスケジューラが期限切れを自動クローズし、24時間前・1時間前にカウントダウン表示を更新。**定員超過時は待機列(queue)に入り、空きが出ると自動繰り上げ**。

**旧仕様書との重大な乖離**: §12は「**auto_close ON/OFF切替可能なブール値**」("ON: 定員到達→full, 退出→open復帰" / "OFF: 人数超過可能")と記載しているが、**`autoClose`カラムはスキーマに存在しない**。実装はこれをブール切替ではなく**デフォルト付きデッドライン+待機列システム**に置き換えており、仕様書の機能を包含する上位互換ではなく、別物の仕組みになっている。genreも候補+自由入力ではなく単純な自由テキストタイトル。

---

### 3.5 TTS

**実態**: `/setup tts`, `/join`, `/force-join`(オーナー/管理者限定・確認モーダル), `/leave`, `/speaker set|server-default`。ガードレール: bot/空/`/`または`//`始まり/120字超のメッセージをスキップ、**ユーザーごとレート制限(10秒に5メッセージ)**(旧仕様書未記載)、辞書置換は正規表現禁止(仕様書通り)+**最大50回の置換上限**(定数値はどのドキュメントにも未記載)。`sanitizeTtsText`はコードブロック・絵文字・Markdown強調・引用記号除去・顔文字ヒューリスティックまで行うが、これらの広範なサニタイズは旧仕様書のURL/メンション除去+120字切り詰めのみの記載を大きく超えている。

VOICEVOXリトライは3回・線形バックオフ(250ms刻み) — 旧仕様書の「VOICEVOX: 2」と食い違う(実際は3)。

---

### 3.6 Dashboard / 認証 / RBAC

**実態**: Discord OAuth(identify+guilds)。ロール: owner(Discordギルドオーナーと動的比較、DB非保存)/admin・viewer(`dashboardAccessGrants`に保存)。API は**すべてNext.js Route Handlers(REST)** — **実装コード中にtRPCの使用箇所はゼロ**(`trpc`という語自体は旧仕様書や本ドキュメントのテキスト中にはヒットするが、実際のソースコードでは未使用)、旧仕様書§2/§24の中核技術選定が実現されていない。Socket.ioリアルタイムは仕様書通り実装済み。

**重大な未記載機能**: `apps/bot/src/discord/member-auto-grant.ts`が**サーバー参加時に全メンバーへ自動でviewer権限を付与**し、退出時に自動剥奪。Bot起動時・ギルド参加時には既存メンバー全員に対して整合性再構築も行う。つまり実態は「明示的な権限付与モデル」ではなく「**デフォルトで全メンバーがviewerとしてログイン可能**」という、旧仕様書のRBAC観(§14, §28)とは前提が異なる設計になっている。

設定タブは旧仕様書/現行docsの想定より大幅に細分化されている(`AccessGrantsTab`, `BotLanguageTab`, `LanguageTab`, `LogsSettingsTab`, `PersonalSettingsTab`, `RecruitmentSettingsTab`, `TtsPersonalTab`, `TtsSettingsTab`, `VoiceSettingsTab`)— `feat/settings-redesign`進行中の影響で、現行`docs/dashboard/pages.md`(6セクション想定)にすら反映されていない。

i18n(英語/日本語ロケールシステム、`guildConfigs.language`)は旧仕様書に一切概念がないが、ほぼ全てのユーザー向けメッセージとDashboard専用タブに及ぶ大規模機能。

---

### 3.7 System Health

**実態**: PostgreSQL/Redis/VOICEVOXの**3項目のみ**を確認する単純なプローブ。ゲートウェイレイテンシ・キュー長・CPU・メモリ・Dockerステータス・**アラート機構は一切存在しない**。

**旧仕様書との重大な乖離**: §15は表示項目として9個(Gateway latency, queue length, Redis ping, PostgreSQL latency, PostgreSQL size, VOICEVOX latency, CPU, Memory, Docker status)を挙げているが、実装は`database`/`redis`/`voicevox`の3プローブのみ(`apps/dashboard/src/app/api/health/route.ts:14`)。残り6項目(Gateway latency, queue length, PostgreSQL size, CPU, Memory, Docker status)は未実装。アラート一覧(bot crash, database error等)は単なるログイベント名(`system.*.error`)であり、通知チャンネルやダッシュボードアラートバナーなどの専用アラート機構は存在しない。この節は最も「仕様書が実装より先行している(未達)」割合が大きい領域。現行`docs/dashboard/pages.md`は既に縮小版の実態(3項目のみ)を反映しているため、乖離しているのは旧仕様書のみ。

---

### 3.8 Backup / Archive

**実態**: PostgreSQLバックアップはDocker Composeの`backup`サービス(`maintenance`プロファイル)で手動実行、スケジューリングなし。ログアーカイブは`pnpm logs:archive`で180日→アーカイブ、365日→削除(日数は仕様書通り)。出力形式は**`.json.gz`**(仕様書は`.sql.gz`かつ月次命名を想定 — 実際はISOタイムスタンプ命名で形式・命名とも異なる)。

自動スケジューラは両方とも存在せず、cron/手動実行前提。旧仕様書は「System Health」配下の一級プラットフォーム機能として想定しているが、実態は運用者が手動で叩くスクリプトに留まる。

---

## 4. 横断的な重要ポイント(まとめ)

1. **tRPCは実装コードでは未使用** — API設計(§2/§24)は構想のみで、実態はREST route handlers(旧仕様書自体や本ドキュメントのテキストには「tRPC」という語自体は登場するが、実装コード中に使用箇所はない)。
2. **月次ログパーティション・Redis Streamコンシューマグループ/ACKは未実装**(§7/§17/§28で重要視されているにも関わらず)。
3. **i18nロケールシステム**が、旧仕様書に概念すらないまま大規模に実装されている。
4. **全メンバー自動viewer権限付与**(`member-auto-grant.ts`)が、旧仕様書のRBACモデルの前提を覆している。
5. **Temp VCのビットレート制御は仕様書・現行docsの両方に記載があるが実装がない** — 旧仕様書とは無関係な、ドキュメントとコードの単純な不一致。
6. **募集のauto_closeブール切替は存在せず**、デッドライン+カウントダウン+待機列という別方式に置き換わっている。
7. **System Healthが最も実装遅れが大きい領域** — 9項目中6項目とアラート機構全体が未実装。

---

## 5. コード構造の問題点

### 5.1 肥大化ファイル(行数上位、`dist/`除く)

**apps/bot/src**
| 行数 | パス |
|---|---|
| 840 | `apps/bot/src/discord/temp-voice.ts` |
| 768 | `apps/bot/src/discord/temp-voice-controls.ts` |
| 615 | `apps/bot/src/discord/tts-message-reader.test.ts` |
| 602 | `apps/bot/src/commands/tts.ts` |
| 564 | `apps/bot/src/discord/temp-voice-controls.test.ts` |
| 548 | `apps/bot/src/discord/voice-activity.ts` |
| 531 | `apps/bot/src/discord/voice-activity.test.ts` |
| 470 | `apps/bot/src/discord/tts-message-reader.ts` |
| 420 | `apps/bot/src/discord/recruitment-interactions.test.ts` |
| 391 | `apps/bot/src/discord/recruitment-interactions.ts` |

**apps/dashboard/src**
| 行数 | パス |
|---|---|
| 1049 | `apps/dashboard/src/lib/locale.ts` |
| 615 | `apps/dashboard/src/app/panel/panel-dashboard.tsx` |
| 613 | `apps/dashboard/src/app/recruitment/recruitment-dashboard.tsx` |
| 569 | `apps/dashboard/src/lib/event-display.ts` |
| 564 | `apps/dashboard/src/app/logs/logs-explorer.tsx` |
| 411 | `apps/dashboard/src/app/tts/tts-dashboard.tsx` |
| 401 | `apps/dashboard/src/app/overview-client.tsx` |

**packages/*/src**
| 行数 | パス |
|---|---|
| 430 | `packages/db/src/schema/core.ts` |
| 402 | `packages/db/src/repositories/recruitments.ts` |
| 361 | `packages/shared/src/locale.ja.ts` |
| 356 | `packages/shared/src/locale.en.ts` |

注: `overview-client.tsx`は401行と決して長くないが、out-degree 89(リポジトリ最大)。「Godコンポーネント」の問題は行数ではなくfan-outの密度にある。既知のhubタブのほとんどが同様。

`packages/db/dist/src/schema/core.d.ts`(1913行)がビルド成果物としてワークツリーに存在するが、`.gitignore:6`の`dist/`により`git status --ignored`で`!!`(ignored)と確認済み — git管理下には入っていない。

### 5.2 重複コード

**確認された重複: 4つのほぼ同一な「設定セクションコンテナ」コンポーネント**

- `LogsSettingsPanel.tsx`(81行)、`VoiceSettingsPanel.tsx`(74行)、`RecruitmentSettingsPanel.tsx`(69行)、`TtsSettingsPanel.tsx`(102行)

4つとも同一のfetch/save/loading定型パターンを個別に持っている:
```tsx
const [settings, setSettings] = useState<SettingsResponse | null>(null);
const [saving, setSaving] = useState(false);
useEffect(() => { fetchSettings(guildId).then(...).catch(e => toast.error(...)) }, [guildId]);
async function save() { setSaving(true); try {...; toast.success(...)} catch(e){toast.error(...)} finally{setSaving(false)} }
if (!settings) return <Skeleton />;
```
`apps/dashboard/src/app/settings/hooks/useTtsSettings.ts`という共通化フックの先例が既に存在するにも関わらず、他3つのパネルには一般化されていない。共有`useSettingsSection(guildId, updateFn)`フックへの抽出が明確に有効なケース。

### 5.3 パッケージ境界

`packages/shared`のDB/discord.js非依存ルールは**違反なし**(zodのみに依存、確認済み)。健全。

### 5.4 Git運用の乱れ

- **ブランチ数185(ローカル) / 187(`git branch -a`基準)**。`phase/0-foundation`〜`phase/14-ui-ux-redesign`、`feature/issue-11-*`〜`feature/issue-180-*`など、マージ済みで削除されていない大量の残骸ブランチ。`worktree-agent-*`のようなエージェント作業用ブランチも未削除で残存。
- **マージ戦略が不統一**: squash merge・通常merge commit・PR経由なしの直接コミットが混在。
- 同一のリファクタリングが並行ブランチで二重に実行された形跡あり(`refactor/code-quality-*`系で内容がほぼ同じコミットが複数ペア存在 — 監査/リファクタエージェントが2回走った可能性)。
- ドキュメント再構成コミット(`docs: 機能単位に再構成し...`)が同一diff統計で2回適用されたように見える箇所があり、rebase時の重複適用の疑いあり(要確認)。
- revert・WIP系コミットメッセージは見当たらず、その点は健全。

### 5.5 デッドコード

`refactor_tool(dead_code)`は93件検出したが大半はNext.jsのroute handler(`GET`/`POST`等)やNextAuthコールバックのフレームワークエントリポイントで、誤検知。

**実際にデッドと確認できたもの**:
- `prefetchUsers`(`apps/dashboard/src/components/user-cache.ts:14`)
- `isGuildLogMode`(`packages/db/src/repositories/guilds.ts:240`)

**要目視確認(グレー)**: `LocalTtsPlaybackQueue`, `DiscordApiError`, `createDiscordClient`, `updateSettings`, `getRecruitmentByMessageId`, `setRecruitmentDeadline`, `setTtsDictionaryEntryEnabled`, `listActiveCallSessionsByGuildId`, `requestSaveManagementRoles`

---

## 6. 旧仕様書 vs 実装 — 差分サマリ

| 項目 | 旧仕様書 | 実装 |
|---|---|---|
| API層 | tRPC | Next.js Route Handlers(REST) |
| ログ保存 | 単一テーブル+月次partition | 単一テーブル、partitionなし |
| Redis Stream | ACK・pending recovery | fire-and-forget、ACKなし |
| 一時VCビットレート制御 | あり(8〜384kbps) | **未実装** |
| 一時VCオーナー移譲 | 自動再計算のみ | 自動(10分猶予)+手動移譲ボタン追加 |
| 募集auto_close | ブールON/OFF切替 | **存在せず**、必須デッドライン+待機列に置換 |
| RBAC | 明示的grant前提 | 全メンバー自動viewer付与 |
| System Health項目 | 8項目+アラート機構 | 3項目のみ、アラート機構なし |
| Backup/Archive形式 | `.sql.gz`月次 | `.json.gz`タイムスタンプ命名 |
| i18n | 概念なし | 英語/日本語ロケールシステムが全面実装済み |
| VOICEVOXリトライ回数 | 2回 | 3回 |

---

## 7. 本ドキュメントの位置づけ

これは実装の実態を記録したものであり、リライトの設計そのものではない。次のステップ(別セッション)では、この棚卸し結果を入力として新アーキテクチャ・技術選定・パッケージ分割方針を設計する。既存の`discord_bot_complete_detailed_specification.md`は参照用として変更せず残す。

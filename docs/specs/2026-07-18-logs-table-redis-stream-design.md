# logsテーブル + Redis Stream基盤 — 設計仕様書

作成日: 2026-07-18
対象issue: #26 `packages/logging: logsテーブルとRedis Stream基盤を実装する`

## 1. 背景・目的

イベントログの保存先(DB)と、realtime配信のためのキュー基盤がまだない。旧実装(`C:\Users\Yuzuki\Documents\discord_bot`)の`packages/db`(logsテーブル)と`packages/logger`(log-stream.ts, realtime-policy.ts)を、新アーキテクチャ(`docs/specs/rewrite-architecture-design.md`§3の4層構成)に沿って移植する。

## 2. スコープ

**含む**:
- `packages/db`: `logs`テーブルのスキーマ追加 + 最小限の書き込みrepository(`insertLogEvent`)
- `packages/shared`: realtimeデフォルト振り分けイベント名リスト、正規化イベントのzodスキーマ
- `packages/logging`(新規パッケージ): realtime判定ロジック、Redis Stream読み書きのプリミティブ

**含まない(別issueの責務)**:
- `log-writer.ts`(DB+Streamへの統合書き込み)、message系ハンドラの実装 → #27
- member/role/channel/guild系ハンドラの実装 → #28
- `listLogEvents`(検索・一覧・ページング) → #31(Logsページ)
- コンシューマグループ・XACK・pending recovery → #56
- `guildConfigs.logMode`による保存モード切り替え → #57

## 3. `packages/shared`

### `src/events.ts`(新規)

旧実装の`realtimeDefaultEnabledEvents` / `realtimeDefaultDisabledEvents`をそのまま移植する。`docs/current-state-audit.md`§3.1の指摘通り、`voice.session.join/leave`は(旧仕様書の記載と逆で)**ON**側に含める。

```ts
export const realtimeDefaultEnabledEvents = [...] as const;
export const realtimeDefaultDisabledEvents = [...] as const;
export const eventNameSchema = z.string().min(1).max(128);
```

### `src/logs.ts`(新規)

`log-stream.ts`が受け取る正規化イベントの契約。旧実装の`normalizedEventSchema` / `NormalizedEvent`をそのまま移植する。

```ts
export const normalizedEventSchema = z.object({
  eventTimestamp: z.coerce.date(),
  receivedAt: z.coerce.date(),
  eventName: z.string().min(1),
  guildId: z.string().min(1).nullable(),
  actorId: z.string().min(1).nullable(),
  channelId: z.string().min(1).nullable(),
  messageId: z.string().min(1).nullable(),
  payload: z.record(z.string(), z.unknown())
});
```

## 3.5 検証: 全イベントカテゴリがこのカラム形状に適合することの確認

「できるだけどのログでもカラムの形にそぐうように」という観点で、旧実装の`apps/bot/src/discord/gateway-logs/`配下の全13カテゴリ(channel, role, guild, message, voice, thread/invite, emoji/sticker, automod, integration, poll/audit, scheduled-event, stage)を確認した。

すべてのカテゴリは`payloads.ts`が公開する7つの共通ビルダーのいずれか経由で、最終的に`createEvent()`が返す同一の5フィールド形状に正規化されている。例外(カテゴリ固有の追加トップレベルフィールドを持つもの)は存在しない。

| ビルダー | 用途 | 使用カテゴリ |
| --- | --- | --- |
| `createGuildEvent` | guildId+actorIdのみ確定、channel/messageなし | guild, member, role, emoji, sticker, automod, integration, stage, scheduled-event, poll(投票) |
| `createChannelEvent` | channelId確定、actorIdなし | channel, webhook, message.bulk_delete |
| `createThreadEvent` | channelId=thread.id | thread |
| `createInviteEvent` | channelId=招待先チャンネル | invite |
| `createReactionEvent` | channelId+messageId確定 | message.reaction |
| `createVoiceEvent` | actorId+channelId確定 | voice |
| `createEvent`(直接) | 上記に当てはまらない特殊系(message.delete等) | message |

いずれもnullable列(`guildId` / `actorId` / `channelId` / `messageId`)に値が入るか`null`になるかの差でしかなく、カテゴリごとに列を追加する必要はない。この検証により、§4のスキーマがカラム追加なしで全ログカテゴリに適合することを確認した。

## 4. `packages/db`

### `src/schema/core.ts`に`logs`テーブルを追記

既存の`guilds` / `dashboardAccessGrants`と同じファイルに追記する(現状69行、肥大化懸念なし)。

```ts
export const logs = pgTable(
  "logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventName: text("event_name").notNull(),
    guildId: text("guild_id").references(() => guilds.guildId, { onDelete: "cascade" }),
    actorId: text("actor_id"),
    channelId: text("channel_id"),
    messageId: text("message_id"),
    eventTimestamp: timestamp("event_timestamp", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    realtimeEnabled: boolean("realtime_enabled").notNull().default(false),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`)
  },
  (table) => ({
    eventNameIdx: index("logs_event_name_idx").on(table.eventName),
    guildIdIdx: index("logs_guild_id_idx").on(table.guildId),
    actorIdIdx: index("logs_actor_id_idx").on(table.actorId),
    channelIdIdx: index("logs_channel_id_idx").on(table.channelId),
    receivedAtIdx: index("logs_received_at_idx").on(table.receivedAt),
    guildReceivedAtIdx: index("logs_guild_received_at_idx").on(table.guildId, table.receivedAt)
  })
);
```

旧実装との差分は`guildId`のFK制約(`guilds.guildId`参照、`ON DELETE CASCADE`)のみ。`dashboardAccessGrants`と一貫性を取るためにユーザー承認済みで追加する。

**トレードオフ(要留意)**: guild未登録のタイミングでイベントを受信するとinsertが失敗しうる。#27/#28でハンドラを実装する際は、`ensureEveryoneBaselineGrant`同様にguildの存在を先に保証する(upsert)必要がある。system系イベント(`system.bot.crashed`等)は`guildId: null`のままでよい(NULLはFK制約の対象外)。

### `src/repositories/logs.ts`(新規)

```ts
export interface InsertLogEventInput {
  eventName: string;
  guildId?: string | null;
  actorId?: string | null;
  channelId?: string | null;
  messageId?: string | null;
  eventTimestamp?: Date;
  receivedAt?: Date;
  realtimeEnabled?: boolean;
  payload?: Record<string, unknown>;
}

export async function insertLogEvent(db: DbClient, input: InsertLogEventInput) { ... }
```

旧実装から`listLogEvents` / `recordSystemBotStarted` / `discordChannels`とのJOINは除外する(範囲外)。

## 5. `packages/logging`(新規パッケージ)

`docs/specs/rewrite-architecture-design.md`§3の4層構成のうち、今回必要な`domain/`と`application/`のみ作成する(`discord/` `router/`は#27/#28/#31で必要になった時点で追加)。

### `src/domain/realtime-policy.ts`

DB・discord.js非依存の純粋関数。旧実装の`resolveRealtimeEnabled`をそのまま移植。

### `src/application/log-stream.ts`

Redis I/Oを行うが、`redis`パッケージへの直接依存は持たない(`RedisStreamWriter` / `RedisStreamReader`インターフェースを引数で受け取るDI方式。旧実装踏襲)。

- `appendLogEventToStream`: `logs:events`ストリームへxAdd
- `appendRealtimeLogEventToStream`: `rt:logs:<guildId>`ストリームへxAdd(guildIdがnullの場合は何もしない)
- `readRealtimeLogEvents`: Dashboard側からのxRead

## 6. パッケージ構成

```
packages/logging/
  package.json
  tsconfig.json
  src/
    index.ts
    domain/
      realtime-policy.ts
      realtime-policy.test.ts
    application/
      log-stream.ts
      log-stream.test.ts
```

依存: `@sm-bot/shared`のみ(`db`には依存しない。DB書き込みは#27の`log-writer.ts`が`logging`と`db`の両方を呼び出して統合する)。

## 7. テスト方針

- `packages/shared`: イベント名リストの重複がないことの単体テスト
- `packages/db`: `dashboard-access-grants.test.ts`と同パターンでローカルDB(`DATABASE_URL`)必須の制約テスト(FK制約違反、CHECK制約、insertLogEventの正常系)
- `packages/logging`: `realtime-policy` / `log-stream`のフェイク実装による純粋関数の単体テスト(実Redis不要)

## 8. スコープ外・既知の懸念(参考記録)

- 月次パーティション未実装(`docs/current-state-audit.md`§3.1で既知の旧仕様書との乖離。今回のissueでは対応しない)
- `payload`内の`targetId`(ban/kick/timeout対象者)は旧実装同様インデックスなし。Dashboard側での対象者検索が必要になった場合は別issueで再検討する

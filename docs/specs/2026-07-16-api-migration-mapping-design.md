# 旧API → 新tRPC移行マッピング設計書

作成日: 2026-07-16
前提資料: `docs/specs/rewrite-architecture-design.md`(§4 API層/tRPC, §6 権限モデル)、`docs/current-state-audit.md`
調査対象: 旧リポジトリ `C:\Users\Yuzuki\Documents\discord_bot` の `apps/dashboard/src/app/api/` 配下20ルート(約2,110行)+ 対応フロントエンド

## 1. 目的・スコープ

新アーキテクチャではAPI層をREST route handlersからtRPCへ全面移行する方針が既に確定している(`rewrite-architecture-design.md` §4)。本書はその実装計画(`writing-plans`)の入力として、**旧APIが実際に「何をできて」「何をできないか」を機能単位で棚卸しし**、新tRPC router(ドメインパッケージの`router/`層)への対応を明確化する。

目的は3点:

1. 旧route 1本ごとの入力/出力/副作用/エッジケースを正確に記録し、実装時に「これ取得できないんだけど」という手戻りを防ぐ
2. 新しい能力ベースRBAC(§6)への`requiredRole`(viewer/admin/owner)の対応表を作る
3. 旧実装のバグ・認証漏れ・設計の歪みを「そのまま移行するもの」「意図的に直すもの」に仕分けする

スコープ外: 実装コード自体、各procedureの詳細zodスキーマの確定(実装計画フェーズで詰める)。

## 2. 全体マッピング表

| 旧route | 新router(ドメインパッケージ) | 備考 |
|---|---|---|
| `GET /api/guilds` | `dashboard-access` router | ドメイン非依存、ギルド選択画面用 |
| `GET/POST/PATCH/DELETE /api/dashboard-access` | `dashboard-access` router | 権限モデル自体が変わる(§4.1) |
| `GET/PATCH /api/settings`(全section) | 各ドメインpackageの`router/`に分割 | 1エンドポイント統合→ドメイン別procedureに分割(§4.2) |
| `GET /api/tts`, `/api/tts-settings`, `/api/tts/preview`, `/api/panel/dictionary`, `/api/panel/speaker`, `/api/panel/speakers` | `packages/tts` router | |
| `GET /api/recruitments`, `/api/recruitments/[id]`, `/api/panel/recruitment` | `packages/recruitment` router | |
| `GET /api/logs` | `packages/logging` router | |
| `GET /api/overview` | `apps/dashboard`集約層(tRPC routerではない) | voice/recruitment/loggingの各routerを横断呼び出しして結合(§3.2) |
| `GET /api/voice` | `packages/voice` router | |
| `GET /api/health` | `apps/dashboard`直下、tRPC外の素のHTTPハンドラ | 共有シークレットヘッダー認証、capabilityモデル非依存(§3.5) |
| `GET /api/discord/users(/[userId])`, `/api/discord/channels/[channelId]`, `/api/discord/guilds/[guildId]/members` | `dashboard-access` router(Discord解決系) | 複数ドメインから使う横断ユーティリティ(§4.4) |

## 3. アーキテクチャ上の論点(先に合意が必要な箇所)

### 3.1 `settings`統合エンドポイントの分割

旧`GET/PATCH /api/settings`は1エンドポイントでlogs/tempVc/tts/recruitment全sectionを扱っていたが、新設計の依存ルール(`router/`→`application/`→`domain/`、ドメインパッケージ同士は非依存)では1つのrouterが他ドメインのテーブルを更新することはできない。従って**section単位でドメイン別routerに分割**する:

- `logs`section → `packages/logging`の`router.updateGuildLogSettings`
- `tempVc`section → `packages/voice`の`router.updateTempVcSettings`
- `tts`section(textChannelIdのみ) → `packages/tts`の`router.updateTtsChannel`
- `recruitment`section → `packages/recruitment`の`router.updateRecruitmentChannel`

フロント側は設定タブ4種が元々ドメイン別コンポーネントだったため、「1コンポーネント=1ドメインrouter呼び出し」に揃うだけで実質的な体験差はない。`dashboardManagementRoleIds`更新(owner専用)は`dashboard-access` routerに残す。

### 3.2 `overview`はドメイン横断集約 — dashboardアプリ層に置く

旧`/api/overview`はvoice+recruitment+logsの3テーブルを1リクエストで集約していたが、新設計ではドメインパッケージ同士が依存できない。**`overview`用の集約ロジックはどのドメインパッケージにも属さず、`apps/dashboard`側で各ドメインrouterを`createCaller`経由で並列呼び出しして結合する**(tRPCの`router/`ではなく、Server Component側の集約、または`apps/dashboard`専用の薄い集約router)。ドメインパッケージの独立性を守るための構造的な帰結であり、旧実装からの意図的な変更点。

### 3.3 Discord ID解決系(users/channels/members)は`dashboard-access`に置く【確定】

`/api/discord/users`, `/api/discord/channels/[channelId]`, `/api/discord/guilds/[guildId]/members`はログ・募集・TTS・アクセス管理など複数ドメインのセレクター/ピッカーコンポーネントから横断的に使われるユーティリティで、特定ドメインの業務ロジックを持たない。設計書§3の「`dashboard-access`はDiscordロール解決のために`core`のDiscord API薄いラッパーには依存してよい」という規定に沿い、実装(DB/キャッシュ/Discord API呼び出しロジック)は`dashboard-access` routerに集約する。

**権限ガードは汎用ガードを新設せず、呼び出し元ドメインのcapabilityをその都度指定する**。「対象guildへの何らかのアクセス権があれば通す」という汎用ガードは、意図しない用途への流用や権限境界の曖昧化を招くため採用しない。procedureは`resolveUsers(guildId, ids[], { requiredCapability })`のように呼び出し元が要求capabilityを渡す形にし、例えば募集画面からの利用は`view_recruitment`、アクセス管理画面からの利用は`manage_access`を要求する。実装コストは上がるが、権限境界がAPIシグネチャ上に明示される利点を優先する。

### 3.4 `view_logs_raw`ビットの使いどころ

新capability一覧には`view_logs`と`view_logs_raw`が別ビットとして既に定義されているが、旧実装の`/api/logs`は`viewer`ロールのみで生の`payload`フィールドまで無条件に返しており、raw/summary相当の区別が実装上存在しなかった。新実装では**`payload`フィールドの返却を`view_logs_raw`保有者に限定し、非保有者には`payload`を省いたレスポンスを返す**設計とする(procedureレベルでレスポンス整形を分岐)。旧仕様からの機能変更点として明示しておく。

### 3.5 `health`の認証要否【確定】

旧`/api/health`はDB/Redis/VOICEVOXのレイテンシ・死活情報を完全に無認証で公開していた。この情報は特定ギルドに紐づかず「サーバー運営者」というダッシュボードのcapabilityモデルとは別軸の権限を必要とするため、**Discordログイン/capabilityとは独立した共有シークレットヘッダー方式**で保護する: `x-health-token`ヘッダー(env変数`HEALTH_CHECK_TOKEN`等で管理)と一致しないリクエストは401で拒否する。監視ツール/CIからの疎通確認はこのトークンを付与して呼び出す運用とする。ダッシュボードのRBAC(capabilities)やNextAuthセッションには一切依存しないため、`dashboard-access`にも属さず`apps/dashboard`直下の独立したミドルウェア/route(またはtRPC外の素のHTTPハンドラ)として実装する。

### 3.6 テナント分離(クロスギルド境界)の実装原則【確定・全ドメイン共通】

「ログインしていればどこかのguildへのアクセス権は検証されている」だけでは不十分で、**guild-scoped procedureは以下3原則を必ず満たす**こととする。これは実装計画・コードレビューで機械的にチェックできる基準として本書に明文化する。

1. **guildId必須+毎リクエスト検証**: 全てのguild-scoped procedureは`guildId`を明示inputに取り、ミドルウェアが「`ctx.userId`が**その**guildIdに対して要求capabilityを持つか」を毎リクエスト計算する(セッションにキャッシュした過去の判定結果を使い回さない)。
2. **ネストしたリソースIDの所属検証**: `recruitmentId`のようにDBの主キーでリソースを取得するprocedureは、取得後に**そのリソース自身が持つ`guildId`と、入力(または認可済み)の`guildId`が一致するか**を必ず突合する。旧`recruitments/[id]/route.ts`が`recruitment.guildId !== authorization.guild.id`で行っていたパターンを、同種の「IDでリソースを取得する全procedure」に横展開する。**不一致時は原則`404`(NOT_FOUND)に統一する**(`403`だと「そのリソース自体は存在するが権限がない」ことを暴露してしまい、他guildにそのIDのリソースが存在するかどうかの推測に使われうる。監査要件上どうしても`403`で区別したい箇所があれば、その場所だけ例外として実装計画に理由を明記する)。
3. **DB書き込みは認可済みguildIdを使う**: 認可(原則1)を通過した後のDB操作は、クライアントが送ってきた`guildId`をそのまま使わず、**認可時にサーバー側で確定した`guildId`**を使う。旧`dashboard-access`のDELETE実装(`deleteDashboardAccessGrant(db, {guildId: authorization.guild.id, ...})`)がこのパターンで、他ドメインにも徹底する。

**旧実装で実際に発見した違反(修正必須)**: `GET /api/discord/channels/[channelId]`が使うDBキャッシュ関数`listDiscordChannelNamesByIds`(`packages/db/src/repositories/discord-channels.ts`)は`channelId`のみで検索し`guildId`を一切見ていない。このため、guild Aへの閲覧権限を持つユーザーが`?guildId=A`を付けたまま無関係なguild Bのchannel IDを問い合わせると、(a) DBキャッシュに既存の行があればguild Bのチャンネル名がそのまま漏洩し、(b) キャッシュミス時はBotトークンでDiscord APIから取得した上で`upsertDiscordChannel({channelId, guildId: A, ...})`が実行され、**そのチャンネルのDB上の所属guildIdが誤ってAに書き換わる**(データ破損を伴う二次被害)。新tRPCの`resolveChannel`では以下の両方を必須とする:
- DBキャッシュ参照を`WHERE channelId = ? AND guildId = ?`の複合条件にする(現状の単一キー検索を廃止)
- Discord APIから取得した場合は、レスポンスの`guild_id`フィールドと入力`guildId`が一致することを検証し、不一致ならエラーとしてDBに書き込まない(誤った紐付けでの上書きを防ぐ)

**補足(新規DBのため移行汚染の懸念は対象外)**: 本プロジェクトは新規リポジトリでのフルリライトであり(`rewrite-architecture-design.md` §7)、旧本番DBのデータを新DBへ移行する計画は存在しない。従って`discord_channels`相当のテーブルは新規作成され、旧実装の不具合(誤った`guildId`紐付け)によって汚染された既存データを引き継ぐ心配はない。新スキーマが最初から`(channelId, guildId)`複合キー/複合インデックスで設計されていれば十分。

**テスト計画への要求**: 原則1〜3それぞれについて、「アクセス権のないguildId/他guildのリソースIDを渡すと拒否される(かつ`404`で応答する)」ケースを実装計画のテスト項目に必須で含める。特に`resolveChannel`は上記の具体的な穴の回帰テストとして明記する。

## 4. ドメイン別詳細

### 4.1 RBAC/認証・アクセス管理

**現状(旧)**

- `GET /api/guilds`: ログインユーザーがアクセス可能なギルド一覧。Discord OAuthトークンで取得した所属ギルドのうち、(a) Discord上の管理権限を直接持つ、(b) user-level access grant保有、(c) 管理ロール保有 or role-level access grant保有、のいずれかを満たすものをDBの`getKnownGuildIds`で絞り込んで返す。認可chainが複雑(直接権限→DB grant→ロール照合の3段階フィルタ)。
- `GET/POST/PATCH/DELETE /api/dashboard-access`: `requiredRole: "owner"`固定。ギルドのaccess grant(user/role単位、role: viewer/admin)の一覧・追加更新・削除。
- 共通認証ヘルパー`authorizeDashboardApi`: NextAuth JWT検証→Discordアクセストークンのリフレッシュ→対象guildへの所属確認(`fetchCurrentUserGuildById`)→(ownerでなければ)ロールID取得→DB上のgrant/管理ロールと突合して`viewer/admin/owner`を算出。

**新tRPC対応案**

- `guilds.list`: procedure化。旧ロジックの3段階フィルタは維持しつつ、実効capabilities算出(§6.3の「user-level grant OR 全保有ロールのrole-level grantのOR結合」)に合わせて「1ビットでも持っていれば一覧に含める」に置き換え。
- `dashboardAccess.list/grant/revoke`: 【確定】認可は**二段階チェック**とする。(1) 呼び出し元が`manage_access`ビットを保有しているか、または対象guildのオーナーであること(=`manage_access`を持たない`view_*`等のみの保有者はそもそも呼び出せない)。(2) (1)を満たした上で、**付与/剥奪しようとしている対象ビットが呼び出し元自身の保有ビットのサブセットであること**(§6.4)、かつ`manage_access`ビット自体の付与/剥奪はguildオーナーのみ可能であること。旧実装は「owner以外は一切触れない」という単純な仕様だったため、**新実装は旧より柔軟(manage_access保有者も(2)の制約内で委任可能)**になる=意図的な機能拡張として設計書§6.4どおり採用する。

**意図的に落とす/変える機能**

- `dashboardManagementRoleIds`(旧: Discordロールを「管理ロール」として一括登録する仕組み)は、新RBACのrole-level capability grant(`targetType:'role'`)に統合される。専用フィールドとしては廃止し、`dashboard-access`のgrant操作の一種として扱う。

**移行時の落とし穴**

- 旧`resolveDashboardAccess`は`viewer < admin < owner`の**ランク比較**だが、新RBACはビットのOR結合であり上位互換関係がない。「viewer以上」のような単純比較のロジックは全て「特定capabilityビットを持つか」の検査に書き換える必要がある(設計書§6.5で既定路線)。
- guildオーナーは全ビット保持(DB非保存)という仕様は維持するが、旧実装のように`isGuildOwner`判定を都度Discord APIで取得する点は変わらないため、Discord REST呼び出し失敗時のフォールバック(旧: 403 "Guild access denied.")の扱いを踏襲する。

### 4.2 設定(settings)

**現状(旧)**: `GET/PATCH /api/settings`1エンドポイントでlogs/tempVc/tts/recruitment全section + `dashboardManagementRoleIds`を扱う。GETは`viewer`、PATCHは`admin`(ただし`dashboardManagementRoleIds`更新のみ`owner`)。PATCHは`section`ごとに異なるDB更新関数・フィールド名リネーム(`createChannelId`→`tempVoiceCreateChannelId`等)を行い、成功時`config.updated`ログイベントをfire-and-forgetで記録。

**新tRPC対応案**(§3.1の分割方針に基づく)

| section | 新procedure | 必要capability(read/write) |
|---|---|---|
| logs | `logging.router.getSettings` / `updateSettings` | `view_logs` / `manage_logging_settings` |
| tempVc | `voice.router.getSettings` / `updateSettings` | `view_voice` / `manage_voice` |
| tts | `tts.router.getSettings` / `updateChannel` | `view_tts` / `manage_tts` |
| recruitment | `recruitment.router.getSettings` / `updateChannel` | `view_recruitment` / `manage_recruitment` |
| dashboardManagementRoleIds相当 | `dashboard-access.router.grant`(role-level) | `manage_access`(付与制約は§6.4) |

**意図的に落とす/変える機能**

- 「1リクエストで全section取得」という旧GETの挙動は、フロント側が複数ドメインrouterを個別に`useQuery`する形に変わる(tRPCのバッチリンクで実質1往復に収まるため体験は劣化しない)。
- `config.updated`ログイベントの記録は各ドメインrouterのapplication層に個別実装(ドメイン別に切れた分、イベント名も`logging.settings.updated`のようにドメイン別に分離する想定)。

**移行時の落とし穴**

- 旧PATCHは「バリデーションはauthorizeより前に実行するが、エラーレスポンスは認証成功後まで返さない(=認証エラーが優先)」という非直感的な順序だった。tRPCの`protectedProcedure`はミドルウェアで認可を先に行う構造になるため、この優先順位は自然に変わる(認可エラーが常に先)。**フロント側のエラーメッセージ分岐がこの順序に依存していないか要確認**。
- `LogsSettingsPanel.tsx`は`settings-api.ts`のヘルパーを使わず生fetchしており、レスポンス型を実態と異なる形にキャストして使っていた(調査で判明した実装の歪み)。tRPCの型安全な`useMutation`に置き換えることで自動的に解消される。
- 空文字列→`null`変換(チャンネル未設定へのクリア操作)は`categoryId`/`createChannelId`/`channelId`等で行われていた。zodスキーマで`z.string().nullable()`とし、フロント側で空選択時に`null`を明示送信する規約を新設計でも踏襲する。

### 4.3 TTS/音声辞書

**現状(旧)**: 6ルート。`GET /api/tts`(サマリ、viewer)、`GET/PATCH/DELETE /api/tts-settings`(guild既定話者・guild辞書、PATCH/DELETEはadmin)、`GET/PATCH/DELETE /api/panel/dictionary`(ユーザー個人辞書、**viewerで自分の分のみ**編集可)、`GET/PATCH/DELETE /api/panel/speaker`(ユーザー個人話者、viewer)、`GET /api/panel/speakers`(VOICEVOX話者一覧)、`GET /api/tts/preview`(**無認証**、VOICEVOX音声合成プレビュー)。

**新tRPC対応案**

- `tts.router.getSummary` — `view_tts`
- `tts.router.getGuildSettings` / `updateGuildDefaultSpeaker` / `updateGuildDictionaryEntry` / `deleteGuildDictionaryEntry` — 読み取り`view_tts`、書き込み`manage_tts`
- `tts.router.getMySpeaker` / `updateMySpeaker` / `deleteMySpeaker` / `getMyDictionary` / `updateMyDictionaryEntry` / `deleteMyDictionaryEntry` — **自分自身の設定のみ**を扱うため`view_tts`で十分(旧仕様どおり、adminでなくてもよい。procedure内で対象を常に`ctx.userId`に固定するため権限昇格の余地がない)
- `tts.router.listSpeakers` — VOICEVOX話者一覧、`view_tts`
- `tts.router.preview` — 【確定】`guildId`を必須inputに追加した上で`view_tts`必須にする(旧: guildId概念自体が無く無認証)。`view_tts`はguildごとのビットのため、§3.6原則1に従い対象guildIdが無いと権限判定ができない。オープンプロキシ状態を解消する

**意図的に落とす/変える機能**

- 辞書登録は旧実装が「重複登録=無条件upsert」だった。この挙動(同一`fromText`への再登録は上書き)は維持する。意図的なエラー化(重複を弾く)は要件変更になるため、変えるなら明示合意が必要。
- 【確定】**speakerIdのVOICEVOX側実在性検証**を新規に追加する。対象は`updateGuildDefaultSpeaker`/`updateMySpeaker`(speakerIdを持つprocedure)のみ。旧実装は非負整数であれば任意のIDを保存可能で、プレビュー時に初めてVOICEVOX側のエラーで発覚する不整合があった。新実装ではこれらのprocedureで`listSpeakers`の結果とクロスチェックし、存在しないspeakerIdは保存時点で`TRPCError({code: "BAD_REQUEST"})`として弾く。**辞書エントリ(`updateGuildDictionaryEntry`/`updateMyDictionaryEntry`、`fromText`/`toText`)はVOICEVOX側に対応する実体を持たないテキスト変換ルールであり、実在性検証の対象外**(そもそも検証しようがない)。

**移行時の落とし穴**

- `/api/panel/dictionary`のGETは全件取得後にアプリ側で`scope==="user" && userId===自分`をフィルタする非効率実装だった。tRPC移行時はDBクエリ側で絞り込むよう修正して問題ない(振る舞いは変わらない、効率化のみ)。
- `/api/panel/speakers`はVOICEVOX障害時に空配列を返しエラーと未設定を区別できない仕様だった。tRPCの`TRPCError`で明示的にエラーコードを返すよう変更するかは実装計画で決定(フロント側のエラートースト表示に影響)。
- speakerId実在性検証の追加により、`listSpeakers`(VOICEVOX呼び出し)への依存が話者変更系procedureに生まれる。VOICEVOXが一時的に落ちている間は**話者変更のみ**保存できなくなる(辞書登録は影響を受けない)。フロント側のエラーメッセージで区別して明示する必要がある。

### 4.4 募集(recruitment)

**現状(旧)**: 3ルート。`GET /api/recruitments`(一覧、viewer)、`PATCH /api/recruitments/[id]`(close/reopen、**viewerは自分の募集のみ、admin/ownerは他人の分も操作可**というロール比較に加えた追加チェックあり)、`GET/POST /api/panel/recruitment`(チャンネル取得/募集作成、**作成もviewerで可能**=manage権限不要)。close/reopen時にDiscordメッセージをPATCH更新(失敗しても握りつぶし)。

**新tRPC対応案**

- `recruitment.router.list` — `view_recruitment`
- `recruitment.router.close` / `reopen` — `view_recruitment`を基本要件としつつ、procedure内で`creatorId === ctx.userId || ctx.capabilities.has(MANAGE_RECRUITMENT)`を追加検査(旧のrole比較による自分の投稿判定を、capabilityベースの「manage権限 or 本人」判定に置き換える)
- `recruitment.router.getPostChannel` / `create` — 【確定】`view_recruitment`のまま(旧仕様継続)。誰でも募集を立てられる仕様は「募集はメンバー主体の機能」という意図的な設計と判断し、権限格上げはしない。

**意図的に落とす/変える機能**

- close/reopenの「本人 or admin以上」制約は新capabilityモデル(`creatorId === ctx.userId || manage_recruitment保有`)でも同等ロジックとして維持する。
- 【確定】`voiceChannelId`を今回あわせて正式対応する。旧実装は`createRecruitment`の入力に含まれておらず常にnull扱いだったが、新実装では募集作成フォームにVoiceチャンネルセレクター(§Discord ID解決系、`view_recruitment`で`resolveChannel`/チャンネル一覧取得)を追加し、`recruitment.router.create`の入力に`voiceChannelId?: string`を正式に持たせ、募集メッセージ生成(`buildRecruitmentMessage`相当)でも表示するようにする。

**移行時の落とし穴**

- Discordメッセージ投稿・更新の失敗を握りつぶしAPIレスポンスは成功扱いにする非同期副作用パターンは、tRPCの`mutation`でも同様に「DB操作の成功可否とDiscord同期の成功可否を分離する」設計を踏襲する必要がある(全体をtry/catchで失敗にすると、DBは更新済みなのにエラー表示される不整合が起きる)。
- `voiceChannelId`正式対応に伴い、募集DBスキーマに新規カラムが必要になる可能性が高い(旧スキーマに保存先が無かったため)。実装計画でマイグレーション要否を確認する。
- 締切定数(`RECRUITMENT_DEADLINE_DEFAULT_DAYS`等)は`packages/shared`に移設が必要(フロント・バック双方参照)。

### 4.5 ログ/概要/Voice/ヘルスチェック

**現状(旧)**

- `GET /api/logs`: カーソルページング(`before`+`limit`)、`eventName`前方一致・`search`(`ilike`でeventName/payload両方)・`actorId`/`channelId`/`messageId`フィルタ。API層のバリデーションはほぼ無く、DB層(`clampLimit`, 上限1000)が最終防御。
- `GET /api/overview`: voice+recruitment+当日ログ(最大1000件固定、ページングなし)を1リクエストで集約。
- `GET /api/voice`: 薄いhandler、実体は`buildVoiceSummary`(アクティブ/終了セッション分離、Temp VC情報付加)。
- `GET /api/health`: DB/Redis/VOICEVOXの死活・レイテンシを**無認証**で返す。
- Socket.io realtime(`logs:event`): Cookie中のNextAuthセッショントークンを手動decode→ギルド所属・ロール確認→Redis Stream(`rt:logs:{guildId}`)を購読。tRPCとは別チャネルのまま(設計書§4で既定)。

**新tRPC対応案**

- `logging.router.listLogs` — `view_logs`(payloadは`view_logs_raw`保有時のみ、§3.4)。既存の`before`+`limit`カーソルページングを維持
- `logging.router.countTodayLogs` — 【新設・確定】`view_logs`。当日分のログ件数のみを`COUNT`クエリで返す軽量procedure
- `voice.router.getSummary` — `view_voice`
- overview集約は§3.2の方針でdashboardアプリ層に配置(tRPC routerではなく、各ドメインrouterを横断呼び出しする集約コード。特定ドメインrouterには実装しない)
- health は§3.5で確定した共有シークレットヘッダー方式で保護する。tRPCの`protectedProcedure`文脈(NextAuthセッション/capability)には一切乗せず、tRPC外の素のHTTPハンドラとして`apps/dashboard`直下に実装する

**意図的に落とす/変える機能**

- 【確定】`overview`の当日ログ`limit:1000`固定を廃止する。旧実装が1000件固定にしていたのは「その日のイベント総数」を表示するためだったと判明したため、**件数表示用途は`logging.router.countTodayLogs`(集計のみ、DB側で`COUNT`)に分離し、一覧表示用途は`logging.router.listLogs`のページング(`nextCursor`)に委ねる**。overview集約層は「件数」と「先頭N件のプレビュー」を別々に取得し、一覧全体が必要な場面ではlogsページ側の通常ページングに誘導する。

**移行時の落とし穴**

- 件数取得(`countTodayLogs`)は`COUNT`クエリのみでpayload等を取得しないため、旧実装よりDB負荷・レスポンスサイズは軽くなる想定。ただし当日ログ件数が多いギルドでは`COUNT`自体のコストがゼロではない点に注意(インデックス設計は実装計画で確認)。
- Socket.ioの認証(Cookie手動decode)は`dashboard-access`パッケージの共通ヘルパーとして切り出し、tRPCの`protectedProcedure`とロジックを重複させない(設計書§4に既定のとおり)。tRPC procedureではないが実質guild-scopedな認可処理であるため、**§3.6の3原則(guildId必須検証/リソース所属検証/認可済みguildIdでの参照)は`logs:subscribe`ハンドラにも同様に適用する**(`{guildId}`をsubscribe時に受け取り、購読対象のRedis Stream `rt:logs:{guildId}`は必ずこの認可済みguildIdから導出し、クライアントが送ってきた値を直接キーに使わない)。
- `voice`のフロント側は実は専用リアルタイムイベントを持たず、`logs:event`ストリームを間借りして`voice.*`イベント検知時にreloadする実装だった。新設計でSocket.ioチャネルを再設計するなら、この「間借り」を維持するか専用購読にするかは別セッションのVoice機能設計で扱う(本書はAPI層の範囲外として明記のみ)。

### 4.6 Discord連携(users/channels/members)

**現状(旧)**

- `GET /api/discord/users`, `/api/discord/users/[userId]`: **guildId概念自体が無く**、`getDashboardSession()`のみでログイン済みなら任意のDiscordユーザーIDをBotトークン経由で問い合わせ可能(ロール検証皆無)。5分メモリキャッシュ+100msスロットリング+429リトライあり。
- `GET /api/discord/channels/[channelId]`: `guildId`をqueryで受け取り`authorizeDashboardApi`で正しくロール検証。DBキャッシュ(`listDiscordChannelNamesByIds`)優先、なければDiscord API+fire-and-forgetでDB書き込み。
- `GET /api/discord/guilds/[guildId]/members`: path paramで`guildId`必須、`authorizeDashboardApi`で正しく検証。検索クエリのDiscord呼び出しに対してキャッシュ・リトライなし。

**新tRPC対応案**(§3.3の方針)

- `dashboard-access.router.resolveUsers(guildId, ids[], { requiredCapability })` — **guildId必須化**(旧では省略可能だった穴を塞ぐ)。汎用ガードは新設せず、呼び出し元ドメインが要求capabilityを指定する(§3.3で確定)。
- `dashboard-access.router.resolveChannel(guildId, channelId, { requiredCapability })` / `searchGuildMembers(guildId, query, { requiredCapability })` — 同様に呼び出し元が要求capabilityを指定。旧ロジックのguildId検証パターン自体は踏襲するが、`resolveChannel`は§3.6で発見した「DBキャッシュがguildIdを見ていない」不備を修正した実装にする(複合条件検索+`guild_id`突合)。

**意図的に落とす/変える機能**

- `users`/`users/[userId]`の**guildId無しでの任意ユーザー問い合わせ**は塞ぐ。ID直接入力を許さない設計原則(CLAUDE.md「Dashboard UIでID等を直接テキスト入力させない」)とも整合させるため、必ず「呼び出し元のguild文脈」を要求する形に変える。これは旧仕様からの明確なセキュリティ強化であり、破壊的変更として実装計画に明記する。

**移行時の落とし穴**

- `users`系のキャッシュ・スロットリング(5分TTL、100ms間隔シリアル化、429時最大3回リトライ)は、Discord APIレート制限対策として実装上有用な仕組みなので、guildId必須化後も**そのままdashboard-access側に移植する**(捨てない)。
- `channels`のDBキャッシュには無効化ロジックが無く、Discord側で改名されても追従しない。新実装でTTL付きにするか、Botのchannel updateイベントで無効化するかは別セッション(logging/core実装)で扱う課題として記録するに留める。
- 【確定】`members`検索(`searchGuildMembers`)は旧実装同様リトライ・キャッシュが無いまま素のBotトークン呼び出しにすると、あるguildでの検索連打がBot全体のDiscord APIレート制限を消費し他guildの動作にも影響しうる(可用性面でのテナント分離の穴)。今回の移行スコープで対応する: `users`系と同様の短命TTLキャッシュ(検索クエリ+guildId単位)とリトライ(429時`Retry-After`尊重)を`searchGuildMembers`にも実装する。フロント側の300msデバウンスは維持しつつ、サーバー側の防御を追加する形。

## 5. 設計判断の確定内容

すべて2026-07-16のレビューで確定した。

1. **`tts.preview`**: `view_tts`必須にする(旧: 無認証)。§4.3
2. **`health`**: ダッシュボードのcapabilityモデルとは独立した共有シークレットヘッダー(`x-health-token`)で保護する。§3.5
3. **募集の作成・close/reopen**: `view_recruitment`のまま(旧仕様継続、格上げしない)。§4.4
4. **TTS話者IDのVOICEVOX実在性検証**: 保存時に`listSpeakers`と照合するチェックを新規に追加する(対象はspeakerIdのみ、辞書エントリは検証対象外)。§4.3
5. **Discord ID解決系(users/channels/members)の権限ガード**: 汎用ガードは新設せず、呼び出し元ドメインが要求capabilityをその都度指定する。§3.3
6. **`overview`の当日ログ上限**: `countTodayLogs`(件数集計)と`listLogs`(ページング一覧)に分離し、1000件固定上限は廃止する。§4.5
7. **募集の`voiceChannelId`**: 今回あわせて正式対応する(DBスキーマ追加を伴う想定)。§4.4
8. **manage_access委任制約(§6.4)**: 設計書どおり適用する(旧owner専用 → manage_access保有者も自分の保有ビットのサブセットを委任可能。ただし呼び出し元がそもそも`manage_access`を保有 or ownerであることが前提の二段階チェック、§4.1)。
9. **`searchGuildMembers`のレート制限対策**: 今回あわせて対応する。`users`系と同様の短命TTLキャッシュ+429リトライを追加する。§4.6

### 5.1 今回未使用のcapabilityビット

`manage_guild_settings`(設計書§6.1のビット10)は、本書が棚卸しした旧20ルートのいずれにも対応する操作が存在しない。今回のtRPC移行スコープでは**未使用のまま予約**し、どのprocedureにも割り当てない。将来ギルド全体設定(現状スコープ外の機能)を追加する際に使う想定として記録するに留める。

## 6. 次のステップ

設計判断が確定したため、`writing-plans`スキルで実装計画(パッケージ別のrouter定義順序、zodスキーマ、DBマイグレーション要否、テスト計画)を作成する。ドメインパッケージ(`packages/tts`, `packages/recruitment`, `packages/logging`, `packages/voice`, `packages/dashboard-access`)のいずれから着手するかも実装計画で決定する。

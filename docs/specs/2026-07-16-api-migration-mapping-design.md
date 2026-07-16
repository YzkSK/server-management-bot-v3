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
| `GET /api/logs`, `/api/overview` | `packages/logging` router(overviewは集約層、§4.3) | |
| `GET /api/voice` | `packages/voice` router | |
| `GET /api/health` | `dashboard`アプリ直下(ドメインパッケージ化しない) | インフラ死活監視、ドメイン非依存 |
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

### 3.3 Discord ID解決系(users/channels/members)は`dashboard-access`に置く

`/api/discord/users`, `/api/discord/channels/[channelId]`, `/api/discord/guilds/[guildId]/members`はログ・募集・TTS・アクセス管理など複数ドメインのセレクター/ピッカーコンポーネントから横断的に使われるユーティリティで、特定ドメインの業務ロジックを持たない。設計書§3の「`dashboard-access`はDiscordロール解決のために`core`のDiscord API薄いラッパーには依存してよい」という規定に沿い、これらは`dashboard-access` routerに集約する。**特定の`capability`ビットではなく「対象guildへの何らかのダッシュボードアクセス権(実効capabilities > 0)」を要求する汎用ガード**を新設し、ドメイン固有のcapability要求とは別枠で扱う(新設計にはまだ存在しない概念のため要決定、§5参照)。

### 3.4 `view_logs_raw`ビットの使いどころ

新capability一覧には`view_logs`と`view_logs_raw`が別ビットとして既に定義されているが、旧実装の`/api/logs`は`viewer`ロールのみで生の`payload`フィールドまで無条件に返しており、raw/summary相当の区別が実装上存在しなかった。新実装では**`payload`フィールドの返却を`view_logs_raw`保有者に限定し、非保有者には`payload`を省いたレスポンスを返す**設計とする(procedureレベルでレスポンス整形を分岐)。旧仕様からの機能変更点として明示しておく。

### 3.5 `health`の認証要否

旧`/api/health`はDB/Redis/VOICEVOXのレイテンシ・死活情報を完全に無認証で公開していた。新設計でも同様に無認証(ロードバランサ/監視ツールからの疎通確認用途を想定)にするか、最低限ログイン必須にするかは要決定(§5)。

## 4. ドメイン別詳細

### 4.1 RBAC/認証・アクセス管理

**現状(旧)**

- `GET /api/guilds`: ログインユーザーがアクセス可能なギルド一覧。Discord OAuthトークンで取得した所属ギルドのうち、(a) Discord上の管理権限を直接持つ、(b) user-level access grant保有、(c) 管理ロール保有 or role-level access grant保有、のいずれかを満たすものをDBの`getKnownGuildIds`で絞り込んで返す。認可chainが複雑(直接権限→DB grant→ロール照合の3段階フィルタ)。
- `GET/POST/PATCH/DELETE /api/dashboard-access`: `requiredRole: "owner"`固定。ギルドのaccess grant(user/role単位、role: viewer/admin)の一覧・追加更新・削除。
- 共通認証ヘルパー`authorizeDashboardApi`: NextAuth JWT検証→Discordアクセストークンのリフレッシュ→対象guildへの所属確認(`fetchCurrentUserGuildById`)→(ownerでなければ)ロールID取得→DB上のgrant/管理ロールと突合して`viewer/admin/owner`を算出。

**新tRPC対応案**

- `guilds.list`: procedure化。旧ロジックの3段階フィルタは維持しつつ、実効capabilities算出(§6.3の「user-level grant OR 全保有ロールのrole-level grantのOR結合」)に合わせて「1ビットでも持っていれば一覧に含める」に置き換え。
- `dashboardAccess.list/grant/revoke`: `requiredCapability`は単純な`manage_access`ではなく**§6.4の委任制約**(自分が持つビットのサブセットしか付与できない、`manage_access`自体はowner専用)をprocedure内で検査するロジックに置き換える。旧実装は「owner以外は一切触れない」という単純な仕様だったため、**新実装は旧より柔軟(manage_access保有者が委任可能)**になる=意図的な機能拡張。

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
- `tts.router.preview` — §5で無認証継続か要決定

**意図的に落とす/変える機能**

- 辞書登録は旧実装が「重複登録=無条件upsert」だった。この挙動(同一`fromText`への再登録は上書き)は維持する。意図的なエラー化(重複を弾く)は要件変更になるため、変えるなら明示合意が必要。
- speakerId/辞書のVOICEVOX側実在性検証は旧実装に**存在しない**(非負整数であれば任意のIDを保存可能、プレビュー時に初めてVOICEVOX側のエラーで判明)。新実装でも同様に検証なしとするか、`listSpeakers`の結果とクロスチェックして保存時に弾くかは要決定(§5)。ここを直さないと引き続き「保存はできるがプレビューで初めて失敗に気づく」という旧来の不整合が残る。

**移行時の落とし穴**

- `/api/panel/dictionary`のGETは全件取得後にアプリ側で`scope==="user" && userId===自分`をフィルタする非効率実装だった。tRPC移行時はDBクエリ側で絞り込むよう修正して問題ない(振る舞いは変わらない、効率化のみ)。
- `/api/panel/speakers`はVOICEVOX障害時に空配列を返しエラーと未設定を区別できない仕様だった。tRPCの`TRPCError`で明示的にエラーコードを返すよう変更するかは§5で決定(フロント側のエラートースト表示に影響)。
- `/api/tts/preview`が本当に無認証(guildIdすら不要)だった点は、意図的な公開エンドポイントなのか単なる実装漏れなのか旧コードから判断できない。§5で方針決定が必須。

### 4.4 募集(recruitment)

**現状(旧)**: 3ルート。`GET /api/recruitments`(一覧、viewer)、`PATCH /api/recruitments/[id]`(close/reopen、**viewerは自分の募集のみ、admin/ownerは他人の分も操作可**というロール比較に加えた追加チェックあり)、`GET/POST /api/panel/recruitment`(チャンネル取得/募集作成、**作成もviewerで可能**=manage権限不要)。close/reopen時にDiscordメッセージをPATCH更新(失敗しても握りつぶし)。

**新tRPC対応案**

- `recruitment.router.list` — `view_recruitment`
- `recruitment.router.close` / `reopen` — `view_recruitment`を基本要件としつつ、procedure内で`creatorId === ctx.userId || ctx.capabilities.has(MANAGE_RECRUITMENT)`を追加検査(旧のrole比較による自分の投稿判定を、capabilityベースの「manage権限 or 本人」判定に置き換える)
- `recruitment.router.getPostChannel` / `create` — **旧仕様どおり`view_recruitment`のみで作成可能とするか、`manage_recruitment`に格上げするかは要決定**(§5)。誰でも募集を立てられる旧仕様は意図的な設計(募集はメンバー主体の機能)である可能性が高いが、明示確認が必要。

**意図的に落とす/変える機能**

- 特になし。close/reopenの「本人 or admin以上」制約は新capabilityモデルでも同等ロジックとして維持する。

**移行時の落とし穴**

- Discordメッセージ投稿・更新の失敗を握りつぶしAPIレスポンスは成功扱いにする非同期副作用パターンは、tRPCの`mutation`でも同様に「DB操作の成功可否とDiscord同期の成功可否を分離する」設計を踏襲する必要がある(全体をtry/catchで失敗にすると、DBは更新済みなのにエラー表示される不整合が起きる)。
- `voiceChannelId`は募集作成時に受け付けているように見えて実際は未実装(常にnull扱い)。新実装で本当に対応するのか、旧仕様のまま「未対応」として明示的に除外するのか§5で確認。
- 締切定数(`RECRUITMENT_DEADLINE_DEFAULT_DAYS`等)は`packages/shared`に移設が必要(フロント・バック双方参照)。

### 4.5 ログ/概要/Voice/ヘルスチェック

**現状(旧)**

- `GET /api/logs`: カーソルページング(`before`+`limit`)、`eventName`前方一致・`search`(`ilike`でeventName/payload両方)・`actorId`/`channelId`/`messageId`フィルタ。API層のバリデーションはほぼ無く、DB層(`clampLimit`, 上限1000)が最終防御。
- `GET /api/overview`: voice+recruitment+当日ログ(最大1000件固定、ページングなし)を1リクエストで集約。
- `GET /api/voice`: 薄いhandler、実体は`buildVoiceSummary`(アクティブ/終了セッション分離、Temp VC情報付加)。
- `GET /api/health`: DB/Redis/VOICEVOXの死活・レイテンシを**無認証**で返す。
- Socket.io realtime(`logs:event`): Cookie中のNextAuthセッショントークンを手動decode→ギルド所属・ロール確認→Redis Stream(`rt:logs:{guildId}`)を購読。tRPCとは別チャネルのまま(設計書§4で既定)。

**新tRPC対応案**

- `logging.router.listLogs` — `view_logs`(payloadは`view_logs_raw`保有時のみ、§3.4)
- `voice.router.getSummary` — `view_voice`
- overview集約は§3.2の方針でdashboardアプリ層に配置(特定ドメインrouterには実装しない)
- health は§3.5で方針決定後にprocedure化(ドメインパッケージに属さない)

**意図的に落とす/変える機能**

- 特になし(ページング・フィルタ仕様は維持)。

**移行時の落とし穴**

- `overview`の当日ログ`limit:1000`固定は、1000件超過時に無言で切り捨てられる仕様だった。集約層をdashboardアプリに移す際、この上限をそのまま踏襲するか、`nextCursor`を返してフロントが「もっと見る」できるようにするかは実装計画で詰める(本書では現状維持を推奨)。
- Socket.ioの認証(Cookie手動decode)は`dashboard-access`パッケージの共通ヘルパーとして切り出し、tRPCの`protectedProcedure`とロジックを重複させない(設計書§4に既定のとおり)。
- `voice`のフロント側は実は専用リアルタイムイベントを持たず、`logs:event`ストリームを間借りして`voice.*`イベント検知時にreloadする実装だった。新設計でSocket.ioチャネルを再設計するなら、この「間借り」を維持するか専用購読にするかは別セッションのVoice機能設計で扱う(本書はAPI層の範囲外として明記のみ)。

### 4.6 Discord連携(users/channels/members)

**現状(旧)**

- `GET /api/discord/users`, `/api/discord/users/[userId]`: **guildId概念自体が無く**、`getDashboardSession()`のみでログイン済みなら任意のDiscordユーザーIDをBotトークン経由で問い合わせ可能(ロール検証皆無)。5分メモリキャッシュ+100msスロットリング+429リトライあり。
- `GET /api/discord/channels/[channelId]`: `guildId`をqueryで受け取り`authorizeDashboardApi`で正しくロール検証。DBキャッシュ(`listDiscordChannelNamesByIds`)優先、なければDiscord API+fire-and-forgetでDB書き込み。
- `GET /api/discord/guilds/[guildId]/members`: path paramで`guildId`必須、`authorizeDashboardApi`で正しく検証。検索クエリのDiscord呼び出しに対してキャッシュ・リトライなし。

**新tRPC対応案**(§3.3の方針)

- `dashboard-access.router.resolveUsers(guildId, ids[])` — **guildId必須化**(旧では省略可能だった穴を塞ぐ)。「そのguildへの何らかのアクセス権」の汎用ガードを新設(§5)。
- `dashboard-access.router.resolveChannel(guildId, channelId)` / `searchGuildMembers(guildId, query)` — 旧ロジックのguildId検証パターンをそのまま踏襲。

**意図的に落とす/変える機能**

- `users`/`users/[userId]`の**guildId無しでの任意ユーザー問い合わせ**は塞ぐ。ID直接入力を許さない設計原則(CLAUDE.md「Dashboard UIでID等を直接テキスト入力させない」)とも整合させるため、必ず「呼び出し元のguild文脈」を要求する形に変える。これは旧仕様からの明確なセキュリティ強化であり、破壊的変更として実装計画に明記する。

**移行時の落とし穴**

- `users`系のキャッシュ・スロットリング(5分TTL、100ms間隔シリアル化、429時最大3回リトライ)は、Discord APIレート制限対策として実装上有用な仕組みなので、guildId必須化後も**そのままdashboard-access側に移植する**(捨てない)。
- `channels`のDBキャッシュには無効化ロジックが無く、Discord側で改名されても追従しない。新実装でTTL付きにするか、Botのchannel updateイベントで無効化するかは別セッション(logging/core実装)で扱う課題として記録するに留める。
- `members`検索にはリトライ・キャッシュが無く、検索デバウンス(フロント300ms)頼みだった。新実装で強化するかは§5で確認。

## 5. 未確定事項リスト(設計判断が必要)

1. **`tts.preview`は無認証のまま公開するか**、`view_tts`必須にするか。無認証だと誰でもVOICEVOXにリクエストを飛ばせるオープンプロキシ状態が続く。
2. **`health`は無認証のまま**にするか、最低限ログイン必須にするか。DB/Redis/VOICEVOXの内部レイテンシ情報の公開範囲の問題。
3. **募集の作成・close/reopenの基本要件を`view_recruitment`のままにするか**、`manage_recruitment`に格上げするか(旧仕様は「誰でも募集を立てられる」)。
4. **TTS話者ID・辞書のVOICEVOX側実在性検証を新規に追加するか**、旧仕様どおり無検証のままにするか。
5. **Discord ID解決系(users/channels/members)の権限ガードの形**: 特定capabilityビットではなく「対象guildへの実効capabilities > 0」という汎用ガードを新設する方針(§3.3)でよいか。
6. **`overview`の当日ログ1000件上限**をそのまま踏襲するか、ページング対応するか。
7. **募集作成の`voiceChannelId`**を新実装で正式対応するか、旧仕様どおり未対応のまま(UIからは選択させない)にするか。
8. **manage_access委任制約(§6.4)の新規適用**により、旧「owner専用」から「manage_access保有者も委任可能」に変わる点(§4.1)の影響範囲の最終確認。

## 6. 次のステップ

本書の§5未確定事項について合意が取れ次第、`writing-plans`スキルで実装計画(パッケージ別のrouter定義順序、zodスキーマ、テスト計画)を作成する。ドメインパッケージ(`packages/tts`, `packages/recruitment`, `packages/logging`, `packages/voice`, `packages/dashboard-access`)のいずれから着手するかも実装計画で決定する。

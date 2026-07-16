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

**権限ガードは汎用ガードを新設せず、呼び出し元ドメインごとにrequiredCapabilityをサーバー側で固定する**【確定・修正】。「対象guildへの何らかのアクセス権があれば通す」という汎用ガードは、意図しない用途への流用や権限境界の曖昧化を招くため採用しない。ただし`requiredCapability`を**tRPCのprocedure入力(クライアントが送信するパラメータ)として受け取ることはしない**——クライアントがcapability値を自由に指定できてしまうと、本来`manage_access`が必要な操作を`view_recruitment`など弱いビットにすり替えて呼び出す権限昇格の余地が生まれるため。代わりに、ドメインごとに**requiredCapabilityをサーバー側コードに固定した薄いラッパーprocedure**を用意する(例: `resolveUsersForRecruitment`は内部で共通実装を`requiredCapability: view_recruitment`固定で呼び出し、`resolveUsersForAccessManagement`は`manage_access`固定で呼び出す)。DB/キャッシュ/Discord API呼び出しロジック自体の共通実装は`dashboard-access`に集約したまま、**公開procedureの単位でrequiredCapabilityをコード上固定**することで、実装の重複を避けつつ権限境界をAPIシグネチャ上に明示する(クライアント入力には一切依存しない)。

### 3.4 `view_logs_raw`ビットの使いどころ

新capability一覧には`view_logs`と`view_logs_raw`が別ビットとして既に定義されているが、旧実装の`/api/logs`は`viewer`ロールのみで生の`payload`フィールドまで無条件に返しており、raw/summary相当の区別が実装上存在しなかった。新実装では**`payload`フィールドの返却を`view_logs_raw`保有者に限定し、非保有者には`payload`を省いたレスポンスを返す**設計とする(procedureレベルでレスポンス整形を分岐)。旧仕様からの機能変更点として明示しておく。

### 3.5 `health`の認証要否【確定】

旧`/api/health`はDB/Redis/VOICEVOXのレイテンシ・死活情報を完全に無認証で公開していた。この情報は特定ギルドに紐づかず「サーバー運営者」というダッシュボードのcapabilityモデルとは別軸の権限を必要とするため、**Discordログイン/capabilityとは独立した共有シークレットヘッダー方式**で保護する: `x-health-token`ヘッダー(env変数`HEALTH_CHECK_TOKEN`等で管理)と一致しないリクエストは401で拒否する。監視ツール/CIからの疎通確認はこのトークンを付与して呼び出す運用とする。ダッシュボードのRBAC(capabilities)やNextAuthセッションには一切依存しないため、`dashboard-access`にも属さず`apps/dashboard`直下の独立したミドルウェア/route(またはtRPC外の素のHTTPハンドラ)として実装する。

**運用要件【確定・追加】**:
- **HTTPS必須**: 平文HTTPでのトークン送信は許可しない(本番環境はHTTPS終端が前提だが、health専用の例外は作らない)。本番はリバースプロキシ/CDN配下でアプリ自体はHTTPしか見えない構成のため、信頼済みプロキシが付与する`x-forwarded-proto`ヘッダーで`https`を検証する(アプリ側で直接TLS終端を検証しようとしない)。ローカル開発環境ではこの検証を無効化してよい。
- **定数時間比較**: トークン検証は文字列の`===`比較を使わず、タイミング攻撃を避けるため定数時間比較(Node.jsの`crypto.timingSafeEqual`等)を用いる。`timingSafeEqual`はBuffer長が異なると例外を投げるため、比較前に受け取ったトークンを固定長にハッシュ化(例: HMAC-SHA256)してから比較する、または長さが異なる場合は固定長のダミー値と比較したうえで最終的に不一致として扱う実装にする(長さ不一致が例外経路やログの分岐として外部から観測できないようにする)。
- **ログ出力禁止**: リクエストログ・エラーログ・監視ツールの出力に`x-health-token`の値そのものを含めない(検証の成否のみを記録する)
- **ローテーション・失効手順**: `HEALTH_CHECK_TOKEN`は定期ローテーション(周期は実装計画で確定)を前提とし、漏洩が疑われる場合は環境変数を即座に更新・再デプロイして失効させる。監視ツール/CI側が保持するトークンもこの更新に追従させる運用手順を実装計画に含める。

### 3.6 テナント分離(クロスギルド境界)の実装原則【確定・全ドメイン共通】

「ログインしていればどこかのguildへのアクセス権は検証されている」だけでは不十分で、**guild-scoped procedureは以下3原則を必ず満たす**こととする。これは実装計画・コードレビューで機械的にチェックできる基準として本書に明文化する。

1. **guildId必須+毎リクエスト検証**: 全てのguild-scoped procedureは`guildId`を明示inputに取り、ミドルウェアが「`ctx.userId`が**その**guildIdに対して要求capabilityを持つか」を毎リクエスト計算する(セッションにキャッシュした過去の判定結果を使い回さない)。
2. **ネストしたリソースIDの所属検証**: `recruitmentId`のようにDBの主キーでリソースを取得するprocedureは、取得後に**そのリソース自身が持つ`guildId`と、入力(または認可済み)の`guildId`が一致するか**を必ず突合する。旧`recruitments/[id]/route.ts`が`recruitment.guildId !== authorization.guild.id`で行っていたパターンを、同種の「IDでリソースを取得する全procedure」に横展開する。**不一致時は原則`404`(NOT_FOUND)に統一する**(`403`だと「そのリソース自体は存在するが権限がない」ことを暴露してしまい、他guildにそのIDのリソースが存在するかどうかの推測に使われうる。監査要件上どうしても`403`で区別したい箇所があれば、その場所だけ例外として実装計画に理由を明記する)。
3. **DB書き込みは認可済みguildIdを使う**: 認可(原則1)を通過した後のDB操作は、クライアントが送ってきた`guildId`をそのまま使わず、**認可時にサーバー側で確定した`guildId`**を使う。旧`dashboard-access`のDELETE実装(`deleteDashboardAccessGrant(db, {guildId: authorization.guild.id, ...})`)がこのパターンで、他ドメインにも徹底する。

**旧実装で実際に発見した違反(修正必須)**: `GET /api/discord/channels/[channelId]`が使うDBキャッシュ関数`listDiscordChannelNamesByIds`(`packages/db/src/repositories/discord-channels.ts`)は`channelId`のみで検索し`guildId`を一切見ていない。このため、guild Aへの閲覧権限を持つユーザーが`?guildId=A`を付けたまま無関係なguild Bのchannel IDを問い合わせると、(a) DBキャッシュに既存の行があればguild Bのチャンネル名がそのまま漏洩し、(b) キャッシュミス時はBotトークンでDiscord APIから取得した上で`upsertDiscordChannel({channelId, guildId: A, ...})`が実行され、**そのチャンネルのDB上の所属guildIdが誤ってAに書き換わる**(データ破損を伴う二次被害)。新tRPCの`resolveChannels`では以下の両方を必須とする:
- DBキャッシュ参照を`WHERE channelId = ? AND guildId = ?`の複合条件にする(現状の単一キー検索を廃止)
- Discord APIから取得した場合は、レスポンスの`guild_id`フィールドと入力`guildId`が一致することを検証し、不一致ならエラーとしてDBに書き込まない(誤った紐付けでの上書きを防ぐ)

**補足(新規DBのため移行汚染の懸念は対象外)**: 本プロジェクトは新規リポジトリでのフルリライトであり(`rewrite-architecture-design.md` §7)、旧本番DBのデータを新DBへ移行する計画は存在しない。従って`discord_channels`相当のテーブルは新規作成され、旧実装の不具合(誤った`guildId`紐付け)によって汚染された既存データを引き継ぐ心配はない。新スキーマが最初から`(channelId, guildId)`複合キー/複合インデックスで設計されていれば十分。

**テスト計画への要求**: 原則1〜3それぞれについて、「アクセス権のないguildId/他guildのリソースIDを渡すと拒否される(かつ`404`で応答する)」ケースを実装計画のテスト項目に必須で含める。特に`resolveChannels`は上記の具体的な穴の回帰テストとして明記する。

### 3.7 認証・認可のエラーフォールバック方針【確定・全ドメイン共通】

旧実装を精読した結果、認証・認可の経路(全procedureの入り口)に具体的なフォールバック不備が2件見つかった。これらは新実装で修正必須とする。

**旧実装で発見した不備**

1. **リフレッシュ失敗の原因を区別していない**(`auth-token.ts`の`getUsableDiscordAccessToken`): リフレッシュトークン自体が失効/無効(Discord側が`invalid_grant`等を返す、恒久的=再ログインが必要)な場合と、Discord APIが一時的にタイムアウト/5xxを返した場合(一時的=再試行すれば直る)を、どちらも同じ`catch { return {ok:false, error:"Authentication expired."} }`に握りつぶしている。`refreshDiscordAccessToken`が投げる`Error`にHTTPステータスが載っていないため、呼び出し側で区別しようがない。結果、Discordの一時障害でユーザーが不要に再ログインを求められる。
2. **ロールID取得に例外処理が無い**(`dashboard-auth.ts`の`authorizeDashboardApi`): `fetchAuthorizedMemberRoleIds`(ギルドオーナー以外の全リクエストが通る経路)の呼び出しに`try/catch`が無く、Discord APIが一時的にエラーを返すと未処理例外としてリクエストが落ちる。同じ関数内の`fetchCurrentUserGuildById`はcatchして502を返しているのに、ロールID取得だけ無防備という非対称な実装になっている。

**新実装での方針**

1. **エラー原因をコードレベルで区別する**(確定): Discord APIとの通信を伴う認可判定は、結果を3種類に分ける。
   - **確実に権限がない**(`TRPCError({code:"FORBIDDEN"})` / `UNAUTHORIZED`): guild未所属、capability不足、リフレッシュトークン失効(Discord側が明示的に`invalid_grant`等を返した場合)など、再試行しても結果が変わらないケース
   - **一時的に確認できなかった**: Discord APIのタイムアウト・5xx・ネットワークエラーなど、再試行すれば結果が変わりうるケース。サーバー内部実装は`packages/dashboard-access`で型付きの専用エラークラス(例: `DiscordUnavailableError`)を定義し、`TRPCError`の`cause`に渡して統一する。**ただし`cause`はtRPCのシリアライズ対象外でクライアントには一切配送されないため、フロントが参照できる契約はサーバー-クライアント間で実際にシリアライズされるフィールドに限定する【確定・修正】**: tRPCの`errorFormatter`(`rewrite-architecture-design.md`§4 API層/tRPCの実装箇所に定義する。本書スコープでは契約のみ確定する)で`error.data`に`reason`という列挙型フィールドを明示的に追加し、この`error.data.reason`を「確実に権限がない」/「一時的に確認できなかった」の判定に使う**公開契約**とする。`TRPCError`のcode(`FORBIDDEN`/`UNAUTHORIZED`/`INTERNAL_SERVER_ERROR`等)はHTTPステータス相当の分類として維持しつつ、区別自体は`error.data.reason`で行う。**`reason`の値と内部例外からの変換表(確定)**:

     | `error.data.reason` | 対応する内部例外/条件 | 対応する`TRPCError.code` |
     |---|---|---|
     | `ACCESS_DENIED` | guild未所属、capability不足、リフレッシュトークン失効(`invalid_grant`等の恒久エラー) | `FORBIDDEN` / `UNAUTHORIZED` |
     | `DISCORD_UNAVAILABLE` | `DiscordUnavailableError`(Discord APIタイムアウト・5xx・ネットワークエラー、リトライ上限到達後) | `INTERNAL_SERVER_ERROR`(フェイルクローズのため成功コードにはしない) |

     上記2種以外の内部エラー(DB接続失敗等、下記4)は`reason`フィールド自体を付与せず、フロント側は`error.data.reason`が存在しない場合は汎用エラー表示にフォールバックする(未分類=デフォルトの扱いとして明記)。
   - フロント側は`error.data.reason`という**ドキュメント化された公開契約のみ**を判定に用いる。`error.cause`の型やエラークラスのinstanceof判定には一切依存しない(causeやエラークラス実体はサーバー内部実装でありネットワーク越しには存在しないため、フロントで判定に使おうとしても機能しない)。この2種類は別メッセージで出し分ける(「アクセス権がありません」 vs 「一時的に確認できませんでした。しばらくしてから再試行してください」)。特にリフレッシュ失敗は、Discord側から返るエラー種別(`invalid_grant`=恒久 vs タイムアウト/5xx=一時)を`refreshDiscordAccessToken`相当の関数がステータス付きで呼び出し元に伝えるよう改修する。
2. **guild所属確認・ロールID取得を含む認可経路のDiscord API呼び出しは、全て例外を捕捉しフェイルクローズする**(確定): 旧実装の非対称性(`fetchCurrentUserGuildById`はcatchするが`fetchAuthorizedMemberRoleIds`はしない)を解消し、認可経路の全Discord API呼び出しを一貫してtry/catchし、失敗時は「一時的に確認できなかった」エラーとして返す(アクセスは許可しない=フェイルクローズだが、上記1の区別により「確実に権限がない」とは異なる旨をフロントに伝える)。
3. **認可経路にもDiscord APIリトライを導入する**(確定): 旧`discord/users`系エンドポイントは429時に`Retry-After`尊重の最大3回リトライを持つが、全リクエストの入り口である認可判定(guild所属確認・ロールID取得)にはリトライが無いという逆転が旧実装に存在した。新実装では認可経路にも同水準のリトライを導入し、末端の周辺機能より認可という中核パスの方が堅牢である状態にする。
4. **DB接続/クエリ失敗は握りつぶさない**: CLAUDE.mdの「エラーは必ず握り潰しを行わないようにすること」の原則どおり、DB呼び出しの失敗はcatchで隠さずそのまま`TRPCError({code:"INTERNAL_SERVER_ERROR"})`として伝播させる。これは自然にフェイルクローズ(エラー=アクセス不許可)と両立する。
5. **Socket.io `logs:subscribe`にも同じ区別を適用する**: 認可失敗時に`logs:error`イベントで「確実に権限がない」か「一時的に確認できない」かをクライアントに伝え、後者の場合はクライアント側で再接続・再購読を試みられるようにする。

**移行時の落とし穴**

- エラーコードを2種類に分けることで、フロント側のエラーハンドリング(トースト表示・リダイレクト判定)も対応する分岐が必要になる。特に「一時的に確認できなかった」を受け取った際にログイン画面へ誤って飛ばさないよう、tRPCのエラーマッピングadapter(設計書§4に既定)で明確に区別する。
- リトライ導入によりレイテンシが増える可能性がある(429時の`Retry-After`待ちが認可判定全体をブロックする)。認可判定のタイムアウト全体の上限(旧実装は個々のDiscord API呼び出しに5秒タイムアウト)をリトライ込みでどう設定するかは実装計画で確定する。

### 3.8 API/DB呼び出しの最小化(N+1回避)【確定・全ドメイン共通】

「APIやDBを叩くときは出来る限り一回にすること」を全procedureの実装原則とする。ループの中で1件ずつ`await`する逐次呼び出し(N+1クエリ/N+1 API呼び出し)を避け、以下の優先順位で実装する:

1. **単一クエリ/単一リクエストにまとめられるなら、まとめる**(IN句によるバッチ取得、複数idを1回のリクエストで解決するAPI設計など)
2. まとめられない場合(対象APIにバッチ手段が無い等)は、**逐次待機ではなく`Promise.all`/`Promise.allSettled`で並列化する**
3. 並列化してもなお回数が多い場合は、**キャッシュ(TTL付き)で実質的な呼び出し回数を減らす**(§4.6の`users`系キャッシュが既存パターン)

**旧実装で発見したN+1の具体例(修正必須)**: `GET /api/guilds`(旧`guilds/route.ts`)は、Discordロール確認が必要な候補guild群(`needsRoleCheck`)に対して`Promise.all(needsRoleCheck.map(async guildId => {...}))`で並列化してはいるものの、**その内部で候補guildごとに`getGuildManagementRoleIds(db, guildId)`と`listDashboardAccessGrants(db, {guildId, ...})`という2種のDBクエリを個別発行しており、guild数分のDBラウンドトリップが発生する**(並列化されているだけで、クエリ回数そのものはN+1のまま)。新tRPCの`guilds.list`では、これらのDB関数を**候補guildId配列をまとめて受け取りMapで返すバッチ版**(`getGuildManagementRoleIdsForGuilds(db, guildIds[])`のような単一IN句クエリ)に置き換え、DB呼び出しをguild数に依存しない定数回(2回程度)に削減する。一方、`fetchGuildMemberRoleIds`(guildメンバーのロール取得)はDiscord REST APIがguild単位のエンドポイントしか提供しておらず、複数guildをまとめて問い合わせるバッチ手段が存在しないため、**この部分のみ「guild数分の並列Discord API呼び出し」が構造的に不可避な例外**として明記する(逐次待機にしない=並列化は必須だが、回数自体はDiscord側の制約で減らせない)。

**tRPCバッチリンクに関する注意**: `@trpc/react-query`の`httpBatchLink`は同一マイクロタスク内で発火した複数の`useQuery`呼び出しを1回のHTTPリクエストにまとめるが、これは「フロントから見た1回」であってサーバー側の各procedureが内部で何回DB/外部APIを叩くかとは無関係。設定タブ4種(§3.1で分割済み)のように**複数ドメインrouterへの呼び出しがフロント側で必要になる箇所は、各コンポーネントの`useQuery`が同じレンダリングサイクルで同時に発火するよう設計し、httpBatchLinkが実際に1リクエストへまとめられる状態を保つ**(タブが個別にマウント・遅延ロードされる設計だとバッチが効かず複数往復になる)。

**関連する既存の指摘との統合**:
- §4.3(TTS)で既出の`panel/dictionary`GETの「全件取得後にアプリ側でフィルタ」は、この原則に反する典型例であり、DBクエリ側の`WHERE`で絞り込む(1クエリで完結させる)よう修正する方針を維持する。
- §4.5(logs/overview)の`countTodayLogs`/`listLogs`分離は、overview集約が1回の`COUNT`クエリと1回のページング取得で完結する設計であり、この原則に沿っている。
- §4.6(Discord連携)の`resolveUsers`のキャッシュ+バッチid配列設計は、Discord側にバッチ取得APIが無い制約下で「実質的な呼び出し回数の最小化」を体現したパターンとして踏襲する。

**テスト計画への要求**: `guilds.list`について、候補guild数を増やしてもDBクエリ発行回数が定数(N+1にならない)であることを確認するテスト(クエリ実行回数のアサーション、またはDBモックの呼び出し回数検証)を実装計画のテスト項目に含める。

**追加で発見した非効率(修正対象)**

- **`health`の3プローブが逐次実行**: 旧`createHealthReport`(`health.ts`)はDB/Redis/VOICEVOXの3チェックを`for...of`+`await`で順番に実行しており、合計レイテンシが「各チェックの合計」になる(例: 各チェックが最悪3秒かかる場合、逐次だと最大9秒、並列なら最大3秒)。各プローブ(`measureHealthProbe`)は例外を投げず結果オブジェクトを返す設計のため、単純に`Promise.all`に置き換えれば安全に並列化できる。新実装(§3.5の共有シークレットヘッダー方式ハンドラ)では3プローブを`Promise.all`で並列実行する。
- **チャンネル名の一括解決APIが存在しない**: DB層の`listDiscordChannelNamesByIds`は既に`channelIds: string[]`を受け取るバッチ関数だが、旧HTTPルートは単一チャンネル専用(`/api/discord/channels/[channelId]`)しか公開しておらず、複数チャンネル名が必要な画面(募集一覧の`voiceChannelId`表示、Temp VC一覧等)ではチャンネル数だけ個別リクエストが発生する構造だった。新tRPCでは`resolveUsers`と同じ形で**内部実装`resolveChannelsInternal(guildId, channelIds[], requiredCapability)`を複数id版で用意し、DB層の既存バッチ能力をそのままAPIとして公開する**(単一チャンネルの解決もこのバッチ版にid配列1件で呼べば足りるため、単一版は別途用意しない)。requiredCapabilityはクライアント入力にせず、§3.3のとおりドメイン別ラッパーprocedure(`resolveChannelsForRecruitment`等)側でコード固定する。Discord APIから新規取得した複数チャンネルをDBキャッシュに書き込む際も、個別upsertではなく一括upsertにまとめる。

## 4. ドメイン別詳細

### 4.1 RBAC/認証・アクセス管理

**現状(旧)**

- `GET /api/guilds`: ログインユーザーがアクセス可能なギルド一覧。Discord OAuthトークンで取得した所属ギルドのうち、(a) Discord上の管理権限を直接持つ、(b) user-level access grant保有、(c) 管理ロール保有 or role-level access grant保有、のいずれかを満たすものをDBの`getKnownGuildIds`で絞り込んで返す。認可chainが複雑(直接権限→DB grant→ロール照合の3段階フィルタ)。
- `GET/POST/PATCH/DELETE /api/dashboard-access`: `requiredRole: "owner"`固定。ギルドのaccess grant(user/role単位、role: viewer/admin)の一覧・追加更新・削除。
- 共通認証ヘルパー`authorizeDashboardApi`: NextAuth JWT検証→Discordアクセストークンのリフレッシュ→対象guildへの所属確認(`fetchCurrentUserGuildById`)→(ownerでなければ)ロールID取得→DB上のgrant/管理ロールと突合して`viewer/admin/owner`を算出。

**新tRPC対応案**

- `guilds.list`: procedure化。旧ロジックの3段階フィルタは維持しつつ、実効capabilities算出(§6.3の「user-level grant OR 全保有ロールのrole-level grantのOR結合」)に合わせて「1ビットでも持っていれば一覧に含める」に置き換え。**DB呼び出しは§3.8で確定したバッチ版に置き換え、候補guild数に依存するN+1クエリを解消する**(旧実装のN+1詳細は§3.8参照)。
- `dashboardAccess.list/grant/revoke`: 【確定】認可は**二段階チェック**とする。(1) 呼び出し元が`manage_access`ビットを保有しているか、または対象guildのオーナーであること(=`manage_access`を持たない`view_*`等のみの保有者はそもそも呼び出せない)。(2) (1)を満たした上で、**付与/剥奪しようとしている対象ビットが呼び出し元自身の保有ビットのサブセットであること**(§6.4)、かつ`manage_access`ビット自体の付与/剥奪はguildオーナーのみ可能であること。旧実装は「owner以外は一切触れない」という単純な仕様だったため、**新実装は旧より柔軟(manage_access保有者も(2)の制約内で委任可能)**になる=意図的な機能拡張として設計書§6.4どおり採用する。

**意図的に落とす/変える機能**

- `dashboardManagementRoleIds`(旧: Discordロールを「管理ロール」として一括登録する仕組み)は、新RBACのrole-level capability grant(`targetType:'role'`)に統合される。専用フィールドとしては廃止し、`dashboard-access`のgrant操作の一種として扱う。

**移行時の落とし穴**

- 旧`resolveDashboardAccess`は`viewer < admin < owner`の**ランク比較**だが、新RBACはビットのOR結合であり上位互換関係がない。「viewer以上」のような単純比較のロジックは全て「特定capabilityビットを持つか」の検査に書き換える必要がある(設計書§6.5で既定路線)。
- guildオーナーは全ビット保持(DB非保存)という仕様は維持するが、旧実装のように`isGuildOwner`判定を都度Discord APIで取得する点は変わらない。この判定・その後のロールID取得を含む認可経路全体のDiscord API失敗時フォールバックは§3.7の方針(エラー原因の区別・例外捕捉の徹底・リトライ導入)に従う。旧実装はこの経路に具体的な不備(ロールID取得の例外未捕捉、リフレッシュ失敗原因の未区別)があったため、単純な踏襲ではなく§3.7の修正を適用する。

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
- 【確定】`voiceChannelId`を今回あわせて正式対応する。旧実装のDB層(`recruitments`テーブル・`createRecruitment`関数・`RecruitmentSummaryItem`)は実は既に`voiceChannelId`カラムをサポート済みで、抜けていたのは`POST /api/panel/recruitment`(APIルート)がリクエストボディからこの値を`createRecruitment`へ渡していなかった点のみだった(DBスキーマ自体の欠落ではない)。新実装では募集作成フォームにVoiceチャンネルセレクター(§Discord ID解決系、`view_recruitment`で`resolveChannels`/チャンネル一覧取得)を追加し、`recruitment.router.create`の入力に`voiceChannelId?: string`を正式に持たせてDB層まで貫通させ、募集メッセージ生成(`buildRecruitmentMessage`相当)でも表示するようにする。

**移行時の落とし穴**

- 「DB操作の成功可否とDiscord同期の成功可否を分離する」という設計方針自体(全体をtry/catchで失敗にすると、DBは更新済みなのにエラー表示される不整合が起きる)は踏襲するが、**旧実装のように単純なfire-and-forgetで失敗を握りつぶすだけの実装は新設計では採用しない【確定・修正】**。close/reopen時のDiscordメッセージ同期は以下の設計に置き換える:
  - close/reopenのDB状態更新と、outboxレコードのinsertは**同一DBトランザクションでコミットする**(状態更新のみコミットされoutbox insertが失われるとイベント自体が永久に消失するため)。即時のDiscord API呼び出しはコミット後にbest-effortで行い、失敗時のみ`pending`のままoutbox workerの再試行に委ねる
  - 同期処理には**冪等性キー**(`recruitmentId` + 単調増加する状態バージョン/revision、または操作単位のUUID)を持たせる。close→reopen→closeのように同じ最終状態へ複数回遷移するケースを区別できるよう、`recruitmentId + 状態文字列`のみのキーは使わない(異なる操作が同一イベントとして潰れるのを防ぐ)
  - 同期の状態(`pending`/`succeeded`/`failed`)を追跡できるステータスを持たせ、`failed`のまま放置されたレコードを監視できるようにする(具体的なアラート化は実装計画で検討)
  - `failed`状態のレコードを手動再実行、または定期ジョブによる自動再試行で再同期できる手段を用意する
  - DB更新成功とAPIレスポンス成功の分離は維持する(Discord同期の成否はミューテーション自体の成功可否に影響させない)
- `voiceChannelId`正式対応自体はDB層の既存パターン(旧`recruitments`テーブルに倣う)を新スキーマにそのまま含めればよく、追加のマイグレーション設計は不要と見込まれる。API/フロントの実装(セレクター追加・procedure入力への追加)が主な作業になる。
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
- Socket.ioの認証(Cookie手動decode)は`dashboard-access`パッケージの共通ヘルパーとして切り出し、tRPCの`protectedProcedure`とロジックを重複させない(設計書§4に既定のとおり)。tRPC procedureではないが実質guild-scopedな認可処理であるため、**§3.6のうち該当する原則(1: guildId必須検証、3: 認可済みguildIdでの参照)は`logs:subscribe`ハンドラにも同様に適用する**(`{guildId}`をsubscribe時に受け取り、購読対象のRedis Stream `rt:logs:{guildId}`は必ずこの認可済みguildIdから導出し、クライアントが送ってきた値を直接キーに使わない)。原則2(ネストしたリソースIDの所属検証)は`logs:subscribe`がguildId以外のリソースIDを扱わないため現状は対象外だが、将来ネストしたリソースID(特定メッセージ購読等)を追加する場合は同様に適用する。
- `voice`のフロント側は実は専用リアルタイムイベントを持たず、`logs:event`ストリームを間借りして`voice.*`イベント検知時にreloadする実装だった。新設計でSocket.ioチャネルを再設計するなら、この「間借り」を維持するか専用購読にするかは別セッションのVoice機能設計で扱う(本書はAPI層の範囲外として明記のみ)。

### 4.6 Discord連携(users/channels/members)

**現状(旧)**

- `GET /api/discord/users`, `/api/discord/users/[userId]`: **guildId概念自体が無く**、`getDashboardSession()`のみでログイン済みなら任意のDiscordユーザーIDをBotトークン経由で問い合わせ可能(ロール検証皆無)。5分メモリキャッシュ+100msスロットリング+429リトライあり。
- `GET /api/discord/channels/[channelId]`: `guildId`をqueryで受け取り`authorizeDashboardApi`で正しくロール検証。DBキャッシュ(`listDiscordChannelNamesByIds`)優先、なければDiscord API+fire-and-forgetでDB書き込み。
- `GET /api/discord/guilds/[guildId]/members`: path paramで`guildId`必須、`authorizeDashboardApi`で正しく検証。検索クエリのDiscord呼び出しに対してキャッシュ・リトライなし。

**新tRPC対応案**(§3.3の方針)

- `dashboard-access`共通実装`resolveUsersInternal(guildId, ids[], requiredCapability)` — **guildId必須化**(旧では省略可能だった穴を塞ぐ)。汎用ガードは新設せず、requiredCapabilityはクライアント入力ではなくドメインごとの公開procedure側でコード固定する(§3.3で確定・修正)。呼び出し元ドメインは`resolveUsersForRecruitment(guildId, ids[])`のような薄いラッパーprocedureを経由する。
- 同様に`resolveChannelsInternal` / `searchGuildMembersInternal`をドメイン別ラッパーprocedure経由で公開する。旧ロジックのguildId検証パターン自体は踏襲するが、`resolveChannels`は§3.6で発見した「DBキャッシュがguildIdを見ていない」不備を修正した実装にする(複合条件検索+`guild_id`突合)。旧実装は単一チャンネル専用(`[channelId]`)だったが、§3.8で発見したとおりDB層は既にバッチ対応済みのため、新tRPCでは`resolveUsers`と同じく複数id版として公開する(単一チャンネルの解決もid配列1件で呼ぶ)。

**意図的に落とす/変える機能**

- `users`/`users/[userId]`の**guildId無しでの任意ユーザー問い合わせ**は塞ぐ。ID直接入力を許さない設計原則(CLAUDE.md「Dashboard UIでID等を直接テキスト入力させない」)とも整合させるため、必ず「呼び出し元のguild文脈」を要求する形に変える。これは旧仕様からの明確なセキュリティ強化であり、破壊的変更として実装計画に明記する。

**移行時の落とし穴**

- `users`系のキャッシュ・スロットリング(5分TTL、100ms間隔シリアル化、429時最大3回リトライ)は、Discord APIレート制限対策として実装上有用な仕組みなので、guildId必須化後も**そのままdashboard-access側に移植する**(捨てない)。
- `channels`のDBキャッシュには無効化ロジックが無く、Discord側で改名されても追従しない。新実装でTTL付きにするか、Botのchannel updateイベントで無効化するかは別セッション(logging/core実装)で扱う課題として記録するに留める。
- 【確定】`members`検索(`searchGuildMembers`)は旧実装同様リトライ・キャッシュが無いまま素のBotトークン呼び出しにすると、あるguildでの検索連打がBot全体のDiscord APIレート制限を消費し他guildの動作にも影響しうる(可用性面でのテナント分離の穴)。今回の移行スコープで対応する: `users`系と同様の短命TTLキャッシュ(検索クエリ+guildId単位)とリトライ(429時`Retry-After`尊重)を`searchGuildMembers`にも実装する。フロント側の300msデバウンスは維持しつつ、サーバー側の防御を追加する形。

## 5. 設計判断の確定内容

すべて2026-07-16のレビューで確定した。

1. **`tts.preview`**: `guildId`を必須inputに追加した上で`view_tts`必須にする(旧: guildId概念自体が無く無認証)。§4.3
2. **`health`**: ダッシュボードのcapabilityモデルとは独立した共有シークレットヘッダー(`x-health-token`)で保護する。§3.5
3. **募集の作成・close/reopen**: `view_recruitment`のまま(旧仕様継続、格上げしない)。§4.4
4. **TTS話者IDのVOICEVOX実在性検証**: 保存時に`listSpeakers`と照合するチェックを新規に追加する(対象はspeakerIdのみ、辞書エントリは検証対象外)。§4.3
5. **Discord ID解決系(users/channels/members)の権限ガード**: 汎用ガードは新設せず、呼び出し元ドメインが要求capabilityをその都度指定する。§3.3
6. **`overview`の当日ログ上限**: `countTodayLogs`(件数集計)と`listLogs`(ページング一覧)に分離し、1000件固定上限は廃止する。§4.5
7. **募集の`voiceChannelId`**: 今回あわせて正式対応する。旧DB層は既に対応済みだったため新スキーマも同パターンを含めればよく、主作業はAPI/フロント側の貫通(procedure入力・セレクター追加)。§4.4
8. **manage_access委任制約(§6.4)**: 設計書どおり適用する(旧owner専用 → manage_access保有者も自分の保有ビットのサブセットを委任可能。ただし呼び出し元がそもそも`manage_access`を保有 or ownerであることが前提の二段階チェック、§4.1)。
9. **`searchGuildMembers`のレート制限対策**: 今回あわせて対応する。`users`系と同様の短命TTLキャッシュ+429リトライを追加する。§4.6
10. **認証・認可のエラーフォールバック**: 「確実に権限がない」と「Discord APIが一時的に確認できなかった」をエラーコードレベルで区別する。旧実装の2つの不備(リフレッシュ失敗原因の未区別、ロールID取得の例外未捕捉)を修正し、認可経路にもDiscord APIリトライを導入する。§3.7
11. **API/DB呼び出しの最小化(N+1回避)**: ループ内の逐次呼び出しを避け、バッチクエリ/並列化/キャッシュで呼び出し回数を最小化する。`guilds.list`のDBクエリN+1(旧実装で発見)をバッチ版に置き換える。`health`の3プローブ逐次実行を`Promise.all`による並列実行に変更し、チャンネル名解決は単一チャンネル専用APIを廃止して`resolveChannels`(複数id版)に統一する。§3.8

### 5.1 今回未使用のcapabilityビット

`manage_guild_settings`(設計書§6.1のビット10)は、本書が棚卸しした旧20ルートのいずれにも対応する操作が存在しない。今回のtRPC移行スコープでは**未使用のまま予約**し、どのprocedureにも割り当てない。将来ギルド全体設定(現状スコープ外の機能)を追加する際に使う想定として記録するに留める。

## 6. 次のステップ

設計判断が確定したため、`writing-plans`スキルで実装計画(パッケージ別のrouter定義順序、zodスキーマ、DBマイグレーション要否、テスト計画)を作成する。ドメインパッケージ(`packages/tts`, `packages/recruitment`, `packages/logging`, `packages/voice`, `packages/dashboard-access`)のいずれから着手するかも実装計画で決定する。

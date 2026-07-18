# Server Management Bot v3

Rewrite of the Discord operations platform. See
[`docs/current-state-audit.md`](docs/current-state-audit.md) and
[`docs/rewrite-architecture-design.md`](docs/rewrite-architecture-design.md)
for the audit and architecture design this rewrite is based on.

## Setup

```bash
bun install
cp .env.example .env
docker compose up -d postgres redis
bun run db:generate
bun run db:migrate
bun run build
```

### Discord OAuth (dashboard login)

Dashboardへのログインは Discord OAuth2 を使用します。
[Discord Developer Portal](https://discord.com/developers/applications) で対象アプリケーションの
OAuth2 設定を開き、Redirects に以下の URL を追加してください。

```text
http://localhost:3000/api/auth/callback/discord
```

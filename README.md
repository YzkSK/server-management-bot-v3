# Server Management Bot v3

Rewrite of the Discord operations platform. See
[`docs/current-state-audit.md`](docs/current-state-audit.md) and
[`docs/specs/rewrite-architecture-design.md`](docs/specs/rewrite-architecture-design.md)
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

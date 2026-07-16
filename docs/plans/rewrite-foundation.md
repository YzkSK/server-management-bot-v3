# Rewrite Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the new repository's foundation — pnpm monorepo skeleton, capability-based RBAC (data model + pure logic + tRPC middleware), a minimal bot that seeds baseline Discord-role permissions on guild join, and a minimal Dashboard (Next.js + tRPC + NextAuth) that proves the whole stack works end-to-end — with no feature domains (voice/tts/recruitment/logging) implemented yet.

**Architecture:** New pnpm workspace monorepo at `C:\Users\Yuzuki\Documents\GitHub\server-management-bot-v3`, following `docs/specs/2026-07-16-rewrite-architecture-design.md`. `apps/bot` (discord.js) and `apps/dashboard` (Next.js + tRPC) sit on top of foundation packages: `config`, `shared` (capability bit table + pure RBAC logic), `db` (Drizzle schema/repositories), `core` (thin discord.js wrapper), `dashboard-access` (tRPC context/middleware wrapping the shared RBAC logic).

**Tech Stack:** TypeScript (strict), Node.js 24, pnpm workspaces + Turborepo, discord.js v14, Drizzle ORM + `postgres` driver, PostgreSQL 17, Redis 8, Next.js (App Router), NextAuth v4 (Discord provider), tRPC v11 + `@trpc/react-query` + `@tanstack/react-query` v5, native `node:test` for tests, Docker Compose for local Postgres/Redis, GitHub Actions for CI.

## Global Constraints

- Node.js `>=24 <25`, pnpm `>=10` (copied from current repo's `package.json` engines field)
- All packages are ESM (`"type": "module"`), `tsconfig.base.json` targets `ES2022` with `module: "Preserve"` / `moduleResolution: "bundler"`, `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- Package scope: `@sm-bot/*` (e.g. `@sm-bot/db`)
- Discord IDs are always `text`, timestamps are always `timestamptz`, no Postgres `enum` types — use `text` + `CHECK` constraints (carried over from `docs/current-state-audit.md` §6 database rules, which held up in the audit)
- Capability bit table (§6.1 of the design spec) is append-only once defined — never reuse or reorder existing bit positions
- No raw ID text inputs in any Dashboard UI added in this plan — anywhere a user/role/channel needs to be referenced, use a selector fed by a real API call (only the `dashboardAccess` procedures in this plan take raw Discord IDs as programmatic input, which is fine — this rule is about UI forms, not API payloads)
- Every unit test uses dependency-injected fakes (fake `db` objects, fake fetchers) — no test in this plan touches a real Postgres/Redis/Discord API, matching the current repo's `packages/db/src/repositories/health.test.ts` pattern

---

### Task 1: Repository bootstrap

**Files:**
- Create: `C:\Users\Yuzuki\Documents\GitHub\server-management-bot-v3\package.json`
- Create: `C:\Users\Yuzuki\Documents\GitHub\server-management-bot-v3\tsconfig.base.json`
- Create: `C:\Users\Yuzuki\Documents\GitHub\server-management-bot-v3\turbo.json`
- Create: `C:\Users\Yuzuki\Documents\GitHub\server-management-bot-v3\.gitignore`
- Create: `C:\Users\Yuzuki\Documents\GitHub\server-management-bot-v3\.env.example`
- Create: `C:\Users\Yuzuki\Documents\GitHub\server-management-bot-v3\docker-compose.yml`
- Create: `C:\Users\Yuzuki\Documents\GitHub\server-management-bot-v3\README.md`

**Interfaces:**
- Produces: the workspace root that every later task's `pnpm --filter` commands run against; `apps/*` and `packages/*` glob patterns that later tasks' new directories must fall under.

- [ ] **Step 1: Create the directory and initialize git**

```bash
mkdir -p "/c/Users/Yuzuki/Documents/GitHub/server-management-bot-v3"
cd "/c/Users/Yuzuki/Documents/GitHub/server-management-bot-v3"
git init
```

Expected: `Initialized empty Git repository in .../server-management-bot-v3/.git/`

- [ ] **Step 2: Write the root `package.json`**

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

- [ ] **Step 3: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "Preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["bun-types"]
  }
}
```

- [ ] **Step 4: Write `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "typecheck": {
      "outputs": []
    }
  }
}
```

- [ ] **Step 5: Write `.gitignore`**

```gitignore
node_modules/
dist/
dist-test/
.next/
*.tsbuildinfo
.env
.env.*
!.env.example
!.env.*.example
.turbo/
```

- [ ] **Step 6: Write `.env.example`**

```env
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/callback/discord

DATABASE_URL=postgres://sm_bot:sm_bot@localhost:5432/sm_bot
REDIS_URL=redis://localhost:6379

NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
SESSION_ENCRYPTION_KEY=

PUBLIC_DASHBOARD_URL=http://localhost:3000
LOG_LEVEL=info
```

- [ ] **Step 7: Write `docker-compose.yml`** (Postgres + Redis only — no bot/dashboard/voicevox services yet, those come with the feature-domain plans)

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-sm_bot}
      POSTGRES_USER: ${POSTGRES_USER:-sm_bot}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-sm_bot}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sm_bot -d sm_bot"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:8-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

- [ ] **Step 8: Write `README.md`**

```markdown
# Server Management Bot v3

Rewrite of the Discord operations platform. See `docs/current-state-audit.md`
and `docs/specs/2026-07-16-rewrite-architecture-design.md` in the
original `discord_bot` repository for the audit and architecture design this
rewrite is based on.

## Setup

\`\`\`bash
bun install
cp .env.example .env
docker compose up -d postgres redis
bun run db:generate
bun run db:migrate
bun run build
\`\`\`
```

- [ ] **Step 9: Verify `docker compose config` parses**

```bash
docker compose config
```

Expected: prints the resolved compose config with no errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: bootstrap Bun workspace skeleton"
```

---

### Task 2: `packages/config` — environment validation

**Files:**
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.json`
- Create: `packages/config/src/dotenv.ts`
- Create: `packages/config/src/env.ts`
- Create: `packages/config/src/env.test.ts`
- Create: `packages/config/src/index.ts`

**Interfaces:**
- Produces: `parseAppEnv(env?): AppEnv`, `parseDatabaseEnv(env?): DatabaseEnv`, `parseRedisEnv(env?): RedisEnv`, `parseDashboardAuthEnv(env?): DashboardAuthEnv` — all imported by `packages/db`, `apps/bot`, `apps/dashboard` in later tasks.

- [ ] **Step 1: Write `packages/config/package.json`**

```json
{
  "name": "@sm-bot/config",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/src/index.d.ts",
      "default": "./dist/src/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch",
    "lint": "tsc -p tsconfig.json --noEmit",
    "test": "tsc -p tsconfig.json && node --test dist/src/env.test.js",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "zod": "*"
  },
  "devDependencies": {
    "dotenv": "^17.4.2",
    "typescript": "*"
  }
}
```

- [ ] **Step 2: Write `packages/config/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write `packages/config/src/dotenv.ts`**

```typescript
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

export function loadRootEnv(): void {
  config({ path: resolve(currentDir, "../../../.env") });
}
```

- [ ] **Step 4: Write the failing test `packages/config/src/env.test.ts`**

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAppEnv, parseDatabaseEnv } from "./env.js";

const validEnv = {
  DISCORD_BOT_TOKEN: "token",
  DISCORD_CLIENT_ID: "client-id",
  DISCORD_CLIENT_SECRET: "client-secret",
  DISCORD_REDIRECT_URI: "http://localhost:3000/api/auth/callback/discord",
  DATABASE_URL: "postgres://sm_bot:sm_bot@localhost:5432/sm_bot",
  REDIS_URL: "redis://localhost:6379",
  NEXTAUTH_SECRET: "secret",
  SESSION_ENCRYPTION_KEY: "x".repeat(32),
  PUBLIC_DASHBOARD_URL: "http://localhost:3000"
};

describe("parseAppEnv", () => {
  it("parses a valid environment and defaults LOG_LEVEL to info", () => {
    const result = parseAppEnv(validEnv);
    assert.equal(result.LOG_LEVEL, "info");
    assert.equal(result.DATABASE_URL, validEnv.DATABASE_URL);
  });

  it("throws when a required key is missing", () => {
    const { DISCORD_BOT_TOKEN: _omit, ...incomplete } = validEnv;
    assert.throws(() => parseAppEnv(incomplete));
  });
});

describe("parseDatabaseEnv", () => {
  it("only requires DATABASE_URL", () => {
    const result = parseDatabaseEnv({ DATABASE_URL: validEnv.DATABASE_URL });
    assert.equal(result.DATABASE_URL, validEnv.DATABASE_URL);
  });
});
```

- [ ] **Step 5: Write `packages/config/src/env.ts`**

```typescript
import { z } from "zod";

import { loadRootEnv } from "./dotenv.js";

loadRootEnv();

const logLevelSchema = z.enum(["trace", "debug", "info", "warn", "error"]);

export const appEnvSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_REDIRECT_URI: z.string().url(),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(1),
  SESSION_ENCRYPTION_KEY: z.string().min(32),
  PUBLIC_DASHBOARD_URL: z.string().url(),
  LOG_LEVEL: logLevelSchema.default("info")
});

export const databaseEnvSchema = appEnvSchema.pick({ DATABASE_URL: true });
export const redisEnvSchema = appEnvSchema.pick({ REDIS_URL: true });

export const dashboardAuthEnvSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().default(""),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url().optional()
});

export type AppEnv = z.infer<typeof appEnvSchema>;
export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
export type RedisEnv = z.infer<typeof redisEnvSchema>;
export type DashboardAuthEnv = z.infer<typeof dashboardAuthEnvSchema>;

export function parseAppEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  return appEnvSchema.parse(env);
}

export function parseDatabaseEnv(
  env: NodeJS.ProcessEnv = process.env
): DatabaseEnv {
  return databaseEnvSchema.parse(env);
}

export function parseRedisEnv(env: NodeJS.ProcessEnv = process.env): RedisEnv {
  return redisEnvSchema.parse(env);
}

export function parseDashboardAuthEnv(
  env: NodeJS.ProcessEnv = process.env
): DashboardAuthEnv {
  return dashboardAuthEnvSchema.parse(env);
}
```

- [ ] **Step 6: Write `packages/config/src/index.ts`**

```typescript
export * from "./env.js";
```

- [ ] **Step 7: Install dependencies, build, and run the test**

```bash
cd "/c/Users/Yuzuki/Documents/GitHub/server-management-bot-v3"
pnpm install
pnpm --filter @sm-bot/config test
```

Expected: both `describe` blocks pass (3 `it` cases, 0 failures).

- [ ] **Step 8: Commit**

```bash
git add packages/config
git commit -m "feat(config): add environment validation package"
```

---

### Task 3: `packages/shared` — capability bit table and pure RBAC logic

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/capabilities.ts`
- Create: `packages/shared/src/capabilities.test.ts`
- Create: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `CAP` (frozen bit constants), `BASELINE_EVERYONE_CAPABILITIES: bigint`, `hasCapability(capabilities: bigint, cap: bigint): boolean`, `combineCapabilities(...values: bigint[]): bigint`, `canGrantCapabilities(input: { granterCapabilities: bigint; granterIsOwner: boolean; requestedCapabilities: bigint }): boolean`, `capabilitiesToWireString(value: bigint): string`, `parseCapabilitiesWireString(value: string): bigint`. Consumed by `packages/db` (Task 5), `packages/dashboard-access` (Tasks 6-7), `apps/bot` (Task 9), `apps/dashboard` (Task 11).

- [ ] **Step 1: Write `packages/shared/package.json`**

```json
{
  "name": "@sm-bot/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/src/index.d.ts",
      "default": "./dist/src/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch",
    "lint": "tsc -p tsconfig.json --noEmit",
    "test": "tsc -p tsconfig.json && node --test dist/src/capabilities.test.js",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "zod": "*"
  },
  "devDependencies": {
    "typescript": "*"
  }
}
```

- [ ] **Step 2: Write `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write the failing test `packages/shared/src/capabilities.test.ts`**

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BASELINE_EVERYONE_CAPABILITIES,
  CAP,
  canGrantCapabilities,
  capabilitiesToWireString,
  combineCapabilities,
  hasCapability,
  parseCapabilitiesWireString
} from "./capabilities.js";

describe("hasCapability", () => {
  it("returns true when the bit is set", () => {
    assert.equal(hasCapability(CAP.VIEW_LOGS | CAP.MANAGE_VOICE, CAP.VIEW_LOGS), true);
  });

  it("returns false when the bit is not set", () => {
    assert.equal(hasCapability(CAP.VIEW_LOGS, CAP.MANAGE_VOICE), false);
  });
});

describe("combineCapabilities", () => {
  it("ORs every value together", () => {
    const combined = combineCapabilities(CAP.VIEW_LOGS, CAP.VIEW_VOICE, 0n);
    assert.equal(hasCapability(combined, CAP.VIEW_LOGS), true);
    assert.equal(hasCapability(combined, CAP.VIEW_VOICE), true);
    assert.equal(hasCapability(combined, CAP.MANAGE_VOICE), false);
  });

  it("returns 0n for no inputs", () => {
    assert.equal(combineCapabilities(), 0n);
  });
});

describe("BASELINE_EVERYONE_CAPABILITIES", () => {
  it("includes exactly the four view_* capabilities", () => {
    for (const cap of [CAP.VIEW_LOGS, CAP.VIEW_VOICE, CAP.VIEW_RECRUITMENT, CAP.VIEW_TTS]) {
      assert.equal(hasCapability(BASELINE_EVERYONE_CAPABILITIES, cap), true);
    }
    for (const cap of [CAP.MANAGE_VOICE, CAP.MANAGE_ACCESS, CAP.VIEW_LOGS_RAW]) {
      assert.equal(hasCapability(BASELINE_EVERYONE_CAPABILITIES, cap), false);
    }
  });
});

describe("canGrantCapabilities", () => {
  it("allows the owner to grant anything, including MANAGE_ACCESS", () => {
    const ok = canGrantCapabilities({
      granterCapabilities: 0n,
      granterIsOwner: true,
      requestedCapabilities: CAP.MANAGE_ACCESS | CAP.MANAGE_VOICE
    });
    assert.equal(ok, true);
  });

  it("allows a non-owner to grant a subset of their own capabilities", () => {
    const granterCapabilities = CAP.VIEW_LOGS | CAP.MANAGE_VOICE;
    const ok = canGrantCapabilities({
      granterCapabilities,
      granterIsOwner: false,
      requestedCapabilities: CAP.MANAGE_VOICE
    });
    assert.equal(ok, true);
  });

  it("rejects a non-owner granting a capability they do not hold", () => {
    const ok = canGrantCapabilities({
      granterCapabilities: CAP.VIEW_LOGS,
      granterIsOwner: false,
      requestedCapabilities: CAP.MANAGE_VOICE
    });
    assert.equal(ok, false);
  });

  it("rejects a non-owner granting MANAGE_ACCESS even if they hold it", () => {
    const ok = canGrantCapabilities({
      granterCapabilities: CAP.MANAGE_ACCESS,
      granterIsOwner: false,
      requestedCapabilities: CAP.MANAGE_ACCESS
    });
    assert.equal(ok, false);
  });
});

describe("capability wire (de)serialization", () => {
  it("round-trips a bigint through its decimal string form", () => {
    const value = CAP.VIEW_LOGS | CAP.MANAGE_ACCESS;
    const wire = capabilitiesToWireString(value);
    assert.equal(typeof wire, "string");
    assert.equal(parseCapabilitiesWireString(wire), value);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
cd "/c/Users/Yuzuki/Documents/GitHub/server-management-bot-v3"
pnpm --filter @sm-bot/shared test
```

Expected: FAIL — `Cannot find module './capabilities.js'`.

- [ ] **Step 5: Write `packages/shared/src/capabilities.ts`**

```typescript
export const CAP = {
  VIEW_LOGS: 1n << 0n,
  VIEW_LOGS_RAW: 1n << 1n,
  VIEW_VOICE: 1n << 2n,
  MANAGE_VOICE: 1n << 3n,
  VIEW_RECRUITMENT: 1n << 4n,
  MANAGE_RECRUITMENT: 1n << 5n,
  VIEW_TTS: 1n << 6n,
  MANAGE_TTS: 1n << 7n,
  MANAGE_LOGGING_SETTINGS: 1n << 8n,
  MANAGE_ACCESS: 1n << 9n,
  MANAGE_GUILD_SETTINGS: 1n << 10n
} as const;

export type CapabilityBit = (typeof CAP)[keyof typeof CAP];

export const BASELINE_EVERYONE_CAPABILITIES: bigint =
  CAP.VIEW_LOGS | CAP.VIEW_VOICE | CAP.VIEW_RECRUITMENT | CAP.VIEW_TTS;

export function hasCapability(capabilities: bigint, cap: bigint): boolean {
  return (capabilities & cap) === cap;
}

export function combineCapabilities(...values: bigint[]): bigint {
  return values.reduce((acc, value) => acc | value, 0n);
}

export interface CanGrantCapabilitiesInput {
  granterCapabilities: bigint;
  granterIsOwner: boolean;
  requestedCapabilities: bigint;
}

export function canGrantCapabilities(input: CanGrantCapabilitiesInput): boolean {
  if (input.granterIsOwner) return true;

  const isSubsetOfGranter =
    (input.requestedCapabilities & input.granterCapabilities) ===
    input.requestedCapabilities;
  if (!isSubsetOfGranter) return false;

  if (hasCapability(input.requestedCapabilities, CAP.MANAGE_ACCESS)) return false;

  return true;
}

export function capabilitiesToWireString(value: bigint): string {
  return value.toString(10);
}

export function parseCapabilitiesWireString(value: string): bigint {
  return BigInt(value);
}
```

- [ ] **Step 6: Write `packages/shared/src/index.ts`**

```typescript
export * from "./capabilities.js";
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
pnpm --filter @sm-bot/shared test
```

Expected: PASS — all `describe` blocks green.

- [ ] **Step 8: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add capability bit table and pure RBAC logic"
```

---

### Task 4: `packages/db` — schema, client, migrations

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/schema/core.ts`
- Create: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/index.ts`

**Interfaces:**
- Produces: `guilds`, `dashboardAccessGrants` Drizzle table objects; `createDbConnection(databaseUrl?): { db: DbClient; close: () => Promise<void> }`; `type DbClient`. Consumed by Task 5 (repositories), Task 9 (bot), Task 11 (dashboard router).

- [ ] **Step 1: Write `packages/db/package.json`**

```json
{
  "name": "@sm-bot/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/src/index.d.ts",
      "default": "./dist/src/index.js"
    },
    "./schema": {
      "types": "./dist/src/schema/index.d.ts",
      "default": "./dist/src/schema/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "dev": "tsc -p tsconfig.json --watch",
    "lint": "tsc -p tsconfig.json --noEmit",
    "test": "tsc -p tsconfig.json && node --test dist/src/repositories/dashboard-access.test.js",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@sm-bot/config": "workspace:*",
    "@sm-bot/shared": "workspace:*",
    "drizzle-orm": "*",
    "postgres": "*"
  },
  "devDependencies": {
    "dotenv": "^17.4.2",
    "drizzle-kit": "*",
    "typescript": "*"
  }
}
```

- [ ] **Step 2: Write `packages/db/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*.ts", "drizzle.config.ts"]
}
```

- [ ] **Step 3: Write `packages/db/drizzle.config.ts`**

```typescript
import { parseDatabaseEnv } from "@sm-bot/config";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(currentDir, "../../.env") });

const env = parseDatabaseEnv();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: env.DATABASE_URL
  },
  strict: true,
  verbose: true
});
```

- [ ] **Step 4: Write `packages/db/src/schema/core.ts`**

```typescript
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const guilds = pgTable(
  "guilds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    guildId: text("guild_id").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    guildIdIdx: uniqueIndex("guilds_guild_id_idx").on(table.guildId)
  })
);

export const dashboardAccessGrants = pgTable(
  "dashboard_access_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    guildId: text("guild_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    capabilities: bigint("capabilities", { mode: "bigint" })
      .notNull()
      .default(0n),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    targetIdx: uniqueIndex("dashboard_access_grants_target_idx").on(
      table.guildId,
      table.targetType,
      table.targetId
    ),
    targetTypeCheck: check(
      "dashboard_access_grants_target_type_check",
      sql`${table.targetType} in ('user', 'role')`
    )
  })
);
```

- [ ] **Step 5: Write `packages/db/src/schema/index.ts`**

```typescript
export * from "./core.js";
```

- [ ] **Step 6: Write `packages/db/src/client.ts`**

```typescript
import { parseDatabaseEnv } from "@sm-bot/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.js";

const DB_POOL_MAX = 10;
const DB_CLOSE_TIMEOUT_SEC = 5;

export function createDbConnection(
  databaseUrl = parseDatabaseEnv().DATABASE_URL
) {
  const client = postgres(databaseUrl, {
    max: DB_POOL_MAX,
    prepare: false
  });

  return {
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: DB_CLOSE_TIMEOUT_SEC })
  };
}

export type DbConnection = ReturnType<typeof createDbConnection>;
export type DbClient = DbConnection["db"];
```

- [ ] **Step 7: Write `packages/db/src/index.ts`**

```typescript
export * from "./client.js";
export * from "./schema/index.js";
```

- [ ] **Step 8: Install, build, and generate the initial migration**

```bash
cd "/c/Users/Yuzuki/Documents/GitHub/server-management-bot-v3"
pnpm install
pnpm --filter @sm-bot/db build
pnpm --filter @sm-bot/db db:generate
```

Expected: a new SQL file appears under `packages/db/drizzle/` creating `guilds` and `dashboard_access_grants`.

- [ ] **Step 9: Commit**

```bash
git add packages/db
git commit -m "feat(db): add guilds and dashboard_access_grants schema"
```

---

### Task 5: `packages/db` — dashboard-access repository (baseline seed + effective-capability lookup)

**Files:**
- Create: `packages/db/src/repositories/dashboard-access.ts`
- Create: `packages/db/src/repositories/dashboard-access.test.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/package.json:12` (test script file list)

**Interfaces:**
- Consumes: `DbClient` (Task 4), `dashboardAccessGrants` table (Task 4), `BASELINE_EVERYONE_CAPABILITIES`, `combineCapabilities` (Task 3)
- Produces: `ensureEveryoneBaselineGrant(db: DbClient, input: { guildId: string; everyoneRoleId: string }): Promise<{ created: boolean }>`, `listGrantsForPrincipal(db: DbClient, input: { guildId: string; userId: string; roleIds: string[] }): Promise<DashboardAccessGrantRow[]>`, `type DashboardAccessGrantRow`. Consumed by `apps/bot` (Task 9) and `apps/dashboard` (Task 11).

- [ ] **Step 1: Write the failing test `packages/db/src/repositories/dashboard-access.test.ts`**

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BASELINE_EVERYONE_CAPABILITIES } from "@sm-bot/shared";

import {
  ensureEveryoneBaselineGrant,
  listGrantsForPrincipal
} from "./dashboard-access.js";

function createFakeDb(initialRows: Array<Record<string, unknown>> = []) {
  const rows = [...initialRows];

  const fakeDb = {
    rows,
    select() {
      return {
        from() {
          return {
            where: async () => rows.filter(() => true)
          };
        }
      };
    },
    insert() {
      return {
        values(values: Record<string, unknown>) {
          return {
            onConflictDoNothing: async () => {
              const exists = rows.some(
                (row) =>
                  row.guildId === values.guildId &&
                  row.targetType === values.targetType &&
                  row.targetId === values.targetId
              );
              if (!exists) rows.push({ id: `row-${rows.length}`, ...values });
              return exists ? [] : [{ id: `row-${rows.length - 1}` }];
            }
          };
        }
      };
    }
  };

  return fakeDb as unknown as import("../client.js").DbClient & {
    rows: typeof rows;
  };
}

describe("ensureEveryoneBaselineGrant", () => {
  it("creates a grant when none exists for the @everyone role", async () => {
    const db = createFakeDb();

    const result = await ensureEveryoneBaselineGrant(db, {
      guildId: "guild-1",
      everyoneRoleId: "role-everyone"
    });

    assert.equal(result.created, true);
    assert.equal(db.rows.length, 1);
    assert.equal(db.rows[0]?.capabilities, BASELINE_EVERYONE_CAPABILITIES);
  });

  it("does not overwrite an existing grant for the @everyone role", async () => {
    const db = createFakeDb([
      {
        id: "row-0",
        guildId: "guild-1",
        targetType: "role",
        targetId: "role-everyone",
        capabilities: 0n
      }
    ]);

    const result = await ensureEveryoneBaselineGrant(db, {
      guildId: "guild-1",
      everyoneRoleId: "role-everyone"
    });

    assert.equal(result.created, false);
    assert.equal(db.rows.length, 1);
    assert.equal(db.rows[0]?.capabilities, 0n);
  });
});

describe("listGrantsForPrincipal", () => {
  it("returns rows matching the user id or any of the role ids", async () => {
    const db = createFakeDb([
      {
        id: "row-0",
        guildId: "guild-1",
        targetType: "user",
        targetId: "user-1",
        capabilities: 1n
      },
      {
        id: "row-1",
        guildId: "guild-1",
        targetType: "role",
        targetId: "role-everyone",
        capabilities: 2n
      },
      {
        id: "row-2",
        guildId: "guild-1",
        targetType: "role",
        targetId: "role-unrelated",
        capabilities: 4n
      }
    ]);

    const rows = await listGrantsForPrincipal(db, {
      guildId: "guild-1",
      userId: "user-1",
      roleIds: ["role-everyone"]
    });

    assert.equal(rows.length, 3);
  });
});
```

Note: this fake `db` is intentionally simple — `where` returns all rows (the real Drizzle query does the filtering; the fake only proves `listGrantsForPrincipal` calls through to `db.select().from().where()` without throwing). The `ensureEveryoneBaselineGrant` behavior (create-if-absent) is fully exercised by the fake `insert().values().onConflictDoNothing()` chain.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd "/c/Users/Yuzuki/Documents/GitHub/server-management-bot-v3"
pnpm --filter @sm-bot/db test
```

Expected: FAIL — `Cannot find module './dashboard-access.js'`.

- [ ] **Step 3: Write `packages/db/src/repositories/dashboard-access.ts`**

```typescript
import { and, eq, inArray, or } from "drizzle-orm";

import { BASELINE_EVERYONE_CAPABILITIES } from "@sm-bot/shared";

import type { DbClient } from "../client.js";
import { dashboardAccessGrants } from "../schema/index.js";

export interface EnsureEveryoneBaselineGrantInput {
  guildId: string;
  everyoneRoleId: string;
}

export async function ensureEveryoneBaselineGrant(
  db: DbClient,
  input: EnsureEveryoneBaselineGrantInput
): Promise<{ created: boolean }> {
  const inserted = await db
    .insert(dashboardAccessGrants)
    .values({
      guildId: input.guildId,
      targetType: "role",
      targetId: input.everyoneRoleId,
      capabilities: BASELINE_EVERYONE_CAPABILITIES
    })
    .onConflictDoNothing({
      target: [
        dashboardAccessGrants.guildId,
        dashboardAccessGrants.targetType,
        dashboardAccessGrants.targetId
      ]
    });

  return { created: inserted.length > 0 };
}

export interface ListGrantsForPrincipalInput {
  guildId: string;
  userId: string;
  roleIds: string[];
}

export type DashboardAccessGrantRow = typeof dashboardAccessGrants.$inferSelect;

export async function listGrantsForPrincipal(
  db: DbClient,
  input: ListGrantsForPrincipalInput
): Promise<DashboardAccessGrantRow[]> {
  return db
    .select()
    .from(dashboardAccessGrants)
    .where(
      and(
        eq(dashboardAccessGrants.guildId, input.guildId),
        or(
          and(
            eq(dashboardAccessGrants.targetType, "user"),
            eq(dashboardAccessGrants.targetId, input.userId)
          ),
          and(
            eq(dashboardAccessGrants.targetType, "role"),
            inArray(dashboardAccessGrants.targetId, input.roleIds)
          )
        )
      )
    );
}
```

- [ ] **Step 4: Update `packages/db/src/index.ts`**

```typescript
export * from "./client.js";
export * from "./repositories/dashboard-access.js";
export * from "./schema/index.js";
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @sm-bot/db test
```

Expected: PASS — 3 `it` cases green.

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "feat(db): add dashboard-access repository with idempotent baseline seed"
```

---

### Task 6: `packages/dashboard-access` — effective capability resolution

**Files:**
- Create: `packages/dashboard-access/package.json`
- Create: `packages/dashboard-access/tsconfig.json`
- Create: `packages/dashboard-access/src/effective-capabilities.ts`
- Create: `packages/dashboard-access/src/effective-capabilities.test.ts`
- Create: `packages/dashboard-access/src/index.ts`

**Interfaces:**
- Consumes: `combineCapabilities`, `hasCapability`, `CAP` (Task 3), `DashboardAccessGrantRow` (Task 5)
- Produces: `resolveEffectiveCapabilities(input: { grants: Pick<DashboardAccessGrantRow, "capabilities">[]; isGuildOwner: boolean }): bigint`. Consumed by Task 7 (tRPC context) and Task 11 (dashboard router).

- [ ] **Step 1: Write the failing test `packages/dashboard-access/src/effective-capabilities.test.ts`**

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CAP, hasCapability } from "@sm-bot/shared";

import { resolveEffectiveCapabilities } from "./effective-capabilities.js";

describe("resolveEffectiveCapabilities", () => {
  it("ORs together the capabilities of every matching grant", () => {
    const result = resolveEffectiveCapabilities({
      grants: [{ capabilities: CAP.VIEW_LOGS }, { capabilities: CAP.MANAGE_VOICE }],
      isGuildOwner: false
    });

    assert.equal(hasCapability(result, CAP.VIEW_LOGS), true);
    assert.equal(hasCapability(result, CAP.MANAGE_VOICE), true);
    assert.equal(hasCapability(result, CAP.MANAGE_ACCESS), false);
  });

  it("grants every capability bit when the principal is the guild owner, even with no grants", () => {
    const result = resolveEffectiveCapabilities({ grants: [], isGuildOwner: true });

    for (const cap of Object.values(CAP)) {
      assert.equal(hasCapability(result, cap), true);
    }
  });

  it("returns 0n for a non-owner with no grants", () => {
    const result = resolveEffectiveCapabilities({ grants: [], isGuildOwner: false });
    assert.equal(result, 0n);
  });
});
```

- [ ] **Step 2: Write `packages/dashboard-access/package.json`**

```json
{
  "name": "@sm-bot/dashboard-access",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/src/index.d.ts",
      "default": "./dist/src/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch",
    "lint": "tsc -p tsconfig.json --noEmit",
    "test": "tsc -p tsconfig.json && node --test dist/src/effective-capabilities.test.js",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@sm-bot/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "*"
  }
}
```

- [ ] **Step 3: Write `packages/dashboard-access/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
cd "/c/Users/Yuzuki/Documents/GitHub/server-management-bot-v3"
pnpm install
pnpm --filter @sm-bot/dashboard-access test
```

Expected: FAIL — `Cannot find module './effective-capabilities.js'`.

- [ ] **Step 5: Write `packages/dashboard-access/src/effective-capabilities.ts`**

```typescript
import { CAP, combineCapabilities } from "@sm-bot/shared";

export interface ResolveEffectiveCapabilitiesInput {
  grants: Array<{ capabilities: bigint }>;
  isGuildOwner: boolean;
}

const ALL_CAPABILITIES: bigint = combineCapabilities(...Object.values(CAP));

export function resolveEffectiveCapabilities(
  input: ResolveEffectiveCapabilitiesInput
): bigint {
  if (input.isGuildOwner) return ALL_CAPABILITIES;

  return combineCapabilities(...input.grants.map((grant) => grant.capabilities));
}
```

- [ ] **Step 6: Write `packages/dashboard-access/src/index.ts`**

```typescript
export * from "./effective-capabilities.js";
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
pnpm --filter @sm-bot/dashboard-access test
```

Expected: PASS — 3 `it` cases green.

- [ ] **Step 8: Commit**

```bash
git add packages/dashboard-access
git commit -m "feat(dashboard-access): add effective capability resolution"
```

---

### Task 7: `packages/dashboard-access` — tRPC base router and `requireCapability` middleware

**Files:**
- Create: `packages/dashboard-access/src/trpc-context.ts`
- Create: `packages/dashboard-access/src/trpc.ts`
- Create: `packages/dashboard-access/src/trpc.test.ts`
- Modify: `packages/dashboard-access/src/index.ts`
- Modify: `packages/dashboard-access/package.json:12` (test script file list)

**Interfaces:**
- Consumes: `hasCapability` (Task 3), `resolveEffectiveCapabilities` (Task 6)
- Produces: `type DashboardAccessContext` (`{ userId: string | null; isGuildOwner: boolean; capabilities: bigint }`), `router`, `publicProcedure`, `protectedProcedure`, `requireCapability(cap: bigint)`. Consumed by Task 11 (dashboard `appRouter`).

- [ ] **Step 1: Write the failing test `packages/dashboard-access/src/trpc.test.ts`**

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CAP } from "@sm-bot/shared";

import { protectedProcedure, requireCapability, router } from "./trpc.js";
import type { DashboardAccessContext } from "./trpc-context.js";

function context(overrides: Partial<DashboardAccessContext> = {}): DashboardAccessContext {
  return { userId: "user-1", isGuildOwner: false, capabilities: 0n, ...overrides };
}

const testRouter = router({
  whoAmI: protectedProcedure.query(({ ctx }) => ctx.userId),
  manageVoiceOnly: requireCapability(CAP.MANAGE_VOICE).query(() => "ok")
});

describe("protectedProcedure", () => {
  it("resolves for an authenticated user", async () => {
    const caller = testRouter.createCaller(context());
    assert.equal(await caller.whoAmI(), "user-1");
  });

  it("rejects an unauthenticated request", async () => {
    const caller = testRouter.createCaller(context({ userId: null }));
    await assert.rejects(() => caller.whoAmI(), /UNAUTHORIZED/);
  });
});

describe("requireCapability", () => {
  it("allows a request whose capabilities include the required bit", async () => {
    const caller = testRouter.createCaller(context({ capabilities: CAP.MANAGE_VOICE }));
    assert.equal(await caller.manageVoiceOnly(), "ok");
  });

  it("rejects a request missing the required bit", async () => {
    const caller = testRouter.createCaller(context({ capabilities: CAP.VIEW_LOGS }));
    await assert.rejects(() => caller.manageVoiceOnly(), /FORBIDDEN/);
  });

  it("rejects an unauthenticated request before checking capabilities", async () => {
    const caller = testRouter.createCaller(context({ userId: null, capabilities: CAP.MANAGE_VOICE }));
    await assert.rejects(() => caller.manageVoiceOnly(), /UNAUTHORIZED/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd "/c/Users/Yuzuki/Documents/GitHub/server-management-bot-v3"
pnpm --filter @sm-bot/dashboard-access test
```

Expected: FAIL — `Cannot find module './trpc.js'`.

- [ ] **Step 3: Write `packages/dashboard-access/src/trpc-context.ts`**

```typescript
export interface DashboardAccessContext {
  userId: string | null;
  isGuildOwner: boolean;
  capabilities: bigint;
}
```

- [ ] **Step 4: Write `packages/dashboard-access/src/trpc.ts`**

```typescript
import { initTRPC, TRPCError } from "@trpc/server";

import { hasCapability } from "@sm-bot/shared";

import type { DashboardAccessContext } from "./trpc-context.js";

const t = initTRPC.context<DashboardAccessContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

export function requireCapability(cap: bigint) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!hasCapability(ctx.capabilities, cap)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next({ ctx });
  });
}
```

- [ ] **Step 5: Update `packages/dashboard-access/package.json`'s test script** to include the new test file

```json
"test": "tsc -p tsconfig.json && node --test dist/src/effective-capabilities.test.js dist/src/trpc.test.js",
```

- [ ] **Step 6: Update `packages/dashboard-access/src/index.ts`**

```typescript
export * from "./effective-capabilities.js";
export * from "./trpc-context.js";
export * from "./trpc.js";
```

- [ ] **Step 7: Add `@trpc/server` to the workspace and run the test**

```bash
pnpm add -w @trpc/server@^11.0.0 --filter @sm-bot/dashboard-access
pnpm --filter @sm-bot/dashboard-access test
```

Expected: PASS — 5 `it` cases green.

- [ ] **Step 8: Commit**

```bash
git add packages/dashboard-access
git commit -m "feat(dashboard-access): add tRPC base router and requireCapability middleware"
```

---

### Task 8: `packages/core` — thin discord.js client wrapper

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/client.ts`
- Create: `packages/core/src/client.test.ts`
- Create: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `createDiscordClient(input: { token: string; intents: number[] }): Client` (thin factory around `discord.js`'s `Client`, no feature logic). Consumed by `apps/bot` (Task 9).

- [ ] **Step 1: Write the failing test `packages/core/src/client.test.ts`**

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GatewayIntentBits } from "discord.js";

import { createDiscordClient } from "./client.js";

describe("createDiscordClient", () => {
  it("builds a discord.js Client with the given intents and no token yet applied", () => {
    const client = createDiscordClient({
      token: "unused-in-this-test",
      intents: [GatewayIntentBits.Guilds]
    });

    assert.equal(client.options.intents.has(GatewayIntentBits.Guilds), true);
    assert.equal(client.token, null);
  });
});
```

- [ ] **Step 2: Write `packages/core/package.json`**

```json
{
  "name": "@sm-bot/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/src/index.d.ts",
      "default": "./dist/src/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch",
    "lint": "tsc -p tsconfig.json --noEmit",
    "test": "tsc -p tsconfig.json && node --test dist/src/client.test.js",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "discord.js": "*"
  },
  "devDependencies": {
    "typescript": "*"
  }
}
```

- [ ] **Step 3: Write `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
cd "/c/Users/Yuzuki/Documents/GitHub/server-management-bot-v3"
pnpm install
pnpm --filter @sm-bot/core test
```

Expected: FAIL — `Cannot find module './client.js'`.

- [ ] **Step 5: Write `packages/core/src/client.ts`**

```typescript
import { Client, type GatewayIntentBits } from "discord.js";

export interface CreateDiscordClientInput {
  token: string;
  intents: GatewayIntentBits[];
}

export function createDiscordClient(input: CreateDiscordClientInput): Client {
  return new Client({ intents: input.intents });
}
```

Note: `token` is accepted here (and used by `apps/bot` to call `client.login(input.token)` in Task 9) but intentionally not passed to the `Client` constructor — logging in is a separate, explicit step owned by the caller, not the factory.

- [ ] **Step 6: Write `packages/core/src/index.ts`**

```typescript
export * from "./client.js";
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
pnpm --filter @sm-bot/core test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core
git commit -m "feat(core): add thin discord.js client factory"
```

---

### Task 9: `apps/bot` — minimal runtime with `@everyone` baseline capability seeding

**Files:**
- Create: `apps/bot/package.json`
- Create: `apps/bot/tsconfig.json`
- Create: `apps/bot/Dockerfile`
- Create: `apps/bot/src/guild-join.ts`
- Create: `apps/bot/src/guild-join.test.ts`
- Create: `apps/bot/src/runtime.ts`
- Create: `apps/bot/src/index.ts`

**Interfaces:**
- Consumes: `createDiscordClient` (Task 8), `createDbConnection`, `ensureEveryoneBaselineGrant` (Task 5), `parseAppEnv` (Task 2)
- Produces: `handleGuildCreate(input: { guildId: string; everyoneRoleId: string }, deps: { ensureEveryoneBaselineGrant: typeof ensureEveryoneBaselineGrant; db: DbClient }): Promise<void>` — the pure, testable seam between the Discord `GuildCreate` event and the DB repository from Task 5.

- [ ] **Step 1: Write the failing test `apps/bot/src/guild-join.test.ts`**

```typescript
import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import { handleGuildCreate } from "./guild-join.js";

describe("handleGuildCreate", () => {
  it("seeds the @everyone baseline grant for the guild", async () => {
    const ensureEveryoneBaselineGrant = mock.fn(async () => ({ created: true }));

    await handleGuildCreate(
      { guildId: "guild-1", everyoneRoleId: "role-everyone" },
      { ensureEveryoneBaselineGrant, db: {} as never }
    );

    assert.equal(ensureEveryoneBaselineGrant.mock.calls.length, 1);
    assert.deepEqual(ensureEveryoneBaselineGrant.mock.calls[0]?.arguments[1], {
      guildId: "guild-1",
      everyoneRoleId: "role-everyone"
    });
  });
});
```

- [ ] **Step 2: Write `apps/bot/package.json`**

```json
{
  "name": "@sm-bot/bot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx src/index.ts",
    "lint": "tsc -p tsconfig.json --noEmit",
    "start": "node dist/index.js",
    "test": "tsc -p tsconfig.json && node --test dist/guild-join.test.js",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@sm-bot/config": "workspace:*",
    "@sm-bot/core": "workspace:*",
    "@sm-bot/db": "workspace:*",
    "discord.js": "*"
  },
  "devDependencies": {
    "tsx": "*",
    "typescript": "*"
  }
}
```

- [ ] **Step 3: Write `apps/bot/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
cd "/c/Users/Yuzuki/Documents/GitHub/server-management-bot-v3"
pnpm install
pnpm --filter @sm-bot/bot test
```

Expected: FAIL — `Cannot find module './guild-join.js'`.

- [ ] **Step 5: Write `apps/bot/src/guild-join.ts`**

```typescript
import type { DbClient, ensureEveryoneBaselineGrant } from "@sm-bot/db";

export interface HandleGuildCreateInput {
  guildId: string;
  everyoneRoleId: string;
}

export interface HandleGuildCreateDeps {
  db: DbClient;
  ensureEveryoneBaselineGrant: typeof ensureEveryoneBaselineGrant;
}

export async function handleGuildCreate(
  input: HandleGuildCreateInput,
  deps: HandleGuildCreateDeps
): Promise<void> {
  await deps.ensureEveryoneBaselineGrant(deps.db, {
    guildId: input.guildId,
    everyoneRoleId: input.everyoneRoleId
  });
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
pnpm --filter @sm-bot/bot test
```

Expected: PASS.

- [ ] **Step 7: Write `apps/bot/src/runtime.ts`** (wires the tested `handleGuildCreate` to the real `GuildCreate` event — this wiring itself is thin enough not to need its own test, matching the "fold scaffolding into the task whose deliverable needs it" guidance)

```typescript
import { parseAppEnv } from "@sm-bot/config";
import { createDiscordClient } from "@sm-bot/core";
import { createDbConnection, ensureEveryoneBaselineGrant } from "@sm-bot/db";
import { Events, GatewayIntentBits } from "discord.js";

import { handleGuildCreate } from "./guild-join.js";

export async function startBot(): Promise<void> {
  const env = parseAppEnv();
  const { db } = createDbConnection(env.DATABASE_URL);
  const client = createDiscordClient({
    token: env.DISCORD_BOT_TOKEN,
    intents: [GatewayIntentBits.Guilds]
  });

  client.on(Events.GuildCreate, (guild) => {
    void handleGuildCreate(
      { guildId: guild.id, everyoneRoleId: guild.roles.everyone.id },
      { db, ensureEveryoneBaselineGrant }
    ).catch((err: unknown) => {
      console.error("guild-join: failed to seed baseline grant", { guildId: guild.id, err });
    });
  });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`bot started as ${readyClient.user.tag}`);
  });

  await client.login(env.DISCORD_BOT_TOKEN);
}
```

- [ ] **Step 8: Write `apps/bot/src/index.ts`**

```typescript
import { startBot } from "./runtime.js";

startBot().catch((err: unknown) => {
  console.error("bot: failed to start", err);
  process.exitCode = 1;
});
```

- [ ] **Step 9: Write `apps/bot/Dockerfile`**

```dockerfile
FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @sm-bot/bot... build

FROM base AS runtime
COPY --from=build /app /app
CMD ["node", "apps/bot/dist/index.js"]
```

- [ ] **Step 10: Build and typecheck the whole workspace**

```bash
pnpm build
pnpm typecheck
```

Expected: both succeed with no errors.

- [ ] **Step 11: Commit**

```bash
git add apps/bot
git commit -m "feat(bot): add minimal runtime with @everyone baseline capability seeding"
```

---

### Task 10: `apps/dashboard` — Next.js scaffold with Discord OAuth

**Files:**
- Create: `apps/dashboard/package.json`
- Create: `apps/dashboard/tsconfig.json`
- Create: `apps/dashboard/next.config.ts`
- Create: `apps/dashboard/src/auth.ts`
- Create: `apps/dashboard/src/app/api/auth/[...nextauth]/route.ts`
- Create: `apps/dashboard/src/app/layout.tsx`
- Create: `apps/dashboard/src/app/page.tsx`

**Interfaces:**
- Consumes: `parseDashboardAuthEnv` (Task 2)
- Produces: `authOptions` (NextAuth config), a running Next.js app at `http://localhost:3000` with a login page. Consumed by Task 11 (tRPC context reads the NextAuth session) and Task 12 (root page).

- [ ] **Step 1: Write `apps/dashboard/package.json`**

```json
{
  "name": "@sm-bot/dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "next build",
    "dev": "next dev",
    "lint": "tsc -p tsconfig.json --noEmit",
    "start": "next start",
    "test": "tsc -p tsconfig.test.json --noEmit",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@sm-bot/config": "workspace:*",
    "@sm-bot/dashboard-access": "workspace:*",
    "@sm-bot/db": "workspace:*",
    "@sm-bot/shared": "workspace:*",
    "@tanstack/react-query": "^5.0.0",
    "@trpc/client": "^11.0.0",
    "@trpc/react-query": "^11.0.0",
    "@trpc/server": "^11.0.0",
    "next": "*",
    "next-auth": "^4.24.14",
    "react": "*",
    "react-dom": "*",
    "zod": "*"
  },
  "devDependencies": {
    "@types/react": "*",
    "@types/react-dom": "*",
    "typescript": "*"
  }
}
```

- [ ] **Step 2: Write `apps/dashboard/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `apps/dashboard/next.config.ts`**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 4: Write `apps/dashboard/src/auth.ts`**

```typescript
import { parseDashboardAuthEnv } from "@sm-bot/config";
import type { AuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

const env = parseDashboardAuthEnv();

export const authOptions: AuthOptions = {
  secret: env.NEXTAUTH_SECRET,
  providers: [
    DiscordProvider({
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
      authorization: { params: { scope: "identify guilds" } }
    })
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    }
  }
};
```

- [ ] **Step 5: Write `apps/dashboard/src/app/api/auth/[...nextauth]/route.ts`**

```typescript
import NextAuth from "next-auth";

import { authOptions } from "../../../../auth.js";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
```

- [ ] **Step 6: Write `apps/dashboard/src/app/layout.tsx`**

```tsx
export const metadata = {
  title: "Server Management Bot"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Write `apps/dashboard/src/app/page.tsx`** (placeholder — replaced by the "who am I" page in Task 12)

```tsx
export default function HomePage() {
  return <main>Server Management Bot dashboard — under construction.</main>;
}
```

- [ ] **Step 8: Install dependencies and build**

```bash
cd "/c/Users/Yuzuki/Documents/GitHub/server-management-bot-v3"
pnpm install
pnpm --filter @sm-bot/dashboard build
```

Expected: Next.js build succeeds (env vars can be dummy placeholders locally, same as the current repo's CI `build` step).

- [ ] **Step 9: Commit**

```bash
git add apps/dashboard
git commit -m "feat(dashboard): add Next.js scaffold with Discord OAuth"
```

---

### Task 11: `apps/dashboard` — tRPC route handler and `dashboardAccess` router

**Files:**
- Create: `apps/dashboard/src/server/trpc-context.ts`
- Create: `apps/dashboard/src/server/dashboard-access-router.ts`
- Create: `apps/dashboard/src/server/dashboard-access-router.test.ts`
- Create: `apps/dashboard/src/server/app-router.ts`
- Create: `apps/dashboard/src/app/api/trpc/[trpc]/route.ts`

**Interfaces:**
- Consumes: `router`, `protectedProcedure`, `requireCapability`, `type DashboardAccessContext` (Task 7), `resolveEffectiveCapabilities` (Task 6), `canGrantCapabilities`, `capabilitiesToWireString`, `parseCapabilitiesWireString`, `CAP` (Task 3), `createDbConnection`, `listGrantsForPrincipal`, `dashboardAccessGrants` (Task 4/5), `authOptions` (Task 10)
- Produces: `appRouter`, `type AppRouter` — consumed by Task 12 (client Provider).

- [ ] **Step 1: Write the failing test `apps/dashboard/src/server/dashboard-access-router.test.ts`**

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CAP } from "@sm-bot/shared";

import { dashboardAccessRouter } from "./dashboard-access-router.js";
import type { DashboardAccessContext } from "@sm-bot/dashboard-access";

function context(overrides: Partial<DashboardAccessContext> = {}): DashboardAccessContext {
  return { userId: "user-1", isGuildOwner: false, capabilities: 0n, ...overrides };
}

describe("dashboardAccessRouter.me", () => {
  it("returns the caller's own id and capabilities as a wire string", async () => {
    const caller = dashboardAccessRouter.createCaller(
      context({ capabilities: CAP.VIEW_LOGS })
    );

    const result = await caller.me();

    assert.equal(result.userId, "user-1");
    assert.equal(result.capabilities, CAP.VIEW_LOGS.toString(10));
  });
});

describe("dashboardAccessRouter.grant (delegation rules)", () => {
  it("rejects granting a capability the caller does not hold", async () => {
    const caller = dashboardAccessRouter.createCaller(
      context({ capabilities: CAP.MANAGE_ACCESS })
    );

    await assert.rejects(
      () =>
        caller.grant({
          guildId: "guild-1",
          targetType: "user",
          targetId: "user-2",
          capabilities: CAP.MANAGE_VOICE.toString(10)
        }),
      /FORBIDDEN/
    );
  });

  it("rejects a non-owner granting MANAGE_ACCESS even if they hold it", async () => {
    const caller = dashboardAccessRouter.createCaller(
      context({ capabilities: CAP.MANAGE_ACCESS })
    );

    await assert.rejects(
      () =>
        caller.grant({
          guildId: "guild-1",
          targetType: "user",
          targetId: "user-2",
          capabilities: CAP.MANAGE_ACCESS.toString(10)
        }),
      /FORBIDDEN/
    );
  });

  it("rejects the request entirely if the caller lacks MANAGE_ACCESS", async () => {
    const caller = dashboardAccessRouter.createCaller(
      context({ capabilities: CAP.VIEW_LOGS })
    );

    await assert.rejects(
      () =>
        caller.grant({
          guildId: "guild-1",
          targetType: "user",
          targetId: "user-2",
          capabilities: CAP.VIEW_LOGS.toString(10)
        }),
      /FORBIDDEN/
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd "/c/Users/Yuzuki/Documents/GitHub/server-management-bot-v3"
pnpm --filter @sm-bot/dashboard test
```

Expected: FAIL — `Cannot find module './dashboard-access-router.js'`.

- [ ] **Step 3: Write `apps/dashboard/src/server/dashboard-access-router.ts`**

Note: this task's `grant` procedure validates the delegation rule from the design spec (§6.4) using `canGrantCapabilities`, but does not yet perform the actual DB write — the DB write requires a live `db` connection in context, which this foundation plan does not wire into the tRPC context (that belongs to the first feature-domain plan that actually needs to persist a grant change from the UI). This keeps the task testable without a real database while still proving the authorization logic end-to-end.

```typescript
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  CAP,
  canGrantCapabilities,
  capabilitiesToWireString,
  parseCapabilitiesWireString
} from "@sm-bot/shared";
import { protectedProcedure, requireCapability, router } from "@sm-bot/dashboard-access";

const grantInput = z.object({
  guildId: z.string().min(1),
  targetType: z.enum(["user", "role"]),
  targetId: z.string().min(1),
  capabilities: z.string().min(1)
});

export const dashboardAccessRouter = router({
  me: protectedProcedure.query(({ ctx }) => ({
    userId: ctx.userId,
    isGuildOwner: ctx.isGuildOwner,
    capabilities: capabilitiesToWireString(ctx.capabilities)
  })),

  grant: requireCapability(CAP.MANAGE_ACCESS)
    .input(grantInput)
    .mutation(({ ctx, input }) => {
      const requested = parseCapabilitiesWireString(input.capabilities);

      const allowed = canGrantCapabilities({
        granterCapabilities: ctx.capabilities,
        granterIsOwner: ctx.isGuildOwner,
        requestedCapabilities: requested
      });

      if (!allowed) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Persisting the grant (an upsert into dashboard_access_grants) is
      // implemented in the first feature-domain plan that wires a real
      // DbClient into the tRPC context — see Task 11's interface note.
      return { guildId: input.guildId, targetType: input.targetType, targetId: input.targetId };
    })
});
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @sm-bot/dashboard test
```

Expected: PASS — 4 `it` cases green.

- [ ] **Step 5: Write `apps/dashboard/src/server/app-router.ts`**

```typescript
import { router } from "@sm-bot/dashboard-access";

import { dashboardAccessRouter } from "./dashboard-access-router.js";

export const appRouter = router({
  dashboardAccess: dashboardAccessRouter
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 6: Write `apps/dashboard/src/server/trpc-context.ts`**

```typescript
import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";

import type { DashboardAccessContext } from "@sm-bot/dashboard-access";

import { authOptions } from "../auth.js";

export async function createContext(_req: NextRequest): Promise<DashboardAccessContext> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  // Guild-scoped owner status and effective capabilities require knowing
  // which guild the request is for (not yet — no guild-scoped routes exist
  // in this foundation plan) and a live DbClient (also not wired yet, see
  // Task 11's `grant` procedure note). Until then every authenticated user
  // resolves to zero capabilities and non-owner, which is a safe default:
  // `me` still proves the auth flow works, and `grant` is unreachable
  // because `requireCapability(CAP.MANAGE_ACCESS)` will reject it.
  return { userId, isGuildOwner: false, capabilities: 0n };
}
```

- [ ] **Step 7: Write `apps/dashboard/src/app/api/trpc/[trpc]/route.ts`**

```typescript
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { NextRequest } from "next/server";

import { appRouter } from "../../../../server/app-router.js";
import { createContext } from "../../../../server/trpc-context.js";

function handler(req: NextRequest) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req)
  });
}

export { handler as GET, handler as POST };
```

- [ ] **Step 8: Build and typecheck**

```bash
pnpm --filter @sm-bot/dashboard build
pnpm --filter @sm-bot/dashboard typecheck
```

Expected: both succeed.

- [ ] **Step 9: Commit**

```bash
git add apps/dashboard
git commit -m "feat(dashboard): add tRPC route handler and dashboardAccess router"
```

---

### Task 12: `apps/dashboard` — React Query provider and end-to-end "who am I" page

**Files:**
- Create: `apps/dashboard/src/trpc-client.ts`
- Create: `apps/dashboard/src/app/providers.tsx`
- Modify: `apps/dashboard/src/app/layout.tsx`
- Modify: `apps/dashboard/src/app/page.tsx`

**Interfaces:**
- Consumes: `type AppRouter` (Task 11)
- Produces: a page at `/` that, once logged in via Discord OAuth (Task 10), calls `dashboardAccess.me` over tRPC and renders the result — the end-to-end proof that auth + tRPC + capability plumbing work together.

- [ ] **Step 1: Write `apps/dashboard/src/trpc-client.ts`**

```typescript
import { createTRPCReact } from "@trpc/react-query";

import type { AppRouter } from "./server/app-router.js";

export const trpc = createTRPCReact<AppRouter>();
```

- [ ] **Step 2: Write `apps/dashboard/src/app/providers.tsx`**

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useState } from "react";

import { trpc } from "../trpc-client.js";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [httpBatchLink({ url: "/api/trpc" })]
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
```

- [ ] **Step 3: Modify `apps/dashboard/src/app/layout.tsx`** to wrap children in `Providers`

```tsx
import { Providers } from "./providers.js";

export const metadata = {
  title: "Server Management Bot"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Modify `apps/dashboard/src/app/page.tsx`** to call `dashboardAccess.me`

```tsx
"use client";

import { trpc } from "../trpc-client.js";

export default function HomePage() {
  const me = trpc.dashboardAccess.me.useQuery();

  if (me.isLoading) return <main>Loading…</main>;
  if (me.error) return <main>Not logged in.</main>;

  return (
    <main>
      <p>Logged in as {me.data?.userId}</p>
      <p>Owner: {String(me.data?.isGuildOwner)}</p>
      <p>Capabilities: {me.data?.capabilities}</p>
    </main>
  );
}
```

- [ ] **Step 5: Build**

```bash
cd "/c/Users/Yuzuki/Documents/GitHub/server-management-bot-v3"
pnpm --filter @sm-bot/dashboard build
```

Expected: succeeds.

- [ ] **Step 6: Manual verification** (requires real Discord OAuth credentials in `.env` — see `docs/specs/2026-07-16-rewrite-architecture-design.md` for the OAuth redirect URI setup, same pattern as the original repo's README)

```bash
docker compose up -d postgres redis
pnpm db:migrate
pnpm --filter @sm-bot/dashboard dev
```

Visit `http://localhost:3000`, log in via Discord, and confirm the page renders `Logged in as <your-user-id>` with `Capabilities: 0` (no grants exist yet — this is expected and correct given Task 11's context stub).

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard
git commit -m "feat(dashboard): wire React Query provider and who-am-I page end to end"
```

---

### Task 13: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (root scripts from Task 1)

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
    branches:
      - main
  push:
    branches:
      - main

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm build
        env:
          DISCORD_BOT_TOKEN: build-placeholder
          DISCORD_CLIENT_ID: build-placeholder
          DISCORD_CLIENT_SECRET: build-placeholder
          DISCORD_REDIRECT_URI: http://localhost:3000/api/auth/callback/discord
          DATABASE_URL: postgres://sm_bot:sm_bot@localhost:5432/sm_bot
          REDIS_URL: redis://localhost:6379
          NEXTAUTH_SECRET: build-placeholder
          SESSION_ENCRYPTION_KEY: build-placeholder-build-placeholder-32
          PUBLIC_DASHBOARD_URL: http://localhost:3000

      - name: Validate Docker Compose
        run: docker compose config
```

(This workflow does not yet configure branch protection or disable squash/rebase merge on GitHub — per the design spec §8, that GitHub-repository-settings step is deferred to whoever creates the actual GitHub repository, since it isn't expressible as a file in this working tree.)

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint/typecheck/test/build workflow"
```

---

### Task 14: Full workspace verification

**Files:** none (verification only)

- [ ] **Step 1: Clean install from lockfile**

```bash
cd "/c/Users/Yuzuki/Documents/GitHub/server-management-bot-v3"
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

Expected: succeeds, produces `pnpm-lock.yaml`.

- [ ] **Step 2: Run every root script**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all four succeed with zero errors. `pnpm test` output should show every `describe` block from Tasks 2, 3, 5, 6, 7, 9, 11 passing (env validation, capability bit logic, dashboard-access repository, effective-capability resolution, tRPC middleware, guild-join seeding, dashboardAccess router delegation rules).

- [ ] **Step 3: Validate Docker Compose**

```bash
docker compose config
```

Expected: resolves with no errors.

- [ ] **Step 4: Commit the lockfile**

```bash
git add pnpm-lock.yaml
git commit -m "chore: commit lockfile after full workspace verification"
```

---

## What this plan deliberately does not build

Per `docs/specs/2026-07-16-rewrite-architecture-design.md` §8: no `voice`, `recruitment`, `tts`, or `logging` domain packages; no Socket.io wiring; no `packages/db` migration for `guild_configs` or any feature-specific table; no real DB-backed `dashboardAccess.list`/`grant`/`revoke` persistence (Task 11 proves the authorization logic only); no selector UI components; no `application/`-layer use cases (nothing to orchestrate yet — the first feature-domain plan introduces the first one). Each of those is a separate spec → plan cycle building on this foundation.

Also explicitly deferred (design spec §6.3, not yet implemented here): the live Discord REST role-lookup + Redis cache that resolves which Discord roles a logged-in user holds in a given guild. Task 11's `createContext` always resolves `capabilities: 0n` and `isGuildOwner: false` — correct and safe for this foundation (nothing is guild-scoped yet, so there is no guild to resolve roles against), but the first feature-domain plan that adds a guild-scoped page must implement real role resolution before `dashboardAccess.me` reports anything meaningful for a non-owner.

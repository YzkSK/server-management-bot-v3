# Bun Workspace Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pnpm/Node.js-based workspace root (already committed on `feature/workspace-bootstrap`) with a Bun-based workspace root per `docs/specs/bun-migration-design.md`, and update the two design docs that still describe pnpm/Node.js for this scope.

**Architecture:** Root `package.json` gains a `"workspaces"` field (replacing `pnpm-workspace.yaml`) and a `packageManager`/`engines` pin to Bun. `tsconfig.base.json` switches to Bun's recommended `bundler` module resolution. `turbo.json` keeps Turborepo but decouples `lint`/`typecheck` from `build`. `.gitignore` gets a broader `.env.*` pattern. No packages exist yet under `apps/*` or `packages/*`, so verification is limited to `bun install` succeeding and `turbo run build` completing with zero packages (not failing).

**Tech Stack:** Bun 1.3, Turborepo 2.10, TypeScript 7.0.

## Global Constraints

- Bun version: `packageManager: "bun@1.3.14"` (exact), `engines.bun: ">=1.3.0 <2.0.0"` (range) — both required; omitting `packageManager` makes `turbo run` fail with `Could not resolve workspace` (verified empirically)
- `tsconfig.base.json`: `module: "Preserve"`, `moduleResolution: "bundler"`, `lib: ["ES2022"]` only (no DOM — that's added per-package later), `types: ["bun"]`, `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- `turbo.json`: `lint` and `typecheck` must NOT depend on `^build`; `test` keeps `^build` dependency plus `outputs: ["coverage/**"]`
- `.gitignore` must not ignore `bun.lock` (it's committed)
- Scope is limited to the root workspace config + the two design docs listed in Task 3; do not touch `packages/*` or `apps/*` (they don't exist yet — later issues create them)

---

### Task 1: Replace pnpm root config with Bun root config

**Files:**
- Delete: `pnpm-workspace.yaml`
- Delete: `pnpm-lock.yaml`
- Modify: `package.json`
- Modify: `tsconfig.base.json`
- Modify: `turbo.json`
- Modify: `.gitignore`
- Generated (by `bun install`, not hand-written): `bun.lock`

**Interfaces:**
- Produces: the Bun workspace root that `bun install`, `bun run --filter <pkg> <script>`, and `turbo run <task>` from later tasks (packages/config, packages/shared, etc.) will run against.

- [ ] **Step 1: Remove pnpm-specific files and installed node_modules**

```bash
cd "/c/Users/Yuzuki/Documents/GitHub/server-management-bot-v3"
git rm pnpm-workspace.yaml pnpm-lock.yaml
rm -rf node_modules
```

Expected: `git rm` stages both deletions; `node_modules` removed from disk.

- [ ] **Step 2: Overwrite `package.json`**

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

- [ ] **Step 3: Overwrite `tsconfig.base.json`**

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
    "types": ["bun"]
  }
}
```

- [ ] **Step 4: Overwrite `turbo.json`**

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

- [ ] **Step 5: Overwrite `.gitignore`**

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

- [ ] **Step 6: Install dependencies and verify `bun.lock` is generated**

```bash
cd "/c/Users/Yuzuki/Documents/GitHub/server-management-bot-v3"
bun install
```

Expected: output ends with a line like `N packages installed`, and `bun.lock` now exists in the repo root (`ls bun.lock` succeeds).

- [ ] **Step 7: Validate `tsconfig.base.json` parses correctly**

```bash
bunx tsc --showConfig -p tsconfig.base.json
```

Expected: prints the resolved JSON config (module: "preserve", moduleResolution: "bundler", lib: ["es2022"], types: ["bun"]) with exit code 0, no errors.

- [ ] **Step 8: Validate `turbo.json` is well-formed and Turborepo can run against zero packages**

```bash
bun run build
```

Expected: exits 0. Output includes `Packages in scope:` (empty list) and `WARNING  No tasks were executed as part of this run.` — this is expected since no packages exist under `apps/*`/`packages/*` yet; a non-zero exit or a `Could not resolve workspace` error means `packageManager` or `workspaces` is misconfigured.

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.base.json turbo.json .gitignore bun.lock
git commit -m "chore: migrate workspace bootstrap from pnpm to Bun"
```

---

### Task 2: Update `docs/plans/rewrite-foundation.md` Task 1 section to Bun

**Files:**
- Modify: `docs/plans/rewrite-foundation.md` (Task 1's Step 2, 3, 5 code blocks — package.json, tsconfig.base.json, turbo.json; Step 3 `pnpm-workspace.yaml` step is removed since Bun uses the `workspaces` field instead)

**Interfaces:**
- Consumes: nothing (docs-only change)
- Produces: nothing consumed by other tasks — this is documentation alignment so future readers of the plan don't get pnpm instructions that no longer match the actual repo

- [ ] **Step 1: Replace the "Write the root `package.json`" step's code block**

Find the code block under `- [ ] **Step 2: Write the root \`package.json\`**` in `docs/plans/rewrite-foundation.md` and replace its JSON content with:

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

- [ ] **Step 2: Remove the "Write `pnpm-workspace.yaml`" step**

Delete the entire **Step 3: Write `pnpm-workspace.yaml`** step (heading + its YAML code block) — the `workspaces` field in `package.json` (Step 2, already updated) replaces it. Renumber the remaining steps in Task 1 sequentially (old Step 4 "Write `tsconfig.base.json`" becomes Step 3, old Step 5 "Write `turbo.json`" becomes Step 4, and so on through the end of Task 1).

- [ ] **Step 3: Replace the "Write `tsconfig.base.json`" step's code block**

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
    "types": ["bun"]
  }
}
```

- [ ] **Step 4: Replace the "Write `turbo.json`" step's code block**

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

- [ ] **Step 5: Replace the "Write `.gitignore`" step's code block**

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

- [ ] **Step 6: Update the "Verify `pnpm install`" verification step text**

Wherever Task 1 references `pnpm install` as a verification command (e.g. before `pnpm --filter @sm-bot/config test` in Task 2, and similar spots in Tasks 3–11 later in the same file), leave those later-task references untouched — they are out of scope for this plan (see `docs/specs/bun-migration-design.md` § Out of Scope). Only Task 1's own steps (Steps 1–11 as originally numbered) are in scope for this edit.

- [ ] **Step 7: Commit**

```bash
cd "/c/Users/Yuzuki/Documents/GitHub/server-management-bot-v3"
git add docs/plans/rewrite-foundation.md
git commit -m "docs: update rewrite-foundation Task 1 to Bun workspace config"
```

---

### Task 3: Update `docs/specs/rewrite-architecture-design.md` tech stack line

**Files:**
- Modify: `docs/specs/rewrite-architecture-design.md:21`

**Interfaces:**
- Consumes: nothing (docs-only change)
- Produces: nothing consumed by other tasks

- [ ] **Step 1: Replace the tech stack line**

Current line 21:

```text
現行から維持: TypeScript, Node.js, discord.js v14+, Drizzle ORM, PostgreSQL, Redis, Socket.io, zod, Next.js, TailwindCSS, shadcn/ui, Docker Compose, VOICEVOX, pnpm workspace, GitHub Actions。
```

Replace with:

```text
現行から維持: TypeScript, discord.js v14+, Drizzle ORM, PostgreSQL, Redis, Socket.io, zod, Next.js, TailwindCSS, shadcn/ui, Docker Compose, VOICEVOX, GitHub Actions。

追加の変更点(Bunワークスペース化): 実行ランタイム・パッケージ管理をNode.js + pnpm workspaceからBun workspaceに変更(詳細は`docs/specs/bun-migration-design.md`を参照)。
```

- [ ] **Step 2: Commit**

```bash
cd "/c/Users/Yuzuki/Documents/GitHub/server-management-bot-v3"
git add docs/specs/rewrite-architecture-design.md
git commit -m "docs: update architecture design tech stack to Bun"
```

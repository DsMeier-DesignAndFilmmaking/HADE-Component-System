# HADE SDK Packages

This directory hosts the v1.0 HADE SDK packages. Each subdirectory is an independent npm package, published under the `@hade/*` namespace.

> **Workspace manager:** the SDK plan called for pnpm. To preserve the existing demo's `package-lock.json` and avoid changing dependency hoisting mid-repo (Non-Negotiable #1: `/demo` must render identically), Phase A uses **npm workspaces** (npm 7+). Workspace semantics are equivalent; switching to pnpm later is a non-breaking lockfile migration.

## Layout

```
packages/
├── core/          # @hade/core            — pure TS, zero framework deps
├── tokens/        # @hade/tokens          — W3C design tokens (data only)
└── copy/          # @hade/copy            — locale string bundles
```

Phases B+ will add: `adapters-google-places`, `adapters-openai`, `adapters-upstash`, `adapters-memory`, `react`, `testkit`, `core-legacy`, `react-legacy`.

## Build / verify all packages

From the repo root:

```bash
npm install                 # installs root + all workspaces
npm run sdk:type-check      # tsc --noEmit per package
npm run sdk:check:cycles    # madge — fails on any circular import
npm run sdk:check:boundaries# eslint — fails if @hade/core imports React/DOM/adapters
npm run sdk:build           # builds every workspace with a build script
npm run sdk:check:budgets   # fails any package whose dist exceeds its budget
npm run sdk:ci              # runs all of the above in order — the CI gate
```

## Package boundaries (enforced by `sdk:check:boundaries`)

- `@hade/core` MUST NOT import React, DOM APIs, any provider SDK, or any adapter package.
- `@hade/react` (Phase E) MUST NOT import any adapter package.
- Adapter packages MUST NOT import each other.
- Legacy packages (Phase F) MAY import from `@hade/core` and `@hade/react`; the reverse is forbidden.

## Bundle budgets

See `scripts/check-bundle-budgets.mjs` for the canonical list. Current budgets:

| Package          | Min+gz |
|------------------|--------|
| `@hade/core`     | ≤ 35 kB |
| `@hade/tokens`   | ≤ 4 kB |
| `@hade/copy`     | ≤ 6 kB / locale |

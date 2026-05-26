# HADE Demo (Next.js)

The Vercel-deployed showcase app. Consumes `@hade/core` via workspace dependency. Not published.

## Run locally

From the repo root:

```bash
pnpm install --frozen-lockfile
pnpm sdk:build            # build @hade/* packages first (demo imports @hade/core)
pnpm --filter demo dev    # http://localhost:3000
```

## Environment variables

Next.js loads `.env*` files relative to its build directory — which is now `apps/demo/`. Root `.env*` files are NOT auto-loaded.

Two options:

1. **Symlink** (recommended for developers maintaining a single `.env.local` at the repo root for `scripts/sync-notion.js`):
   ```bash
   ln -s ../../.env.local .env.local
   ```
2. **Copy**:
   ```bash
   cp ../../.env.local .env.local
   ```

Required vars (mirror what's in `../../.env.example`):

| Variable | Required for | Source |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | production | [console.upstash.com](https://console.upstash.com) |
| `UPSTASH_REDIS_REST_TOKEN` | production | Same |
| `OPENAI_API_KEY` | LLM copy enhancement | [platform.openai.com](https://platform.openai.com) |
| `GOOGLE_API_KEY` | Places API | [console.cloud.google.com](https://console.cloud.google.com) |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | map rendering | [account.mapbox.com](https://account.mapbox.com) |

In production (Vercel), set these via the dashboard — see the repo root `README.md` "Deployment" section.

## Build + scripts

| Command | Effect |
|---|---|
| `pnpm --filter demo dev` | Next dev server with hot reload |
| `pnpm --filter demo build` | Production Next build → `apps/demo/.next/` |
| `pnpm --filter demo start` | Serve the production build |
| `pnpm --filter demo lint` | ESLint flat config (`apps/demo/eslint.config.mjs`) |
| `pnpm --filter demo type-check` | `tsc --noEmit` against `apps/demo/tsconfig.json` |
| `pnpm --filter demo test` | Vitest jsdom run for demo tests only |

## Boundary rules

`apps/demo/` MAY import:

- `@hade/core` and its sub-paths (`@hade/core/legacy`, `@hade/core/adapters/geo`, etc.) — workspace-resolved via `pnpm-workspace.yaml`
- Anything from `apps/demo/src/`, `apps/demo/domain/`, `apps/demo/models/` via the `@/` alias OR relative paths

`apps/demo/` MUST NOT be imported by `packages/**`. This is the one-way rule enforced by:

- `eslint.sdk.config.mjs` — ESLint rule block on `packages/**` that forbids `@/*`, `apps/`, and `apps/demo` import patterns
- `scripts/audit-package-purity.mjs` — unforgiving regex grep run inside `pnpm sdk:ci`

If you find yourself wanting to import demo code into a package, **the code belongs in a package**.

## CI

This app is gated by `.github/workflows/demo-ci.yml`. It fires on any change to `apps/demo/**` or `packages/**` (since the demo depends on `@hade/core`). It does NOT trigger SDK publishing — that lives in `release.yml` and ignores `apps/**`.

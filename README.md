# HADE Component System

A monorepo of two products under one roof:

- **`apps/demo/`** — the Next.js demo deployed to Vercel. Consumer-facing showcase + smoke test.
- **`packages/*`** — the shippable `@hade/*` SDK (9 packages). Published to GitHub Packages via Changesets.
- **`examples/*`** — installable external-consumer references (`with-next/`, `with-node-edge/`). Not deployed.

Each product has its own CI gate (`sdk-ci.yml` / `demo-ci.yml`) and lifecycle. Releases publish only `packages/*`; the demo deploys independently via Vercel's Git integration. See [`docs/quickstart.md`](docs/quickstart.md) for SDK usage and [`docs/installation.md`](docs/installation.md) for install instructions.

## Deployment (Vercel)

The demo at `apps/demo/` deploys to Vercel via Git integration. **One-time operator setup:**

1. In the Vercel dashboard → Project → Settings → General, set **Root Directory** to `apps/demo`. Vercel auto-detects Next.js inside the subdir; no `vercel.json` required.
2. In Project → Settings → Environment Variables, set the following for Production + Preview:

   | Variable | Required | Notes |
   |---|---|---|
   | `UPSTASH_REDIS_REST_URL` | yes (production) | See "Redis Requirement" below |
   | `UPSTASH_REDIS_REST_TOKEN` | yes (production) | |
   | `OPENAI_API_KEY` | yes (production) | Powers `@hade/adapters-openai` |
   | `GOOGLE_API_KEY` | yes (production) | Powers Google Places |
   | `NEXT_PUBLIC_MAPBOX_TOKEN` | optional | Map rendering in the demo |
   | `NEXT_PUBLIC_HADE_API_BASE` | optional | Override API base URL |

3. Vercel reads env vars from the dashboard — root `.env*` files do NOT propagate after the Root Directory move. For local development of the demo, see `apps/demo/README.md` for the `.env.local` setup.

The SDK `release.yml` workflow is fully decoupled — it ignores `apps/**` via `paths-ignore` and never triggers a Vercel deploy. Demo deploys happen on `apps/demo/**` changes (via Vercel Git integration) and post-Notion-sync (via the deploy hook in `.github/workflows/hade-sync.yml`).

## Redis Requirement

HADE requires Upstash Redis in production.

## Production Warning

Production depends on Redis for correctness.
Process memory and development fallbacks are not valid production storage.

Without Redis:
- UGC will not persist
- Cross-user signal propagation will not work
- Network effects are disabled

The app will fail to start in production without Redis configured.

### Setup

1. Create a database at [console.upstash.com](https://console.upstash.com)
2. Copy the REST URL and token into your environment:

```
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here
```

### Environment Behavior

| Environment | Redis missing | Behavior |
|-------------|---------------|----------|
| `production` | — | **Fatal error on startup** |
| `development` / `test` | — | In-memory fallback, one-time warning logged |

### Runtime Inspection

```ts
import { HADE_PERSISTENCE_MODE } from "@/lib/hade/redis";
// "redis" | "memory"
```

## Dependency Policy

This project follows a **reachability gate** for dependency security fixes:
we only patch packages reachable from application runtime or from build
configuration we own. Framework-internal transitives (Next.js, serwist, vite,
tailwind internals) are documented and deferred — never force-fixed or
overridden.

Full rule, decision flow, and current deferrals: [`docs/dependency-notes.md`](docs/dependency-notes.md).

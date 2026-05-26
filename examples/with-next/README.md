# HADE example — Next.js 15 App Router

External-consumer reference for `@hade/core` + `@hade/react`. Pins **published** versions of the SDK (not the workspace), so the install path mirrors what an outside consumer experiences.

## Setup

```bash
# Set your GitHub PAT (read:packages scope)
export GITHUB_TOKEN=ghp_…

cd examples/with-next
npm install
npm run dev
```

Open http://localhost:3000.

## What it shows

- `app/Providers.tsx` — `<HadeProvider>` wired at the root, reads `hade.config.json`
- `app/page.tsx` — `useHade()` auto-runs on mount, `refine()` updates state
- `app/api/decide/route.ts` — standalone `decide()` in an Edge handler
- `hade.config.json` — references the JSON Schema bundled with `@hade/core` (autocomplete in VS Code)

## Without real adapters

By default the example runs WITHOUT a venue adapter — the engine returns a graceful fallback. To see real candidates, install an adapter and wire it in `app/Providers.tsx`:

```ts
import { googlePlaces } from "@hade/adapters-google-places";

<HadeProvider
  config={hadeConfig}
  adapters={{
    venue: googlePlaces({ apiKey: process.env.GOOGLE_PLACES_API_KEY! }),
  }}
>
```

## Verifying the install path

This example is the gold standard for "did I package the SDK correctly?" Run from the monorepo root:

```bash
npm run examples:verify
```

The verify script publishes the workspace `@hade/*` packages to a local Verdaccio registry, installs them into each `examples/*` dir, and runs `npm run build`. Any export / file / interop bug shows up here before it hits external consumers.

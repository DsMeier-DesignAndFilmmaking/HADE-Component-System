# @hade/adapters-google-places

Google Places (New API) `VenueAdapter` for HADE.

**Status: Phase D ships the clean-room factory.** The byte-identical legacy migration shim (`unwrappedGooglePlaces`) lives in `@hade/core/legacy`.

## Install

```bash
npm install @hade/core @hade/adapters-google-places
```

## Quickstart

```ts
import { createHade } from "@hade/core";
import { googlePlaces } from "@hade/adapters-google-places";

const client = createHade({
  adapters: { venue: googlePlaces({ apiKey: process.env.GOOGLE_API_KEY }) },
});
```

## Options

| Option | Default | Notes |
|---|---|---|
| `apiKey` | `process.env.GOOGLE_API_KEY` | Required at first call; constructor never reads env eagerly |
| `defaultRadiusMeters` | `800` | Matches the legacy `placesAdapter.ts:38` default |
| `defaultMaxResults` | `20` | Google's per-page max |
| `timeoutMs` | `6000` | Matches the legacy `REQUEST_TIMEOUT_MS` |
| `fetchImpl` | global `fetch` | Override for tests / non-global runtimes |

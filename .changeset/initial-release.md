---
"@hade/core": minor
"@hade/react": minor
"@hade/testkit": minor
"@hade/tokens": minor
"@hade/copy": minor
"@hade/adapters-google-places": minor
"@hade/adapters-openai": minor
"@hade/adapters-upstash": minor
"@hade/adapters-memory": minor
---

Phase 8 — initial @hade/* SDK release scaffold.

- **Build system:** every package now builds with **tsup**, producing dual ESM + CJS + .d.ts outputs. `tsc` is type-check-only.
- **New packages:**
  - `@hade/react` — minimal headless React wrapper: `HadeProvider`, `useHadeClient`, `useHade`, `useHadeConfig`. SSR + edge safe. Cancellation built in.
  - `@hade/testkit` — fixtures (`makeConfig`, `makeDecision`, `makeDecisionEngineOutput`, `makeVenueCandidate`), scripted mock adapters (`mockVenueAdapter`, `mockLLMAdapter`, `mockCacheAdapter`, `mockGeoAdapter`), `fakeClock`, and opt-in Vitest matchers at `@hade/testkit/vitest`.
- **Versioning:** all `@hade/*` packages move in lockstep via Changesets fixed mode.
- **Publishing:** GitHub Packages (`registry: https://npm.pkg.github.com`, `access: restricted`) for the alpha/beta cycle. Public npm flip at 1.0.
- **Hygiene:** new `sdk:pack:dry-run` gate verifies every published package ships `dist/index.{js,cjs,d.ts}` + `README.md` and never leaks test artifacts or `.tsbuildinfo`.

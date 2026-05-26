# HADE Headless Architecture — Migration Plan

**Date:** 2026-05-23  
**Goal:** `packages/core` is the framework-free decision engine. React, Next.js, and DOM live in binding packages. `/demo` behavior unchanged at every phase boundary.

**Non-negotiables:** Additive only · Re-export compatibility shims until Phase F · `npm run sdk:check:boundaries` green · Demo snapshot/visual parity.

---

## 1. Audit — `packages/core` today

| Check | Status | Notes |
|-------|--------|-------|
| React imports | ✅ Clean | `eslint.sdk.config.mjs` enforces; zero matches in `packages/core/src` |
| Next.js imports | ✅ Clean | No `next/*`, no `server-only` |
| DOM APIs | ✅ Clean | No `window`, `document`, `localStorage`, `navigator` in source |
| Env coupling | ✅ Clean | No `process.env.NEXT_PUBLIC_*` in core |

**Already in `@hade/core`:**

| Path | Role |
|------|------|
| `src/types/DecisionEngineOutput.ts` | Headless output contract |
| `src/engine/buildOutput.ts` | `DecisionEngineOutput` builder + `HadeDecision` adapters |

---

## 2. Audit — violations by layer (repository-wide)

### 2.1 Must **never** land in `packages/core`

| Violation class | Files (representative) | Target package |
|-----------------|------------------------|----------------|
| `"use client"` + React hooks | `hooks.ts`, `useHade.ts`, `settings.tsx`, `compareModes.ts`, `mobileViewport.ts` | `@hade/react` |
| Next.js navigation / RSC | `src/app/**`, `useSearchParams` in `demo/page.tsx` | App (`examples/next-demo`) |
| DOM / browser storage | `deviceId.ts`, `queue.ts`, `cache.ts`, `mobileViewport.ts`, `useHade.ts` (geo + localStorage) | `@hade/client-browser` |
| `navigator.sendBeacon` | `navigationTelemetry.ts` | `@hade/client-browser` |
| Provider SDKs | `redis.ts` (Upstash), `src/core/services/places.ts` (Google) | `@hade/adapters-*` |
| `server-only` + route orchestration | `synthetic.ts`, `decide/route.ts` | `@hade/core` engine + `@hade/server` wiring |
| `NEXT_PUBLIC_*` / Mapbox env | `engine.ts`, `api.ts`, `logging.ts`, `mapboxConfig.ts`, `useHade.ts` | Config injection at app boundary |

### 2.2 Pure engine — **move to `packages/core`**

| Current path | New path | Blockers |
|--------------|----------|----------|
| `src/lib/hade/engine.ts` | `packages/core/src/engine/engine.ts` | `NEXT_PUBLIC_HADE_API_URL` → `createHade({ apiUrl })` |
| `src/lib/hade/confidence.ts` | `packages/core/src/scoring/confidence.ts` | `VIBE_TAG_SENTIMENT` → `packages/core/src/config/vibeSentiment.ts` |
| `src/lib/hade/surfacedPenalty.ts` | `packages/core/src/scoring/surfacedPenalty.ts` | None ✅ Phase 1 |
| `src/lib/hade/signals.ts` | `packages/core/src/engine/signals.ts` | Move `signal_ttl_map.json` → `config/vocab/` |
| `src/lib/hade/weights.ts` | `packages/core/src/scoring/weights.ts` | Split: pure math in core; Redis in `@hade/adapters-cache-upstash` |
| `src/lib/hade/trust.ts` | `packages/core/src/scoring/trust.ts` | Device trust I/O stays in client adapter |
| `src/lib/hade/deriveReasons.ts` | `packages/core/src/explanation/deriveReasons.ts` | Types from `@hade/core/types` |
| `src/lib/hade/explanation.ts` | `packages/core/src/explanation/explanation.ts` | None ✅ Phase 1 |
| `src/lib/hade/supportText.ts` | `packages/core/src/explanation/supportText.ts` | Copy IDs (Phase 4) |
| `src/lib/hade/commitment.ts` | `packages/core/src/engine/commitment.ts` | `lensProfiles` type extract |
| `src/lib/hade/travelerState.ts` | `packages/core/src/engine/travelerState.ts` | Types |
| `src/lib/hade/voiceIntentParser.ts` | `packages/core/src/engine/voiceIntentParser.ts` | Types |
| `src/lib/hade/fallbackSelection.ts` | `packages/core/src/engine/fallbackSelection.ts` | None ✅ Phase 1 |
| `src/lib/hade/format.ts` | `packages/core/src/util/format.ts` | None ✅ Phase 1 |
| `src/lib/hade/prompt.ts` | `packages/core/src/explanation/prompt.ts` | Depends on `engine.ts` |
| `src/lib/hade/presets.ts`, `scenarios.ts` | `packages/core/src/config/` | Types |
| `src/lib/hade/ugcCopy.ts` | `packages/core/src/explanation/ugcCopy.ts` | `UiState` type only |
| `src/core/engine/synthetic.ts` | `packages/core/src/engine/synthetic.ts` | DI: `VenueAdapter`, remove `server-only` from core; wire in app route |
| `src/core/domain/*` | `packages/core/src/domain/*` | None |
| `src/core/constants/radius.ts` | `packages/core/src/config/radius.ts` | Config Phase 2 |
| `src/core/types/decision.ts` | `packages/core/src/types/decision.ts` | Merge with public contract |
| `src/config/*.json` (engine vocab) | `packages/core/src/config/vocab/*.json` | JSON imports |

### 2.3 Presentation & I/O — **stay out of core**

| Current path | Target |
|--------------|--------|
| `src/lib/hade/hooks.ts`, `useHade.ts` | `@hade/react` |
| `src/lib/hade/viewModel.ts` | `@hade/react` (view-model adapter over `DecisionEngineOutput`) |
| `src/lib/hade/settings.tsx` | `@hade/react` |
| `src/lib/hade/ugc.ts`, `redis.ts` | `@hade/adapters-cache-upstash` |
| `src/lib/hade/api.ts`, `mapboxConfig.ts` | App env + `@hade/client-browser` |
| `src/components/hade/**` | `@hade/react` components (demo imports package) |
| `hade-sdk/**` | Deprecate toward `@hade/react` + `@hade/core` |
| `src/types/hade.ts` | Split: `packages/core/src/types` + `src/types/hade-app.ts` shim |

### 2.4 `engine.ts` env violation (fix during move)

```ts
// Today (blocks headless core):
api_url: process.env.NEXT_PUBLIC_HADE_API_URL ?? "/api",
```

**Remedy:** `DEFAULT_HADE_CONFIG` in core with `api_url: "/api"`; app passes `createHade({ apiUrl: process.env.NEXT_PUBLIC_HADE_API_URL })`.

---

## 3. Target package topology

```
packages/
├── core/           @hade/core     — pure TS, zero React/Next/DOM
├── react/          @hade/react    — hooks, view models, UI bindings
├── client-browser/ @hade/client-browser — geo, idb queue, deviceId, sendBeacon
├── adapters-*/     provider SDKs  — places, llm, redis (not in core)
├── tokens/         @hade/tokens
├── copy/           @hade/copy
└── testkit/        @hade/testkit

src/                          — compatibility + Next app
├── app/demo/                 — unchanged imports via shims
├── lib/hade/*.ts             — re-export @hade/core (Phase 1–5)
└── types/hade.ts             — re-export + app-only extensions
```

---

## 4. File move plan (phased)

### Phase 1 — Pure leaf modules (1 sprint) ✅ started

**Move (no behavior change):**

- `surfacedPenalty.ts` → `core/src/scoring/surfacedPenalty.ts`
- `format.ts` → `core/src/util/format.ts`
- `fallbackSelection.ts` → `core/src/engine/fallbackSelection.ts`
- `explanation.ts` → `core/src/explanation/explanation.ts`
- `confidence.ts` → `core/src/scoring/confidence.ts` + `config/vibeSentiment.ts`

**Shim:** `src/lib/hade/<name>.ts` → `export * from "@hade/core/..."`

**Ship criteria:** `npm test`, `npm run build`, `/demo` manual smoke, `npm run sdk:ci`.

### Phase 2 — Engine spine (1–2 sprints)

- Move `engine.ts`, `signals.ts`, vocab JSON
- Move `deriveReasons`, `supportText`, `ugcCopy`, `travelerState`, `voiceIntentParser`, `prompt`
- Extract `packages/core/src/types/hade.ts` (engine subset); shim `src/types/hade.ts`

### Phase 3 — Scoring + domain (1–2 sprints)

- Move `domain/*`, `constants/radius`, `types/decision`
- Refactor `weights.ts` / `trust.ts`: core = pure functions; adapter = persistence
- Move `commitment.ts` (decouple `lensProfiles` → `DomainMode` in types)

### Phase 4 — Synthetic engine + headless output (2 sprints)

- Move `synthetic.ts` into core without `server-only`
- Route uses `createHade({ adapters })`; `buildOutput` in decide path
- `viewModel` / `hooks` consume `DecisionEngineOutput`

### Phase 5 — React package + demo rebind (1 sprint)

- Create `packages/react`; move `hooks`, `useHade`, `settings`, `viewModel`
- Demo: optional direct `@hade/react` imports; shims remain

### Phase 6 — Adapters + cleanup (1–2 sprints)

- `places.ts`, `redis.ts`, `ugc.ts` → adapters
- Remove shims (major version); archive `hade-sdk/`

---

## 5. Import update matrix

| Consumer | Phase 1 | Phase 5+ |
|----------|---------|----------|
| `src/app/api/hade/decide/route.ts` | `@/lib/hade/fallbackSelection` (shim) | `@hade/core` |
| `src/core/engine/synthetic.ts` | `@/lib/hade/engine` (shim) | `@hade/core` |
| `src/components/hade/**` | `@/lib/hade/hooks` | `@hade/react` |
| `src/app/demo/page.tsx` | **No change** (shims) | `@hade/react` optional |
| Tests under `src/lib/hade/__tests__` | Keep paths (shims) | Point at `packages/core` |

**Root `tsconfig.json` paths (additive):**

```json
"@hade/core": ["./packages/core/src/index.ts"],
"@hade/core/*": ["./packages/core/src/*"]
```

**Root `package.json`:**

```json
"dependencies": {
  "@hade/core": "workspace:*"
}
```

---

## 6. Compatibility layer

### 6.1 Shim pattern (required until Phase 6)

Each legacy file becomes a stable re-export — **no logic**:

```ts
// src/lib/hade/format.ts
/** @deprecated Import from `@hade/core` — shim for /demo and API routes. */
export * from "@hade/core/util/format.js";
```

### 6.2 Barrel shim (optional)

`src/lib/hade/index.ts` re-exports common symbols for gradual migration.

### 6.3 Types shim

```ts
// src/types/hade.ts (end state)
export type * from "@hade/core/types";
// App-only: AgentPersona UI extensions, etc.
```

### 6.4 `createHade` bridge (Phase 4)

```ts
// packages/core — real implementation
export function createHade(config?: HadeClientConfig): HadeClient { ... }

// hade-sdk/core/createHade.ts — shim
export { createHade } from "@hade/core";
```

---

## 7. CI guards

| Command | Purpose |
|---------|---------|
| `npm run sdk:check:boundaries` | ESLint: no React/Next/adapters in core |
| `npm run sdk:check:cycles` | madge on `packages/` |
| `node scripts/audit-core-purity.mjs` | Ripgrep: DOM/React/Next in `packages/core/src` |

---

## 8. `/demo` safety checklist

- [ ] Do **not** change `src/app/demo/page.tsx` import paths in Phase 1–4
- [ ] Run `npm test` + manual demo after each phase
- [ ] `useHadeAdaptiveContext` / `HadeSettingsProvider` stay in `@/lib/hade/*` until Phase 5
- [ ] API route URLs unchanged (`/api/hade/decide`)
- [ ] Visual regression on `DecisionScreen` before removing shims

---

## 9. Violation count summary

| Layer | Files with React/Next/DOM | Action |
|-------|---------------------------|--------|
| `packages/core` | **0** | Maintain |
| `src/lib/hade` | **6** client modules | → `@hade/react` / `@hade/client-browser` |
| `src/components/hade` | **all `.tsx`** | → `@hade/react` |
| `src/app` | **pages + routes** | App shell only |
| `hade-sdk` | **react/** + **ui/** | Deprecate |
| `src/core/engine/synthetic.ts` | `server-only` + Places | Core engine + adapter DI |

---

## 10. Phase 1 completion log

| Module | Core path | Shim |
|--------|-----------|------|
| `surfacedPenalty` | `scoring/surfacedPenalty.ts` | `src/lib/hade/surfacedPenalty.ts` |
| `format` | `util/format.ts` | `src/lib/hade/format.ts` |
| `fallbackSelection` | `engine/fallbackSelection.ts` | `src/lib/hade/fallbackSelection.ts` |
| `explanation` | `explanation/explanation.ts` | `src/lib/hade/explanation.ts` |
| `confidence` | `scoring/confidence.ts` | `src/lib/hade/confidence.ts` |

Run after pull:

```bash
npm run build --workspace=@hade/core
npm run sdk:check:boundaries
node scripts/audit-core-purity.mjs
npm test
```

# HADE SDK Readiness Audit
**Date:** 2026-05-23
**Auditor role:** B2B Technical Product Manager / Senior Systems Architect / DevEx Lead
**Scope:** Read-only architectural audit. Goal: transform HADE Component System from internal product demo into a marketable, out-of-the-box, Config-First Decision Engine SDK.
**Constraints:** Additive refactors only. Preserve `/demo` behavior. Treat current implementation as reference behavior. Do not rewrite the whole system.

---

## 🏛️ Executive Summary & Architecture Score

**Score: 4 / 10 — Polished internal demo with SDK aspirations; not yet sellable as a config-first decision engine SDK.**

HADE has done the hard part: the **core decision engine** (`src/lib/hade/engine.ts`, `src/lib/hade/confidence.ts`, `src/core/engine/synthetic.ts`) is **already framework-free pure TypeScript** and partially externalizes vocabulary to JSON (`src/config/*.json` — 90 lines of intent affinity, vibe maps, TTLs, type maps). That is the spine an SDK is built on.

But the **packaging story falls apart** the moment you ask three questions an enterprise buyer will ask in their first call:

1. **"Can my product manager edit thresholds without a deploy?"** — No. Confidence cutoffs (`confidence.ts:19,37,48–62`), radius defaults (`radius.ts:4–13`), proximity decay (`route.ts:1117–1132`), surfaced-history penalties (`surfacedPenalty.ts:2,4`), copy length caps (`route.ts:899–902`), upstream timeouts (`route.ts:33–34`) all live as TypeScript constants.
2. **"Can my SwiftUI/Webflow/Figma team consume HADE without React?"** — No. The published `hade-sdk/react/useHade.ts` returns React state shape with UI strings baked in (`pivotLabel`, hardcoded `"Reframing..."`, `"Your move"` in `hade-sdk/react/DecisionCard.tsx:18–19`). There is no data-only `decide()` function exposed.
3. **"Can I swap Google Places for my own Yelp/Foursquare/internal venue DB?"** — Partially. `src/core/adapters/placesAdapter.ts` exists but `route.ts:19,229` and `synthetic.ts:23–24` bypass it and import the Google-specific `fetchNearbyGrounded` directly. OpenAI is hardcoded at `route.ts:844` (`fetch("https://api.openai.com/v1/chat/completions")`) with model `"gpt-4o-mini"` at line 851.

The good news: **none of the necessary refactors are rewrites.** The engine is pure. Adapter scaffolding exists. The 6-phase plan below is additive and `/demo` keeps working at every step.

### Readiness Posture by Layer

| Layer | Current State | SDK-Ready State | Gap |
|---|---|---|---|
| Decision engine purity | Pure TS, no framework | Same | ✅ None |
| Vocabulary externalization | 6 JSON files (90 lines) | Full `hade-config.json` | Medium |
| Threshold/weight config | Hardcoded constants | Config-driven | High |
| Adapter pattern | Scaffolded, bypassed | Enforced via DI | Medium |
| Output contract | React state + UI strings | Headless `DecisionEngineOutput` | High |
| Theme tokens | Tailwind extend + inline hex | W3C tokens + CSS vars | High |
| Copy localization | ~40 inline English strings | Locale bundles | Medium |
| Public API surface | `hade-sdk/` exists, React-coupled | Multi-package monorepo | High |
| Config validation | None | Zod fail-fast | Low |
| Mock/demo adapters | None | Testkit fixtures | Low |

---

## 🚨 Critical Architecture Flaws

### Flaw 1 — Confidence ladder is a buried constant
- **File / Component:** `src/lib/hade/confidence.ts:19,37,48–62`; `src/core/engine/synthetic.ts:153,156`
- **Current Issue:** Bucket thresholds (`<2h → 1.0`, `<6h → 0.85`, etc.), clamp ranges (`[0.3, 0.95]`), and label cutoffs (`≥0.65 → "Strong pick"`) are inline literals. The `ConfidenceLabel` union has only 3 values (`"Strong pick" | "Good fit" | "Exploratory"`).
- **Why It Blocks SDK Packaging:** Every vertical wants its own confidence curve. A dating-app integrator can't ship "Match" / "Maybe" / "Pass" without forking the engine.
- **Recommended Remedy:** Move to `hade-config.json` under `confidence.buckets[]` + `confidence.labels[]`. Engine reads at boot via a `loadConfig()` validator.
- **Refactor Difficulty:** Low
- **Priority:** P0

### Flaw 2 — Hardcoded radius defaults and walking speed
- **File / Component:** `src/core/constants/radius.ts:4–13`; `route.ts:289,1168`
- **Current Issue:** `SEARCH_DEFAULT = 800`, `FALLBACK_STATIC = 500`, `ACTIVITY_CREATION = 150`, ETA formula `distance / 80` (80 m/min walking).
- **Why It Blocks SDK Packaging:** A logistics SaaS will hard-fork to change walking pace to driving pace. A nightlife app will fork for larger radius defaults.
- **Recommended Remedy:** `hade-config.json` → `mobility.walking_meters_per_minute`, `mobility.driving_meters_per_minute`, `geo.default_radius_meters`. Engine resolves at decide-time.
- **Refactor Difficulty:** Low
- **Priority:** P0

### Flaw 3 — Copy embedded across 5 files
- **File / Component:** `route.ts:129–132,302–304,1013–1015,1169–1172`; `engine.ts:90–102`; `deriveReasons.ts:30–121`; `supportText.ts:34–47`; `explanation.ts:7–13,24,30`
- **Current Issue:** ~40 user-facing English strings (e.g. `"Take a walk nearby"`, `"Solid food here"`, `"Decision engine temporarily unavailable"`, `"🔥 Good energy"`) live inside execution logic.
- **Why It Blocks SDK Packaging:** No localization. No tone customization. Any non-English deployment is a fork. An enterprise client with a brand voice ("crisp", "playful", "luxury") cannot configure.
- **Recommended Remedy:** Centralize in `src/config/copy/{locale}.json` keyed by stable IDs (`copy.fallback.walk_nearby`, `copy.reason.solid_food`). Add `hade-config.json` → `copy.tone: "casual" | "professional" | "playful"` selector.
- **Refactor Difficulty:** Medium
- **Priority:** P0

### Flaw 4 — Scoring weights are inline in two places (drift risk)
- **File / Component:** `engine.ts:29–33` (`DEFAULT_OPPORTUNITY_SCORING_WEIGHTS = { proximity: 0.4, signal: 0.35, intent: 0.25 }`); `route.ts:1117–1132` (offline cache uses `proximityWeight = 0.6, ratingWeight = 0.4, vibeDelta = ±0.10`)
- **Current Issue:** Two parallel scoring schemes will drift. Neither is config-bound.
- **Why It Blocks SDK Packaging:** A travel concierge integrator wants `proximity: 0.7`. A discovery feed wants `signal: 0.5`. Today: code fork.
- **Recommended Remedy:** `hade-config.json` → `scoring.weights.{primary,offline}`. Add Zod-shaped validator that asserts weights sum to 1.0 ± epsilon.
- **Refactor Difficulty:** Low
- **Priority:** P0

### Flaw 5 — `route.ts` directly calls `fetchNearbyGrounded` and OpenAI, bypassing adapter layer
- **File / Component:** `route.ts:19,229,844,851`; `src/core/services/places.ts`; `src/core/adapters/placesAdapter.ts`
- **Current Issue:** Adapter exists but route imports the Google-specific service. OpenAI URL + model name hardcoded.
- **Why It Blocks SDK Packaging:** SDK consumer cannot inject Yelp, Foursquare, Apple Maps, Anthropic, or local LLM. Any swap = fork.
- **Recommended Remedy:** Introduce `VenueAdapter` and `LLMAdapter` interfaces. Route receives adapters via DI from `createHade({ adapters: {...} })`. Default factory wires Google + OpenAI.
- **Refactor Difficulty:** Medium
- **Priority:** P0

### Flaw 6 — `useHade` returns React-shaped state, not raw decision
- **File / Component:** `hade-sdk/react/useHade.ts:25–28`; `hade-sdk/react/DecisionCard.tsx:18–19,28–30`
- **Current Issue:** Hook return includes `status: "loading"|"reframing"|"ready"`, `pivotLabel: string`, wrapped `hade` client. UI copy strings inside the hook (`toneLabel()` → `"Adjusting for: Too far"`).
- **Why It Blocks SDK Packaging:** Non-React platforms (SwiftUI, Android, Webflow, Figma plug-ins) cannot bind. No headless `decide()` exposed at SDK root.
- **Recommended Remedy:** Split into `hade-sdk/core/decide()` (pure async function, returns `DecisionEngineOutput`) + thin `useHadeQuery()` adapter for React. Move all UI strings out of the hook.
- **Refactor Difficulty:** Medium
- **Priority:** P0

### Flaw 7 — Theme tokens locked to Tailwind extend
- **File / Component:** `tailwind.config.ts`; `HeroDecisionCard.tsx:118,132,173`; `ContextSignalBadge.tsx:7–17`
- **Current Issue:** Brand color `accent: "#316BFF"`, signal colors, opacity modifiers (`bg-accent/10`, `bg-emerald-500/10`) baked as Tailwind classes. Some inline hex (`intentMeta.eat.color = "#F59E0B"`).
- **Why It Blocks SDK Packaging:** Consumer cannot rebrand. No CSS variable layer. No exported token bundle.
- **Recommended Remedy:** Add `src/tokens/tokens.json` (W3C Design Tokens format); generate CSS variables (`--hade-color-accent`); have Tailwind config consume tokens. Expose `setTheme(tokens)` in SDK.
- **Refactor Difficulty:** Medium
- **Priority:** P1

### Flaw 8 — Demo `/src/app/demo/page.tsx` not separable from engine
- **File / Component:** `src/app/demo/page.tsx:1–30,196–220,330–340`; `src/components/hade/mobile/DecisionScreen.tsx:1056–1092`
- **Current Issue:** UX state machine (low confidence → refine panel, medium → expand radius) lives in `DecisionScreen.handleCta()` and `resolveUiState()`, **not in the SDK output**. Demo imports adaptive/mobile components directly.
- **Why It Blocks SDK Packaging:** Integrators can't reuse the proven UX logic without copying components. The "intelligence" of when to show what is in component code, invisible from the API.
- **Recommended Remedy:** Move UX-state resolution into engine output as `ux_state: { next_action, suggested_sheet, escalation_path }`. Demo and SDK consume the same payload.
- **Refactor Difficulty:** Medium
- **Priority:** P1

### Flaw 9 — No config validator; no boot-time schema check
- **File / Component:** `src/config/*.json` (read directly via `import` at `engine.ts:17–18`)
- **Current Issue:** Misshapen config → silent runtime errors. No `hade-config.json` exists at all.
- **Why It Blocks SDK Packaging:** Enterprise integrators expect "config invalid → loud, early error with line number."
- **Recommended Remedy:** Add `src/config/schema.ts` (Zod), `validateHadeConfig(input): Result<HadeConfig>`, called in `createHade()` constructor. Fail fast.
- **Refactor Difficulty:** Low
- **Priority:** P1

### Flaw 10 — Three sources of truth for decision shape
- **File / Component:** `src/types/hade.ts` (`HadeDecision` ~251–303), `src/core/types/decision.ts` (`DecisionCandidate`), `validateDecision.ts` (runtime asserts)
- **Current Issue:** Field additions must land in all three or runtime/static checks diverge. (See Data Contract Audit, Risks D1–D7 — `DecideResponse.source` union is already incomplete.)
- **Why It Blocks SDK Packaging:** Consumers will hit unexpected `source` values. Type signature lies.
- **Recommended Remedy:** Promote `DecisionEngineOutput` in `hade-sdk/core/types.ts` as the single public contract. Generate validators from the type via Zod inference (`z.infer<typeof DecisionEngineOutputSchema>`).
- **Refactor Difficulty:** Medium
- **Priority:** P1

### Flaw 11 — Timeouts hardcoded in route
- **File / Component:** `route.ts:33–34`
- **Current Issue:** `UPSTREAM_TIMEOUT_MS = 8000`, `COPY_ENHANCE_TIMEOUT_MS = 1500`.
- **Why It Blocks SDK Packaging:** Edge deployments, mobile-only deployments, server-to-server deployments each want different timeouts.
- **Recommended Remedy:** `hade-config.json` → `runtime.timeouts.{upstream_ms, copy_enhance_ms, total_budget_ms}`.
- **Refactor Difficulty:** Low
- **Priority:** P1

### Flaw 12 — Redis coupling not pluggable
- **File / Component:** `route.ts:117,121`; `src/core/services/redis.ts:1,7–8`
- **Current Issue:** `getRedisMode()` returns `"FULL"|"DEGRADED"`; degraded mode mirrors to `x-hade-degraded` header. Upstash-specific.
- **Why It Blocks SDK Packaging:** Consumer with their own KV (Cloudflare KV, DynamoDB, Redis Cluster) must fork.
- **Recommended Remedy:** Define `CacheAdapter { get, set, mode() }` interface. Default factory wires Upstash.
- **Refactor Difficulty:** Medium
- **Priority:** P2

### Flaw 13 — No offline / no-network policy is config-driven
- **File / Component:** `route.ts:1013–1015,1169–1172`
- **Current Issue:** Offline copy and behavior (`"Decision engine temporarily unavailable"`, hardcoded intent `"chill"`) inlined.
- **Why It Blocks SDK Packaging:** Cannot define per-vertical degraded behavior.
- **Recommended Remedy:** `hade-config.json` → `offline.{policy: "static"|"cache"|"reject", copy_id, default_intent}`.
- **Refactor Difficulty:** Low
- **Priority:** P2

### Flaw Priority Summary

| Priority | Count | Flaws |
|---|---|---|
| P0 | 6 | #1, #2, #3, #4, #5, #6 |
| P1 | 5 | #7, #8, #9, #10, #11 |
| P2 | 2 | #12, #13 |

---

## 📋 Proposed Config-First Blueprint

### 1. `hade-config.json`

```json
{
  "$schema": "https://hade.dev/schema/config/v1.json",
  "version": "1.0.0",
  "product": {
    "id": "acme-dining-demo",
    "name": "Acme Dining",
    "domain": "dining"
  },

  "domains": {
    "dining":  { "intents": ["eat", "drink"],      "primary_signals": ["UGC", "PRESENCE"] },
    "social":  { "intents": ["scene", "chill"],    "primary_signals": ["SOCIAL_RELAY", "EVENT"] },
    "travel":  { "intents": ["explore", "anything"], "primary_signals": ["AMBIENT", "ENVIRONMENTAL"] }
  },

  "decision_modes": {
    "spontaneous":  { "default_radius_meters": 1500, "scoring_profile": "balanced" },
    "planned":      { "default_radius_meters": 5000, "scoring_profile": "intent_heavy" },
    "dead_time":    { "default_radius_meters": "auto", "scoring_profile": "proximity_heavy" }
  },

  "candidate_categories": {
    "include_google_types": ["restaurant", "cafe", "bar", "park"],
    "exclude_google_types": ["gas_station", "atm"],
    "user_categories":      { "ref": "./categories.json" }
  },

  "scoring": {
    "profiles": {
      "balanced":         { "proximity": 0.40, "signal": 0.35, "intent": 0.25 },
      "intent_heavy":     { "proximity": 0.25, "signal": 0.25, "intent": 0.50 },
      "proximity_heavy":  { "proximity": 0.60, "signal": 0.25, "intent": 0.15 }
    },
    "offline_overlay":    { "proximity": 0.60, "rating": 0.40, "vibe_delta_cap": 0.10 },
    "surfaced_penalty":   { "once": -0.08, "twice": -0.14 }
  },

  "confidence": {
    "clamp": { "min": 0.30, "max": 0.95 },
    "buckets": [
      { "max_age_hours": 2,  "score": 1.00 },
      { "max_age_hours": 6,  "score": 0.85 },
      { "max_age_hours": 24, "score": 0.70 },
      { "max_age_hours": null, "score": 0.50 }
    ],
    "labels": [
      { "min_score": 0.65, "id": "strong_pick"  },
      { "min_score": 0.40, "id": "good_fit"     },
      { "min_score": 0.00, "id": "exploratory"  }
    ]
  },

  "fallback": {
    "strategy": "synthetic_then_static",
    "cold_start": { "penalty": -0.05 },
    "static_pool_id": "default_walks"
  },

  "copy": {
    "locale": "en-US",
    "tone": "casual",
    "max_chars": { "rationale": 280, "why_now": 120, "why_this": 60, "decision_frame": 180 },
    "overrides": { "ref": "./copy/en-US.json" }
  },

  "ui_theme": {
    "tokens_ref": "./tokens/light.json",
    "dark_tokens_ref": "./tokens/dark.json"
  },

  "mobility": {
    "walking_meters_per_minute": 80,
    "driving_meters_per_minute": 500
  },

  "telemetry": {
    "emit_decisions": true,
    "emit_corrections": true,
    "sink": { "kind": "http", "url": "https://acme.example/hade-telemetry" }
  },

  "runtime": {
    "timeouts": { "upstream_ms": 8000, "copy_enhance_ms": 1500, "total_budget_ms": 12000 },
    "offline":  { "policy": "cache", "default_intent": "chill", "copy_id": "offline.cache_hit" }
  },

  "adapters": {
    "venue":  { "id": "google_places" },
    "llm":    { "id": "openai", "model": "gpt-4o-mini" },
    "cache":  { "id": "upstash" },
    "geo":    { "id": "browser" }
  }
}
```

### 2. `ContextEnvelope` TypeScript Interface

```ts
/**
 * Uniform input contract — every external telemetry source
 * (geolocation, weather, device, signals, UGC) MUST normalize to this
 * before the decision engine sees it. Engine never touches raw provider data.
 */
export interface ContextEnvelope {
  envelope_version: "1.0";
  emitted_at_ms: number;
  source_adapter: string;             // "google_places" | "browser_geo" | "custom"
  trust: { level: "verified" | "best_effort" | "unknown"; reason?: string };

  geo?: {
    coords: { lat: number; lng: number; accuracy_m?: number };
    locale?: string;                  // BCP-47
    timezone?: string;
    address?: { city?: string; country?: string; neighborhood?: string };
  };

  time?: {
    now_ms: number;
    time_of_day?: TimeOfDay;          // engine-derived if omitted
    day_type?: DayType;
  };

  device?: {
    platform: "web" | "ios" | "android" | "server";
    network: "online" | "offline" | "degraded";
    battery_pct?: number;
  };

  ambient?: {
    weather?: { temp_c?: number; condition?: string };
    daylight?: "day" | "twilight" | "night";
  };

  user?: {
    id_hash?: string;                 // anonymized
    state?: { energy?: HadeEnergy; openness?: HadeOpenness };
    social?: { group_size?: number; group_type?: HadeGroupType };
    constraints?: HadeConstraints;
  };

  signals?: Signal[];                 // already-normalized SignalType union
  candidates?: CandidatePool;         // optional pre-fetched venue pool

  parse_warnings?: ParseWarning[];    // defensive: malformed fields surface, never throw
}

export interface CandidatePool {
  source: string;                     // "google_places" | "yelp" | "internal"
  fetched_at_ms: number;
  items: Array<{
    id: string;
    name: string;
    category: string;                 // normalized via places_type_map
    geo: { lat: number; lng: number };
    distance_meters?: number;
    rating?: number;
    raw?: unknown;                    // provider-specific payload preserved for debug
  }>;
}

export interface ParseWarning {
  field: string;
  message: string;
  severity: "info" | "warn" | "error";
}
```

### 3. `DecisionEngineOutput` TypeScript Interface

```ts
/**
 * Headless, framework-agnostic decision payload.
 * Consumers: React, SwiftUI, Android, Webflow, Figma plug-ins, enterprise dashboards.
 * Contains ONLY: data, semantic tokens, ux-state hints. NO HTML, NO CSS, NO copy override decisions.
 */
export interface DecisionEngineOutput {
  output_version: "1.0";
  request_id: string;
  generated_at_ms: number;
  source: DecisionSource;             // typed union (replaces the incomplete one in DecideResponse)
  is_fallback: boolean;

  decision: {
    id: string;
    venue_name: string;
    category: string;
    geo: { lat: number; lng: number };
    distance_meters: number;
    eta_minutes: number;
    neighborhood?: string;
    address?: string;
  };

  confidence: {
    score: number;                    // 0–1
    label_id: string;                 // "strong_pick" | custom — resolved via config
    band: "low" | "medium" | "high";  // engine-computed bucket
  };

  rationale: {
    primary_id?: string;              // stable key into copy/{locale}.json
    primary_text?: string;            // localized resolved string (or null if consumer renders own)
    secondary_id?: string;
    secondary_text?: string;
    cited_signals: Array<{ signal_id: string; weight: number }>;
  };

  action_tokens: {
    primary:   { kind: "navigate" | "open_sheet" | "call" | "custom"; payload: Record<string, unknown>; label_id: string };
    secondary: Array<{ kind: string; payload: Record<string, unknown>; label_id: string }>;
  };

  layout_tokens: {
    surface: "hero_card" | "list_row" | "map_pin" | "compact_pill";
    density: "comfortable" | "compact";
    show_slots: Array<"badge" | "support_text" | "trust_attribution" | "commitment_preview">;
  };

  copy_tokens: {
    locale: string;
    keys: Record<string, string>;     // resolved label IDs → strings (UI can ignore and use IDs directly)
  };

  theme_tokens: {
    palette_ref: string;              // "default" | "dark" | custom palette id
    semantic: {
      confidence_color_id: "color.signal.strong" | "color.signal.weak" | string;
      surface_color_id: string;
      accent_color_id: string;
    };
  };

  ux_state: {
    next_action: "commit" | "refine" | "expand_radius" | "compare_modes" | "show_alternatives";
    suggested_sheet?: "refine" | "vibe" | "commitment" | "micro_adventure" | null;
    escalation_path: Array<"refine" | "expand_radius" | "switch_mode">;
  };

  fallback_meta?: {
    reason: "no_signal" | "places_timeout" | "llm_failed" | "offline_cache";
    degraded_fields: string[];
    user_visible: boolean;
  };

  analytics: {
    candidates_considered: number;
    candidates_scored: number;
    engine_tier: "llm" | "synthetic" | "static" | "cold_start" | "offline_cache";
    timings_ms: { upstream?: number; scoring?: number; copy?: number; total: number };
    config_hash: string;              // sha of resolved hade-config.json for A/B + reproducibility
  };

  debug?: {
    config_snapshot_ref?: string;
    prompt_id?: string;
    request_echo?: unknown;
  };
}

export type DecisionSource =
  | "llm" | "synthetic" | "static_fallback"
  | "cold_start_synthetic" | "offline_cache";
```

---

## 🎨 Headless Output Token Mapping

A frontend team can bind this payload directly into UI components without knowing HADE internals. Every visual decision is expressible as a token; every action is expressible as a kind+payload.

```json
{
  "output_version": "1.0",
  "request_id": "req_01HXY9Z3K4M",
  "generated_at_ms": 1747920000000,
  "source": "llm",
  "is_fallback": false,

  "decision": {
    "id": "places/ChIJ12345abcde",
    "venue_name": "Hart's",
    "category": "wine_bar",
    "geo": { "lat": 40.6818, "lng": -73.9591 },
    "distance_meters": 420,
    "eta_minutes": 6,
    "neighborhood": "Bed-Stuy",
    "address": "457 Nostrand Ave, Brooklyn, NY"
  },

  "confidence": {
    "score": 0.78,
    "label_id": "strong_pick",
    "band": "high"
  },

  "rationale": {
    "primary_id": "reason.recent_buzz",
    "primary_text": "Three friends checked in here in the last hour.",
    "secondary_id": "reason.intent_match",
    "secondary_text": "Matches your 'looking for a scene' vibe.",
    "cited_signals": [
      { "signal_id": "sig_presence_88a", "weight": 0.62 },
      { "signal_id": "sig_social_31b",   "weight": 0.38 }
    ]
  },

  "action_tokens": {
    "primary": {
      "kind": "navigate",
      "payload": { "lat": 40.6818, "lng": -73.9591, "mode": "walking" },
      "label_id": "action.take_me_there"
    },
    "secondary": [
      { "kind": "open_sheet", "payload": { "sheet": "refine" }, "label_id": "action.refine" },
      { "kind": "open_sheet", "payload": { "sheet": "alternatives" }, "label_id": "action.show_alts" }
    ]
  },

  "layout_tokens": {
    "surface": "hero_card",
    "density": "comfortable",
    "show_slots": ["badge", "support_text", "trust_attribution"]
  },

  "copy_tokens": {
    "locale": "en-US",
    "keys": {
      "eyebrow.your_move":       "Your move",
      "action.take_me_there":    "Take me there",
      "action.refine":           "Refine",
      "action.show_alts":        "See alternatives",
      "reason.recent_buzz":      "Three friends checked in here in the last hour.",
      "reason.intent_match":     "Matches your 'looking for a scene' vibe.",
      "label.strong_pick":       "Strong pick"
    }
  },

  "theme_tokens": {
    "palette_ref": "default",
    "semantic": {
      "confidence_color_id": "color.signal.strong",
      "surface_color_id":    "color.surface.elevated",
      "accent_color_id":     "color.brand.accent"
    }
  },

  "ux_state": {
    "next_action": "commit",
    "suggested_sheet": null,
    "escalation_path": ["refine", "expand_radius", "switch_mode"]
  },

  "analytics": {
    "candidates_considered": 47,
    "candidates_scored": 12,
    "engine_tier": "llm",
    "timings_ms": { "upstream": 412, "scoring": 18, "copy": 980, "total": 1410 },
    "config_hash": "sha256:9f3b7c..."
  }
}
```

### Binding Examples

| Platform | Binding Pattern |
|---|---|
| **React / Web** | `<HeroCard tokens={output.layout_tokens} action={output.action_tokens.primary} copy={output.copy_tokens.keys} />` |
| **SwiftUI** | `HadeHeroCard(output: output).accentColor(theme[output.theme_tokens.semantic.accent_color_id])` |
| **Webflow** | CMS field map: `{{ decision.venue_name }}`, `{{ copy_tokens.keys["action.take_me_there"] }}` |
| **Figma plug-in** | Auto-populate component variants from `layout_tokens.surface` + `confidence.band` |
| **Enterprise dashboard** | Map `analytics` block into BI; render `decision` + `rationale` as audit row |

---

## 🧱 Target SDK Architecture

```
hade/
├── packages/
│   ├── core/                        # @hade/core — pure TS, zero framework
│   │   ├── src/
│   │   │   ├── index.ts                          # public API: createHade, decide, types
│   │   │   ├── engine/
│   │   │   │   ├── scoreOpportunity.ts
│   │   │   │   ├── rankOpportunities.ts
│   │   │   │   ├── generateCommitment.ts
│   │   │   │   ├── inferTravelerState.ts
│   │   │   │   ├── reachability.ts
│   │   │   │   └── synthetic.ts                  # deterministic floor
│   │   │   ├── scoring/
│   │   │   │   ├── confidence.ts                 # config-driven buckets
│   │   │   │   ├── weights.ts
│   │   │   │   └── surfacedPenalty.ts
│   │   │   ├── explanation/
│   │   │   │   ├── rationale.ts
│   │   │   │   ├── supportText.ts
│   │   │   │   └── deriveReasons.ts
│   │   │   ├── config/
│   │   │   │   ├── schema.ts                     # Zod schema for hade-config.json
│   │   │   │   ├── loadConfig.ts
│   │   │   │   ├── validateConfig.ts
│   │   │   │   └── defaults.ts                   # safe defaults if user provides none
│   │   │   ├── types/
│   │   │   │   ├── ContextEnvelope.ts
│   │   │   │   ├── DecisionEngineOutput.ts
│   │   │   │   ├── HadeConfig.ts
│   │   │   │   └── adapters.ts
│   │   │   └── util/
│   │   │       ├── haversine.ts
│   │   │       └── time.ts
│   │   └── package.json
│   │
│   ├── adapters/                    # @hade/adapters-*
│   │   ├── places-google/
│   │   ├── places-yelp/
│   │   ├── llm-openai/
│   │   ├── llm-anthropic/
│   │   ├── cache-upstash/
│   │   ├── cache-memory/
│   │   ├── geo-browser/
│   │   └── geo-server/
│   │
│   ├── tokens/                      # @hade/tokens — W3C design tokens
│   │   ├── src/
│   │   │   ├── tokens.json
│   │   │   ├── light.json
│   │   │   ├── dark.json
│   │   │   └── generators/
│   │   │       ├── css.ts                        # → CSS vars
│   │   │       ├── tailwind.ts                   # → tailwind preset
│   │   │       └── swift.ts                      # → SwiftUI Color extension
│   │   └── package.json
│   │
│   ├── react/                       # @hade/react — thin binding
│   │   ├── src/
│   │   │   ├── useHadeQuery.ts                   # wraps core.decide() in React Query-shaped API
│   │   │   ├── components/
│   │   │   │   ├── HeroCard.tsx                  # consumes layout_tokens + copy_tokens
│   │   │   │   ├── PrimaryAction.tsx
│   │   │   │   ├── RefineSheet.tsx
│   │   │   │   └── ContextBadge.tsx
│   │   │   └── HadeProvider.tsx
│   │   └── package.json
│   │
│   ├── copy/                        # @hade/copy — locale bundles
│   │   ├── en-US.json
│   │   ├── es-ES.json
│   │   └── ja-JP.json
│   │
│   └── testkit/                     # @hade/testkit
│       ├── fixtures/
│       │   ├── contexts/             # ContextEnvelope examples
│       │   ├── decisions/            # DecisionEngineOutput examples
│       │   └── configs/              # hade-config.json examples
│       ├── mocks/
│       │   ├── mockVenueAdapter.ts
│       │   └── mockLLMAdapter.ts
│       └── snapshots/
│
├── examples/
│   ├── next-demo/                   # current /demo, preserved
│   ├── swiftui-bridge/
│   ├── webflow-embed/
│   └── server-side/
│
├── docs/
│   ├── README.md                    # quickstart in 5 minutes
│   ├── config.md                    # hade-config.json reference
│   ├── adapters.md
│   ├── headless-binding.md
│   └── api/                         # typedoc output
│
└── apps/
    └── playground/                  # interactive config builder
```

### Package Responsibility Matrix

| Package | Depends On | Consumers | Framework Coupling |
|---|---|---|---|
| `@hade/core` | nothing (zero deps) | all other packages | None |
| `@hade/adapters-*` | `@hade/core` types only | runtime wiring | Provider SDK only |
| `@hade/tokens` | nothing | `@hade/react`, consumer apps | None |
| `@hade/react` | `@hade/core`, `@hade/tokens` | React apps | React peer dep |
| `@hade/copy` | nothing | resolved at decide-time | None |
| `@hade/testkit` | `@hade/core` types | test suites | None |

---

## 🛠️ Migration Plan

All phases preserve `/demo` behavior. Every phase ships independently. No phase removes existing UX/UI.

### Phase 1 — Audit-Safe Extraction (1 sprint)
**Goal:** Reorganize without changing behavior. Zero risk.

**Steps:**
- Move `src/lib/hade/` → `packages/core/src/engine/` and `packages/core/src/explanation/` via path aliases only. No logic changes. Demo continues importing from new path via `@hade/core`.
- Move `src/core/engine/synthetic.ts` to same package.
- Extract `src/config/*.json` to `packages/core/src/config/vocab/` (kept as data, not yet schema-validated).
- Add `tsconfig.json` paths mapping so existing imports resolve to new locations.

**Ship criteria:** `npm run build` green, `/demo` identical, `test` green.

**Addresses flaws:** Pre-work; no flaws fully resolved yet.

---

### Phase 2 — Config Abstraction (1–2 sprints)
**Goal:** Promote all hardcoded thresholds, weights, timeouts, and copy length caps into `hade-config.json`.

**Steps:**
- Create `packages/core/src/config/schema.ts` (Zod) for `HadeConfig`.
- Write `loadConfig(input | path): HadeConfig` with `validateConfig()` fail-fast.
- Migrate constants:
  - `radius.ts` → `config.geo.default_radius_meters`
  - `confidence.ts:19,37,48–62` → `config.confidence.{buckets,clamp,labels}`
  - `engine.ts:29–33` → `config.scoring.profiles.balanced`
  - `route.ts:33–34` → `config.runtime.timeouts`
  - `route.ts:1117–1132` → `config.scoring.offline_overlay`
  - `surfacedPenalty.ts:2,4` → `config.scoring.surfaced_penalty`
  - `route.ts:899–902` (copy length caps) → `config.copy.max_chars`
- Demo loads `examples/next-demo/hade-config.json` with current values. Behavior unchanged.
- Add `config_hash` to every decision output (sha of resolved config).

**Ship criteria:** Identical decisions for fixture inputs; swap `hade-config.json` weights → measurably different rankings.

**Addresses flaws:** #1 (confidence), #2 (radius), #4 (weights), #9 (validator), #11 (timeouts).

---

### Phase 3 — Adapter Interfaces (2 sprints)
**Goal:** Make every external service swappable via DI.

**Steps:**
- Define `VenueAdapter`, `LLMAdapter`, `CacheAdapter`, `GeoAdapter` interfaces in `packages/core/src/types/adapters.ts`.
- Refactor `route.ts:19,229` to consume `adapters.venue.search(envelope, opts)` instead of `fetchNearbyGrounded`.
- Refactor `route.ts:844,851` to consume `adapters.llm.enhance(prompt, opts)`.
- Extract Google + OpenAI + Upstash + browser-geo implementations to `packages/adapters/*` as default factories.
- Ship `createHade({ adapters: { venue: googlePlaces(), llm: openai(...) } })` constructor.
- Promote `placesAdapter.ts` from bypassed scaffolding to enforced interface.

**Ship criteria:** Demo wires defaults via factory; swap LLM adapter to mock in tests yields deterministic output.

**Addresses flaws:** #5 (route bypasses adapter), #12 (Redis coupling).

---

### Phase 4 — Headless Output Contract (2 sprints)
**Goal:** Make the decision payload framework-agnostic. SwiftUI and Webflow integrators can bind.

**Steps:**
- Implement `DecisionEngineOutput` builder in `packages/core/src/engine/buildOutput.ts`.
- Move UX-state resolution from `DecisionScreen.handleCta()` + `resolveUiState()` into engine → `output.ux_state`.
- Replace inline copy strings (40+ across 5 files) with stable IDs; centralize resolved strings in `packages/copy/en-US.json`.
- Build `copy_tokens.keys` resolver: takes `label_id`s referenced in the output + locale, returns map.
- Generate `theme_tokens` from `packages/tokens/`.
- Add `src/tokens/tokens.json` (W3C Design Tokens); generate CSS variables via build step.
- `useHadeQuery` returns raw `DecisionEngineOutput` + thin loading/error wrapping; remove `pivotLabel`, `toneLabel` from hook.
- Existing `hade-sdk/react/DecisionCard.tsx` reimplemented as consumer of `output.layout_tokens` + `output.copy_tokens`.
- Promote `DecisionEngineOutput` as the single source-of-truth type; deprecate parallel decision shapes.

**Ship criteria:** Same demo render, but driven entirely by output payload. Snapshot test: render output payload with empty CSS → semantic HTML still parses.

**Addresses flaws:** #3 (embedded copy), #6 (useHade React-shaped), #7 (theme tokens), #8 (UX state in components), #10 (three sources of truth), #13 (offline policy).

---

### Phase 5 — SDK Packaging (1–2 sprints)
**Goal:** Publishable, installable, documented.

**Steps:**
- pnpm workspaces, semantic versioning, Changesets.
- Each `packages/*` builds to dual ESM/CJS with full `.d.ts`.
- `@hade/core` exports tree-shakable: `import { decide, createHade } from "@hade/core"`.
- Add `peerDependencies` for `react`, `react-dom` on `@hade/react` only.
- Publish to private npm or GitHub Packages first; smoke-test install in a fresh Next.js, Vite, and Astro app.
- Add `examples/swiftui-bridge` showing the output payload rendered natively.
- Build `@hade/testkit` with mock adapters and fixture decisions.

**Ship criteria:** `npm install @hade/core @hade/adapters-google-places @hade/react` + 20-line README example → working hero card.

**Addresses flaws:** Packaging gap; no direct flaw mapping.

---

### Phase 6 — Docs / Demo Commercialization (1 sprint)
**Goal:** Sellable. A developer who's never seen HADE ships in under 30 minutes.

**Steps:**
- README with "5-minute quickstart" path (install → config → render).
- `docs/config.md` reference auto-generated from Zod schema via `zod-to-md`.
- `apps/playground/` — interactive config builder (drag-drop weights, live decision preview).
- Migration guide for current `/demo` consumers.
- Public-facing landing page positioning: "Config-First Decision Engine for any vertical that ranks options under context."
- Pricing/licensing decision (MIT core + commercial adapters? Source-available?).
- Vertical-specific config preset library (`examples/configs/dating.json`, `examples/configs/logistics.json`, `examples/configs/concierge.json`).

**Ship criteria:** A new developer with no prior HADE exposure can ship a working decision UI in ≤ 30 minutes following docs/README.

**Addresses flaws:** Commercialization gap.

---

### Phase Sequencing Summary

| Phase | Focus | Sprints | Risk | P0 Flaws Resolved |
|---|---|---|---|---|
| 1 | Extraction | 1 | None | 0 |
| 2 | Config | 1–2 | Low | 4 (#1, #2, #4, #9, #11) |
| 3 | Adapters | 2 | Medium | 2 (#5, #12) |
| 4 | Headless output | 2 | Medium | 5 (#3, #6, #7, #8, #10, #13) |
| 5 | Packaging | 1–2 | Low | 0 |
| 6 | Docs | 1 | None | 0 |
| **Total** | | **8–10 sprints** | | **All 13** |

---

## ✅ Non-Negotiables Across All Phases

These rules apply to every PR, every sprint, every phase. Violating any of them risks regression of the current demo or compromises the SDK's value proposition.

### 1. `/demo` must render identically at every phase boundary
- Snapshot tests gate every PR.
- Visual regression suite runs against the existing demo state.
- Any pixel-level divergence requires explicit reviewer sign-off as a deliberate change.

### 2. Additive only
- No field removals until Phase 6 cleanup, and only behind a major version bump.
- Existing types remain functional alongside new ones during transition.
- Deprecation warnings precede removals by at least one minor version.

### 3. Engine purity preserved
- No phase introduces React, framer-motion, or DOM imports into `packages/core/`.
- Lint rule enforces zero framework imports in core package.
- CI fails if `packages/core/` imports from `react`, `next`, or any DOM API.

### 4. Safe defaults
- A `createHade()` call with no config produces working decisions using bundled defaults (current demo behavior).
- Defaults match today's hardcoded values exactly.
- No required config fields unless absolutely necessary; everything has a sensible fallback.

### 5. Config-hash in every output payload
- Every decision carries the SHA of the resolved config it was made under.
- Enables A/B testing, audit trails, and reproducibility.
- Customer support can reproduce any decision given the request + config hash.

### 6. Preserve existing UX/UI surface
- Do not remove `RefineSheet`, `VibeSheet`, `CommitmentSheet`, `MicroAdventureSheet`, or any current mobile component.
- Refactor in place; rebind to new output payload.
- All existing user-facing labels stay reachable via copy IDs even after Phase 4 migration.

### 7. Adapter swap must never crash the engine
- Failed adapter → graceful degradation via synthetic engine floor.
- No adapter is allowed to throw uncaught exceptions into the engine.
- All adapter calls wrapped in `try/catch` with timeout + fallback.

### 8. Type purity at package boundaries
- `@hade/core` exports only TypeScript types, pure functions, and factories.
- No package exports React components except `@hade/react`.
- No package exports CSS except `@hade/tokens` (and only as generated artifacts).

### 9. Backward-compatible JSON contracts
- `hade-config.json` schema versioned via `version` field.
- `DecisionEngineOutput` schema versioned via `output_version` field.
- Schema migrations provided when fields change shape.

### 10. Test fixtures must round-trip
- Every fixture in `@hade/testkit/fixtures/` must validate against current schemas.
- CI runs fixture validation on every PR.
- Adding a new field to any contract requires updating fixtures simultaneously.

---

## Appendix A — File Change Inventory

### Files Created
- `packages/core/src/config/schema.ts` (Zod)
- `packages/core/src/config/loadConfig.ts`
- `packages/core/src/config/validateConfig.ts`
- `packages/core/src/config/defaults.ts`
- `packages/core/src/types/ContextEnvelope.ts`
- `packages/core/src/types/DecisionEngineOutput.ts`
- `packages/core/src/types/HadeConfig.ts`
- `packages/core/src/types/adapters.ts`
- `packages/core/src/engine/buildOutput.ts`
- `packages/tokens/src/tokens.json` (W3C format)
- `packages/tokens/src/generators/{css,tailwind,swift}.ts`
- `packages/copy/{en-US,es-ES,ja-JP}.json`
- `packages/testkit/fixtures/{contexts,decisions,configs}/*.json`
- `packages/testkit/mocks/{mockVenueAdapter,mockLLMAdapter}.ts`
- `apps/playground/` (interactive config builder)
- `examples/next-demo/hade-config.json`
- `examples/{swiftui-bridge,webflow-embed,server-side}/`
- `docs/{config.md,adapters.md,headless-binding.md}`

### Files Modified
- `src/lib/hade/engine.ts` — read scoring weights from config
- `src/lib/hade/confidence.ts` — read buckets/clamp/labels from config
- `src/lib/hade/surfacedPenalty.ts` — read penalties from config
- `src/core/constants/radius.ts` — promote to config; keep as defaults export
- `src/app/api/hade/decide/route.ts` — consume adapters, config-driven timeouts and copy
- `src/core/engine/synthetic.ts` — read confidence label cutoffs from config
- `src/lib/hade/deriveReasons.ts` — emit copy IDs instead of strings
- `src/lib/hade/supportText.ts` — emit copy IDs instead of strings
- `src/lib/hade/explanation.ts` — emit copy IDs instead of strings
- `hade-sdk/react/useHade.ts` — return raw `DecisionEngineOutput`
- `hade-sdk/react/DecisionCard.tsx` — consume `layout_tokens` + `copy_tokens`
- `hade-sdk/react/PrimaryCTAButton.tsx` — consume `action_tokens.primary`
- `src/components/hade/mobile/DecisionScreen.tsx` — read `ux_state` from output instead of local logic
- `tailwind.config.ts` — consume `@hade/tokens` preset
- `src/types/hade.ts` — promote `DecisionEngineOutput` as canonical

### Files Moved (Phase 1)
- `src/lib/hade/*` → `packages/core/src/engine/`
- `src/core/engine/synthetic.ts` → `packages/core/src/engine/synthetic.ts`
- `src/config/*.json` → `packages/core/src/config/vocab/`

---

## Appendix B — Success Metrics

A successful SDK migration is measurable. Track these from Phase 2 onward:

| Metric | Phase 0 Baseline | Phase 6 Target |
|---|---|---|
| Hardcoded thresholds in execution code | ~25 | 0 |
| Inline English copy strings | ~40 | 0 (all via IDs) |
| External services swappable via DI | 0 | 4 (venue, LLM, cache, geo) |
| Non-React platforms with binding example | 0 | ≥ 2 (SwiftUI, Webflow) |
| Time to first decision for new developer | ~4 hours | ≤ 30 min |
| Config changes requiring code deploy | 100% | 0% |
| Decision reproducibility (config hash present) | No | Yes |
| Test coverage for config-driven behavior | Low | ≥ 80% |
| Published package count | 1 (`hade-sdk`) | 6+ (`@hade/*`) |
| Locale coverage | 1 (en-US, implicit) | 3+ (en-US, es-ES, ja-JP) |

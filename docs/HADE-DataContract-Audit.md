# HADE Data Contract Audit
**Date:** 2026-05-22
**Auditor role:** Senior TypeScript backend architect
**Scope:** Read-only. All findings reference specific file:line. No code was changed.

---

## 1. Current Schema Map

### Type Module Topology

| Module | Purpose | Who consumes |
|---|---|---|
| `src/types/hade.ts` | Canonical HTTP wire contract (~1000 lines, 80+ exports) | All layers |
| `src/core/types/decision.ts` | Internal adapter only (`DecisionCandidate`) | Route + engine internals only |
| `domain/spontaneous-object/spontaneousObject.ts` | Base shape that `HadeDecision` extends | `hade.ts` via `Partial<SpontaneousObject>` |
| `src/app/api/hade/decide/validateDecision.ts` | Runtime validator + copy safety guard | Route handler only |

### Key Type Shapes

**`HadeDecision`** (`src/types/hade.ts:251–303`) — Primary HTTP wire decision shape.
- 17 own fields: `id`, `venue_name`, `category`, `address`, `neighborhood`, `distance_meters`, `eta_minutes`, `rationale`, `why_now`, `why_this`, `decision_frame`, `confidence`, `confidence_label`, `is_fallback`, `source`, `trust_attributions`, `primary_signal`
- Extends `Partial<SpontaneousObject>` — inherits a second `source` field (loose `string`) from the base shape

**`DecideRequest`** (`src/types/hade.ts:201–236`) — Client → server POST body. Contains full `HadeContext` + `mode`, `lens`, `scenario`, `voice_input`, `session_id`, `rejection_history`.

**`DecideResponse`** (`src/types/hade.ts:309–334`) — Server → client envelope. Fields: `decision`, `context_echo`, `session_id`, `source?`, `confidence?`, `debug?`.

**`HadeContext`** (`src/types/hade.ts:163–186`) — Composed of 4 groups:
- `HadeSituation` (lines 93–96): `intent`, `urgency`
- `HadeState` (lines 102–105): `energy`, `openness`
- `HadeSocial`: `group_size`, `group_type`
- `HadeConstraints` (lines 118–122): `budget?`, `time_available_minutes?`, `distance_tolerance?`

**`DecisionCandidate`** (`src/core/types/decision.ts`) — Internal-only normalized candidate shape. Never sent to clients. Zero overlap with `hade.ts`.

**`SpontaneousObject`** (`domain/spontaneous-object/spontaneousObject.ts`) — Base shape inherited by `HadeDecision`:
```ts
id, type, title, time_window, location, radius, going_count, maybe_count,
user_state, created_at, expires_at, trust_score, vibe_tag, source?,
address?, place_name?, location_label?, location_source?, place_id?
```

### Validation Surface

**`assertDecisionValid(decision, provenanceId, reqId): boolean`**
- Enforces: non-empty `id`/`venue_name`/`category`, `confidence` ∈ [0,1], ≥1 copy field set, `source` and `is_fallback` present, provenance ID match (anti-LLM-swap guard)

**`extractSafeCopyPatch(selectedId, upstreamDecision, reqId)`**
- LLM copy safety guard — whitelists only: `rationale`, `why_now`, `why_this`, `decision_frame`
- Silently drops any other fields the LLM emits

---

## 2. Type Duplication Risks

### D1 — `DecideResponse.source` union is INCOMPLETE
**Location:** `src/types/hade.ts:~318`
**Declared as:** `"llm" | "synthetic" | "static_fallback"`
**Route actually emits:** 5 values including `"cold_start_synthetic"` and `"offline_cache"`
**Risk:** TypeScript accepts the route's emission without error (string assignability), but consumers that switch on `source` will silently miss two branches.
**Fix:** Define a `DecisionSource` discriminated union and use it in both the type and the route.

### D2 — `source` field name collision
**Location:** `HadeDecision` own field vs `SpontaneousObject.source` (inherited)
**Problem:** `HadeDecision.source` (typed union: engine tier) collides with `SpontaneousObject.source` (loose `string`: venue provenance). The inherited field shadows or merges depending on TypeScript's intersection resolution — behavior is non-obvious.
**Fix:** Rename one: `HadeDecision.source` → `decision_tier`, or `SpontaneousObject.source` → `venue_source`. Phase 6 type cleanup.

### D3 — Four copy fields with unclear boundaries
**Location:** `HadeDecision.rationale`, `why_now`, `why_this`, `decision_frame`
**Problem:** Semantically overlapping. No schema comment defines when each is required vs optional vs deprecated. LLM prompt may emit all four; UI may render only one.
**Fix:** Add TSDoc comments distinguishing each field's exact purpose. No removal — all four are load-bearing in existing UI renders.

### D4 — `eta_minutes` overloaded
**Location:** `src/types/hade.ts:~257`, computed at `route.ts:~1110` as `Math.ceil(dist / 80)`
**Problem:** Represents travel time only. Future `commitment.visit_duration_minutes` + multi-stop chaining will create temporal ambiguity if callers assume `eta_minutes` = "time until done."
**Fix:** Do not rename `eta_minutes`. Add a sibling `fits_in_window?: WindowFit` with `travel_out`, `dwell`, `travel_back`, `total`, `fits` breakdown.

### D5 — `Intent` is an open union
**Location:** `src/types/hade.ts` — declared as `KnownIntent | (string & {})`
**Problem:** Accepts any string. Typos compile silently. Downstream scoring and affinity-map lookups silently miss unrecognized values.
**Fix:** Do not close the union (breaking change). Add a runtime `isKnownIntent()` guard and log unknown values.

### D6 — `ConfidenceLabel` has only 3 values
**Location:** `src/types/hade.ts:~242` — `"Strong pick" | "Good fit" | "Exploratory"`
**Problem:** Insufficient resolution for traveler-state and time-constrained contexts. A `low_energy` traveler seeing "Strong pick" copy that implies energy expenditure is a mismatch.
**Fix:** Additive: add `"Quick win"` and `"Comfort pick"` as optional values. Existing UI renders fall through to "Exploratory" if unrecognized.

### D7 — `extractSafeCopyPatch()` whitelist gaps
**Location:** `src/app/api/hade/decide/validateDecision.ts`
**Problem:** Whitelists only 4 fields. When the LLM is asked to emit new structured fields (`commitment`, `traveler_state_note`, `window_label`), they will be silently stripped at the validator.
**Fix:** Extend the whitelist before extending the LLM prompt schema. Order matters: type → validator → prompt → UI.

---

## 3. Recommended Additive Schema Extensions

All extensions are **optional fields** — zero breaking changes.

### `HadeConstraints` additions
```ts
interface HadeConstraints {
  budget?: BudgetLevel;
  time_available_minutes?: number;
  distance_tolerance?: DistanceTolerance;
  // NEW
  time_window_end_ms?: number;       // deadline (epoch ms) — distinct from duration
  window_bucket?: TimeWindowBucket;  // derived: "micro_15" | "short_30" | "half_45" | "hour_60"
}
```

### `HadeContext` additions
```ts
interface HadeContext {
  // existing fields...
  // NEW
  traveler_state?: TravelerState;            // inferred by engine
  traveler_state_confidence?: number;        // 0–1, used for UI pill rendering threshold
  dead_time_context?: DeadTimeContext;       // layover / gap / transit metadata
}
```

### `HadeDecision` additions
```ts
interface HadeDecision {
  // existing fields...
  // NEW
  commitment?: DecisionCommitment;    // "how to execute" layer (complements "why" layer)
  fits_in_window?: WindowFit;         // temporal feasibility with travel + dwell breakdown
  window_label?: string;              // human copy: "Fits your 30-minute window"
}
```

### `DecideResponse` additions
```ts
interface DecideResponse {
  // existing fields...
  // NEW
  itinerary?: MicroAdventure;         // multi-stop chain (Phases 4+)
  inferred_traveler_state?: InferredTravelerState;  // logged even before UI activation
  source?: DecisionSource;            // NOW TYPED (replaces incomplete union)
}
```

---

## 4. Proposed TypeScript Interfaces

### Commitment

```ts
interface CommitmentStep {
  order: number;
  instruction: string;
  duration_seconds?: number;
  cue?: "order" | "sit" | "photo" | "chat" | "walk";
}

interface PostAction {
  kind: "walk_to" | "next_stop" | "home" | "transit";
  target_geo?: GeoLocation;
  walking_minutes?: number;
  label?: string;
}

interface DecisionCommitment {
  visit_duration_minutes: number;
  steps: CommitmentStep[];
  post_action?: PostAction;
  generated_by: "engine" | "llm";  // provenance for safety stripping
}
```

### Temporal Feasibility

```ts
interface WindowFit {
  travel_out_minutes: number;
  dwell_minutes: number;
  travel_back_minutes: number;
  total_minutes: number;
  fits: boolean;                   // total ≤ time_available_minutes
  margin_minutes?: number;         // slack remaining
}

type TimeWindowBucket = "micro_15" | "short_30" | "half_45" | "hour_60" | "open";
```

### Traveler State

```ts
type TravelerState =
  | "exploring"
  | "waiting"
  | "transitioning"
  | "recovering"
  | "socializing"
  | "solo_confidence"
  | "low_energy"
  | "time_constrained"
  | "arrival_orientation";

interface InferredTravelerState {
  state: TravelerState;
  confidence: number;              // 0–1
  signals_used: string[];          // audit trail for scoring gate
  override?: TravelerState;        // user-corrected value from RefineSheet
}
```

### Dead-Time / Micro-Adventure

```ts
interface DeadTimeContext {
  trigger: "layover" | "gap" | "transit_wait" | "early_arrival" | "explicit";
  available_minutes: number;
  origin_geo?: GeoLocation;        // where the dead time starts (airport gate, station, etc.)
  return_geo?: GeoLocation;        // where they must return to
}

interface MicroAdventureStop {
  decision: HadeDecision;
  commitment?: DecisionCommitment;
  fits: WindowFit;
  stop_index: number;
}

interface MicroAdventure {
  stops: MicroAdventureStop[];
  total_walking_minutes: number;
  total_dwell_minutes: number;
  total_duration_minutes: number;
  fits_budget: boolean;
}
```

### Source Type Fix

```ts
type DecisionSource =
  | "llm"
  | "synthetic"
  | "static_fallback"
  | "cold_start_synthetic"
  | "offline_cache";
```

---

## 5. Backend Mapping Requirements

The engine pipeline must be extended in this order to avoid introducing dependencies before their inputs exist:

### Step 1 — Traveler State Inference (new: `src/lib/hade/travelerState.ts`)
- Input: `HadeContext` (time_of_day, day_type, energy, urgency, signals, voice keywords)
- Output: `InferredTravelerState`
- Runs before candidate sourcing so state can influence radius and scoring
- Initially: log only, no scoring effect (Phase 2 activation gate)

### Step 2 — Window Bucketing (new: `src/lib/hade/reachability.ts`)
- Input: `HadeConstraints.time_available_minutes` + `DeadTimeContext`
- Output: `TimeWindowBucket`, reachability radius (meters)
- Formula: `reachable_radius = (time_available_minutes / 2 - visit_duration_estimate) * 80` (using existing 80 m/min constant)
- Bucket thresholds: ≤17 min → `micro_15`, ≤32 → `short_30`, ≤47 → `half_45`, ≤65 → `hour_60`, else `open`
- Consumed by: Places candidate query (replaces static `RADIUS.SEARCH_DEFAULT = 800`)

### Step 3 — Reachability-Aware Candidate Sourcing (`src/app/api/hade/decide/route.ts`)
- Replace static radius with reachability output
- Cap at `RADIUS.MAX` (add to `src/core/constants/radius.ts`) to prevent Places quota explosion
- Pass `window_bucket` in `DecideRequest` echo for debug/analytics

### Step 4 — State-Aware Scoring (`src/lib/hade/engine.ts:scoreOpportunity`)
- Add optional `travelerState` param to `scoreOpportunity()`
- Weight adjustments (Phase 4+, behind activation gate):
  - `recovering` / `low_energy` → collapse proximity weight, penalize high-energy venues
  - `time_constrained` → boost proximity weight 0.4 → 0.55
  - `exploring` → boost intent diversity, widen radius
- Default weights unchanged when state absent

### Step 5 — Commitment Assembly (`src/lib/hade/engine.ts`)
- New function: `generateCommitment(decision, context): DecisionCommitment`
- Deterministic templates per domain (dining / social / travel) keyed off `intent` + `visit_duration_minutes`
- LLM can override steps if in JSON mode — validated and stripped by `extractSafeCopyPatch()` (requires whitelist extension per Risk D7)
- Fallback: synthetic template always available (no LLM dependency for floor)

### Step 6 — WindowFit Calculation (`src/app/api/hade/decide/route.ts`)
- Compute `fits_in_window` after commitment assembly (visit duration now known)
- Formula: `travel_out + dwell + travel_back ≤ time_available_minutes`
- Attach to `HadeDecision.fits_in_window`

### Step 7 — Multi-Stop Sequencer (`src/lib/hade/engine.ts`)
- New function: `sequenceStops(candidates, context, budget): MicroAdventureStop[]`
- Chain 2–3 stops within reachability budget
- Reuse `fallbackSelection.ts` surfaced-history to avoid stale chains
- Validation: `sum(stop.fits.total_duration_minutes) ≤ time_available_minutes`
- Attach to `DecideResponse.itinerary`

### Step 8 — Validation Extension (`src/app/api/hade/decide/validateDecision.ts`)
- Add tolerant assertion for `commitment` shape (strip on parse failure, never throw)
- Add `fits_in_window` budget invariant check: `total ≤ time_available_minutes` when both present
- Extend `extractSafeCopyPatch()` whitelist: add `commitment`, `window_label`, `fits_in_window`
- Source union: accept all 5 `DecisionSource` values

---

## 6. Frontend Rendering Requirements

### New Card Slots (HeroDecisionCard)

**Inline commitment preview** — below `primarySupport` render (~line 118 of `HeroDecisionCard.tsx`):
- Renders first 1–2 commitment steps as a micro-list when `decision.commitment` present
- Shows `window_label` chip: "Fits your 30-minute window" (green) or "Tight fit" (amber)
- Hidden when `commitment` absent — no layout shift

**Fits-in-window chip** — adjacent to ETA chip:
- `fits_in_window.fits === true` → "30 min total" (green)
- `fits_in_window.fits === false` → "~35 min (over budget)" (amber)

### New Sheets

**`CommitmentSheet.tsx`** (new) — opened from `PrimaryAction.tsx` on tap:
- Header: venue name + visit duration
- Ordered step list with cue icons (order / sit / photo / chat / walk)
- Post-action footer: "Then walk to [next stop]" or "Then head home"
- Haptic confirm pattern on CTA

**`MicroAdventureSheet.tsx`** (new) — opened from new "Adventure mode" chip:
- Card-per-stop layout reusing `HeroDecisionCard` component
- Total time header: "45-min loop"
- Walking legs between stops (minutes + direction label)
- "Start adventure" CTA locks the itinerary

### State Pill (ContextSignalBadge)

**New variant** — `traveler_state` pill rendered when `inferred_traveler_state.confidence ≥ 0.65`:
- Label: "Sensing: low energy" / "Arrival mode" / "Time-constrained"
- Tap opens `RefineSheet` correction control (override field)
- Hidden below confidence threshold — erring on the side of silence over wrong labels

### Time Budget Input (DecisionScreen)

**New chip row** — "I have 15 min / 30 min / 45 min / 1 hour":
- Writes to `HadeConstraints.time_available_minutes` in context
- Triggers re-decide with updated budget
- Also accessible via voice: "I have half an hour" (existing `parseTimeMinutes()` handles parsing)

### CTA Resolution

Current divergence: `PrimaryAction.tsx` renders "Take me there" while `DecisionScreen.tsx:1056` renders "Navigate". Resolve to single source before CommitmentSheet mount — both need the same tap handler.

---

## 7. Test Requirements

### Type-Layer Tests

- `DecisionSource` exhaustiveness: switch on all 5 values, TypeScript fails if route adds a 6th without updating the union
- `TravelerState` exhaustiveness: same pattern in scoring hook
- `WindowFit.fits` invariant: `total = travel_out + dwell + travel_back` (unit test, no mocking)
- `TimeWindowBucket` derivation: ≤17 → `micro_15`, 18–32 → `short_30`, 33–47 → `half_45`, 48–65 → `hour_60`, >65 → `open`

### Schema Invariant Tests (`validateDecision.ts`)

- `assertDecisionValid` rejects: missing `id`, `confidence > 1`, zero copy fields, mismatched provenance
- `assertDecisionValid` accepts: `commitment` absent (optional), `fits_in_window` absent (optional)
- `extractSafeCopyPatch` strips: any field not in whitelist (including new fields until explicitly added)
- `extractSafeCopyPatch` accepts: `commitment` after whitelist extension
- Budget invariant: `fits_in_window.total > time_available_minutes` → logs warning, does not throw

### Engine Behavior Tests (`engine.ts`)

- `scoreOpportunity` with `low_energy` state: proximity weight ≥ 0.55 vs baseline 0.4
- `scoreOpportunity` without state: returns baseline weights (no regression)
- `generateCommitment` for `intent: "eat"`, `visit_duration_minutes: 45`: steps include "order", "sit"
- `generateCommitment` for `intent: "chill"`, `visit_duration_minutes: 20`: no "photo" cue
- `sequenceStops` 3-stop chain: total duration ≤ budget
- `sequenceStops` deduplicates: no stop appears in both chain and `rejection_history`

### Contract Round-Trip Tests

- `DecideRequest` serializes and deserializes with all new optional fields present
- `DecideResponse` with `itinerary` round-trips through JSON without loss
- `InferredTravelerState.signals_used` survives serialization (string array)
- `HadeDecision` with `commitment.steps` round-trips; `generated_by` preserved

### Migration Safety Tests

- Route emits `"cold_start_synthetic"` → `DecideResponse.source` accepts it (typed union now includes it)
- Route emits `"offline_cache"` → same
- Old `DecideResponse` without `itinerary` → consumers don't crash (optional field)
- Old `HadeDecision` without `commitment` → `CommitmentSheet` renders nothing, no throw

---

## 8. Exact Files to Update

### Type Files (3)

| File | Change |
|---|---|
| `src/types/hade.ts` | Add `CommitmentStep`, `PostAction`, `DecisionCommitment`, `WindowFit`, `TimeWindowBucket`, `TravelerState`, `InferredTravelerState`, `DeadTimeContext`, `MicroAdventureStop`, `MicroAdventure`, `DecisionSource`; extend `HadeConstraints`, `HadeContext`, `HadeDecision`, `DecideResponse` |
| `src/core/types/decision.ts` | No change required — `DecisionCandidate` is internal-only and not affected |
| `domain/spontaneous-object/spontaneousObject.ts` | Phase 6 only: rename `source` → `venue_source` to resolve D2 collision |

### Validation File (1)

| File | Change |
|---|---|
| `src/app/api/hade/decide/validateDecision.ts` | Extend `extractSafeCopyPatch` whitelist; add budget invariant check; accept all 5 `DecisionSource` values in `assertDecisionValid` |

### Engine / Route Files (4)

| File | Change |
|---|---|
| `src/lib/hade/engine.ts` | Add `generateCommitment()`, `sequenceStops()`; extend `scoreOpportunity()` with optional `travelerState` param |
| `src/app/api/hade/decide/route.ts` | Invoke reachability, commitment, state inference; replace static radius; cap at `RADIUS.MAX`; populate `itinerary` |
| `src/lib/hade/prompt.ts` | Extend `buildDecisionPrompt` to optionally request `commitment` in structured JSON mode; tolerant fallback |
| `src/core/constants/radius.ts` | Add `RADIUS.MAX` ceiling for time-scaled search |

### New Modules (5)

| File | Purpose |
|---|---|
| `src/lib/hade/travelerState.ts` | `inferTravelerState()` — signal-based state inference |
| `src/lib/hade/reachability.ts` | `timeToRadius()`, `bucketWindow()`, `computeWindowFit()` |
| `src/app/api/hade/state/route.ts` | Correction telemetry endpoint (mirrors `signal/route.ts`) |
| `src/components/hade/mobile/CommitmentSheet.tsx` | Commitment step renderer, post-action footer |
| `src/components/hade/mobile/MicroAdventureSheet.tsx` | Multi-stop itinerary view |

### Frontend Files (8)

| File | Change |
|---|---|
| `src/components/hade/mobile/HeroDecisionCard.tsx` | Add commitment preview slot (~line 118); add `fits_in_window` chip |
| `src/components/hade/mobile/DecisionScreen.tsx` | Add time-budget chip row; open `MicroAdventureSheet`; resolve CTA divergence |
| `src/components/hade/mobile/PrimaryAction.tsx` | Open `CommitmentSheet` on tap; resolve "Navigate" vs "Take me there" divergence |
| `src/components/hade/mobile/RefineSheet.tsx` | Add traveler-state correction control |
| `src/components/hade/adaptive/ContextSignalBadge.tsx` | Add `traveler_state` pill variant |
| `src/components/hade/mobile/OtherModesPanel.tsx` | Add dead-time preset chips ("15 min gap", "30 min layover", etc.) |
| `src/components/hade/mobile/ActivityCreationView.tsx` | Add duration input alongside start time |
| `src/lib/hade/useHade.ts` | Surface `itinerary`, `inferred_traveler_state`, `fits_in_window` from response |

### Test Files (5)

| File | Change |
|---|---|
| `src/lib/hade/__tests__/decision.behavior.test.ts` | Add commitment shape invariants, budget invariant |
| `src/lib/hade/__tests__/voiceIntentParser.test.ts` | Add state keyword extraction tests |
| `src/lib/hade/__tests__/reachability.test.ts` | New: window bucket derivation, WindowFit calculation |
| `src/lib/hade/__tests__/travelerState.test.ts` | New: state inference from signal combinations |
| `src/app/api/hade/decide/__tests__/validateDecision.test.ts` | Extend: source union, whitelist, budget invariant |

---

## 9. Safe Rollout Plan

### Phase 0 — Type Scaffolding Only (no runtime change)
**Goal:** Land all new TypeScript types. Zero behavior change.
**Steps:**
1. Add all new interfaces and unions to `src/types/hade.ts` (all optional)
2. Add `DecisionSource` typed union; update `DecideResponse.source`
3. Add TSDoc comments to the four copy fields (D3 disambiguation)
4. Document 8-axis concept model in header comment in `engine.ts`: Mode / Lens / Preset / Scenario / Intent / HadeState / TravelerState / WindowBucket
5. Add type-layer tests: exhaustiveness checks, `WindowFit` arithmetic invariant
6. **Ship.** No UI change. No runtime change.

**Risk:** None. All new fields optional; existing consumers unaffected.

---

### Phase 1 — Synthetic Engine Floor
**Goal:** Synthetic engine emits minimal values for all new fields. Validator extended.
**Steps:**
1. Implement `src/lib/hade/reachability.ts`: `timeToRadius()`, `bucketWindow()`, `computeWindowFit()`
2. Extend `src/core/engine/synthetic.ts` to emit:
   - `commitment`: deterministic template based on intent (e.g., `eat` → order/sit steps)
   - `fits_in_window`: computed from travel + 30-min default dwell
3. Extend `extractSafeCopyPatch()` whitelist: add `commitment`, `window_label`, `fits_in_window`
4. Extend `assertDecisionValid`: accept all 5 `DecisionSource` values; add budget invariant warning (non-throwing)
5. Add `RADIUS.MAX` to `src/core/constants/radius.ts`
6. **Ship.** Synthetic path now has a floor for all new fields.

**Risk:** Synthetic floor bypasses LLM. If synthetic template is wrong for a given intent, it surfaces in UI before Phase 3 UI renders it. Mitigation: commitment is not rendered until Phase 3.

---

### Phase 2 — Inference Behind Feature Flag
**Goal:** `inferTravelerState()` runs in production, logging only (no scoring effect, no UI).
**Steps:**
1. Implement `src/lib/hade/travelerState.ts`: `inferTravelerState(signals, context): InferredTravelerState`
2. Wire into `src/app/api/hade/decide/route.ts`: run inference, attach to `DecideResponse.inferred_traveler_state`
3. Log inference output to analytics (state + confidence + signals_used) — do not send to client unless `HADE_TRAVELER_STATE_UI=true` env flag
4. Implement `src/app/api/hade/state/route.ts`: correction telemetry endpoint
5. Add `src/lib/hade/__tests__/travelerState.test.ts`
6. **Ship.** Collect accuracy baseline on real traffic before UI activation.

**Activation gate:** Promote to Phase 4 only when accuracy ≥ 70% on ≥ 100 logged samples.

---

### Phase 3 — Frontend Render Slots
**Goal:** UI renders new fields when present; gracefully hides when absent.
**Steps:**
1. Add commitment preview slot to `HeroDecisionCard.tsx` (hidden when `commitment` absent)
2. Add `fits_in_window` chip to hero card (hidden when absent)
3. Add time-budget chip row to `DecisionScreen.tsx`; wire to `HadeConstraints.time_available_minutes`
4. Build `CommitmentSheet.tsx`; mount from `PrimaryAction.tsx`
5. Resolve CTA divergence: `PrimaryAction.tsx` ("Take me there") vs `DecisionScreen.tsx:1056` ("Navigate")
6. Extend `useHade.ts` to surface new response fields
7. **Ship.** Commitment renders for synthetic-floor decisions. LLM commitment not yet activated.

---

### Phase 4 — Activate Scoring and State UI
**Goal:** Traveler state influences scoring; UI pill rendered when confidence ≥ 0.65.
**Prerequisite:** Phase 2 accuracy gate passed.
**Steps:**
1. Extend `scoreOpportunity()` in `engine.ts`: add optional `travelerState` param, apply weight adjustments
2. Wire traveler state into route scoring call
3. Add `traveler_state` pill variant to `ContextSignalBadge.tsx`
4. Add state correction control to `RefineSheet.tsx`
5. Set `HADE_TRAVELER_STATE_UI=true`
6. **Ship.** Monitor for trust erosion (wrong pill → correction rate). Rollback: unset env flag.

---

### Phase 5 — Multi-Stop Micro-Adventures
**Goal:** Dead-time scenario produces chained itinerary.
**Prerequisite:** Phases 1, 2, 3 complete.
**Steps:**
1. Implement `sequenceStops()` in `engine.ts`: 2–3 stops within reachability budget; reuse `fallbackSelection.ts` surfaced-history
2. Populate `DecideResponse.itinerary` from route handler when `window_bucket` ≠ `open`
3. Build `MicroAdventureSheet.tsx`; mount from `DecisionScreen.tsx`
4. Add dead-time preset chips to `OtherModesPanel.tsx` ("15 min gap", "30 min layover", "45 min loop", "1-hour local")
5. Extend `src/lib/hade/scenarios.ts` with `layover_15`, `gap_30`, `loop_45`, `local_60` scenarios
6. **Ship.** Initial cap: 2 stops max. Expand to 3 after observing completion rate.

---

### Phase 6 — Type Cleanup (Breaking Change, Version-Gated)
**Goal:** Resolve field name collisions introduced in earlier phases.
**Steps:**
1. Rename `SpontaneousObject.source` → `venue_source` in `domain/spontaneous-object/spontaneousObject.ts`
2. Update all consumers (grep for `.source` on `SpontaneousObject`-typed objects)
3. Ship with semver bump (minor or major depending on consumer spread)
4. Remove any `(string & {})` escape hatches from `Intent` if adoption of `isKnownIntent()` guard is confirmed

**Risk:** Only breaking change in the plan. Gate behind a codemod or deprecation warning cycle.

---

## Implementation Priority

| Phase | Effort | Visible Payoff | Risk |
|---|---|---|---|
| 0 — Type scaffolding | Low | None (internal) | None |
| 1 — Synthetic floor | Medium | Enables Phase 3 | Low |
| 3 — Frontend render slots | Medium | High (commitment UI) | Low |
| 2 — Inference (logging) | Medium | None visible yet | Low |
| 4 — State scoring + UI | Medium | Medium (traveler pill) | Medium |
| 5 — Multi-stop | High | High (micro-adventure) | Medium |
| 6 — Type cleanup | Low | None visible | Medium (breaking) |

**Recommended order:** 0 → 1 → 3 → 2 → 4 → 5 → 6

The synthetic floor (Phase 1) must precede the UI (Phase 3) to guarantee no empty hero card. The inference logging (Phase 2) must precede the UI pill (Phase 4) to guarantee accuracy before user trust is at stake.

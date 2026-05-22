# HADE Micro-Adventure / Dead-Time Engine — Audit & Implementation Plan

**Scope:** HADE Component System (`/src`), read-only audit. No code changes.
**Audit date:** 2026-05-22
**Auditor:** Strategic AI Audit

---

## 1) Current Dead-Time Support Level

**Verdict: Field-level scaffolding exists. Zero behavior-level support.**

### What's Present

| Capability | Present? | Where |
|---|---|---|
| `time_available_minutes` field on `HadeConstraints` | ✅ | [src/types/hade.ts:120](src/types/hade.ts) |
| `distance_tolerance` field (walking/short_drive/any) | ✅ | [src/types/hade.ts:121](src/types/hade.ts) |
| `urgency` field (low/medium/high) | ✅ | [src/types/hade.ts:95](src/types/hade.ts) |
| Voice parser extracts "30 min", "half hour", "an hour" | ✅ | [voiceIntentParser.ts:44–49](src/lib/hade/voiceIntentParser.ts) |
| Voice parser auto-bumps urgency to "high" when ≤20 min | ✅ | [voiceIntentParser.ts:89](src/lib/hade/voiceIntentParser.ts) |
| `time_available_minutes` flows into LLM system prompt | ✅ | [prompt.ts:127–128](src/lib/hade/prompt.ts) |
| `time_available_minutes` appears in situation summary copy | ✅ | [engine.ts:270–272](src/lib/hade/engine.ts) ("2-hour window") |

### What's Absent

| Capability | Present? | Evidence |
|---|---|---|
| `time_available_minutes` ever scales search radius | ❌ | No call site mutates `radius_meters` from time budget |
| `distance_tolerance` filters or shrinks candidates | ❌ | Informational only — flows into LLM prompt and summary only |
| `urgency` affects scoring weights | ❌ | Used only in copy ([deriveReasons.ts:105–107](src/lib/hade/deriveReasons.ts), [supportText.ts](src/lib/hade/supportText.ts)) |
| Time-budget term in synthetic scoring | ❌ | `scoreSpontaneousCandidate()` ([synthetic.ts:748–813](src/core/engine/synthetic.ts)) has no time-budget term |
| UI control for "I have N minutes" | ❌ | RefineSheet collects intent+urgency only; no time chip |
| Response shape supports multi-stop / sequence | ❌ | `DecideResponse.decision` is single `HadeDecision`. Comment at [src/types/hade.ts:246](src/types/hade.ts): *"No fallbacks. No primary+secondary. One decision."* |
| Concepts: itinerary / next_stop / loop / micro / layover / deadtime | ❌ | grep src/ → 0 matches |
| Navigation passes duration / return time | ❌ | [navigation.ts](src/lib/hade/navigation.ts) ships coords + label only |
| Scenarios for time windows | ❌ | Only `exploration`, `quick`, `social` ([scenarios.ts](src/lib/hade/scenarios.ts)) |
| Presets for time windows | ❌ | Only `balanced`, `spontaneous`, `chill`, `social`, `focused` ([presets.ts](src/lib/hade/presets.ts)) |

### Answers to Key Questions

1. **Does HADE currently know how much time the user has?** Only when extracted from voice. No tap-to-set affordance. Default = `undefined`.
2. **Does the UX allow the user to quickly provide time available?** No. Only via voice ("I have 30 minutes"). Tap UI is missing.
3. **Does the backend rank differently based on time window?** No. The field flows into the prompt as descriptive context; it does not affect radius, candidate budget, or score.
4. **Does the decision card explain why the option fits the time window?** Only as an inherited LLM rationale string — no structured `fits_in_window` proof.
5. **Does navigation account for return time or walking radius?** No. Maps handoff is one-way; no return clock.
6. **Is there any concept of a sequence, loop, or mini-plan?** No. Single decision per call. Zero matches in src/ for sequence/itinerary/loop/chain/multi_stop.

---

## 2) Missing Data Model Fields

Add to [src/types/hade.ts](src/types/hade.ts) and mirror to [src/core/types/decision.ts](src/core/types/decision.ts) and [validateDecision.ts](src/app/api/hade/decide/validateDecision.ts). All new fields **optional** to preserve cold-start fallback contract from commit `85a9617`.

### On `HadeConstraints` (around line 118–122)

```ts
time_available_minutes?: number;   // already exists — duration
time_window_end_ms?: number;       // NEW — absolute deadline (e.g. dinner reservation at 19:30)
return_to_origin?: boolean;        // NEW — round-trip vs one-way (default true for dead-time)
```

### On `HadeDecision` (around line 251)

```ts
fits_in_window?: {
  travel_out_min: number;          // walking time to venue
  dwell_min: number;               // recommended time at venue
  travel_back_min: number;         // walking time back to origin (0 if !return_to_origin)
  total_min: number;               // travel_out + dwell + travel_back
  buffer_min: number;              // time_available - total (must be ≥ 0)
};
```

### On `DecideResponse` (around line 310)

```ts
micro_adventure?: MicroAdventure;  // when ≥2 stops within budget — see Section 3
```

### New top-level types

```ts
export type TimeWindowBucket =
  | "lightning"       // 10–15 min
  | "quick_break"     // 20–30 min
  | "short_loop"      // 45 min
  | "extended"        // 60–90 min
  | "open_window";    // 90+ min (no real constraint)

export type DeadTimeContext =
  | "before_checkin"
  | "before_dinner"
  | "during_layover"
  | "between_meetings"
  | "waiting_for_transit"
  | "low_energy_evening"
  | "generic";
```

### On `HadeContext` (around line 175)

```ts
window_bucket?: TimeWindowBucket;
dead_time_context?: DeadTimeContext;
```

---

## 3) Proposed `MicroAdventure` Type / Interface

```ts
// New file: src/types/microAdventure.ts (re-export from src/types/hade.ts)

export interface MicroAdventureStop {
  order: number;                        // 1, 2, 3...
  venue: HadeDecision;                  // reuse full decision shape per stop
  dwell_min: number;                    // recommended time at this stop
  cues: Array<                          // light commitment hints
    | "order_quick"
    | "stay_outside"
    | "grab_to_go"
    | "snap_photo"
    | "people_watch"
    | "sit_inside"
  >;
  transition_to_next_min?: number;      // walk time to next stop (undefined on last)
}

export interface MicroAdventure {
  id: string;                           // session-stable
  bucket: TimeWindowBucket;
  context: DeadTimeContext;
  stops: MicroAdventureStop[];          // 1–3 stops
  total_walking_min: number;
  total_dwell_min: number;
  total_min: number;
  buffer_min: number;                   // headroom against budget
  return_path: {
    distance_m: number;
    walking_min: number;
    target_geo: GeoLocation;            // origin (or supplied return target)
  } | null;                             // null when !return_to_origin
  is_loop: boolean;                     // true when last stop returns toward origin
  rationale: string;                    // why this chain fits the moment
  fallback_reason?: string;             // when forced to single-stop within multi-stop bucket
}
```

### Design Invariants

- `stops.length >= 1` always. A "micro-adventure" of 1 stop is the canonical single-decision case wrapped uniformly.
- `sum(stops[].dwell_min) + total_walking_min ≤ time_available_minutes` — hard invariant; enforced in [validateDecision.ts](src/app/api/hade/decide/validateDecision.ts).
- `buffer_min = time_available_minutes - total_min` must be ≥ a per-bucket safety margin (see Section 5).
- `is_loop = true` requires haversine(last_stop, origin) ≤ 1.5× max(haversine(any stop, origin)) — prevents pseudo-loops with long return legs.

---

## 4) Recommended Time-Window Buckets

| Bucket | Range | Default Radius | Stops | Cue Profile | Typical Context |
|---|---|---|---|---|---|
| `lightning` | 10–15 min | **350m** (≈4 min walk one-way; full round trip ≤8 min, dwell ≤7 min) | 1 | grab-and-go, no sit-down | waiting_for_transit, before_checkin |
| `quick_break` | 20–30 min | **600m** | 1 | sit briefly, single beverage/snack | between_meetings, before_dinner |
| `short_loop` | 45 min | **900m** | 1–2 | one substantive stop OR two light stops + walk loop | low_energy_evening, before_dinner |
| `extended` | 60–90 min | **1500m** | 2–3 | proper meal OR scenic walk + stop, photo-worthy | during_layover, generic |
| `open_window` | 90+ min | **2500m** (current default) | 1 (current behavior) | no special bucket — full HADE behavior | (passthrough) |

### Radius Derivation

Time-scaled radius (walking-only buckets): `max_radius_m = floor(time_available_min × 80 / 4)` where the `/4` reserves time-budget for: walk-out, dwell, walk-back, safety buffer. The 80 m/min constant is already in [synthetic.ts:1248](src/core/engine/synthetic.ts) as the walk speed used to compute `eta_minutes`. Cap by `RADIUS.SEARCH_DEFAULT * 3` (=2400m) to prevent extended-bucket explosion against Places quota.

### Safety Margins

| Bucket | Required buffer |
|---|---|
| `lightning` | ≥ 2 min |
| `quick_break` | ≥ 3 min |
| `short_loop` | ≥ 5 min |
| `extended` | ≥ 8 min |

---

## 5) Recommended Ranking Logic

### Step 1: Bucket Resolution

```ts
function resolveBucket(ctx: HadeContext): TimeWindowBucket | null {
  const mins = ctx.constraints.time_available_minutes;
  if (mins == null) return null;
  if (mins <= 15) return "lightning";
  if (mins <= 30) return "quick_break";
  if (mins <= 45) return "short_loop";
  if (mins <= 90) return "extended";
  return "open_window";
}
```

### Step 2: Reachability Filter (new util: `src/lib/hade/reachability.ts`)

```ts
function isReachable(opp: Opportunity, budget: number, returnTrip: boolean): boolean {
  const oneWayMin = opp.distance_meters / 80;
  const minDwell = 5;
  const required = returnTrip ? oneWayMin * 2 + minDwell : oneWayMin + minDwell;
  return required <= budget;
}
```

Applied **before** scoring, so unreachable candidates never enter the LLM context window.

### Step 3: Bucket-Specific Weight Deltas

Applied in `scoreOpportunity()` ([engine.ts:317–350](src/lib/hade/engine.ts)) after baseline weights.

| Bucket | Proximity Δ | Signal Δ | Intent Δ | Category Bias |
|---|---|---|---|---|
| `lightning` | **+0.25** | -0.10 | -0.05 | prefer `cafe`, `convenience`, `kiosk`, `bakery`, `food_truck` |
| `quick_break` | +0.15 | -0.05 | -0.05 | prefer `cafe`, `bar` (single drink), `bench`, `park` |
| `short_loop` | +0.05 | 0 | 0 | balanced; allow scenic/sit-down |
| `extended` | -0.05 | +0.05 | 0 | allow `restaurant`, `museum_small`, `viewpoint` |
| `open_window` | 0 | 0 | 0 | no change |

Renormalise to sum = 1.0 after applying deltas (`normaliseWeights()` utility).

### Step 4: Multi-Stop Sequencer (for `short_loop` and `extended`)

```ts
function sequenceStops(
  candidates: Opportunity[],
  ctx: HadeContext,
  bucket: TimeWindowBucket,
  origin: GeoLocation,
): MicroAdventureStop[] {
  const budget = ctx.constraints.time_available_minutes!;
  const targetStops = bucket === "extended" ? 2 : (bucket === "short_loop" ? 2 : 1);
  const minBufferMin = SAFETY_MARGIN[bucket];

  // Greedy: anchor strongest-scoring candidate; chain the next-best within remaining budget
  // that lies along a loop trajectory back to origin.
  // For each additional stop:
  //   remaining_budget -= dwell + walk_from_previous
  //   require remaining_budget >= return_to_origin_walk + minBufferMin
  // Reject chains that exceed the loop deviation threshold.
}
```

### Step 5: Dead-Time Context Modifier

When `dead_time_context` is set, layer a context-specific bias on top of bucket bias:

| Context | Additional Bias |
|---|---|
| `before_checkin` | filter out alcohol-heavy venues; prefer luggage-friendly |
| `before_dinner` | filter out heavy food; favor `bar`, `cafe`, `park` |
| `during_layover` | filter out venues requiring reservation; prefer airport-adjacent if known |
| `between_meetings` | prefer quiet (signal: `vibe_calm`); penalise loud/social |
| `waiting_for_transit` | hard-cap radius at 400m regardless of bucket; prefer `coffee`, `news_stand` |
| `low_energy_evening` | apply `recovering`/`low_energy` traveler state weights (no nightclub/bar) |

---

## 6) Recommended UI Additions

### A. Time-Budget Chip on `DecisionScreen` (entry point)

Render above the hero card when `time_available_minutes == null`:

```
[Got somewhere to be?]
  [15 min] [30 min] [45 min] [1 hr] [1.5 hr]   [Edit]
```

- Tapping a chip sets `time_available_minutes` and re-runs `decide()`.
- "Edit" opens a sheet with finer granularity + dead-time context selector.
- Once set, chip collapses to inline pill: `"30 min · Tap to change"`.

### B. New `WindowEntrySheet.tsx`

Opens from time pill. Fields:
- Time budget slider (5–180 min)
- Dead-time context selector (6 options + `generic`)
- Return-to-origin toggle (default ON for dead-time, OFF for full-evening)

### C. Extend `RefineSheet.tsx`

Add third row below intent + urgency:
- Label: `"How long do you have?"`
- Chips: `["10 min", "30 min", "1 hr", "Open"]`
- Selection updates `time_available_minutes` and re-runs.

### D. Extend `ActivityCreationView.tsx`

Currently captures **start time** only. Add duration input alongside start time:
- `[Duration: 30 min ▾]` selector beside start time picker
- Maps to `time_available_minutes` when used as decide-input rather than UGC-create.

### E. Extend `OtherModesPanel.tsx`

Add a "Quick window" row beneath the existing domain mode rows:
- `[Lightning]` `[Quick break]` `[Loop]` `[Long]`
- One-tap sets bucket explicitly, overriding inference.

### F. Hero Card Additions (`HeroDecisionCard.tsx`)

Below the meta chips (around line 240), insert a `WindowProof` slot:

```
[ Fits your 30 min ]
  4 min walk · 22 min there · 4 min back   ✓ 0 buffer min
```

When `fits_in_window.buffer_min < 0`, show `[Over budget: needs 35 min]` in warning style and demote the card.

### G. New `MicroAdventureSheet.tsx`

Opens when `decision.micro_adventure.stops.length ≥ 2`. Stacked vertical list of stops:

```
1. [HeroDecisionCard for stop 1] · dwell 12 min
   ↓ 6 min walk
2. [HeroDecisionCard for stop 2] · dwell 10 min
   ↓ 5 min walk back

Total: 33 min · 2 min buffer
```

Per-stop swipe-to-replace. CTA: `"Start the loop"`.

### H. CTA Label Variants

Modify [PrimaryAction.tsx](src/components/hade/mobile/PrimaryAction.tsx) and the hard-coded "Navigate" at [DecisionScreen.tsx:1056](src/components/hade/mobile/DecisionScreen.tsx) based on bucket:

| Bucket | CTA |
|---|---|
| `lightning` | "Grab and go" |
| `quick_break` | "Quick break" |
| `short_loop` | "Start the loop" |
| `extended` | "Take me there" |
| `open_window` | (existing) "Take me there" |

---

## 7) Recommended Fallback Copy

When time budget is set but nothing reachable within bucket constraints, supportText.ts `fallbackSupport()` ([supportText.ts:96–111](src/lib/hade/supportText.ts)) should branch:

### Per-Bucket Fallback Copy

| Bucket | Copy when no reachable venue |
|---|---|
| `lightning` | "Nothing solid within a 4-minute walk. Want to widen the window?" |
| `quick_break` | "Tight window. Best nearby pick — won't be a sit-down." |
| `short_loop` | "No clean loop in 45 min. Best single stop instead." |
| `extended` | "Best place that fits your hour. No second stop made the cut." |

### Per-Context Fallback Copy

| Context | Copy when bucket succeeds |
|---|---|
| `before_checkin` | "Quick stop before check-in — luggage-friendly." |
| `before_dinner` | "Light enough not to spoil dinner." |
| `during_layover` | "Within layover walking range — back in time." |
| `between_meetings` | "Quiet enough to think between meetings." |
| `waiting_for_transit` | "Two minutes from your platform. Back before boarding." |
| `low_energy_evening` | "Low-key — exactly what tonight needs." |

### Per-Bucket Header Chip Variants

Replace "Your move" in [HeroDecisionCard.tsx:169](src/components/hade/mobile/HeroDecisionCard.tsx):

| Bucket | Chip |
|---|---|
| `lightning` | "In and out" |
| `quick_break` | "Quick break" |
| `short_loop` | "Loop pick" |
| `extended` | "Your hour" |
| `open_window` | (existing) "Your move" |

---

## 8) Files To Change

### New Files (5)

| File | Purpose |
|---|---|
| `src/lib/hade/reachability.ts` | `resolveBucket()`, `isReachable()`, `timeBudgetToRadius()`, `normaliseWeights()` |
| `src/lib/hade/microAdventure.ts` | `sequenceStops()`, `composeMicroAdventure()`, loop-deviation checks |
| `src/types/microAdventure.ts` | `MicroAdventure`, `MicroAdventureStop`, `TimeWindowBucket`, `DeadTimeContext` (re-exported from `src/types/hade.ts`) |
| `src/components/hade/mobile/WindowEntrySheet.tsx` | Time-budget + dead-time-context entry sheet |
| `src/components/hade/mobile/MicroAdventureSheet.tsx` | Multi-stop stacked card view |

### Core Types & Validation (3)

| File | Change |
|---|---|
| [src/types/hade.ts](src/types/hade.ts) | Add `time_window_end_ms`, `return_to_origin` to `HadeConstraints`; `fits_in_window` to `HadeDecision`; `micro_adventure` to `DecideResponse`; `window_bucket`, `dead_time_context` to `HadeContext`; export new union types |
| [src/core/types/decision.ts](src/core/types/decision.ts) | Mirror all new types |
| [src/app/api/hade/decide/validateDecision.ts](src/app/api/hade/decide/validateDecision.ts) | Tolerant validator: strip on parse failure; enforce `sum(dwell) + walking ≤ time_available_minutes`; clamp buffer ≥ 0 |

### Engine & API (6)

| File | Change |
|---|---|
| [src/lib/hade/engine.ts](src/lib/hade/engine.ts) | Wire `resolveBucket()` + reachability filter into pipeline; bucket weight deltas in `scoreOpportunity()` (lines 317–350); axis-disambiguation comment block at top |
| [src/app/api/hade/decide/route.ts](src/app/api/hade/decide/route.ts) | Call `resolveBucket(ctx)`; scale radius via `timeBudgetToRadius()` before Places fetch; call `composeMicroAdventure()` after ranking; populate `fits_in_window` and `micro_adventure` |
| [src/core/engine/synthetic.ts](src/core/engine/synthetic.ts) | Accept optional `bucket` parameter in `scoreSpontaneousCandidate()`; emit minimal `fits_in_window` for fallback decisions |
| [src/lib/hade/prompt.ts](src/lib/hade/prompt.ts) | Inject bucket + dead-time-context into system prompt; request structured `fits_in_window` proof from LLM with parser-tolerant fallback |
| [src/lib/hade/supportText.ts](src/lib/hade/supportText.ts) | Bucket-aware support copy (Section 7); per-context copy variants |
| [src/lib/hade/voiceIntentParser.ts](src/lib/hade/voiceIntentParser.ts) | Extend `parseTimeMinutes()` patterns: "before dinner", "during layover", "between meetings", "waiting for the X" → set `dead_time_context` |

### UX Surfaces (8)

| File | Change |
|---|---|
| [src/components/hade/mobile/DecisionScreen.tsx](src/components/hade/mobile/DecisionScreen.tsx) | Time-budget chip row above hero card; bucket-driven CTA label at line 1056; open `WindowEntrySheet` |
| [src/components/hade/mobile/HeroDecisionCard.tsx](src/components/hade/mobile/HeroDecisionCard.tsx) | `WindowProof` slot below meta chips (insert at ~line 240); bucket-driven header chip variant (replacing line 169); over-budget warning state |
| [src/components/hade/mobile/PrimaryAction.tsx](src/components/hade/mobile/PrimaryAction.tsx) | CTA label resolved from bucket (replaces default "Take me there") |
| [src/components/hade/mobile/RefineSheet.tsx](src/components/hade/mobile/RefineSheet.tsx) | Third row: "How long do you have?" chip selector |
| [src/components/hade/mobile/OtherModesPanel.tsx](src/components/hade/mobile/OtherModesPanel.tsx) | "Quick window" row with 4 bucket chips |
| [src/components/hade/mobile/ActivityCreationView.tsx](src/components/hade/mobile/ActivityCreationView.tsx) | Duration input beside start time; routes to bucket inference when used as decide input |
| [src/lib/hade/scenarios.ts](src/lib/hade/scenarios.ts) | New scenarios: `layover_15`, `gap_30`, `loop_45`, `local_60` |
| [src/lib/hade/useHade.ts](src/lib/hade/useHade.ts) | Surface `micro_adventure` and `fits_in_window` on `DecideResponse` to consumers |

### Constants & Adapter (2)

| File | Change |
|---|---|
| [src/core/constants/radius.ts](src/core/constants/radius.ts) | Add `RADIUS.WINDOW_MAX = 2400`; document `RADIUS.SEARCH_DEFAULT` is the open-window default, not the global default |
| [src/core/adapters/placesAdapter.ts](src/core/adapters/placesAdapter.ts) | Accept resolved radius from `timeBudgetToRadius()`; cap at `RADIUS.WINDOW_MAX` |

---

## 9) Tests To Add

### Unit — `src/lib/hade/__tests__/reachability.test.ts` (new)

| ID | Test | Expectation |
|---|---|---|
| R-01 | `resolveBucket({ time_available_minutes: 12 })` | `"lightning"` |
| R-02 | `resolveBucket({ time_available_minutes: 30 })` | `"quick_break"` |
| R-03 | `resolveBucket({ time_available_minutes: 45 })` | `"short_loop"` |
| R-04 | `resolveBucket({ time_available_minutes: 75 })` | `"extended"` |
| R-05 | `resolveBucket({ time_available_minutes: 120 })` | `"open_window"` |
| R-06 | `resolveBucket({})` (undefined) | `null` |
| R-07 | `isReachable(opp@500m, budget=15, returnTrip=true)` | `false` (>15 round-trip + dwell) |
| R-08 | `isReachable(opp@200m, budget=15, returnTrip=true)` | `true` |
| R-09 | `timeBudgetToRadius(30) ≤ RADIUS.WINDOW_MAX` | true |
| R-10 | `timeBudgetToRadius(15)` | ~300m (with 4× divisor) |
| R-11 | `normaliseWeights({p:0.6,s:0.5,i:0.3})` | sum = 1.0 |

### Unit — `src/lib/hade/__tests__/microAdventure.test.ts` (new)

| ID | Test | Expectation |
|---|---|---|
| MA-01 | `composeMicroAdventure(bucket=lightning, candidates)` | `stops.length === 1`, single-stop wrapper |
| MA-02 | `composeMicroAdventure(bucket=extended)` with 5 candidates | `stops.length === 2` or `3` |
| MA-03 | `composeMicroAdventure` total time ≤ time_available | invariant |
| MA-04 | `composeMicroAdventure` buffer ≥ safety margin | invariant per bucket |
| MA-05 | Loop deviation > 1.5× max → not flagged as `is_loop` | `is_loop === false` |
| MA-06 | `return_to_origin=false` | `return_path === null`, total excludes back-leg |
| MA-07 | No candidates reachable → `fallback_reason` set, `stops.length === 0` is forbidden | use bucket-fallback path |

### Unit — `src/lib/hade/__tests__/voiceIntentParser.test.ts` (extend)

| Input | Expected |
|---|---|
| "I have 25 minutes before check-in" | `time_available_minutes=25`, `dead_time_context="before_checkin"` |
| "Got half an hour during my layover" | `time_available_minutes=30`, `dead_time_context="during_layover"` |
| "Waiting for the train, like 10 minutes" | `time_available_minutes=10`, `dead_time_context="waiting_for_transit"`, `urgency="high"` |
| "An hour between meetings" | `time_available_minutes=60`, `dead_time_context="between_meetings"` |
| "Low energy tonight, an hour to kill" | `time_available_minutes=60`, `dead_time_context="low_energy_evening"` |

### Integration — `src/lib/hade/__tests__/decision.behavior.test.ts` (extend)

- Given `time_available_minutes=15` → all candidates returned must satisfy `isReachable(opp, 15, returnTrip=true)`.
- Given `bucket=lightning` → no candidate with category `restaurant` (sit-down) ranks top-1.
- Given `bucket=extended` + 5 reachable candidates → `decide()` returns `micro_adventure.stops.length ≥ 2`.
- Given `time_available_minutes=30` but only one venue at 1200m available → return single-stop with `fallback_reason` populated.
- Given `dead_time_context="before_checkin"` → winning venue does not have alcohol primary category.
- Given `dead_time_context="waiting_for_transit"` → radius hard-capped at 400m regardless of bucket.

### Validation — `src/app/api/hade/decide/__tests__/validateDecision.test.ts` (extend)

- `fits_in_window.total_min > time_available_minutes` → validator strips `fits_in_window`.
- `micro_adventure` with `stops[0].dwell_min` negative → strip entire `micro_adventure`.
- `buffer_min < 0` → strip `fits_in_window` (don't propagate impossible promise).
- Unknown bucket value → strip; decision still valid.

### Cold-Start Tolerance

- LLM returns no `fits_in_window` → response still valid (optional field).
- Synthetic engine emits a minimal `fits_in_window` for fallback decisions.
- `composeMicroAdventure()` with 0 candidates → throws no exception; returns `null` micro_adventure; single-decision path still works.

---

## 10) Implementation Roadmap

### Phase 0 — Type Scaffolding (Zero Risk)
**Duration: 1 day**

- [ ] Add `TimeWindowBucket`, `DeadTimeContext`, `MicroAdventure`, `MicroAdventureStop`, `fits_in_window` to [src/types/hade.ts](src/types/hade.ts)
- [ ] Add `time_window_end_ms`, `return_to_origin` to `HadeConstraints`
- [ ] Mirror to [src/core/types/decision.ts](src/core/types/decision.ts)
- [ ] Tolerant validators in [validateDecision.ts](src/app/api/hade/decide/validateDecision.ts) — strip on parse failure
- [ ] Add 7-axis disambiguation comment block to top of [engine.ts](src/lib/hade/engine.ts) (Mode / Lens / Preset / Scenario / Intent / HadeState / WindowBucket)
- [ ] **Ship.** No UI change. No scoring change.

---

### Phase 1 — Reachability & Bucket Resolution (Backend Only)
**Duration: 2–3 days**

- [ ] Create `src/lib/hade/reachability.ts` with `resolveBucket()`, `isReachable()`, `timeBudgetToRadius()`, `normaliseWeights()`
- [ ] Wire into [src/app/api/hade/decide/route.ts](src/app/api/hade/decide/route.ts): bucket-aware radius before Places fetch
- [ ] Wire reachability filter into [src/lib/hade/engine.ts:rankOpportunities](src/lib/hade/engine.ts)
- [ ] Populate `fits_in_window` on each `HadeDecision`
- [ ] Add `RADIUS.WINDOW_MAX = 2400` to [src/core/constants/radius.ts](src/core/constants/radius.ts)
- [ ] Add reachability test file (R-01 through R-11)
- [ ] **Ship. Existing UX unchanged when no time budget set.**

---

### Phase 2 — Voice Context Extensions
**Duration: 1 day**

- [ ] Extend [voiceIntentParser.ts](src/lib/hade/voiceIntentParser.ts) with dead-time context patterns
- [ ] Return `dead_time_context` in `VoiceIntent`
- [ ] Add 5 voice parser tests
- [ ] **Ship. Voice-first users get context-aware ranking.**

---

### Phase 3 — UI Entry & Window Proof
**Duration: 4–5 days**

- [ ] Build `src/components/hade/mobile/WindowEntrySheet.tsx`
- [ ] Add time-budget chip row to [DecisionScreen.tsx](src/components/hade/mobile/DecisionScreen.tsx)
- [ ] Add "How long do you have?" row to [RefineSheet.tsx](src/components/hade/mobile/RefineSheet.tsx)
- [ ] Add `WindowProof` slot to [HeroDecisionCard.tsx](src/components/hade/mobile/HeroDecisionCard.tsx) (renders `fits_in_window`)
- [ ] Bucket-driven header chip + CTA label variants
- [ ] Extend [ActivityCreationView.tsx](src/components/hade/mobile/ActivityCreationView.tsx) with duration input
- [ ] Add "Quick window" row to [OtherModesPanel.tsx](src/components/hade/mobile/OtherModesPanel.tsx)
- [ ] **Ship. Single-stop dead-time engine end-to-end.**

---

### Phase 4 — Bucket Scoring Activation
**Duration: 2 days**

- [ ] Apply bucket weight deltas in `scoreOpportunity()` ([engine.ts:317–350](src/lib/hade/engine.ts))
- [ ] Per-bucket category filtering (lightning: no sit-down; etc.)
- [ ] Dead-time-context modifiers (before_checkin / waiting_for_transit / etc.)
- [ ] Per-bucket support copy in [supportText.ts](src/lib/hade/supportText.ts)
- [ ] New scenarios in [scenarios.ts](src/lib/hade/scenarios.ts): `layover_15`, `gap_30`, `loop_45`, `local_60`
- [ ] Integration tests (decision.behavior.test.ts additions)
- [ ] **Ship. Bucket-aware scoring is live.**

---

### Phase 5 — Multi-Stop Sequencer
**Duration: 4–5 days**

- [ ] Build `src/lib/hade/microAdventure.ts` — `composeMicroAdventure()`, `sequenceStops()`, loop-deviation check
- [ ] Wire into [route.ts](src/app/api/hade/decide/route.ts) after `rankOpportunities()` for `short_loop` and `extended` buckets
- [ ] Reuse `fallbackSelection.ts` surfaced-history bookkeeping to avoid stale chains
- [ ] Build `src/components/hade/mobile/MicroAdventureSheet.tsx` (stacked vertical stops)
- [ ] Surface `decision.micro_adventure` via [useHade.ts](src/lib/hade/useHade.ts)
- [ ] Validation: total time ≤ budget invariant in [validateDecision.ts](src/app/api/hade/decide/validateDecision.ts)
- [ ] microAdventure.test.ts (MA-01 through MA-07)
- [ ] **Ship. Multi-stop micro-adventures live for ≥45 min buckets.**

---

### Phase 6 — LLM Structured Output (Optional Enhancement)
**Duration: 2–3 days**

- [ ] Extend [prompt.ts](src/lib/hade/prompt.ts): demand structured `fits_in_window` proof with rationale
- [ ] Parser-tolerant fallback in [validateDecision.ts](src/app/api/hade/decide/validateDecision.ts) (avoids cold-start regression pattern from commit `85a9617`)
- [ ] Backend always emits synthetic `fits_in_window` as floor; LLM may enrich
- [ ] **Ship. LLM-quality rationale for window fit; synthetic remains tier-2 floor.**

---

### Phase 7 — Return-Time-Aware Navigation
**Duration: 2 days**

- [ ] Extend [navigation.ts](src/lib/hade/navigation.ts) to optionally pass return target as second waypoint (Google Maps `dirflg=w` walking + `destination` chained)
- [ ] In-app "return clock" widget on `MicroAdventureSheet` showing time-since-departure vs `total_min`
- [ ] PushNotification at `total_min - buffer_min` if app backgrounded
- [ ] **Ship. End-to-end return-time accountability.**

---

## Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Places quota explosion when extended bucket → large radius | High | Cap at `RADIUS.WINDOW_MAX=2400`; honor `placesAdapter` paging; per-bucket max candidates |
| LLM contract regression (structured fits_in_window required) | High | Parser-tolerant validator; synthetic floor; cold-start fallback pattern from `85a9617` |
| Synthetic engine empty card when bucket strict + no candidates | High | Bucket-aware fallback copy; widen-window prompt CTA; never block on empty `fits_in_window` |
| Multi-stop chain stale (last visited venue resurfaces) | Medium | Reuse `fallbackSelection.ts` surfaced-history bookkeeping |
| UI chip overload (intent + urgency + bucket + state) | Medium | Bucket pill collapses to inline once set; one row at a time visible |
| Budget invariant violated by LLM rounding | Medium | Validator strips `fits_in_window` when `total_min > time_available_minutes`; never propagate broken promise |
| Distance tolerance vs bucket conflict (walking + extended → 1500m may exceed walking) | Low | Bucket radius derivation already assumes walking speed; distance_tolerance becomes informational hint to LLM only |
| Voice keyword false positives ("an hour" matches in many sentences) | Low | Already-present pattern; calibrate after real-data sample |

---

## Concept Axis Disambiguation (7 Axes)

| Axis | Set By | Lifecycle | Effect |
|---|---|---|---|
| **Mode** (dining/social/travel) | User-explicit | Session-long | Domain scoring config + radius |
| **Lens** | User-explicit | Session-long | Narrative frame + bias |
| **Preset** | User-explicit | Single call | Temperature/weight overrides |
| **Scenario** | System-inferred | Session-long | Context template |
| **Intent** | Voice/RefineSheet | Single call | Category affinity |
| **HadeState** (energy/openness) | Voice/defaults | Single call | (currently inert; future scoring) |
| **WindowBucket** ← NEW | Time-budget derivation | Single call (TTL = budget) | Radius scale + weight deltas + UI variant |

WindowBucket is **derived deterministically** from `time_available_minutes` — never user-set directly. Users set the time budget; the bucket follows.

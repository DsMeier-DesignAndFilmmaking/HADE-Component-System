# HADE — Strategic Audit & Decision Commitment Engine
**Audit Date:** 2026-05-22  
**Scope:** Decision Commitment Engine · Real-Time Traveler State Engine · Micro-Adventure / Dead-Time Engine  
**Status:** Read-only audit. No code modified.

---

## Table of Contents

1. [Current Architecture Summary](#1-current-architecture-summary)
2. [Current UX Flow Summary](#2-current-ux-flow-summary)
3. [Core Verdict](#3-core-verdict)
4. [Where HADE Acts Like a Recommendation Engine](#4-where-hade-acts-like-a-recommendation-engine)
5. [Where HADE Already Supports Commitment Behavior](#5-where-hade-already-supports-commitment-behavior)
6. [Opportunity 1 — Decision Commitment Engine](#6-opportunity-1--decision-commitment-engine)
7. [Opportunity 2 — Real-Time Traveler State Engine](#7-opportunity-2--real-time-traveler-state-engine)
8. [Opportunity 3 — Micro-Adventure / Dead-Time Engine](#8-opportunity-3--micro-adventure--dead-time-engine)
9. [Missing Decision Fields](#9-missing-decision-fields)
10. [Recommended Decision Schema Additions](#10-recommended-decision-schema-additions)
11. [Recommended UX Copy Changes](#11-recommended-ux-copy-changes)
12. [Recommended Card Layout Changes](#12-recommended-card-layout-changes)
13. [Recommended Backend Transformation Layer](#13-recommended-backend-transformation-layer)
14. [Overlapping & Redundant Logic](#14-overlapping--redundant-logic)
15. [Risk Areas](#15-risk-areas)
16. [Files to Change](#16-files-to-change)
17. [Risk Level Per Change](#17-risk-level-per-change)
18. [Full Implementation Sequence](#18-full-implementation-sequence)

---

## 1) Current Architecture Summary

**Decision pipeline (request → response):**

1. UI collects intent / mode / lens / voice → `useHade.decide()` — `src/lib/hade/useHade.ts`
2. `POST /api/hade/decide` (`src/app/api/hade/decide/route.ts`) — candidate sourcing (Google Places + UGC), LLM or synthetic ranking, validation
3. Engine helpers in `src/lib/hade/engine.ts`: `scoreOpportunity()`, `rankOpportunities()`, `generateSituationSummary()`
4. Copy assembled by `supportText.ts`, `deriveReasons.ts`, `explanation.ts`
5. Returned as a single `HadeDecision` (`src/types/hade.ts:251`) wrapped by `DecideResponse` (`src/types/hade.ts:310`)

**Key signals & state:**
- `HadeContext` = `HadeSituation` + `HadeState{energy, openness}` + `HadeSocial` + `HadeConstraints{budget, time_available_minutes, distance_tolerance}` — `src/types/hade.ts:102–122`
- 7 SignalTypes: `PRESENCE / SOCIAL_RELAY / ENVIRONMENTAL / BEHAVIORAL / AMBIENT / EVENT / INTENT` — `src/types/hade.ts:11–18`
- 6 LensProfiles (`src/lib/hade/lensProfiles.ts`), 5 Presets (`src/lib/hade/presets.ts`), 3 DomainModes (`dining/social/travel`), 3 Scenarios (`exploration/quick/social`) — `src/lib/hade/scenarios.ts`
- Confidence via `confidence.ts`, weighted vibe edges via `weights.ts`

**Fallback chain:**  
Static fallback set → synthetic engine (`src/core/engine/synthetic.ts`) → cold-start surfacing penalty (`surfacedPenalty.ts`, `fallbackSelection.ts`)

---

## 2) Current UX Flow Summary

Mobile card surface in `DecisionScreen.tsx` renders `HeroDecisionCard.tsx` with:
- Header chip: "Your move" / "Community"
- Venue name + category
- Meta chips: "Happening now" / "Starting in X min", social count, ETA
- Support copy via `supportText`, lens frame
- One primary CTA: **"Navigate"** (hard-coded in `DecisionScreen.tsx:1056`, separate from `PrimaryAction.tsx` which exports `"Take me there"` but is unused in this surface)
- Secondary: "Not this" (rejection) + ghost row: "Previous" / "Refine"
- Sheets: `RefineSheet`, `VibeSheet`, `CompareModesSheet`, `UgcVerificationSheet`, `PinSpotSheet`, `VoiceSheet`, `OtherModesPanel`

`ContextSignalBadge` (`src/components/hade/adaptive/ContextSignalBadge.tsx`) renders **intent + urgency + mode** dots — not traveler state.

`ActivityCreationView.tsx` collects vibe / what / location / **start time** — not duration.

---

## 3) Core Verdict

**HADE is still a recommendation engine.**

The decision object names a place. The card describes the place. The CTA hands the user to Apple/Google Maps. HADE loses control of the moment the instant the user taps "Navigate." Every copy field answers *"why this place"* — none answers *"what should I do, exactly, for how long."*

| Question | HADE today |
|---|---|
| What place should I go to? | ✅ Answered |
| What should I do next, exactly, given my context? | ❌ Not answered |
| How long should I spend there? | ❌ Not answered |
| What should I do after? | ❌ Not answered |
| What kind of traveler am I right now? | ❌ Not answered |
| I have 25 minutes — what's the best use? | ❌ Not answered |

---

## 4) Where HADE Acts Like a Recommendation Engine

| Surface | File:Line | Recommendation tell |
|---|---|---|
| Decision object | `src/types/hade.ts:251–303` | Fields: `venue_name`, `category`, `distance_meters`, `eta_minutes` + four "why" strings (`rationale`, `why_now`, `why_this`, `decision_frame`). Zero action structure. |
| Header chip | `HeroDecisionCard.tsx:168–170` | "Your move" — pure venue framing |
| Title | `HeroDecisionCard.tsx:195–197` | `object.title` (venue name). No action verb. |
| Meta chips | `HeroDecisionCard.tsx:240–247` | `timeLabel` + social count. No "Spend ~25 min." |
| Primary CTA (component) | `PrimaryAction.tsx:10` | Default label `"Take me there"` |
| Primary CTA (actual) | `DecisionScreen.tsx:1056` | Hard-coded `"Navigate"` button — `PrimaryAction.tsx` is not rendered here |
| Handoff | `DecisionScreen.tsx:662` | `window.open(url, "_self")` → Apple/Google Maps via `navigation.ts:1–15`. HADE control ends here. |
| Support label | `supportText.ts:122–199` | "Closest useful food option right now." / "Nearby pick with a little discovery built in." — describes the *place*, not behavior |
| Reasons | `deriveReasons.ts:27–142` | "Around the corner", "Friday night energy", "Solid food here" — `MAX_WORDS = 8`, structured as adjectival reasons |
| Domain narratives | `domainConfigs.ts:161–272, 343–358` | "Right around the corner and open — go grab a bite." / "Energy is peaking nearby — go where the night is." — verbs collapse to "go." |
| Fallback support | `supportText.ts:96–111` | "Best nearby match while live context is limited." — even degraded mode is recommendation-shaped |
| Synthetic decision assembly | `synthetic.ts:1246–1276` | `eta_minutes = Math.ceil(bestDistance / 80)` = walking time *to* venue. No visit-duration computed. |
| Secondary actions | `SecondaryActions.tsx`, `DecisionScreen.tsx:1059–1067` | "Previous" / "Refine" / "Not this" — all push to a *different* decision; none converts the current one into action |
| Add-Vibe CTA | `HeroDecisionCard.tsx:251–301` | Feedback collection (`onAddVibe`), not commitment |

---

## 5) Where HADE Already Supports Commitment Behavior

These are seeds, not features. They reduce the implementation delta.

1. **Time budget flows end-to-end** — `HadeConstraints.time_available_minutes` (`src/types/hade.ts:120`) is captured by voice parser at `voiceIntentParser.ts:46–55` (`parseTimeMinutes`), passed through `DecideRequest`, and verbalised by `generateSituationSummary` (`engine.ts:203`) as "${mins}-minute window." Duration as *input* exists — the engine just never outputs anything bounded by it.

2. **Per-domain `narrative()` builders** (`domainConfigs.ts:161, 255, 343`) switch on intent + situation. This is the natural site to emit a step array instead of one prose sentence.

3. **`decision_frame`** (`hade.ts:268`) is described as "One sentence framing the pick as a recommendation" — closest existing analogue to a commitment headline.

4. **Action verbs already appear in copy** — "go grab a bite", "join the energy", "go discover something good" (domainConfigs.ts:178–182, 266–270, 356). Half-way commitment-shaped; stops at one verb.

5. **Navigation telemetry hook** at `navigationTelemetry.ts`, called from `handleGo` (`DecisionScreen.tsx:645`) — a checkpoint at the "user committed" instant where a commitment object could be persisted and tracked.

6. **Post-visit timer scaffold** — `visitRef` set in `handleGo` (`DecisionScreen.tsx:638–643`), polling effect at line ~568 checks it. Primitive presence detection — foundation for a dwell-loop.

7. **`SpontaneousObject.time_window: { start, end }`** carries an interval repurposable for visit duration.

---

## 6) Opportunity 1 — Decision Commitment Engine

### What's Present

| Primitive | File | Notes |
|---|---|---|
| `time_available_minutes` | `src/types/hade.ts:120` | Flows end-to-end; parsed from voice |
| `eta_minutes` | `src/types/hade.ts:257` | Travel time only (`Math.ceil(dist/80)`) — distinct from visit duration |
| `generateSituationSummary()` | `engine.ts:203` | Ready-made anchor for commitment generation |
| LLM prompt builders | `prompt.ts` | Can be extended for structured step output |
| Four "why" copy fields | `hade.ts:261–268` | Rich *why* layer exists; *how* layer is the gap |

### What's Absent

- No step array
- No `visit_duration_minutes` field
- No post-place follow-on action
- No ordering / sit / photograph cues
- No UI block for sequenced micro-instructions
- No `commitment` object on `HadeDecision`
- No `CommitmentSheet` component
- No "Start this" CTA
- No completion telemetry (`commitmentStarted`, `commitmentDone`, `commitmentBailed`)

### Copy-Level Gap

Every "why" field is venue-descriptive. None is behavior-prescriptive:

| Field | Current value (dining, eat, high urgency) | Needed |
|---|---|---|
| `why_now` | "Right around the corner and open — go grab a bite." | "Order at the counter. Sit near the window. 20 min." |
| `decision_frame` | "Low effort, nearby, and open — easy win." | "Coffee window before dinner" |
| `supportLabel` | "Closest useful food option right now." | "Order something small at the counter." |

### Risk: Four-Copy-Field Overload

`rationale`, `why_now`, `why_this`, `decision_frame` all sit on `HadeDecision`. Adding a fifth source (`commitment.steps`) risks confusion. Resolution: keep the four as the *why* layer (unchanged); commitment is the *how-to-execute* layer. Make UI separation explicit in `HeroDecisionCard.tsx`.

---

## 7) Opportunity 2 — Real-Time Traveler State Engine

### Signal Inputs Today

**Type definition** (`src/types/hade.ts:11–18`):
```typescript
export type SignalType =
  | "PRESENCE"      // Location check-in; 30m TTL
  | "SOCIAL_RELAY"  // Social proximity; 24h TTL
  | "ENVIRONMENTAL" // Context (noise, crowding, weather)
  | "BEHAVIORAL"    // User actions (pause, scroll, dwell)
  | "AMBIENT"       // Vibe tags and UGC feedback
  | "EVENT"         // Calendar/event occurrence; 24h TTL
  | "INTENT";       // Voice command, explicit user intent
```

**Not collected:** battery state, motion type (walking vs stationary), user-declared "current mood," last-action history (what was rejected, how long dwelled).

### Existing State-Like Concepts

| Concept | File | Values | Purpose |
|---|---|---|---|
| `DomainMode` | `useHade.ts:86` | `"dining" \| "social" \| "travel"` | Selects Places API categories |
| `LensProfileId` | `lensProfiles.ts:3–9` | 6 values (`food_dining`, `wellness`, etc.) | UI-driven intent override |
| `HadePreset` | `presets.ts:15–81` | `balanced`, `spontaneous`, `chill`, `social`, `focused` | Convenience setting bundles |
| `HadeState` | `hade.ts:102–105` | `energy: low/medium/high`, `openness: comfort/open/adventurous` | User-provided or defaulted — **not inferred** |
| `VibeTag` | `hade.ts:916–928` | `too_crowded`, `perfect_vibe`, etc. | User feedback on venue quality |
| `UserSignalMode` | `hade.ts:654–663` | `explore \| book \| compare` | Adaptive UI state |

**None of these is `TravelerState`.** `HadeState.energy` defaults to `"medium"` at `engine.ts:141` — it is never inferred from signals.

### What's Missing

- **Zero matches** in `src/` for `TravelerState`, `traveler_state`, `inferState`
- No `inferTravelerState(signals, context): TravelerState` function
- No `traveler_state` field on `HadeContext`, `DecideRequest`, or `HadeDecision`
- No UI pill/badge for inferred state
- No state-correction telemetry endpoint (mirror of `signal/route.ts`)
- No A/B testing substrate for state weighting

### Where State Would Plug In

- `engine.ts:317–350` `scoreOpportunity()` — proximity decay could steepen for `"recovering"` state; intent scoring could bonus `"waiting"` for transit-adjacent venues
- `engine.ts:369–376` `rankOpportunities()` — inherits any scoring change
- `weights.ts` — per-state venue affinity modifiers

### Concept Collision Risk

| Collision | Risk |
|---|---|
| Mode ↔ TravelerState | High — both affect candidate selection; keep orthogonal (Mode = category selector, State = weight modifier) |
| Preset ↔ TravelerState | Medium — "chill" preset semantically overlaps "recovering" state; keep separate (presets = persistent preference, state = session-temporal) |
| Lens ↔ TravelerState | Medium — composable; both apply independently |
| HadeState ↔ TravelerState | High — `HadeState.energy` overlaps `low_energy` state; TravelerState is richer (9 states vs 3 levels); keep both, TravelerState informs HadeState.energy |

### Proposed TravelerState Union

```typescript
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
```

---

## 8) Opportunity 3 — Micro-Adventure / Dead-Time Engine

### What's Present (Most Groundwork of the Three)

| Primitive | File | Notes |
|---|---|---|
| `time_available_minutes` | `hade.ts:120` | Flows end-to-end |
| `parseTimeMinutes()` | `voiceIntentParser.ts:46–55` | Converts "half an hour" / "an hour" / "X minutes" |
| Urgency auto-boost | `voiceIntentParser.ts:81` | Bumps urgency to "high" when ≤20 min |
| Haversine + 80 m/min | `engine.ts`, `synthetic.ts:1253` | Invertible: time → radius |
| Situation summary | `engine.ts:203` | Already verbalises "${mins}-minute window" in LLM prompt |
| Domain radius constants | `core/constants/radius.ts:6` | `SEARCH_DEFAULT: 800` — static, not time-scaled |

### What's Absent

| Missing | Confirmed by |
|---|---|
| `DecideResponse.decision` is a **single** object | `hade.ts:246`: *"No fallbacks. No primary+secondary. One decision."* |
| No `itinerary`, `next_stop`, `legs[]` | Zero matches in `src/` |
| No isochrone / time→radius scaling | `radius.ts` is static; no reachability module |
| No 15/30/45/60-min scenario | `scenarios.ts:3`: only `"exploration" \| "quick" \| "social"` |
| No "dead time" preset | `presets.ts:17–69`: only 5 generic presets |
| No time-budget UI control | `ActivityCreationView.tsx` captures start time (HH:MM), not duration |
| No `time_window_end_ms` (deadline vs duration) | `HadeConstraints` has duration only |

### ETA vs Visit Duration Distinction

`eta_minutes` (`hade.ts:257`) = `Math.ceil(bestDistance / 80)` — **walking time to venue**, not time at venue. A micro-adventure engine needs `visit_duration_minutes` as a separate field. Never overload `eta_minutes`.

### Scenario Gap

```typescript
// Current scenarios.ts:3
export type ScenarioId = "exploration" | "quick" | "social";

// Needed
export type ScenarioId = 
  | "exploration" | "quick" | "social"  // existing
  | "layover_15" | "gap_30" | "loop_45" | "local_60";  // dead-time additions
```

---

## 9) Missing Decision Fields

Reading `HadeDecision` (`src/types/hade.ts:251–303`) against all three opportunity goals:

| Required field | Currently |
|---|---|
| `visit_duration_minutes` | Absent — only travel `eta_minutes` (line 257) |
| `commitment.steps[]` | Absent — closest is unstructured `decision_frame` (line 268) |
| `commitment.post_action` | Absent — no follow-on chaining anywhere |
| `commitment.style` | Absent |
| `commitment.entry_cue` | Absent |
| `commitment.success_signal` | Absent |
| `commitment.bail_out_after_minutes` | Absent |
| `traveler_state` | Absent — zero matches for `TravelerState` in `src/` |
| `traveler_state_confidence` | Absent |
| `itinerary` on `DecideResponse` | Absent |
| `time_window_end_ms` on `HadeConstraints` | Absent |

---

## 10) Recommended Decision Schema Additions

Add to `src/types/hade.ts` immediately after the existing `HadeDecision` block. Mirror into `src/core/types/decision.ts` and `validateDecision.ts` (three sources of truth — must land in same PR).

```typescript
// ─── Commitment Layer ─────────────────────────────────────────────────────────

export type CommitmentCue =
  | "order" | "sit" | "browse" | "photo" | "chat" | "observe" | "move";

export type CommitmentStyle =
  | "ritual" | "explore" | "reset" | "social" | "errand";

export type PostActionKind =
  | "walk_to" | "next_stop" | "return_home" | "open_ended";

export interface CommitmentStep {
  order: number;                   // 1-indexed render order
  instruction: string;             // ≤14 words, imperative verb-first
  cue?: CommitmentCue;             // icon/affordance hint
  duration_seconds?: number;       // optional — only when step is timed
}

export interface DecisionCommitment {
  visit_duration_minutes: number;  // total dwell — distinct from eta_minutes
  style: CommitmentStyle;
  headline: string;                // ≤10 words, replaces decision_frame on commit view
  steps: CommitmentStep[];         // 2–5 ordered steps
  entry_cue?: string;              // "Look for the green door."
  success_signal?: string;         // "You've ordered + sat down."
  bail_out_after_minutes?: number; // graceful abandon window
  post_action?: {
    kind: PostActionKind;
    target_geo?: GeoLocation;
    walking_minutes?: number;
    label?: string;                // "Then 2-block walk toward the park"
  };
}

// ─── TravelerState ────────────────────────────────────────────────────────────

export type TravelerState =
  | "exploring" | "waiting" | "transitioning" | "recovering"
  | "socializing" | "solo_confidence" | "low_energy"
  | "time_constrained" | "arrival_orientation";

// ─── Additions to existing interfaces ────────────────────────────────────────

// On HadeDecision (~line 273, before is_fallback):
commitment?: DecisionCommitment;

// On HadeContext (~line 175) and DecideRequest (~line 205):
traveler_state?: TravelerState;
traveler_state_confidence?: number;

// On HadeConstraints (~line 118–122):
time_window_end_ms?: number;  // deadline, distinct from duration

// On DecideResponse (~line 310):
itinerary?: {
  stops: HadeDecision[];
  total_walking_minutes: number;
  total_duration_minutes: number;
};
```

### Validator Invariants (`validateDecision.ts`)

- `sum(steps.duration_seconds) ≤ visit_duration_minutes * 60` (when all steps timed)
- `visit_duration_minutes ≤ context.constraints.time_available_minutes` (if set)
- `steps.length ∈ [2, 5]`
- On invariant breach: **strip commitment silently + log** — never block the response (mirrors cold-start regression in commit `85a9617`)

---

## 11) Recommended UX Copy Changes

| Surface | Today | Commit-shaped |
|---|---|---|
| Header chip (`HeroDecisionCard.tsx:168–170`) | "Your move" | "Your move · 25 min" (when `commitment.visit_duration_minutes` set) |
| Title block | Venue name only | Venue name + sub-line `commitment.headline` e.g. *"Coffee window before dinner"* |
| `supportLabel` primary line (`supportText.ts:122–199`) | "Low-friction nearby food option for your current energy." | Promote `commitment.steps[0].instruction` as primary: *"Order something small at the counter."* |
| Domain narrative copy (`domainConfigs.ts:161, 255, 343`) | One prose sentence per intent | Emit `decision_frame` AND a 2–4-step `commitment.steps[]` array. Keep `why_*` copy unchanged. |
| Fallback support (`supportText.ts:96–111`) | "Best nearby match while live context is limited." | "Quick 15-min stop while context settles" + minimal 2-step commitment from static template |
| Reasons (`deriveReasons.ts:27–142`) | "Around the corner", "Friday night energy" | No change — stay as the *why* badge row. Make visual distinction from steps explicit. |
| Primary CTA (`DecisionScreen.tsx:1056`) | "Navigate" | **"Start this"** when `commitment` present; "Just navigate" as secondary escape |
| Confirmation toast (none today) | — | "You're in. I'll check in 25 min." |
| "Not this" (`DecisionScreen.tsx:1066`) | Pivot to different decision | "Skip this commitment" when commitment present |
| `PrimaryAction.tsx:10` | "Take me there" (appears unused in mobile path) | Either delete dead code or rebuild as canonical commitment CTA — choose one |

---

## 12) Recommended Card Layout Changes

**Current render order** (`HeroDecisionCard.tsx`):
1. Header chips
2. Title
3. `primarySupport` (line 200)
4. `secondarySupport` (line 205)
5. UGC rationale block (line 216)
6. Meta chips (line 240)
7. Add-Vibe input (line 251)

**Proposed order when `commitment` present:**
1. Header chip + duration pill ("Your move · 25 min")
2. Title — slightly smaller weight
3. `commitment.headline` — becomes the de-facto primary message
4. `primarySupport` / `secondarySupport` (unchanged copy, demoted to subtitle weight)
5. **Steps block** — ordered list, each with cue icon + 14-word imperative (insert after line 213, before meta chips at line 240)
6. Meta chips (unchanged)
7. **Post-action footer** (`commitment.post_action.label`) — subtle one-liner: "Then 2-block walk toward the park."
8. Add-Vibe input (unchanged)

**When `commitment` absent:** render exactly as today — zero regression risk.

**CTA stack** (`DecisionScreen.tsx:1049–1067`):
- When `commitment` present: **"Start this"** (opens `CommitmentSheet`) + **"Just navigate"** (escape to Maps)
- When `commitment` absent: "Navigate" as today
- "Not this" remains lowest visual weight throughout

---

## 13) Recommended Backend Transformation Layer

### Primary Insertion Point

Between `selectWithDiversity` (`synthetic.ts:1212`) and decision assembly (`synthetic.ts:1246`):

```
rankSpontaneousObjects
  → selectWithDiversity
  → [NEW] deriveCommitment(bestObj, ctx, config, distance_meters)
  → assemble HadeDecision
```

### New Module: `src/lib/hade/commitment.ts`

**Export:** `deriveCommitment(obj, ctx, config, distance_meters): DecisionCommitment | null`

**Strategy v1 — deterministic templates, not LLM:**

1. Pick `style` from `(domain, intent, energy)` tuple:

| Domain | Intent | Energy | Style |
|---|---|---|---|
| dining | eat | low | ritual |
| dining | eat | high | errand |
| dining | drink | any | social |
| social | scene | high | explore |
| travel | any | low | reset |
| travel | any | high | explore |

2. Pick `visit_duration_minutes` from `(style, time_available_minutes)`:

| Style | Default range | Clamp at |
|---|---|---|
| ritual | 20–30 min | `time_available_minutes` |
| explore | 30–45 min | `time_available_minutes` |
| reset | 15–25 min | `time_available_minutes` |
| social | 45–60 min | `time_available_minutes` |
| errand | 10–15 min | `time_available_minutes` |

3. Pick `steps[]` from per-domain template table keyed by `(style, vibe_tag)` with venue-specific substitution (`{venue_name}`, `{neighborhood}`, `{walking_minutes}`, `{eta_minutes}`)

4. `post_action`: emit only when `time_available_minutes ≥ visit_duration_minutes + 10` AND a contrasting-category candidate exists in `fallback_places` (`synthetic.ts:1294–1296`)

### Integration in `domainConfigs.ts`

Extend `narrative()` (`lines 161, 255, 343`) to also return `commitment_template_id`. `deriveCommitment` fills in venue specifics. Return shape becomes:

```typescript
narrative: (place, ctx) => {
  rationale: string;
  why_now: string;
  why_this: string;
  decision_frame: string;
  commitment_template_id?: string;  // NEW
}
```

### New Utility: `src/lib/hade/reachability.ts`

```typescript
export function maxSearchRadiusMeters(
  timeAvailableMinutes: number,
  visitDurationMinutes: number,
  walkSpeedMpm = 80
): number {
  const walkableMinutes = (timeAvailableMinutes - visitDurationMinutes) / 2;
  return Math.min(walkableMinutes * walkSpeedMpm, 2400); // cap at 2.4km
}
```

Consumed in `route.ts` candidate query when `time_available_minutes` is set. Replaces static `RADIUS.SEARCH_DEFAULT: 800`.

### New Inference Function: `src/lib/hade/travelerState.ts`

```typescript
export function inferTravelerState(
  signals: Signal[],
  ctx: HadeContext
): { state: TravelerState; confidence: number } | null
```

Inputs: signals (past 2h), `time_of_day`, `day_type`, urgency, energy, rejection history, voice keywords. Output: one of the 9 states + confidence score. Plug into `scoreOpportunity()` (`engine.ts:317–350`) **behind a feature flag — logging only first, no scoring shift** until calibrated.

### LLM Path (defer)

Extend `buildDecisionPrompt` (`prompt.ts`) to optionally request structured `steps[]` in JSON mode. Deterministic templates remain the safety net. Never make commitment a required LLM output — the `85a9617` cold-start regression pattern will recur.

---

## 14) Overlapping & Redundant Logic

| Overlap | Resolution |
|---|---|
| Four "why" copy fields + new `commitment.steps` | Keep four as *why* layer (unchanged); commitment is *how* layer. Explicit UI separation in `HeroDecisionCard.tsx`. |
| `eta_minutes` vs `visit_duration_minutes` | `eta_minutes` = travel time; `visit_duration_minutes` in `commitment` = dwell time. Never conflate. |
| `time_available_minutes` vs `time_window_end_ms` | Duration vs deadline. Keep both; deadline derives duration when "now" is known. |
| Scenarios vs Presets (both wrap context defaults) | New dead-time entries go in scenarios.ts with explicit `micro_window_minutes` field rather than creating a third wrapper. |
| Mode ↔ Lens ↔ Preset ↔ Vibe ↔ Intent ↔ HadeState | Document all six axes in a header comment in `engine.ts` before adding TravelerState as a 7th. |
| `fallbackSelection.ts` surfaced-history deduplication | Orthogonal to itinerary chaining — reuse its bookkeeping rather than reinventing for multi-stop sequencer. |
| `PrimaryAction.tsx` vs inline button in `DecisionScreen.tsx:1056` | Two CTAs with different labels for the same action. Pick one and delete the other. |

---

## 15) Risk Areas

1. **LLM contract breakage** — `buildDecisionPrompt` (`prompt.ts`) returns prose-shaped reasoning. Demanding structured `steps[]` requires JSON-mode + fallback parser in `route.ts`. Without a parser-tolerant validator in `validateDecision.ts`, the cold-start regression pattern (commit `85a9617`) will recur.

2. **Static fallback gap** — `synthetic.ts` returns one place. If `commitment` becomes required, Tier 3 static stub must also emit a minimal commitment or the validator must keep it optional and strip gracefully.

3. **State inference accuracy without telemetry** — shipping `traveler_state` to UI without a "wrong" feedback path means no learning loop. A wrong "Sensing: low energy" pill erodes trust fast.

4. **Radius scaling + Places quota** — `time→radius` scaling could explode candidate counts at the 60-min upper bound. Cap in `core/constants/radius.ts` and ensure `placesAdapter` paging is honoured.

5. **Concept overload in UI** — Mode + Lens + Preset + State pills will blow up `ContextSignalBadge` real estate. Need explicit IA decision before adding another chip.

6. **Validation drift** — Three type sources of truth (`src/types/hade.ts`, `src/core/types/decision.ts`, `validateDecision.ts`). New fields must land in all three or runtime / static checks diverge.

7. **`window.open` removal risk** — Do not remove maps handoff entirely. It would break muscle memory and the maps integration. Wrap, don't replace — "Start this" opens the sheet AND navigates; "Just navigate" is the escape valve.

---

## 16) Files to Change

### New Files

| File | Purpose |
|---|---|
| `src/lib/hade/commitment.ts` | `deriveCommitment()` + per-domain templates |
| `src/lib/hade/travelerState.ts` | `inferTravelerState()` + `TravelerState` type |
| `src/lib/hade/reachability.ts` | Time → radius / walking budget |
| `src/app/api/hade/state/route.ts` | State correction telemetry (mirror of `signal/route.ts`) |
| `src/components/hade/mobile/CommitmentSheet.tsx` | Step checklist, dwell timer, completion telemetry |
| `src/components/hade/mobile/MicroAdventureSheet.tsx` | Multi-stop itinerary view (Phase 4) |

### Core Types & Validation

| File | Changes |
|---|---|
| `src/types/hade.ts` | Add `DecisionCommitment`, `TravelerState`, `CommitmentStep`, `CommitmentCue`, `CommitmentStyle`, `PostActionKind`; add optional `commitment` on `HadeDecision` (~line 273); `traveler_state` on context; `time_window_end_ms` on constraints; `itinerary` on `DecideResponse` |
| `src/core/types/decision.ts` | Mirror all new types |
| `src/app/api/hade/decide/validateDecision.ts` | Tolerant validators + duration invariants for new optional fields |

### Engine & API

| File | Changes |
|---|---|
| `src/lib/hade/engine.ts` | Six-axis disambiguation comment in header; `generateCommitment` helper; state-aware scoring hooks; multi-stop sequencer (Phase 4) |
| `src/app/api/hade/decide/route.ts` | Invoke `deriveCommitment`; invoke `reachability`; invoke `inferTravelerState`; cap radius for time-scaled queries |
| `src/core/engine/synthetic.ts` | Call `deriveCommitment` between lines 1212–1246; spread result into decision assembly |
| `src/core/domain/domainConfigs.ts` | Extend `narrative()` (lines 161, 255, 343) to return `commitment_template_id` |
| `src/core/constants/radius.ts` | Radius ceilings for time-scaled search |
| `src/lib/hade/prompt.ts` | (Phase F) Structured-output schema extension for LLM path |

### UX Surfaces

| File | Changes |
|---|---|
| `src/components/hade/mobile/HeroDecisionCard.tsx` | Add `commitment` prop; render step block between line 213–240; duration pill in header |
| `src/components/hade/mobile/DecisionScreen.tsx` | Pass `commitment` to card; replace CTA block at lines 1049–1067 with "Start this" / "Just navigate" pair |
| `src/components/hade/mobile/PrimaryAction.tsx` | Either delete (dead code) or rebuild as canonical commitment CTA |
| `src/components/hade/mobile/RefineSheet.tsx` | Add TravelerState correction control |
| `src/components/hade/mobile/OtherModesPanel.tsx` | Dead-time preset chips (layover / gap / loop) |
| `src/components/hade/mobile/ActivityCreationView.tsx` | Duration input alongside start time |
| `src/components/hade/adaptive/ContextSignalBadge.tsx` | New TravelerState variant (with IA decision on real estate) |
| `src/lib/hade/supportText.ts` | When `commitment` present, promote `steps[0].instruction` over venue-describing label |
| `src/lib/hade/scenarios.ts` | Add `layover_15`, `gap_30`, `loop_45`, `local_60` scenarios |
| `src/lib/hade/presets.ts` | Optional dead-time preset or leave to scenarios |
| `src/lib/hade/voiceIntentParser.ts` | Extend with state keywords ("tired", "waiting", "just landed") |
| `src/lib/hade/useHade.ts` | Surface `commitment`, `traveler_state`, `itinerary` from response to hooks |
| `src/lib/hade/viewModel.ts` | Pass `commitment` through to `HeroDecisionCard` props |
| `src/lib/hade/navigationTelemetry.ts` | Add `commitmentStarted`, `commitmentStepDone`, `commitmentBailed`, `commitmentCompleted` events |

### Tests

| File | Changes |
|---|---|
| `src/lib/hade/__tests__/decision.behavior.test.ts` | Commitment shape invariants, step count bounds |
| `src/lib/hade/__tests__/supportText.test.ts` | Update for new priority order when commitment present |
| `src/lib/hade/__tests__/voiceIntentParser.test.ts` | State keyword extraction |
| New: `src/lib/hade/__tests__/commitment.test.ts` | Template selection, duration clamping, post-action emission |
| New: `src/lib/hade/__tests__/reachability.test.ts` | Time→radius edge cases |
| New: `src/lib/hade/__tests__/travelerState.test.ts` | Inference from signal combinations |

---

## 17) Risk Level Per Change

| Change | Risk | Reason |
|---|---|---|
| Add optional fields to `HadeDecision` | **Low** | Optional, additive; mirrors how `score_debug` was added |
| Mirror across 3 contract files in same PR | **Low → Medium** | Three sources of truth historically drift |
| New `commitment.ts` deterministic transformer | **Low** | Read-only on existing code; gated by template table coverage |
| `synthetic.ts` integration (lines 1212–1246) | **Medium** | Cold-start critical path — commit `85a9617` just fixed a regression here; preserve empty-pool guard pattern |
| Extend `domainConfigs.narrative()` at 3 sites | **Medium** | Template-id contract must be uniform across all three |
| `HeroDecisionCard.tsx` layout change | **Medium** | Tight visual hierarchy; commitment block must be skippable when absent |
| New `CommitmentSheet.tsx` + telemetry | **Medium** | Integrates with fragile `visitRef` polling (`DecisionScreen.tsx:568, 638–643`) |
| CTA copy "Navigate" → "Start this" | **Medium** | User-visible language change; A/B-flaggable; preserve maps handoff |
| Deprecate / rebuild `PrimaryAction.tsx` | **Low** | Already appears unused in main mobile path |
| `supportText.ts` re-prioritisation | **Medium** | Heavily test-covered (`supportText.test.ts`) — update tests alongside |
| Validator invariants (duration sums) | **Medium** | Too-strict → strips commitments silently; must log + fall back gracefully |
| TravelerState inference (logging-only phase) | **Low** | No scoring change; pure observability |
| TravelerState scoring hooks (live) | **High** | Affects every ranking; requires calibration data from logging phase first |
| Radius scaling + Places quota impact | **Medium** | Cap in `radius.ts`; test with 60-min time window before production |
| LLM prompt for structured steps | **High** | JSON-mode parse failures were the `85a9617` failure class — defer to Phase F |
| Removing `window.open` entirely | **High** | Do not do this — wrap, never replace |

---

## 18) Full Implementation Sequence

### Phase 0 — Type & Contract Scaffolding
**Goal:** Zero UI change. Lay the type foundation.  
**Risk:** Low

- [ ] Add `DecisionCommitment`, `TravelerState`, and all supporting union types to `src/types/hade.ts`
- [ ] Add optional `commitment` to `HadeDecision` (~line 273)
- [ ] Add optional `traveler_state` / `traveler_state_confidence` to `HadeContext` and `DecideRequest`
- [ ] Add optional `time_window_end_ms` to `HadeConstraints`
- [ ] Add optional `itinerary` to `DecideResponse`
- [ ] Mirror all additions into `src/core/types/decision.ts` (same PR)
- [ ] Add tolerant assertions in `validateDecision.ts` — strip commitment on breach, log
- [ ] Document six-axis disambiguation in `engine.ts` header comment (Mode / Lens / Preset / Vibe / Intent / HadeState ↔ TravelerState)
- [ ] Ship dark — clients ignore new fields

---

### Phase 1 — Dead-Time Engine
**Goal:** Detect and use time budgets for scoped, single-stop decisions.  
**Risk:** Medium  
**Depends on:** Phase 0

- [ ] Implement `src/lib/hade/reachability.ts` — `maxSearchRadiusMeters(timeAvailable, visitDuration, walkSpeed)` using existing 80 m/min constant
- [ ] Add time-based radius override in `route.ts` candidate query when `time_available_minutes` set
- [ ] Add ceiling for 60-min window in `core/constants/radius.ts`
- [ ] Extend `src/lib/hade/scenarios.ts` with `layover_15`, `gap_30`, `loop_45`, `local_60` scenarios (preserve existing 3)
- [ ] Add time-budget chip to `DecisionScreen.tsx` — tap to cycle 15 / 30 / 45 / 60 / unlimited; wire to `HadeConstraints.time_available_minutes`
- [ ] Add dead-time chips row to `OtherModesPanel.tsx`
- [ ] Verify: confirm voice parser already handles "I have 30 minutes" → `voiceIntentParser.ts:46`
- [ ] Write `reachability.test.ts`
- [ ] Single-stop only. Verify against existing scoring before stacking.

---

### Phase 2 — Decision Commitment Engine (Templates)
**Goal:** Produce a structured commitment object from the winning candidate.  
**Risk:** Medium  
**Depends on:** Phase 0

- [ ] Implement `src/lib/hade/commitment.ts` — `deriveCommitment()` with per-domain template table (≤15 tuples covering 3 domains × 5 styles)
- [ ] Template table: for each `(domain, style)` define: `headline`, `steps[2–4]`, `success_signal`, `entry_cue`, `bail_out_after_minutes`
- [ ] Extend `domainConfigs.ts narrative()` (lines 161, 255, 343) to return `commitment_template_id`
- [ ] Call `deriveCommitment` in `synthetic.ts` between lines 1212–1246; spread result onto `decision`
- [ ] Add `commitment_template_id` return to static fallback path in `route.ts` (Tier 3 minimal template)
- [ ] Validate: `sum(steps.duration_seconds) ≤ visit_duration_minutes * 60`, `steps.length ∈ [2, 5]`, `visit_duration_minutes ≤ time_available_minutes`
- [ ] Write `commitment.test.ts`
- [ ] Ship dark — clients ignore `commitment` field until Phase 3 surfaces it

---

### Phase 3 — Card Surface & "Start This" CTA
**Goal:** Make the commitment visible in the card and committed to via a new CTA.  
**Risk:** Medium  
**Depends on:** Phase 2

- [ ] Extend `viewModel.ts` to pass `commitment` through to card props
- [ ] Update `HeroDecisionCard.tsx`:
  - Add `commitment` prop (optional)
  - Render duration pill in header chip row
  - Render `commitment.headline` as sub-title
  - Render steps block between line 213 and 240 (skipped when `commitment` absent)
  - Render post-action footer when `commitment.post_action` set
- [ ] Update `supportText.ts` to promote `steps[0].instruction` over venue-describing label when commitment present; update `supportText.test.ts`
- [ ] Update `DecisionScreen.tsx:1049–1067` CTA block:
  - "Start this" primary (opens CommitmentSheet) when commitment present
  - "Just navigate" secondary escape (still calls `window.open`)
  - "Navigate" only when no commitment
- [ ] Resolve `PrimaryAction.tsx` — delete or make canonical; don't leave two diverged implementations
- [ ] Build `CommitmentSheet.tsx`:
  - Re-renders steps list in execution mode
  - Per-step checkboxes
  - Dwell timer keyed off `commitment.visit_duration_minutes`
  - "I'm done" button → fires `commitmentCompleted` telemetry
  - "Leave now" button → fires `commitmentBailed` telemetry
  - "Navigate" button inside sheet → `window.open` (same as today)
- [ ] Extend `navigationTelemetry.ts` with `commitmentStarted`, `commitmentStepDone`, `commitmentBailed`, `commitmentCompleted`
- [ ] Confirmation toast: "You're in. I'll check in 25 min."
- [ ] Measure: compare Navigate tap rate before/after

---

### Phase 4 — Traveler State Inference (Logging Only)
**Goal:** Infer TravelerState from existing signals. No scoring changes yet.  
**Risk:** Low  
**Depends on:** Phase 0

- [ ] Implement `src/lib/hade/travelerState.ts` — `inferTravelerState(signals, ctx)` using:
  - `time_of_day`, `day_type`
  - `context.state.energy`, `context.situation.urgency`
  - Voice keywords (extend `voiceIntentParser.ts`: "tired", "waiting", "just landed", "rushing")
  - Rejection history recency (proxy for frustration / `time_constrained`)
  - Signal recency (long gap since last PRESENCE → `transitioning`)
- [ ] Add `inferTravelerState` call in `scoreOpportunity` (`engine.ts:317`) **gated by feature flag** — log result only, do not modify score
- [ ] Add `traveler_state` + `traveler_state_confidence` to `context_snapshot` in response (observability only)
- [ ] New TravelerState variant in `ContextSignalBadge.tsx` — visible only when confidence ≥ 0.75
- [ ] Add state-correction control to `RefineSheet.tsx`: "HADE thinks you're [X]. Is that right?"
- [ ] New `POST /api/hade/state` route (mirror `signal/route.ts`) for correction telemetry
- [ ] Write `travelerState.test.ts`
- [ ] **Do not promote to scoring until calibration data shows ≥70% inference accuracy**

---

### Phase 5 — Multi-Stop Micro-Adventures
**Goal:** Chain 2–3 stops within a time budget.  
**Risk:** Medium  
**Depends on:** Phases 1, 2, 3

- [ ] Multi-stop sequencer in `engine.ts` alongside `rankOpportunities` — chains stops until `sum(eta_minutes + visit_duration_minutes) ≥ time_available_minutes`
- [ ] Source `itinerary.stops` from existing `fallback_places` (`synthetic.ts:1294`) — reuse `fallbackSelection` surfaced-history bookkeeping to avoid stale chains
- [ ] Populate `DecideResponse.itinerary` for layover/gap scenarios
- [ ] Build `MicroAdventureSheet.tsx` — renders `itinerary.stops[]` using `HeroDecisionCard` per stop
- [ ] Wire "Micro-adventure" scenario chips from Phase 1 to trigger multi-stop path

---

### Phase 6 — State-Aware Scoring
**Goal:** Promote TravelerState from logging-only to active scoring input.  
**Risk:** High  
**Depends on:** Phase 4 (calibration data), Phase 2

- [ ] Remove feature flag gate from `scoreOpportunity` (`engine.ts:317–350`)
- [ ] State-aware distance tolerance: `recovering` collapses radius; `time_constrained` boosts urgency weight
- [ ] State-aware commitment shaping: `low_energy` → shorter dwell, no photo cue; `socializing` → social-proof boost; `arrival_orientation` → landmark/transit preference
- [ ] State-aware copy: `commitment.steps[]` variant selection switches on `traveler_state`
- [ ] A/B gate: state-aware scoring vs baseline; measure commitment completion rate as primary metric

---

### Phase 7 — LLM-Authored Commitments (Defer)
**Goal:** Allow LLM to generate venue-specific step variations beyond static templates.  
**Risk:** High  
**Depends on:** Phases 0–6 stable

- [ ] Extend `buildDecisionPrompt` (`prompt.ts`) to optionally request `commitment.steps[]` in JSON mode
- [ ] Parser-tolerant validator — if LLM commitment fails parse/validation, fall back to deterministic template silently (same invariant as Phase 2 Tier 3 treatment)
- [ ] Never make LLM commitment a required output — template-based commitment remains the canonical safety net

---

*End of audit document.*

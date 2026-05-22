# HADE 10x Implementation Specification

Date: May 22, 2026

Source material: all markdown files in `docs/`, including the Traveler State, Commitment, Micro-Adventure / Dead-Time, Data Contract, Mobile UX, ranking, phased-roadmap, protocol, dependency, and project-context notes.

Status: implementation-ready specification only. Do not implement features from this document until a separate implementation task is opened.

## 1. Objective

Add three additive HADE engines:

1. Traveler State Engine
2. Decision Commitment Engine
3. Micro-Adventure Engine

The implementation must preserve existing:

- Places pipeline
- UGC pipeline
- cold-start fallback
- Refine
- Not This
- navigation
- lens/mode behavior
- Urban Mobility default behavior

All changes are additive and non-breaking. Existing request and response shapes must remain valid.

## 2. Current System Facts

Current Tier 1 selection is deterministic in `src/core/engine/synthetic.ts`:

- Stored UGC, request `custom_candidates`, and Google Places candidates are merged into one scored pool.
- Ranking already uses time proximity, distance, going count, trust, LocationNode vibe/trust, domain type fit, group fit, uniqueness, lens category boost, rejection sensitivity, and exploration bias.
- `domainConfigs.ts` is the active domain scoring config. `src/core/domain/config.ts` is legacy/stale for the synthetic path.
- Places candidates currently receive synthetic `now`-based time windows, so time scoring is meaningful for UGC/custom candidates but weak for Places.
- Confidence exists in `src/lib/hade/confidence.ts`, but it does not currently influence ranking.

Fallback order:

1. Tier 1 synthetic ranked pool
2. Tier 2 offline cache
3. Tier 3 direct Places fallback
4. Static fallback titles

Known fallback risks:

- Cold-start synthetic failure can bypass offline cache.
- Direct fallback Places does not consult UGC.
- Fallback Places candidates do not run through the normal ranker.
- Missing API key, Places API errors, and true empty results all collapse to `[]`.

## 3. Non-Breaking Design Rules

1. No existing type, field, route, component, or behavior may be removed.
2. New response fields must be optional.
3. New UI surfaces must hide when data is absent.
4. New scoring components must default to neutral.
5. New validators must strip invalid optional objects instead of failing the whole decision.
6. Cold-start fallback and static fallback must remain valid without new fields.
7. Navigation must remain available as an escape valve even after Commitment UI ships.
8. Urban Mobility remains the default lens behavior unless the user explicitly changes lens/mode.
9. Places and UGC remain in the same candidate pool. No engine may create a competing source-priority path.
10. No new external APIs are required for Phase 1 through Phase 5.

## 4. Phase Plan

### Phase 0 — Contract Audit Alignment

Goal: align type names and response surfaces before runtime changes.

Files to change:

- `src/types/hade.ts`
- `src/core/types/decision.ts`
- `src/app/api/hade/decide/validateDecision.ts`

Exact new files:

- None

Tasks:

1. Add the interfaces in Section 5 to `src/types/hade.ts`.
2. Re-export or mirror public response types into `src/core/types/decision.ts` only where the core engine needs them.
3. Extend `DecideResponse.source` to include all emitted sources:
   - `"llm"`
   - `"synthetic"`
   - `"static_fallback"`
   - `"cold_start_synthetic"`
   - `"offline_cache"`
4. Add TSDoc clarifying that existing copy fields are the "why" layer, while commitment is the "how" layer.
5. Add tolerant validators for optional fields.

Risk level: Low

Rollback:

- Revert only the type additions and validator optional-field clauses.
- Because all fields are optional, no persisted data migration is needed.

Definition of done:

- Existing API responses compile unchanged.
- Old decisions without new fields still validate.
- Type tests prove optional fields round-trip through JSON.

### Phase 1 — Traveler State Engine, Logging Only

Goal: infer traveler state deterministically from existing payload/context fields, with no scoring or UI effect.

Files to change:

- `src/types/hade.ts`
- `src/lib/hade/travelerState.ts`
- `src/lib/hade/engine.ts`
- `src/app/api/hade/decide/route.ts`
- `src/lib/hade/voiceIntentParser.ts`
- `src/lib/hade/logging.ts`

Exact new files:

- `src/lib/hade/travelerState.ts`
- `src/lib/hade/__tests__/travelerState.test.ts`

Tasks:

1. Create `inferTravelerState()` in `src/lib/hade/travelerState.ts`.
2. Use only existing fields:
   - `constraints`
   - `situation`
   - `intent`
   - `urgency`
   - `signals`
   - `rejection_history`
   - `distance_tolerance`
   - `time_available_minutes`
   - `day_type`
   - `mode`
   - `lens`
   - `candidate_categories`
3. Call inference after `buildContext()` in `route.ts`.
4. Attach result to debug/log output only.
5. Do not pass traveler state into ranking yet.
6. Preserve caller-supplied traveler state when present.

Risk level: Low

Rollback:

- Disable the `inferTravelerState()` call in `route.ts`.
- Keep types in place because they are optional and harmless.

Definition of done:

- No ranking change.
- No UI change.
- Logs show `traveler_state.primary`, confidence, and reason codes.
- Tests cover all deterministic rules.

### Phase 2 — Reachability and Time Window Foundation

Goal: compute time-window bucket, radius, and feasibility without changing UI.

Files to change:

- `src/types/hade.ts`
- `src/core/constants/radius.ts`
- `src/core/adapters/placesAdapter.ts`
- `src/core/services/places.ts`
- `src/app/api/hade/decide/route.ts`
- `src/core/engine/synthetic.ts`

Exact new files:

- `src/lib/hade/reachability.ts`
- `src/lib/hade/__tests__/reachability.test.ts`

Tasks:

1. Implement `resolveTimeWindowBucket()`.
2. Implement `timeBudgetToRadiusMeters()`.
3. Implement `computeWindowFit()`.
4. Add `RADIUS.WINDOW_MAX = 2400`.
5. Cap all time-scaled radius values.
6. Compute `fits_in_window` after a winner is selected.
7. Keep hard filters limited to impossible candidates.

Risk level: Medium

Rollback:

- Force `resolveTimeWindowBucket()` to return `"open_window"`.
- Keep `fits_in_window` absent from responses.
- Restore existing `RADIUS.SEARCH_DEFAULT` behavior.

Definition of done:

- Existing Places calls still work with no time budget.
- Unknown/absent time budget produces open/default behavior.
- Reachability tests prove buckets, radius caps, and fit arithmetic.

### Phase 3 — Decision Commitment Engine

Goal: produce deterministic commitment actions for the selected decision.

Files to change:

- `src/types/hade.ts`
- `src/lib/hade/commitment.ts`
- `src/core/domain/domainConfigs.ts`
- `src/core/engine/synthetic.ts`
- `src/app/api/hade/decide/route.ts`
- `src/app/api/hade/decide/validateDecision.ts`
- `src/lib/hade/supportText.ts`

Exact new files:

- `src/lib/hade/commitment.ts`
- `src/lib/hade/__tests__/commitment.test.ts`

Tasks:

1. Implement `deriveCommitmentAction()` with deterministic templates.
2. Template by domain, intent, time window, traveler state, and available minutes.
3. Attach `decision.commitment` when derivation succeeds.
4. Attach `decision.window_label` and `decision.fits_in_window` when time budget exists.
5. Keep `commitment` optional.
6. Static fallback may emit a minimal commitment, but must not be required to.
7. Do not use LLMs for commitment in this phase.

Risk level: Medium

Rollback:

- Stop attaching `decision.commitment`.
- UI hides commitment automatically because field is optional.
- Leave helper and tests in place for later reactivation.

Definition of done:

- Synthetic decisions can include a safe commitment object.
- Fallback decisions remain valid without it.
- Validation strips malformed commitment without failing response.

### Phase 4 — Ranking Integration

Goal: add bounded traveler, commitment, and micro-adventure fit scoring to the ranker.

Files to change:

- `src/core/engine/synthetic.ts`
- `src/core/domain/domainConfigs.ts`
- `src/lib/hade/travelerState.ts`
- `src/lib/hade/commitment.ts`
- `src/lib/hade/reachability.ts`
- `src/lib/hade/confidence.ts`
- `src/types/hade.ts`

Exact new files:

- `src/core/engine/__tests__/rankingEngines.test.ts`

Tasks:

1. Add these optional fields to `SpontaneousScoreBreakdown`:
   - `travelerStateBonus`
   - `commitmentFitBonus`
   - `microAdventureBonus`
   - `confidenceWeight`
2. Pass `traveler_state`, `window_bucket`, `commitment`, and surfaced history into `rankSpontaneousObjects()`.
3. Add `travelerStateFit()` as a bounded additive component.
4. Add `commitmentFit()` as a bounded additive component.
5. Add `microAdventureFit()` as a bounded additive component.
6. Keep all bonuses neutral when input is missing.
7. Keep rejection hard exclusions authoritative.
8. Keep Places and UGC candidates in the same pool.
9. Expose all score components in debug output.

Risk level: Medium to High

Rollback:

- Set all new bonus weights to `0`.
- Keep debug and type fields in place.
- Existing ranking formula remains available.

Definition of done:

- Low-energy/short-window state can shift ranking toward easier candidates.
- UGC with strong timing/social/trust can still win.
- Not This still hard-excludes rejected venues.
- Navigation payload remains valid.

### Phase 5 — Micro-Adventure Engine

Goal: compose one-to-three stop micro-adventures within a time budget.

Files to change:

- `src/types/hade.ts`
- `src/lib/hade/microAdventure.ts`
- `src/lib/hade/reachability.ts`
- `src/core/engine/synthetic.ts`
- `src/app/api/hade/decide/route.ts`
- `src/lib/hade/fallbackSelection.ts`
- `src/lib/hade/scenarios.ts`
- `src/lib/hade/useHade.ts`

Exact new files:

- `src/lib/hade/microAdventure.ts`
- `src/types/microAdventure.ts`
- `src/lib/hade/__tests__/microAdventure.test.ts`

Tasks:

1. Implement `sequenceStops()`.
2. Implement `composeMicroAdventure()`.
3. Start with one-to-two stops only.
4. Reuse surfaced/rejected history to avoid stale chains.
5. Ensure every itinerary satisfies the `WindowFit` budget invariant.
6. Attach to `DecideResponse.micro_adventure`.
7. If no valid chain exists, omit `micro_adventure` and keep the single decision.
8. Do not change cold-start fallback behavior.

Risk level: Medium

Rollback:

- Stop populating `DecideResponse.micro_adventure`.
- Keep single-decision response as source of truth.
- Disable UI entry points for micro-adventure sheet.

Definition of done:

- A valid single decision is always returned.
- Micro-adventure is additive and optional.
- Itineraries never exceed available time.
- UGC and Places both remain eligible stops.

### Phase 6 — Decision Card UX

Goal: render commitment, traveler state, and micro-adventure data when present.

Files to change:

- `src/components/hade/mobile/DecisionScreen.tsx`
- `src/components/hade/mobile/HeroDecisionCard.tsx`
- `src/components/hade/mobile/PrimaryAction.tsx`
- `src/components/hade/mobile/RefineSheet.tsx`
- `src/components/hade/adaptive/ContextSignalBadge.tsx`
- `src/lib/hade/viewModel.ts`
- `src/lib/hade/useHade.ts`
- `src/lib/hade/supportText.ts`

Exact new files:

- `src/components/hade/mobile/CommitmentSheet.tsx`
- `src/components/hade/mobile/MicroAdventureSheet.tsx`
- `src/components/hade/mobile/WindowEntrySheet.tsx`
- `src/components/hade/mobile/ReturnClock.tsx`

Tasks:

1. Commitment preview renders only when `decision.commitment` exists.
2. `fits_in_window` chip renders only when present.
3. Traveler state pill renders only when confidence is above threshold.
4. Micro-adventure sheet opens only when response has `micro_adventure`.
5. Primary CTA remains navigation-compatible.
6. "Just navigate" escape remains available when commitment sheet is shown.
7. Refine gains optional state/time correction controls.
8. UI must hide all new surfaces for old responses.

Risk level: Medium

Rollback:

- Hide new UI surfaces behind flags:
  - `HADE_COMMITMENT_UI`
  - `HADE_TRAVELER_STATE_UI`
  - `HADE_MICRO_ADVENTURE_UI`
- Navigation continues through existing handler.

Definition of done:

- No layout overlap on mobile.
- UGC temporal copy remains preferred for live UGC.
- Static fallback cards render cleanly.
- Existing Refine, Not This, Previous, and navigation still work.

### Phase 7 — QA, Regression, and Rollout

Goal: prove nothing regressed.

Files to change:

- Test files only, unless regressions are found.

Exact new files:

- `src/app/api/hade/decide/__tests__/validateDecision.test.ts`
- `src/core/engine/__tests__/candidatePipeline.regression.test.ts`
- `src/components/hade/mobile/__tests__/decisionCardEngines.test.tsx`

Tasks:

1. Add scenario matrix tests:
   - Places available
   - Places unavailable
   - missing Google key
   - UGC-only
   - custom candidates
   - malformed custom candidates
   - cold start
   - unknown geo
   - Not This
   - Refine
   - Navigation
   - offline cache
   - static fallback
   - Urban Mobility default
2. Add golden ranking fixtures for dining/social/travel.
3. Add mobile rendering tests for absent/present optional fields.
4. Add manual QA checklist.

Risk level: Low

Rollback:

- Disable all feature flags.
- Set scoring bonuses to zero.
- Stop attaching optional response fields.

Definition of done:

- `npm run type-check` passes.
- Targeted Vitest suites pass.
- `npm run build` passes.
- Manual QA confirms preserved flows.

## 5. Proposed TypeScript Interfaces

These are proposed final interfaces. Existing lighter-weight contracts may coexist during migration. All fields are optional where attached to existing response objects.

```ts
export type DecisionSource =
  | "llm"
  | "synthetic"
  | "static_fallback"
  | "cold_start_synthetic"
  | "offline_cache";

export type TravelerState =
  | "exploring"
  | "waiting"
  | "transitioning"
  | "recovering"
  | "socializing"
  | "solo_confidence"
  | "low_energy"
  | "time_constrained"
  | "arrival_orientation"
  | "weather_detour"
  | "hungry_now"
  | "open_to_surprise"
  | "micro_adventure_ready"
  | "decision_fatigue";

export type TravelerStateSource =
  | "voice"
  | "context"
  | "manual"
  | "signal"
  | "geo_velocity";

export interface InferredTravelerState {
  primary: TravelerState;
  secondary?: TravelerState[];
  confidence: number;
  source: TravelerStateSource;
  reason_codes: string[];
  inferred_at: number;
  ttl_ms: number;
  override?: TravelerState;
}

export type CommitmentCue =
  | "order"
  | "sit"
  | "photo"
  | "chat"
  | "walk"
  | "browse"
  | "pause"
  | "return";

export interface CommitmentStep {
  order: number;
  instruction: string;
  duration_seconds?: number;
  cue?: CommitmentCue;
}

export interface PostAction {
  kind: "walk_to" | "next_stop" | "home" | "transit" | "none";
  target_geo?: GeoLocation;
  walking_minutes?: number;
  label?: string;
}

export interface DecisionCommitment {
  action_title: string;
  visit_duration_minutes: number;
  steps: CommitmentStep[];
  post_action?: PostAction;
  primary_cta_label: string;
  generated_by: "engine" | "llm";
  template_id?: string;
}

export type TimeWindowBucket =
  | "lightning"
  | "quick_break"
  | "short_loop"
  | "extended"
  | "open_window";

export type DeadTimeContext =
  | "before_checkin"
  | "before_dinner"
  | "during_layover"
  | "between_meetings"
  | "waiting_for_transit"
  | "low_energy_evening"
  | "generic";

export interface WindowFit {
  travel_out_min: number;
  dwell_min: number;
  travel_back_min: number;
  total_min: number;
  buffer_min: number;
  fits: boolean;
  bucket: TimeWindowBucket;
}

export interface MicroAdventureStop {
  order: number;
  venue: HadeDecision;
  dwell_min: number;
  cues: Array<
    | "order_quick"
    | "stay_outside"
    | "grab_to_go"
    | "snap_photo"
    | "people_watch"
    | "sit_inside"
  >;
  transition_to_next_min?: number;
  commitment?: DecisionCommitment;
  fits: WindowFit;
}

export interface MicroAdventure {
  id: string;
  bucket: TimeWindowBucket;
  context: DeadTimeContext;
  stops: MicroAdventureStop[];
  total_walking_min: number;
  total_dwell_min: number;
  total_min: number;
  buffer_min: number;
  return_path: {
    distance_m: number;
    walking_min: number;
    target_geo: GeoLocation;
  } | null;
  is_loop: boolean;
  rationale: string;
  fits_budget: boolean;
  fallback_reason?: string;
}
```

### Additive Existing-Type Extensions

```ts
export interface HadeConstraints {
  time_available_minutes?: number;
  time_window_end_ms?: number;
  return_to_origin?: boolean;
  window_bucket?: TimeWindowBucket;
}

export interface HadeContext {
  traveler_state?: InferredTravelerState;
  traveler_state_confidence?: number;
  dead_time_context?: DeadTimeContext;
  window_bucket?: TimeWindowBucket;
}

export interface HadeDecision {
  commitment?: DecisionCommitment;
  fits_in_window?: WindowFit;
  window_label?: string;
  traveler_state_applied?: TravelerState;
}

export interface DecideResponse {
  source?: DecisionSource;
  micro_adventure?: MicroAdventure;
  inferred_traveler_state?: InferredTravelerState;
}
```

## 6. Helper Function Signatures

Create these helpers before integrating into UI:

```ts
// src/lib/hade/travelerState.ts
export function inferTravelerState(
  context: HadeContext,
  options?: {
    raw_voice_text?: string;
    manual_override?: TravelerState;
    mode?: string;
    lens?: string;
  },
): InferredTravelerState | null;

// src/lib/hade/reachability.ts
export function resolveTimeWindowBucket(
  minutes?: number | null,
): TimeWindowBucket | null;

export function timeBudgetToRadiusMeters(
  minutes: number | undefined,
  options?: {
    walk_speed_m_per_min?: number;
    max_radius_m?: number;
  },
): number | null;

export function computeWindowFit(input: {
  distance_meters: number;
  dwell_min: number;
  time_available_minutes?: number;
  return_to_origin?: boolean;
  walk_speed_m_per_min?: number;
}): WindowFit | null;

export function isReachable(input: {
  distance_meters: number;
  budget_minutes: number;
  dwell_min: number;
  return_to_origin: boolean;
}): boolean;

// src/lib/hade/commitment.ts
export function deriveCommitmentAction(input: {
  decision: HadeDecision;
  context: HadeContext;
  traveler_state?: InferredTravelerState | null;
  window_fit?: WindowFit | null;
  domain_id?: string;
}): DecisionCommitment | null;

export function estimateDwellMinutes(input: {
  category: string;
  intent?: Intent | null;
  bucket?: TimeWindowBucket | null;
  traveler_state?: TravelerState | null;
}): number;

// src/lib/hade/microAdventure.ts
export function sequenceStops(input: {
  candidates: Array<{ candidate: RankedCandidate; score: number }>;
  context: HadeContext;
  bucket: TimeWindowBucket;
  origin: GeoLocation;
  rejected_ids?: Set<string>;
  surfaced_ids?: Set<string>;
  max_stops?: number;
}): MicroAdventureStop[];

export function composeMicroAdventure(input: {
  selected: HadeDecision;
  ranked_candidates: Array<{ candidate: RankedCandidate; score: number }>;
  context: HadeContext;
  bucket: TimeWindowBucket;
  origin: GeoLocation;
}): MicroAdventure | null;
```

## 7. API Response Additions

`POST /api/hade/decide` may add these optional fields:

```ts
{
  "decision": {
    "...existing": "...",
    "commitment": {
      "action_title": "30-minute coffee reset",
      "visit_duration_minutes": 22,
      "steps": [
        { "order": 1, "instruction": "Walk over and order at the counter.", "cue": "walk" },
        { "order": 2, "instruction": "Sit for 15 minutes, then reassess.", "cue": "sit" }
      ],
      "primary_cta_label": "Start 30-minute plan",
      "generated_by": "engine"
    },
    "fits_in_window": {
      "travel_out_min": 5,
      "dwell_min": 20,
      "travel_back_min": 5,
      "total_min": 30,
      "buffer_min": 0,
      "fits": true,
      "bucket": "quick_break"
    },
    "window_label": "Fits your 30-minute window",
    "traveler_state_applied": "waiting"
  },
  "micro_adventure": {
    "id": "micro-synthetic-abc123",
    "bucket": "short_loop",
    "context": "between_meetings",
    "stops": [],
    "total_walking_min": 12,
    "total_dwell_min": 28,
    "total_min": 40,
    "buffer_min": 5,
    "return_path": null,
    "is_loop": false,
    "rationale": "A compact loop that fits the available window.",
    "fits_budget": true
  },
  "inferred_traveler_state": {
    "primary": "waiting",
    "secondary": ["time_constrained"],
    "confidence": 0.86,
    "source": "context",
    "reason_codes": ["time_available=30min", "urgency=medium"],
    "inferred_at": 1779480000000,
    "ttl_ms": 1800000
  }
}
```

Response rules:

- Omit optional objects when unavailable.
- Never return `null` for `decision`.
- Never require `commitment`, `fits_in_window`, `micro_adventure`, or `inferred_traveler_state`.
- Validator warnings for optional invalid objects must not force fallback.
- `source` must preserve current emitted values.

## 8. UI Rendering Rules

### Decision Card

Files:

- `src/components/hade/mobile/HeroDecisionCard.tsx`
- `src/lib/hade/viewModel.ts`

Rules:

- Render commitment preview below primary support only when `decision.commitment` exists.
- Show at most two commitment steps on the card.
- Render `fits_in_window` chip next to ETA when present.
- If `fits_in_window.fits === true`, copy: `Fits your N min`.
- If `fits_in_window.fits === false`, copy: `Tight fit`.
- Do not render raw score names or engine names.
- UGC temporal copy remains preferred for UGC cards.
- Fallback cards must not show empty commitment/state/adventure placeholders.

### Primary CTA

Files:

- `src/components/hade/mobile/PrimaryAction.tsx`
- `src/components/hade/mobile/DecisionScreen.tsx`

Rules:

- If commitment exists, primary CTA opens `CommitmentSheet`.
- Provide secondary `Just navigate` escape that uses the current navigation handler.
- If commitment is absent, preserve existing navigation behavior.
- Resolve duplicate CTA labels between `PrimaryAction.tsx` and hard-coded `DecisionScreen` CTA.

### Traveler State Pill

Files:

- `src/components/hade/adaptive/ContextSignalBadge.tsx`
- `src/components/hade/mobile/RefineSheet.tsx`
- `src/components/hade/mobile/DecisionScreen.tsx`

Rules:

- Render only when confidence is at or above threshold.
- Initial threshold: `0.75` for UI; `0.65` may be used in non-prod testing.
- Copy format: `Sensing: low energy`.
- Tap opens Refine state-correction control.
- User correction overrides inference for the current session.

### Micro-Adventure Sheet

Files:

- `src/components/hade/mobile/MicroAdventureSheet.tsx`
- `src/components/hade/mobile/DecisionScreen.tsx`

Rules:

- Open only when `response.micro_adventure` exists and has at least one stop.
- Initial release displays one-to-two stops only.
- Show total time, walking time, stop order, and return/buffer state.
- Never replace the single primary decision; the itinerary is additive.

### Time Budget Entry

Files:

- `src/components/hade/mobile/WindowEntrySheet.tsx`
- `src/components/hade/mobile/DecisionScreen.tsx`
- `src/components/hade/mobile/RefineSheet.tsx`

Rules:

- Offer 15 / 30 / 45 / 60 / unlimited.
- Writes to `constraints.time_available_minutes`.
- Triggers re-decide with unchanged lens/mode unless user changes lens.
- Urban Mobility remains the default lens if no explicit lens has been chosen.

## 9. Unit Test Plan

### Type and Contract Tests

Files:

- `src/types/__tests__/hade-contracts.test.ts`
- `src/app/api/hade/decide/__tests__/validateDecision.test.ts`

Cases:

- Existing minimal `DecideRequest` still type-checks.
- New optional fields can be present on request, decision, debug payload, and response.
- `DecisionSource` accepts all emitted source values.
- Old response without new fields renders/serializes safely.
- Invalid optional commitment is stripped, not fatal.
- `WindowFit.total_min` arithmetic invariant is enforced or warned.

### Traveler State Tests

File:

- `src/lib/hade/__tests__/travelerState.test.ts`

Cases:

- time available <= 20 -> `waiting` / `time_constrained`.
- time available <= 45 -> `micro_adventure_ready` or waiting-state secondary.
- rejection history length >= 2 -> `decision_fatigue` / `open_to_surprise`.
- empty intent + cold start -> open-to-surprise state.
- wellness lens/categories -> recovering.
- social mode/lens -> socializing.
- low energy -> low_energy or recovering.
- group friends + evening + scene/drink -> socializing.
- all-default context does not produce high-confidence false positive.
- manual override wins.

### Reachability Tests

File:

- `src/lib/hade/__tests__/reachability.test.ts`

Cases:

- 12 minutes -> lightning.
- 30 minutes -> quick_break.
- 45 minutes -> short_loop.
- 75 minutes -> extended.
- 120 minutes -> open_window.
- undefined -> null/open behavior.
- 500m with 15 minutes round trip is unreachable.
- 200m with 15 minutes round trip is reachable.
- radius never exceeds `RADIUS.WINDOW_MAX`.
- normalized weights sum to 1.0.

### Commitment Tests

File:

- `src/lib/hade/__tests__/commitment.test.ts`

Cases:

- eating with 45-minute window includes order/sit steps.
- chill with 20-minute window avoids photo-heavy cue.
- visit duration is clamped to available time.
- fallback decision can omit commitment.
- generated commitment has 2 to 5 steps.
- post action emits safe target or `none`.

### Micro-Adventure Tests

File:

- `src/lib/hade/__tests__/microAdventure.test.ts`

Cases:

- one-stop adventure wraps selected decision.
- two-stop chain stays within budget.
- rejected candidates are not included.
- surfaced candidates are deprioritized.
- no valid chain returns null, not fallback.
- UGC candidate can be a stop.
- Places candidate can be a stop.

### UI Tests

Files:

- `src/components/hade/mobile/__tests__/decisionCardEngines.test.tsx`
- existing mobile component tests if present

Cases:

- Card renders with no new fields.
- Card renders with commitment only.
- Card renders with traveler state only.
- Card renders with micro-adventure response.
- Fallback card renders without commitment.
- UGC card keeps UGC temporal copy.
- Primary CTA still supports navigation escape.

## 10. Regression Test Plan

Run after each phase:

- `npm run type-check`
- targeted `npx vitest run ...`
- `npm run build`

Regression matrix:

| Area | Must Preserve |
|---|---|
| Places pipeline | Places candidates still fetched, normalized, filtered, and ranked |
| UGC pipeline | stored UGC and custom candidates still merge into ranked pool |
| Cold-start fallback | never returns null decision |
| Refine | existing intent/urgency refine still works |
| Not This | rejected id/name remains hard-excluded |
| Navigation | current map URL and handoff still work |
| Lens/mode | mode and candidate category behavior remains intact |
| Urban Mobility | remains default when no explicit lens/mode is selected |
| Offline cache | still used when Tier 1 fails |
| Static fallback | still valid when everything else fails |
| Unknown geo | does not fetch fake-location Places |

Specific regression cases:

1. No Google key -> valid fallback response.
2. Places API returns empty -> UGC-only can still rank.
3. UGC-only candidate pool -> winner selected when valid.
4. Two Not This events -> rejected venues never return.
5. Refine after Not This -> rejection history preserved.
6. Cold start no intent/no signals/no rejections -> valid cold-start decision/fallback.
7. Urban Mobility lens default -> travel-oriented categories preserved.
8. Micro-adventure absent -> old single-card UI path unchanged.
9. Commitment absent -> primary CTA navigates as before.
10. Traveler state confidence low -> state pill hidden.

## 11. Risk Register

| Change | Risk | Mitigation |
|---|---|---|
| Optional type additions | Low | Keep optional, add contract tests |
| Validator extension | Medium | Strip invalid optional fields, never fail whole decision |
| Traveler inference logging | Low | No scoring/UI effect until accuracy threshold |
| Traveler scoring | High | Feature flag, bounded bonuses, accuracy gate |
| Reachability radius scaling | Medium | Cap radius, test Places query volume |
| Commitment helper | Medium | Deterministic templates, optional rendering |
| Commitment UI | Medium | Hide when absent, keep navigation escape |
| Micro-adventure sequencing | Medium | Keep single decision primary, omit itinerary on failure |
| LLM structured steps | High | Defer; engine-generated floor first |
| CTA consolidation | Medium | Component tests and manual QA |
| Type cleanup / renames | High | Defer; version-gate any breaking rename |
| Dependency changes | Medium | Follow `dependency-notes.md`; never run `npm audit fix --force` |

## 12. Rollback Strategy

Global rollback order:

1. Disable UI flags:
   - `HADE_COMMITMENT_UI=false`
   - `HADE_TRAVELER_STATE_UI=false`
   - `HADE_MICRO_ADVENTURE_UI=false`
2. Set new score weights to zero.
3. Stop attaching optional response objects in `route.ts`.
4. Keep type additions unless a compile issue requires revert.
5. Restore static `RADIUS.SEARCH_DEFAULT` if reachability causes Places issues.
6. Keep navigation fallback visible at all times.

Per-engine rollback:

- Traveler State: stop calling `inferTravelerState()` or ignore result in route/ranker.
- Commitment: omit `decision.commitment`; UI hides.
- Micro-Adventure: omit `response.micro_adventure`; single decision remains.
- Reachability: return `null` bucket / open window for all contexts.

Breaking-change rollback:

- Do not rename `SpontaneousObject.source` in this implementation cycle.
- If attempted in a later version, ship a codemod or compatibility alias first.

## 13. Definition of Done

The implementation is complete when:

1. All new fields are optional and backward compatible.
2. Existing API responses still validate.
3. Existing Places/UGC/cold-start/Refine/Not This/navigation/lens flows pass regression tests.
4. Traveler State inference runs deterministically without LLM/API usage.
5. Commitment generation has deterministic templates and no LLM dependency.
6. Micro-adventure generation is optional and never blocks a single decision.
7. Debug output exposes new scoring components.
8. UI renders new fields only when present.
9. Navigation remains available from every committed flow.
10. Urban Mobility remains the default behavior for unspecified lens/mode.
11. `npm run type-check`, targeted tests, and `npm run build` pass.
12. Rollback flags and zero-weight rollback path are documented and tested.

## 14. Manual QA Checklist

Before release:

- Cold start with real geo.
- Cold start with unknown geo.
- Places API unavailable.
- UGC event nearby.
- Custom candidate request.
- Not This twice.
- Refine after Not This.
- Navigate from normal card.
- Navigate from commitment card.
- Time budget set to 15, 30, 45, 60.
- Wellness lens.
- Social lens.
- Urban Mobility default.
- Static fallback card.
- Offline cache response.
- Mobile small viewport.
- Long venue name.
- UGC temporal copy.


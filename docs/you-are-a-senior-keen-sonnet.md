# HADE Strategic Audit — Decision Commitment / Traveler State / Micro-Adventure

## Context

HADE today ranks one place and renders a single "Your move" card. The three product opportunities push HADE past pure recommendation into **structured commitment** (what to do, for how long, then what), **state inference** (what kind of traveler-moment is this), and **time-windowed micro-experiences** (15/30/45/60-min dead-time). This audit maps existing scaffolding to those goals, identifies missing primitives, and proposes a phased implementation path tied to concrete files.

Scope: read-only audit. No code changes. Findings below are quoted against file:line where load-bearing.

---

## 1) Current Architecture Summary

**Decision pipeline** (request → response):
1. UI collects intent/mode/lens/voice → `useHade.decide()` ([src/lib/hade/useHade.ts](src/lib/hade/useHade.ts))
2. `POST /api/hade/decide` ([src/app/api/hade/decide/route.ts](src/app/api/hade/decide/route.ts)) — candidate sourcing (Google Places + UGC), LLM or synthetic ranking, validation
3. Engine helpers in [src/lib/hade/engine.ts](src/lib/hade/engine.ts): `scoreOpportunity()`, `rankOpportunities()`, `generateSituationSummary()`
4. Copy assembled by [supportText.ts](src/lib/hade/supportText.ts), [deriveReasons.ts](src/lib/hade/deriveReasons.ts), [explanation.ts](src/lib/hade/explanation.ts)
5. Returned as a single `HadeDecision` ([src/types/hade.ts:251](src/types/hade.ts)) wrapped by `DecideResponse` ([src/types/hade.ts:310](src/types/hade.ts))

**Key signals & state**:
- `HadeContext` = `HadeSituation` + `HadeState{energy, openness}` + `HadeSocial` + `HadeConstraints{budget, time_available_minutes, distance_tolerance}` ([src/types/hade.ts:102–122](src/types/hade.ts))
- 7 SignalTypes: PRESENCE / SOCIAL_RELAY / ENVIRONMENTAL / BEHAVIORAL / AMBIENT / EVENT / INTENT ([src/types/hade.ts:11–18](src/types/hade.ts))
- 6 LensProfiles ([src/lib/hade/lensProfiles.ts](src/lib/hade/lensProfiles.ts)), 5 Presets ([src/lib/hade/presets.ts](src/lib/hade/presets.ts)), 3 DomainModes (dining/social/travel), 3 Scenarios (exploration/quick/social) ([src/lib/hade/scenarios.ts](src/lib/hade/scenarios.ts))
- Confidence via [confidence.ts](src/lib/hade/confidence.ts), weighted vibe edges via [weights.ts](src/lib/hade/weights.ts)

**Fallback chain**: Static fallback set → synthetic engine ([src/core/engine/synthetic.ts](src/core/engine/synthetic.ts)) → cold-start surfacing penalty ([surfacedPenalty.ts](src/lib/hade/surfacedPenalty.ts), [fallbackSelection.ts](src/lib/hade/fallbackSelection.ts)).

---

## 2) Current UX Flow Summary

Mobile card surface in [DecisionScreen.tsx](src/components/hade/mobile/DecisionScreen.tsx) renders [HeroDecisionCard.tsx](src/components/hade/mobile/HeroDecisionCard.tsx) with:
- Header chip ("Your move" / "Community")
- Venue name + category
- Meta chips: "Happening now" / "Starting in X min", social count, ETA
- Support copy via `supportText`, lens frame
- One `PrimaryAction` ("Take me there") + two `SecondaryActions` ("Previous", "Refine")
- Sheets: `RefineSheet`, `VibeSheet`, `CompareModesSheet`, `UgcVerificationSheet`, `PinSpotSheet`, `VoiceSheet`, `OtherModesPanel`

`ContextSignalBadge` ([src/components/hade/adaptive/ContextSignalBadge.tsx](src/components/hade/adaptive/ContextSignalBadge.tsx)) renders **intent + urgency + mode** dots — *not* traveler state.

`ActivityCreationView.tsx` collects vibe / what / location / **start time** — not duration.

---

## 3) Existing Support per Opportunity

### Opportunity 1 — Decision Commitment Engine
**Present**:
- `supportText.ts` already emits time-bounded copy ("Best in the next 25 minutes") — closest existing analogue to a step.
- `eta_minutes` ([src/types/hade.ts:257](src/types/hade.ts)) computed at [route.ts ~line 1110](src/app/api/hade/decide/route.ts) (`Math.ceil(dist / 80)`).
- `generateSituationSummary()` ([engine.ts:203](src/lib/hade/engine.ts)) is a ready-made anchor string for commitment generation.
- LLM prompt builders `buildSystemPrompt` / `buildDecisionPrompt` ([prompt.ts](src/lib/hade/prompt.ts)) can be extended to demand structured output.
- Four copy fields already exist (`rationale`, `why_now`, `why_this`, `decision_frame`) — i.e., a "why" layer is rich; a "how to execute" layer is the gap.

**Absent**: No step array, no visit-duration field, no post-place follow-on, no ordering/sit/photograph cues, no UI block for sequenced micro-instructions.

### Opportunity 2 — Real-Time Traveler State Engine
**Present**:
- `HadeState{energy, openness}` exists but is *user-provided or defaulted to "medium"* ([engine.ts:141](src/lib/hade/engine.ts)) — no inference.
- `voiceIntentParser.ts` extracts energy keywords; could be extended.
- Signal infrastructure (`emitSignal`, `aggregateSignals`, `filterByType`) ready to host a `TRAVELER_STATE` signal type ([src/lib/hade/signals.ts](src/lib/hade/signals.ts)).
- `LocationNode.weight_map` ([weights.ts](src/lib/hade/weights.ts)) could carry per-state venue affinities.

**Absent**: Zero matches in `src/` for `TravelerState`, `traveler_state`, `inferState`. No inference function, no field on context/response, no UI badge for state.

### Opportunity 3 — Micro-Adventure / Dead-Time Engine
**Present** (more groundwork than the other two):
- `HadeConstraints.time_available_minutes` exists ([src/types/hade.ts:120](src/types/hade.ts)) and flows end-to-end.
- `voiceIntentParser.parseTimeMinutes()` already converts "half an hour" / "an hour" / "X minutes" ([voiceIntentParser.ts ~line 54](src/lib/hade/voiceIntentParser.ts)) and auto-boosts urgency to "high" when ≤20 min.
- Haversine + 80 m/min walk constant exist — invertible to time→radius.
- Situation summary already verbalises "${mins}-minute window" — already in the LLM prompt.

**Absent**: `DecideResponse.decision` is a **single** HadeDecision (no array, no `next_stop`, no `itinerary`); the file's own comment at [src/types/hade.ts:246](src/types/hade.ts) reads *"No fallbacks. No primary+secondary. One decision."* (echoed at line 307) Radius is static (`RADIUS.SEARCH_DEFAULT = 800` in [src/core/constants/radius.ts](src/core/constants/radius.ts)) — never scaled by time budget. No 15/30/45/60-min preset or scenario. No UI control to enter a time budget (ActivityCreationView captures start time, not duration).

---

## 4) Missing Logic

| Gap | Location it would live |
|---|---|
| `inferTravelerState(signals, context): TravelerState` | new file `src/lib/hade/travelerState.ts` |
| `generateCommitment(decision, context): Commitment` | new helper in [engine.ts](src/lib/hade/engine.ts) |
| Isochrone / time→radius scaler | new util `src/lib/hade/reachability.ts`; consumed in [route.ts](src/app/api/hade/decide/route.ts) candidate query |
| Multi-stop sequencer (chain N stops within budget) | new helper alongside `rankOpportunities` in [engine.ts](src/lib/hade/engine.ts) |
| Commitment validation (sum of durations ≤ time budget) | [validateDecision.ts](src/app/api/hade/decide/validateDecision.ts) |
| LLM schema extension demanding structured `steps[]` + `post_action` | [prompt.ts](src/lib/hade/prompt.ts) `buildDecisionPrompt` |
| State-correction telemetry endpoint | new route `src/app/api/hade/state/route.ts`, mirrored after [signal/route.ts](src/app/api/hade/signal/route.ts) |
| Scoring hook that lets state shift weights (proximity/intent) | [engine.ts:317–350 `scoreOpportunity()`](src/lib/hade/engine.ts) |

---

## 5) Missing UI States

| Need | Component to add/extend |
|---|---|
| Commitment block (duration header, ordered steps, post-place action, cue toggles) | new `src/components/hade/mobile/CommitmentSheet.tsx`; mount from [PrimaryAction.tsx](src/components/hade/mobile/PrimaryAction.tsx) |
| Inline step preview on hero card | [HeroDecisionCard.tsx](src/components/hade/mobile/HeroDecisionCard.tsx) — insert slot after `primarySupport` render (~line 123, prop declared at 93) |
| TravelerState pill ("Sensing: low-energy" / "Arrival mode") | new variant of [ContextSignalBadge.tsx](src/components/hade/adaptive/ContextSignalBadge.tsx); correction control via [RefineSheet.tsx](src/components/hade/mobile/RefineSheet.tsx) |
| Time-budget chip / input ("I have 30 minutes") | new control on [DecisionScreen.tsx](src/components/hade/mobile/DecisionScreen.tsx); also extend [ActivityCreationView.tsx](src/components/hade/mobile/ActivityCreationView.tsx) |
| Itinerary view for multi-stop micro-adventure | new `src/components/hade/mobile/MicroAdventureSheet.tsx`, reusing `HeroDecisionCard` per stop |
| "Layover / dead time" entry preset chips | new row in [OtherModesPanel.tsx](src/components/hade/mobile/OtherModesPanel.tsx) |

---

## 6) Missing Data Fields

Extend [src/types/hade.ts](src/types/hade.ts) (and mirror across [validateDecision.ts](src/app/api/hade/decide/validateDecision.ts) and [src/core/types/decision.ts](src/core/types/decision.ts)):

```ts
// On HadeDecision (around line 251–303):
commitment?: {
  visit_duration_minutes: number;
  steps: { order: number; instruction: string; duration_seconds?: number; cue?: "order"|"sit"|"photo"|"chat" }[];
  post_action?: { kind: "walk_to"|"next_stop"|"home"; target_geo?: GeoLocation; walking_minutes?: number };
};

// On DecideResponse (around line 310):
itinerary?: { stops: HadeDecision[]; total_walking_minutes: number; total_duration_minutes: number };

// On HadeContext (around line 175) and DecideRequest (around line 205):
traveler_state?: TravelerState;  // inferred
traveler_state_confidence?: number;

// On HadeConstraints (around line 118–122):
time_window_end_ms?: number;     // deadline, distinct from duration

// New top-level union:
type TravelerState =
  | "exploring" | "waiting" | "transitioning" | "recovering"
  | "socializing" | "solo_confidence" | "low_energy"
  | "time_constrained" | "arrival_orientation";
```

---

## 7) Overlapping / Redundant Logic

- **Four "why" copy fields** — `rationale`, `why_now`, `why_this`, `decision_frame` all sit on `HadeDecision` and risk colliding with new `commitment.steps`. Resolution: keep the four as the *why* layer; commitment is the *how* layer. Make UI separation explicit in [HeroDecisionCard.tsx](src/components/hade/mobile/HeroDecisionCard.tsx).
- **Mode ↔ Lens ↔ Preset ↔ Vibe ↔ Intent ↔ HadeState** — six concept axes already exist; a 7th (`TravelerState`) will compound confusion. Resolution: TravelerState is *inferred & temporal*, all others are *explicit & persistent*; document axes in a comment block at top of [engine.ts](src/lib/hade/engine.ts).
- **`eta_minutes` vs visit duration** — `eta_minutes` is travel time only ([route.ts ~1110](src/app/api/hade/decide/route.ts)). Don't overload it; introduce `visit_duration_minutes` in `commitment`.
- **`time_available_minutes` ([src/types/hade.ts:120](src/types/hade.ts)) ↔ proposed `time_window_end_ms`** — duration vs deadline. Keep both; deadline derives duration when "now" is known.
- **Scenarios vs Presets** — both already wrap context defaults ([scenarios.ts](src/lib/hade/scenarios.ts), [presets.ts](src/lib/hade/presets.ts)). New dead-time presets should be a third axis ("micro-window presets") rather than overload either; or fold into scenarios with an explicit `micro_window_minutes` field.
- **`fallbackSelection.ts` carousel deduplication** — orthogonal to itinerary chaining; ensure multi-stop sequencer reuses its surfaced-history bookkeeping rather than reinventing it.

---

## 8) Risk Areas

1. **LLM contract breakage**: `buildDecisionPrompt` ([prompt.ts](src/lib/hade/prompt.ts)) returns prose-shaped reasoning; demanding structured `steps[]` will require JSON-mode and a fallback path in [route.ts](src/app/api/hade/decide/route.ts). Without a parser-tolerant validator in [validateDecision.ts](src/app/api/hade/decide/validateDecision.ts), the cold-start fallback regression pattern (cf. commit `85a9617`) will recur.
2. **Static fallback gap**: synthetic engine ([src/core/engine/synthetic.ts](src/core/engine/synthetic.ts)) returns one place. If commitment becomes a required field, synthetic must also emit a minimal commitment or the validator must mark it optional. Risk of empty hero card.
3. **State inference accuracy without telemetry**: shipping `traveler_state` to UI without a "wrong" feedback path (mirror of [signal/route.ts](src/app/api/hade/signal/route.ts)) means no learning loop — and a wrong "Sensing: low energy" pill erodes trust fast.
4. **Radius scaling and Places quota**: time→radius could explode candidate counts at the upper bound (60-min window). Cap in [src/core/constants/radius.ts](src/core/constants/radius.ts) and ensure `placesAdapter` paging is honoured ([placesAdapter.ts](src/core/adapters/placesAdapter.ts)).
5. **Concept overload in UI**: stacking mode + lens + preset + state pills will blow up `ContextSignalBadge` real estate. Need explicit IA decision before adding another chip.
6. **Validation drift**: three type sources of truth (`src/types/hade.ts`, `src/core/types/decision.ts`, `validateDecision.ts`). New fields must land in all three or runtime/static checks diverge.

---

## 9) Recommended Implementation Phases

### Phase 0 — Type & contract scaffolding (low risk, foundational)
- Add `commitment`, `itinerary`, `traveler_state`, `time_window_end_ms` to [src/types/hade.ts](src/types/hade.ts), mirroring into [src/core/types/decision.ts](src/core/types/decision.ts) and adding tolerant assertions in [validateDecision.ts](src/app/api/hade/decide/validateDecision.ts). All optional. Ship; no UI change.
- Add `TravelerState` union; document the six-axis disambiguation in a header comment in [engine.ts](src/lib/hade/engine.ts).

### Phase 1 — Dead-Time Engine (highest groundwork-to-value ratio)
- Implement `src/lib/hade/reachability.ts` (time→radius using existing 80 m/min constant and visit-time budget).
- Extend [src/lib/hade/scenarios.ts](src/lib/hade/scenarios.ts) with `layover_15`, `gap_30`, `loop_45`, `local_60` scenarios.
- Add time-budget chip to [DecisionScreen.tsx](src/components/hade/mobile/DecisionScreen.tsx); wire to `HadeConstraints.time_available_minutes`.
- Single-stop only initially. Verify against existing scoring before stacking.

### Phase 2 — Decision Commitment (rich UI, contained scope)
- Implement `generateCommitment()` in [engine.ts](src/lib/hade/engine.ts) — deterministic templates per domain (dining/social/travel) keyed off intent + duration. Quote `generateSituationSummary` output.
- Extend [prompt.ts](src/lib/hade/prompt.ts) to optionally request structured steps; tolerate absence.
- Build `CommitmentSheet.tsx` opened from [PrimaryAction.tsx](src/components/hade/mobile/PrimaryAction.tsx); render inline preview in [HeroDecisionCard.tsx](src/components/hade/mobile/HeroDecisionCard.tsx).
- Validation: sum(step durations) ≤ `time_available_minutes` in [validateDecision.ts](src/app/api/hade/decide/validateDecision.ts).

### Phase 3 — Traveler State (inference, telemetry-bound)
- Implement `inferTravelerState()` in new `src/lib/hade/travelerState.ts` using only existing signals (time_of_day, day_type, last-action recency, energy, urgency, voice keywords).
- Plug into `scoreOpportunity()` ([engine.ts:317–350](src/lib/hade/engine.ts)) behind a feature flag — start with logging only, no scoring shift.
- New UI variant on [ContextSignalBadge.tsx](src/components/hade/adaptive/ContextSignalBadge.tsx); add correction control to [RefineSheet.tsx](src/components/hade/mobile/RefineSheet.tsx).
- New `POST /api/hade/state` route mirroring [signal/route.ts](src/app/api/hade/signal/route.ts) for corrections; start learning loop.

### Phase 4 — Multi-stop micro-adventures (depends on Phases 1–2)
- Sequencer in [engine.ts](src/lib/hade/engine.ts) chaining 2–3 stops within reachability budget.
- `DecideResponse.itinerary` populated; new `MicroAdventureSheet.tsx`; reuse `fallbackSelection` surfaced-history to avoid stale chains.

### Phase 5 — State-aware scoring & commitment shaping
- Promote state from logging-only to weighting in `scoreOpportunity` (e.g. `recovering` collapses radius, `socializing` boosts social-signal weight).
- Commitment cues vary by state (e.g. `low_energy` ⇒ no photo cue, longer dwell).

---

## 10) Exact Files Likely Requiring Changes

**Core types & validation**
- [src/types/hade.ts](src/types/hade.ts) — add commitment / itinerary / traveler_state / time_window_end_ms; new `TravelerState` union (lines ~102–303)
- [src/core/types/decision.ts](src/core/types/decision.ts) — mirror
- [src/app/api/hade/decide/validateDecision.ts](src/app/api/hade/decide/validateDecision.ts) — tolerant validators for new optional fields; commitment-vs-budget invariant

**Engine & API**
- [src/lib/hade/engine.ts](src/lib/hade/engine.ts) — `generateCommitment`, state-aware scoring, multi-stop sequencer; touch `scoreOpportunity` (317–350), `rankOpportunities` (369–376), `generateSituationSummary` (203)
- [src/app/api/hade/decide/route.ts](src/app/api/hade/decide/route.ts) — invoke reachability, commitment, state inference; cap radius
- [src/lib/hade/prompt.ts](src/lib/hade/prompt.ts) — structured-output schema extension
- [src/core/engine/synthetic.ts](src/core/engine/synthetic.ts) — minimal commitment in fallback
- [src/core/constants/radius.ts](src/core/constants/radius.ts) — radius ceilings for time-scaled search

**New files**
- `src/lib/hade/travelerState.ts` — inference + types
- `src/lib/hade/reachability.ts` — time → radius / walking budget
- `src/app/api/hade/state/route.ts` — correction telemetry
- `src/components/hade/mobile/CommitmentSheet.tsx`
- `src/components/hade/mobile/MicroAdventureSheet.tsx`

**Existing UX surfaces to extend**
- [src/components/hade/mobile/DecisionScreen.tsx](src/components/hade/mobile/DecisionScreen.tsx) — time-budget chip, itinerary entry
- [src/components/hade/mobile/HeroDecisionCard.tsx](src/components/hade/mobile/HeroDecisionCard.tsx) — commitment preview slot (~line 118)
- [src/components/hade/mobile/PrimaryAction.tsx](src/components/hade/mobile/PrimaryAction.tsx) — opens CommitmentSheet
- [src/components/hade/mobile/RefineSheet.tsx](src/components/hade/mobile/RefineSheet.tsx) — state correction control
- [src/components/hade/adaptive/ContextSignalBadge.tsx](src/components/hade/adaptive/ContextSignalBadge.tsx) — new traveler-state variant
- [src/components/hade/mobile/OtherModesPanel.tsx](src/components/hade/mobile/OtherModesPanel.tsx) — dead-time preset chips
- [src/components/hade/mobile/ActivityCreationView.tsx](src/components/hade/mobile/ActivityCreationView.tsx) — duration input alongside start time
- [src/lib/hade/scenarios.ts](src/lib/hade/scenarios.ts) — layover / gap / loop scenarios
- [src/lib/hade/presets.ts](src/lib/hade/presets.ts) — optional dead-time preset (or leave to scenarios)
- [src/lib/hade/voiceIntentParser.ts](src/lib/hade/voiceIntentParser.ts) — extend with state keywords ("tired", "waiting", "just landed")
- [src/lib/hade/useHade.ts](src/lib/hade/useHade.ts) — surface new response fields to hooks

**Tests to add/extend**
- [src/lib/hade/__tests__/decision.behavior.test.ts](src/lib/hade/__tests__/decision.behavior.test.ts) — commitment shape invariants
- [src/lib/hade/__tests__/voiceIntentParser.test.ts](src/lib/hade/__tests__/voiceIntentParser.test.ts) — state keyword extraction
- New `reachability.test.ts`, `travelerState.test.ts`

---

## Verification

This is an audit deliverable; verification is editorial, not runtime:

1. Confirm every claim's file:line — spot-checks already done for `HadeConstraints.time_available_minutes` ([src/types/hade.ts:120](src/types/hade.ts)), single-`HadeDecision` shape (line 251 / 310), and zero matches in `src/` for `TravelerState|traveler_state|commitment|itinerary|microAdventure|deadtime`.
2. Review with product to confirm phase ordering reflects business priority (current ordering optimises for groundwork density, not necessarily user-visible wins — Dead-Time is most ready, Commitment is highest visible payoff, State has the longest tail).
3. Before Phase 0 lands, document the six-axis concept disambiguation (Mode / Lens / Preset / Vibe / Intent / HadeState ↔ new TravelerState) in [engine.ts](src/lib/hade/engine.ts) header to prevent confusion in subsequent PRs.

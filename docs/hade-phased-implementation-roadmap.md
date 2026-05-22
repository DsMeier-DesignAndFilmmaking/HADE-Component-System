# HADE Phased Implementation Roadmap

Date: May 22, 2026

Purpose: Add three new ranking engines to HADE without breaking the existing Places, UGC, Navigation, Refine, Not This, and cold-start fallback flows.

New engines:

1. Traveler State Engine
2. Decision Commitment Engine
3. Micro-Adventure Engine

Guiding principle: every change should be additive, bounded, observable, and neutral by default. Existing requests must continue to work without sending any new fields.

## Current Audit Findings

### Existing Strengths

- HADE already has a deterministic ranking pipeline in `src/core/engine/synthetic.ts`.
- Places and UGC are merged into one candidate pool before ranking.
- UGC can influence ranking through stored UGC candidates and LocationNode trust/vibe overlays.
- Rejection history already affects filtering, diversity, and scoring weights.
- Domain modes already provide distinct scoring weights for dining, social, and travel.
- Time-window filtering and scoring already exist for candidates with real time windows.
- Offline cache and static fallback provide resilience when the main engine cannot produce a decision.

### Current Candidate Sources

Effective candidate source order:

1. Tier 1 synthetic ranked pool
   - Stored UGC from `getNearbyUGC()`.
   - Request-level `custom_candidates`.
   - Google Places candidates from lens multi-query, domain multi-query, or intent/category adapter fallback.
   - All surviving candidates are merged and score-ranked together.

2. Tier 2 offline cache
   - Cached venues from prior synthetic results.
   - Ranked by proximity, rating, and cached LocationNode vibe overlay.

3. Tier 3 fallback Places
   - Direct Google Places fetch via `buildFallbackCandidates()`.
   - First returned place wins.
   - Does not run through the normal synthetic ranker.

4. Static fallback titles
   - Lens-specific fallback hints first.
   - Generic static titles second.
   - First static object wins.

### Current Scoring Inputs

Current Tier 1 scoring inputs:

- Candidate time window start relative to `now`.
- Candidate distance from user.
- Candidate `going_count`.
- Candidate `trust_score`.
- LocationNode trust via `getNodeTrustScore()`.
- LocationNode vibe via `getNodeVibeScore()`.
- Domain scoring weights from `src/core/domain/domainConfigs.ts`.
- Candidate `user_state`, currently `going`, `maybe`, or `null`.
- Raw Google Place `types`.
- Domain mode.
- Group size.
- Travel uniqueness types.
- Lens / `candidate_categories` match.
- Rejection-derived exploration bias.
- Random jitter from exploration bias.

Current filtering and pool-shaping inputs:

- `geo`.
- `geo_source`.
- `radius_meters`.
- `situation.intent`.
- `time_of_day`.
- `mode`.
- Domain allowlists and blacklists.
- `candidate_categories`.
- `rejection_history.venue_id`.
- `rejection_history.venue_name`.
- `rejection_history.category`.
- `rejection_history.pivot_reason`.
- UGC `created_at` and `expires_at`.
- Candidate `expires_at`.
- Candidate `time_window.end`.

### Key Gaps

Traveler State Engine gap:

- `state.energy`, `state.openness`, `social.group_size`, `social.group_type`, and constraints already exist in context.
- Only `social.group_size` has a meaningful ranking effect today.
- Energy and openness mostly affect narrative copy, not selection.

Decision Commitment Engine gap:

- Commitment inputs already exist indirectly: urgency, time available, distance tolerance, energy, openness, distance, and ETA.
- There is no explicit candidate-level commitment or friction score.

Micro-Adventure Engine gap:

- The current system has exploration bias, travel uniqueness, lens category boosts, and diversity after repeated rejections.
- There is no first-class micro-adventure score that balances novelty against low commitment.

Time-window gap:

- Time scoring exists, but Places candidates receive synthetic `now`-based windows.
- Time-window scoring is much more meaningful for UGC/custom candidates than for Google Places.

Confidence gap:

- `computeConfidence()` exists, but confidence does not currently affect ranking.
- Synthetic decisions expose confidence from final score, but confidence is not a rank input.

Fallback gap:

- Cold-start synthetic failure goes directly to cold-start fallback, bypassing offline cache.
- Direct fallback Places does not consult UGC.
- Malformed custom candidates fail the request instead of being soft-dropped.
- `geo_source: unknown` skips synthetic entirely, which can bypass UGC/custom ranking opportunities.

# Phase 1

## Data Contracts

### Goal

Define additive contracts for Traveler State, Decision Commitment, and Micro-Adventure scoring without changing current Places, UGC, Navigation, Refine, Not This, or cold-start fallback behavior.

### Files

- `src/types/hade.ts`
- `src/lib/hade/engine.ts`
- `src/core/engine/synthetic.ts`
- `src/core/domain/domainConfigs.ts`
- `src/lib/hade/viewModel.ts`

### Tasks

1. Add optional score fields to debug and decision metadata:
   - `traveler_state_fit`
   - `commitment_fit`
   - `micro_adventure_fit`

2. Add optional normalized context fields for:
   - traveler state inference
   - commitment preference
   - adventure preference

3. Keep all new fields optional and neutral by default.

4. Extend scoring breakdown types without changing existing response fields.

5. Document that `src/core/domain/domainConfigs.ts` is the active ranking config path, while `src/core/domain/config.ts` appears stale or legacy.

### Tests

- Type checks for `DecideRequest`, `HadeContext`, `HadeDebugPayload`, and scoring breakdown types.
- Regression test: existing decide request with no new fields returns valid response.
- Debug test: missing new fields produce neutral score components.
- View-model test: decision cards render if new metadata is absent.

### Risks

- Accidentally making new fields required.
- Contract drift between frontend request builders and the API route.
- Debug payload shape changes breaking tests or developer tooling.

### Definition of Done

- Existing clients work unchanged.
- New fields are typed, optional, and neutral by default.
- Debug mode can expose the new score components without changing selection behavior.

# Phase 2

## Traveler State Inference

### Goal

Create a deterministic inference layer that converts existing HADE context into ranking-ready traveler state signals.

### Files

- `src/lib/hade/engine.ts`
- `src/types/hade.ts`
- `src/lib/hade/hooks.ts`
- `src/lib/hade/useHade.ts`
- `src/lib/hade/voiceIntentParser.ts`
- `src/core/engine/synthetic.ts`

### Tasks

1. Infer stable traveler dimensions from existing context:
   - effort tolerance
   - stimulation preference
   - novelty appetite
   - group friction
   - pace / urgency

2. Use these source fields:
   - `state.energy`
   - `state.openness`
   - `social.group_size`
   - `social.group_type`
   - `constraints.time_available_minutes`
   - `constraints.distance_tolerance`
   - `situation.urgency`
   - `time_of_day`
   - `day_type`

3. Keep inference deterministic and explainable.

4. Do not filter candidates in this phase.

5. Ensure voice input and Refine flows preserve or update traveler state cleanly.

### Tests

- Low-energy user infers low effort tolerance.
- High-energy adventurous user infers higher novelty appetite.
- Group of friends infers higher social tolerance than solo comfort state.
- Voice parser changes still preserve existing category exclusions.
- Cold-start request gets stable default traveler state.

### Risks

- Encoding too much domain logic in generic state inference.
- Breaking frontend context assembly.
- Making Refine or voice flows overwrite user state too aggressively.

### Definition of Done

- Every decide call can derive a normalized traveler state object.
- Inference is deterministic, tested, and neutral for missing inputs.
- No ranking behavior changes yet except optional debug visibility.

# Phase 3

## Ranking Integration

### Goal

Wire Traveler State Engine outputs into ranking as bounded, additive score components.

### Files

- `src/core/engine/synthetic.ts`
- `src/core/domain/domainConfigs.ts`
- `src/lib/hade/weights.ts`
- `src/lib/hade/confidence.ts`
- `src/types/hade.ts`

### Tasks

1. Add `travelerStateBonus` to `SpontaneousScoreBreakdown`.

2. Pass normalized traveler state into:
   - `generateSyntheticDecision()`
   - `rankSpontaneousObjects()`
   - `scoreSpontaneousCandidate()`

3. Add conservative caps so traveler state cannot overwhelm:
   - Places distance
   - Places rating/trust
   - UGC social proof
   - UGC vibe/trust signals
   - rejection hard-exclusions

4. Make traveler state weighting domain-sensitive:
   - dining: effort and distance sensitivity matter more
   - social: stimulation and group fit matter more
   - travel: openness and quality tolerance matter more

5. Add debug output for traveler fit.

### Tests

- Same candidate pool, low-energy state favors closer/lower-effort candidate.
- Same candidate pool, adventurous state can favor a slightly farther unique candidate.
- Strong UGC trust/vibe can still beat a traveler-state-favored Places candidate.
- Not This still hard-excludes rejected venue ids and names.
- Navigation metadata remains valid for selected candidate.

### Risks

- Traveler score could become too dominant.
- Existing domain weights could become harder to reason about.
- Exploration jitter could obscure deterministic score behavior in tests.

### Definition of Done

- Traveler state affects ranking only through bounded score components.
- Existing filtering remains authoritative.
- Debug traces show traveler contribution per top candidate.

# Phase 4

## Commitment Layer

### Goal

Add explicit Decision Commitment scoring so HADE can distinguish low-friction suggestions from higher-effort, higher-reward suggestions.

### Files

- `src/core/engine/synthetic.ts`
- `src/core/domain/domainConfigs.ts`
- `src/lib/hade/engine.ts`
- `src/types/hade.ts`
- `src/lib/hade/viewModel.ts`
- `src/components/hade/adaptive/DecisionCard.tsx`

### Tasks

1. Compute commitment fit from:
   - distance
   - ETA
   - user energy
   - urgency
   - time available
   - distance tolerance
   - openness
   - candidate category/type

2. Add `commitmentFitBonus` to scoring breakdown.

3. Keep commitment as score-based, not filter-based, except for impossible candidates.

4. Make weighting domain-sensitive:
   - dining: commitment strongly favors nearby/easy
   - social: commitment balances energy and group size
   - travel: commitment allows farther candidates if trust/uniqueness is strong

5. Expose commitment reason in debug and optional card metadata.

### Tests

- Low energy plus short time favors close candidate.
- High openness plus long time available can tolerate farther candidate.
- Dining does not select a far venue when an adequate nearby venue exists.
- Travel can still select a farther high-quality attraction.
- Cold-start fallback still works when commitment fields are absent.

### Risks

- Commitment can duplicate distance scoring if designed too narrowly.
- Travel quality could be over-penalized by friction.
- UX could become too cautious if commitment weights are high.

### Definition of Done

- Commitment fit is visible in debug output.
- Commitment shifts rankings predictably in targeted cases.
- Places, UGC, Navigation, Refine, Not This, and cold-start fallback remain intact.

# Phase 5

## Micro-Adventures

### Goal

Add a Micro-Adventure Engine that identifies small, worthwhile deviations from the obvious choice while preserving trust, proximity, UGC, and fallback safety.

### Files

- `src/core/engine/synthetic.ts`
- `src/core/domain/domainConfigs.ts`
- `src/lib/hade/lensProfiles.ts`
- `src/lib/hade/hooks.ts`
- `src/lib/hade/useHade.ts`
- `src/types/hade.ts`

### Tasks

1. Define `microAdventureFit` from:
   - openness
   - novelty appetite
   - candidate uniqueness
   - lens category match
   - manageable commitment
   - category diversity
   - surfaced/rejected history

2. Keep micro-adventure as a bounded additive score.

3. Separate deterministic micro-adventure fit from random exploration jitter.

4. Use domain-specific behavior:
   - dining: small boost only
   - social: moderate boost for lively/novel options
   - travel: stronger boost for unique, highly trusted options

5. Ensure UGC events can still win through timing, social proof, and trust.

### Tests

- Adventurous user gets more diverse candidate than comfort user from same pool.
- Comfort user does not get pushed to overly distant novelty candidate.
- Rejected categories are not immediately repeated when viable alternatives exist.
- UGC live event with strong social proof can beat a Places micro-adventure.
- Refine and Not This preserve rejection/surfacing history.

### Risks

- Recommendations could feel random if novelty is too strong.
- Micro-adventure may overlap with lens category boosts.
- Surfaced-history logic could accidentally suppress too many candidates.

### Definition of Done

- Micro-adventure score is deterministic, bounded, and explainable.
- It improves variety without weakening hard exclusions or UGC relevance.
- Debug output shows why a candidate received the boost.

# Phase 6

## Decision Card UX

### Goal

Surface the new engines in decision-card language and metadata without turning the UI into a scoring dashboard.

### Files

- `src/components/hade/adaptive/DecisionCard.tsx`
- `src/components/hade/mobile/DecisionScreen.tsx`
- `src/lib/hade/viewModel.ts`
- `src/lib/hade/ugcCopy.ts`
- `src/core/domain/domainConfigs.ts`

### Tasks

1. Add compact, human-readable explanations for:
   - traveler fit
   - commitment fit
   - micro-adventure reason

2. Keep UGC temporal/social copy preferred for live UGC events.

3. Avoid exposing raw score names in the UI.

4. Keep fallback cards valid when new fields are missing.

5. Ensure mobile layout remains stable with longer venue names and rationale text.

### Tests

- Decision card renders with all new fields.
- Decision card renders with none of the new fields.
- UGC card still shows live/temporal copy.
- Static fallback card still renders cleanly.
- Mobile and desktop visual checks for text overflow.

### Risks

- Overexplaining the decision.
- Breaking adaptive card layout.
- Making fallback cards feel less trustworthy by exposing missing metadata.

### Definition of Done

- Decision cards explain fit in user-friendly language.
- No raw scoring jargon appears in the UI.
- UGC and fallback cards keep their current behavior.

# Phase 7

## QA and Regression

### Goal

Prove the new engines do not break existing HADE behavior across ranking, fallback, and frontend flows.

### Files

- `src/core/engine/synthetic.ts`
- `src/app/api/hade/decide/route.ts`
- `src/core/services/places.ts`
- `src/core/adapters/placesAdapter.ts`
- `src/lib/hade/hooks.ts`
- `src/lib/hade/useHade.ts`
- `src/lib/hade/viewModel.ts`
- `src/lib/hade/__tests__/*`
- `src/core/engine/__tests__/*` if present
- `src/components/hade/**/__tests__/*` if present

### Tasks

1. Build a regression matrix covering:
   - Places available
   - Places unavailable
   - missing Google API key
   - UGC-only
   - custom candidates
   - malformed custom candidates
   - Not This
   - Refine
   - Navigation
   - unknown geo
   - cold start
   - offline cache
   - static fallback

2. Add golden ranking fixtures for:
   - dining
   - social
   - travel
   - low energy
   - high energy
   - comfort
   - adventurous
   - short time available
   - high commitment tolerance

3. Add debug assertions for:
   - traveler state fit
   - commitment fit
   - micro-adventure fit
   - UGC trust/vibe contribution
   - confidence contribution if implemented

4. Run full build and targeted test suite.

5. Manually QA mobile decision flows:
   - first decision
   - Refine
   - Not This
   - open navigation
   - UGC event card
   - fallback card

### Tests

- `npm run build`
- Synthetic ranking unit tests.
- Decide route regression tests.
- Fallback behavior tests.
- UGC store tests.
- View-model tests.
- Decision card rendering tests.
- Manual QA with real or mocked Places responses.

### Risks

- Hidden tests may rely on old score ordering.
- Real Places responses can vary by time and location.
- Debug-only assertions may not catch production-shape regressions.

### Definition of Done

- Full build passes.
- Existing HADE flows pass regression coverage.
- Ranking changes are observable and explainable.
- Places, UGC, Navigation, Refine, Not This, and cold-start fallback remain functional.

## Recommended Rollout Order

1. Phase 1: Data Contracts
2. Phase 2: Traveler State Inference
3. Phase 3: Ranking Integration
4. Phase 4: Commitment Layer
5. Phase 5: Micro-Adventures
6. Phase 6: Decision Card UX
7. Phase 7: QA and Regression

This order keeps the system stable by introducing contracts and observability first, then ranking behavior, then user-facing presentation, and finally full regression hardening.

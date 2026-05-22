# HADE Ranking, Candidate Selection, and Fallback Audit

Date: May 22, 2026

Scope:

- `src/app/api/hade/decide/route.ts`
- `src/core/engine/synthetic.ts`
- `src/core/services/places.ts`
- `src/core/adapters/placesAdapter.ts`
- `src/core/domain/config.ts`
- `src/core/domain/domainConfigs.ts`
- `src/core/utils/intentMapper.ts`
- `src/lib/hade/ugc.ts`
- `src/lib/hade/confidence.ts`

Note: `src/core/domain/config.ts` defines domain configuration, but the live synthetic ranking path imports `src/core/domain/domainConfigs.ts`. Both are relevant to the audit, but `domainConfigs.ts` is the active scoring configuration for the current ranking engine.

## Executive Summary

The current HADE ranking pipeline already supports a deterministic candidate pipeline with Places, UGC, custom candidates, domain filters, time-window filtering, rejection sensitivity, LocationNode trust/vibe overlays, and fallback tiers.

It can support the requested scoring extensions, but most of them are not first-class ranking signals yet.

Current support status:

| Capability | Current Status |
|---|---|
| Decision Commitment scoring | Partially possible from existing context, not implemented as scoring |
| Traveler State scoring | Context exists; mostly used for copy, not ranking |
| Micro-Adventure scoring | Partially approximated by travel uniqueness, lens categories, and exploration bias |
| Time-window scoring | Implemented, but weak for Places because Places get synthetic windows |
| UGC signal weighting | Implemented through LocationNode trust/vibe and UGC candidates |
| Confidence weighting | Confidence exists, but does not currently influence ranking |

## Current Candidate Sources

Candidate sources in effective decision order:

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

## Current Scoring Inputs

Tier 1 scoring is centered in `scoreSpontaneousCandidate()` and `rankSpontaneousObjects()` in `src/core/engine/synthetic.ts`.

Direct score variables:

- Candidate time window start relative to `now`.
- Candidate distance from user.
- `going_count`.
- Candidate `trust_score`.
- LocationNode trust via `getNodeTrustScore()`.
- LocationNode vibe via `getNodeVibeScore()`.
- Domain scoring weights from `domainConfigs.ts`.
- Candidate `user_state`, currently `"going"` or `"maybe"`.
- Raw Google Place `types`.
- Domain mode.
- Group size.
- Travel uniqueness types.
- Lens / `candidate_categories` match.
- Rejection-derived exploration bias.
- Random jitter from exploration bias.

Tie-breakers:

- Final score.
- `going_count`.
- Distance.
- Candidate id.

Filtering and pool-shaping inputs:

- `geo`.
- `geo_source`.
- `radius_meters`.
- `situation.intent`.
- `time_of_day`.
- `mode`.
- Domain allowlists.
- Domain blacklists.
- `candidate_categories`.
- `rejection_history.venue_id`.
- `rejection_history.venue_name`.
- `rejection_history.category`.
- `rejection_history.pivot_reason`.
- UGC `created_at`.
- UGC `expires_at`.
- Candidate `expires_at`.
- Candidate `time_window.end`.

Offline cache scoring inputs:

- Distance from user.
- Cached venue rating.
- Optional `settings.scoring_weights.proximity`.
- Optional `settings.scoring_weights.rating`.
- Cached LocationNode `weight_map` average as a vibe delta.

Confidence inputs:

- `computeConfidence()` uses LocationNode `signal_count`, `weight_map`, and `last_updated`.
- `syntheticConfidence()` maps a final synthetic score to a confidence value.
- Neither is currently used as a ranking weight in the main synthetic score.

## Missing Inputs and Injection Points

### Traveler State

Existing context:

- `state.energy`
- `state.openness`
- `social.group_size`
- `social.group_type`
- `constraints.budget`
- `constraints.time_available_minutes`
- `constraints.distance_tolerance`

Current ranking use:

- `social.group_size` affects social group fit.
- `state.energy` and `state.openness` mostly affect narrative copy, not score.

Best injection points:

- `generateSyntheticDecision()` after `buildContext()`.
- `rankSpontaneousObjects()` argument list.
- `scoreSpontaneousCandidate()` as `travelerStateBonus`.
- `domainConfigs.ts` for domain-specific state weighting.

### Decision Commitment Fit

Existing proxy inputs:

- `situation.urgency`
- `constraints.time_available_minutes`
- `constraints.distance_tolerance`
- `state.energy`
- `state.openness`
- Distance.
- ETA.
- Time window duration.

Missing:

- No explicit commitment score.
- No candidate-level friction score.
- No direct mapping from "low commitment" to candidate fit.

Best injection points:

- `scoreSpontaneousCandidate()` as `commitmentFitBonus`.
- `filterByTimeWindow()` if some commitment constraints should become hard exclusions.
- `domainConfigs.ts` if commitment should be weighted differently by dining/social/travel.

### Micro-Adventure Fit

Existing proxy inputs:

- `state.openness`.
- Travel uniqueness bonus.
- Lens category boost.
- Exploration bias.
- Rejection sensitivity.

Missing:

- No explicit novelty/adventure score.
- No memory of surfaced categories except rejection history.
- No distance-vs-novelty tradeoff.

Best injection points:

- `scoreSpontaneousCandidate()` as `microAdventureBonus`.
- `selectWithDiversity()` if diversity should include surfaced history, not only rejected history.
- `domainConfigs.ts` for per-domain adventure weighting.

### Time-Window Fit

Existing:

- Hard filter: candidate must not be expired and must start within two hours.
- Score: inverse decay from `time_window.start`.

Weakness:

- Places candidates receive synthetic `now`-based windows, so Places often look equally timely.
- Opening-hours detail is limited to `openNow`.

Best injection points:

- `fetchNearbyGrounded()` to request richer opening-hours fields.
- `toPlaceOption()` to carry close/opening window information.
- `placeToCandidate()` to convert Places availability into real `time_window`.
- `scoreSpontaneousCandidate()` to add duration/closing-soon fit.

### UGC Signal Weighting

Existing:

- Stored UGC enters the candidate pool.
- Custom UGC enters the candidate pool.
- LocationNode trust adjusts candidate trust.
- LocationNode vibe contributes to score.
- Offline cache applies a vibe delta.

Missing:

- Direct fallback does not consider UGC.
- UGC entity shape does not carry social counts or trust directly.
- `computeConfidence()` is not part of ranking.

Best injection points:

- `buildFallbackCandidates()` to consult UGC before static fallback.
- UGC storage shape if UGC should carry crowd/trust signals directly.
- `rankSpontaneousObjects()` to include confidence weighting.

### Confidence Weighting

Existing:

- `computeConfidence()` supports LocationNode-based confidence.
- Synthetic decisions expose `confidence` from final score.
- Confidence labels are derived from final score.

Missing:

- Confidence does not affect rank order.
- `computeConfidence()` is imported in `route.ts` but not used in the decision path.

Best injection points:

- `rankSpontaneousObjects()` after LocationNode read.
- `scoreSpontaneousCandidate()` as confidence dampener or multiplier.
- Debug payload to expose confidence contribution.

## Fallback Analysis

Fallback occurs when:

- Request JSON parsing fails.
- Payload validation fails.
- Geo is missing or invalid.
- `custom_candidates` is malformed.
- Cold-start synthetic fails.
- Cold-start synthetic returns an invalid decision.
- `geo_source` is `"unknown"`.
- Synthetic pool is empty after domain filtering.
- Synthetic pool is empty after rejection filtering.
- Synthetic pool is empty after time-window filtering.
- Synthetic decision validation fails.
- Synthetic throws.
- Offline cache is missing, empty, skipped, or unusable.
- Fallback Places fails or returns no candidates.

### Does Fallback Happen Too Early?

Sometimes, yes.

Early fallback cases:

- Cold-start synthetic failure goes directly to `cold_start_fallback`, bypassing offline cache.
- Invalid `custom_candidates` fails the whole request instead of dropping only bad custom candidates.
- Missing top-level geo forces fallback even if custom candidates have valid locations.
- `geo_source: unknown` skips synthetic entirely, which also skips UGC/custom ranking.
- Time-window filtering is hard; no penalty-based salvage path exists.

### Can UGC Influence Fallback?

Partially.

UGC can influence:

- Tier 1 ranking.
- Offline cache scoring through LocationNode vibe overlay.

UGC cannot currently influence:

- Direct fallback Places.
- Static fallback title selection.
- Cold-start fallback after synthetic failure.

### Do Places Failures Bypass Useful Alternatives?

Sometimes.

Good current behavior:

- In Tier 1, Places failures usually become an empty array, allowing UGC-only ranking to continue.
- Multi-query Places preserves partial success because each query resolves independently.
- Strict domain filtering has a blacklist-only last-resort bypass when Places returned real data.

Problem areas:

- Cold-start fallback bypasses offline cache.
- Direct fallback tries Places then static, with no UGC attempt.
- Missing API key, Places API errors, and true empty results all collapse into `[]`.
- Fallback Places candidates are not ranked with the normal scoring formula.

## Proposed Additive Changes

| Recommendation | File | Function | Risk | Effort |
|---|---|---|---|---|
| Add explicit commitment fit score | `src/core/engine/synthetic.ts` | `scoreSpontaneousCandidate()` | Medium | Medium |
| Add traveler-state fit score | `src/core/engine/synthetic.ts` | `scoreSpontaneousCandidate()` | Medium | Medium |
| Add micro-adventure fit score | `src/core/engine/synthetic.ts` | `scoreSpontaneousCandidate()` | Medium | Medium |
| Add richer Places time-window support | `src/core/services/places.ts`, `src/core/engine/synthetic.ts` | `fetchNearbyGrounded()`, `placeToCandidate()` | Medium | Medium |
| Let direct fallback consult UGC before static fallback | `src/app/api/hade/decide/route.ts` | `buildFallbackCandidates()` | Medium | Medium |
| Try offline cache before cold-start fallback | `src/app/api/hade/decide/route.ts` | `generateDecision()` | Low | Low |
| Soft-drop malformed custom candidates | `src/app/api/hade/decide/route.ts` | `validateCustomCandidates()` | Low | Low |
| Use confidence as ranking dampener or multiplier | `src/lib/hade/confidence.ts`, `src/core/engine/synthetic.ts` | `computeConfidence()`, `rankSpontaneousObjects()` | Medium | Medium |
| Consolidate stale domain config paths | `src/core/domain/config.ts`, `src/core/domain/domainConfigs.ts` | `getDomainConfig()` | Low | Low |

## Recommended Implementation Phases

### Phase 1: Observability and Safety

Goal: make the current system easier to reason about before changing rankings.

Steps:

1. Add debug fields for every score component already calculated.
2. Include source counts for UGC, custom candidates, Places, offline cache, and static fallback.
3. Split Places empty result reasons into missing key, API error, parse error, invalid geo, and true empty.
4. Surface whether fallback bypassed UGC or offline cache.
5. Document that `domainConfigs.ts` is the active config path.

Risk: Low

Effort: Low

### Phase 2: Fallback Quality Improvements

Goal: reduce avoidable static fallback and preserve useful alternatives.

Steps:

1. Try offline cache before cold-start direct fallback.
2. Allow UGC/custom-only ranking when geo is unavailable but candidates contain valid coordinates.
3. Let `buildFallbackCandidates()` consult UGC before static fallback.
4. Route fallback Places candidates through the same ranker when feasible.
5. Soft-drop malformed custom candidates instead of failing the whole request.

Risk: Low to Medium

Effort: Medium

### Phase 3: First-Class Traveler and Commitment Scoring

Goal: make user state and decision friction part of ranking, not just copy.

Steps:

1. Define `travelerStateFit` from energy, openness, group type, and group size.
2. Define `commitmentFit` from urgency, time available, distance tolerance, distance, and ETA.
3. Add both as additive score components with conservative caps.
4. Add domain-level weights for dining/social/travel.
5. Add debug output for both scores.

Risk: Medium

Effort: Medium

### Phase 4: Micro-Adventure Scoring

Goal: distinguish safe convenience from worthwhile discovery.

Steps:

1. Define `microAdventureFit` from openness, novelty, category diversity, uniqueness, and lens match.
2. Use surfaced/rejected history to avoid repeating the same category too often.
3. Make the score domain-sensitive: stronger in travel, moderate in social, light in dining.
4. Keep exploration jitter separate from deterministic micro-adventure scoring.
5. Add A/B-friendly debug fields.

Risk: Medium

Effort: Medium

### Phase 5: Real Time-Window Scoring

Goal: make time scoring meaningful for Places, not only UGC/custom events.

Steps:

1. Request richer opening-hours fields from Google Places.
2. Normalize open/close data into `PlaceOption`.
3. Convert Places availability into candidate `time_window`.
4. Score closing-soon, already-started, and duration fit.
5. Keep hard expiry filtering for truly unavailable candidates only.

Risk: Medium

Effort: Medium to High

### Phase 6: Confidence-Weighted Ranking

Goal: rank not only by fit, but by confidence in that fit.

Steps:

1. Compute candidate confidence from LocationNode signal count, agreement, and recency.
2. Apply confidence as a bounded multiplier or dampener.
3. Keep neutral confidence for candidates without history.
4. Expose confidence contribution in debug payload.
5. Ensure new Places candidates are not over-penalized for having no history.

Risk: Medium

Effort: Medium

## Suggested Priority Order

1. Phase 1: Observability and Safety.
2. Phase 2: Fallback Quality Improvements.
3. Phase 3: Traveler and Commitment Scoring.
4. Phase 6: Confidence-Weighted Ranking.
5. Phase 4: Micro-Adventure Scoring.
6. Phase 5: Real Time-Window Scoring.

This order improves correctness and debuggability first, then adds user-sensitive ranking signals, then deepens temporal accuracy once the scoring surface is easier to inspect.


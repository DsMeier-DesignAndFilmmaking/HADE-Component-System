# HADE Real-Time Traveler State Engine — Audit & Implementation Plan

**Scope:** HADE Component System (`/src`), read-only audit. No code changes.
**Audit date:** 2026-05-22
**Auditor:** Strategic AI Audit

---

## 1) Current Context Model

### Four Situation-First Input Groups

HADE's context model assembles a `HadeContext` from four groups. Every field has a hard-coded default in `buildContext()` ([src/lib/hade/engine.ts:123–161](src/lib/hade/engine.ts)). None of these defaults are inferred from signals.

| Group | Field | Default | Sourcing |
|---|---|---|---|
| `situation` | `intent` | `null` | Voice parser, RefineSheet |
| `situation` | `urgency` | `"low"` | Voice parser, RefineSheet |
| `state` | `energy` | `"medium"` | Voice parser ONLY — no UI affordance |
| `state` | `openness` | `"open"` | Voice parser ONLY — no UI affordance |
| `social` | `group_size` | `1` | Never collected post-init |
| `social` | `group_type` | `"solo"` | Never collected post-init |
| `constraints` | `budget` | `undefined` | Never collected in mobile path |
| `constraints` | `time_available_minutes` | `undefined` | Voice parser ONLY — no chip |
| `constraints` | `distance_tolerance` | `undefined` | Voice parser ONLY |

**RefineSheet** ([src/components/hade/mobile/RefineSheet.tsx:15–16](src/components/hade/mobile/RefineSheet.tsx)) collects **only** `intent` and `urgency`. Energy, openness, group, and all constraints have no non-voice UI affordance.

**voiceIntentParser** ([src/lib/hade/voiceIntentParser.ts](src/lib/hade/voiceIntentParser.ts)) is the only real input path for energy, distance, and time. Returns `VoiceIntent` with `state?: { energy }` — no `traveler_hint` or `TravelerState` output.

### Signal Infrastructure

All 7 SignalTypes (PRESENCE / SOCIAL_RELAY / ENVIRONMENTAL / BEHAVIORAL / AMBIENT / EVENT / INTENT) are venue-attached — they describe activity at a place, not the user's own travel state. No `TRAVELER_STATE` type exists. `emitSignal()`, `aggregateSignals()`, `filterByType()` in [src/lib/hade/signals.ts](src/lib/hade/signals.ts) are ready to host a new signal type but no user-state data flows through them today.

### Scoring Weight Isolation

`scoreOpportunity()` ([src/lib/hade/engine.ts:317–350](src/lib/hade/engine.ts)) uses three weights: proximity (0.4), signal (0.35), intent (0.25). `energy` and `openness` are on `HadeContext` but are **not wired to any scoring path** — they exist as context but have zero effect on output.

### Zero TravelerState Presence in Codebase

```
grep -r "TravelerState\|traveler_state\|inferState\|traveler_hint" src/ → 0 matches
```

No type, no function, no field, no log, no UI badge.

---

## 2) Missing Traveler State Model

### What Would "Traveler State" Enable?

Today HADE answers: *"Where should I go?"*
With traveler state, HADE answers: *"Where should I go **given that I'm [state]**?"*

The 12 target states shift both **venue selection** (scoring weights, radius, category filters) and **copy/UX** (CTA verb, header chip, commitment cues).

### State Feasibility vs. Existing Signals

| State | Inferrable From | Feasibility | Bottleneck |
|---|---|---|---|
| `exploring` | high openness + low urgency + no rejection history | ✅ Direct | Openness never non-default |
| `waiting` | urgency=high + time_available_minutes ≤ 45 + geo stable | ✅ Direct | time_available never set |
| `transitioning` | time_of_day shift + geo delta (session gap) | ✅ Direct | No geo delta today |
| `recovering` | energy=low (voiceParser) + time late_night/morning | ✅ Direct | Energy starved without voice |
| `socializing` | group_type ≠ solo + evening + intent=drink/scene | ✅ Direct | group_type defaults to solo |
| `solo_confidence` | group_size=1 + energy=high + openness=adventurous | ✅ Direct | Energy + openness starved |
| `low_energy` | energy=low OR late_night + recovering tag | ✅ Direct | Energy starved without voice |
| `time_constrained` | time_available_minutes ≤ 30 OR urgency=high | ✅ Direct | time_available rarely set |
| `arrival_orientation` | session_id new + geo first-seen + morning/midday | ⚡ Partial | Needs session-scoped geo history |
| `weather_detour` | voice keyword ("raining", "cold") OR env signal | ⚡ Partial | No ENVIRONMENTAL signal path from device |
| `hungry_now` | intent=eat + urgency=high + time midday/early_evening | ✅ Direct | Urgency defaults to low |
| `open_to_surprise` | rejection ≥ 2 + openness=adventurous + energy=high | ⚡ Partial | Openness starved |

**Summary:** 7 directly inferable, 3 partially inferable, 2 require external signals.

### Root Cause: Input Starvation

The inference function can be written today. The accuracy problem is that `energy`, `openness`, `group_type`, `time_available_minutes` all default to neutral values because there's no UI to collect them. **The accuracy bottleneck is input starvation, not inference logic.**

---

## 3) Proposed TypeScript Types

Add to [src/types/hade.ts](src/types/hade.ts) (around lines 15–20 for the union, ~line 185 for context fields):

```ts
// ─── TravelerState ────────────────────────────────────────────────────────────

export type TravelerState =
  | "exploring"           // open wandering, low urgency, high openness
  | "waiting"             // filling time at a transit node, constrained window
  | "transitioning"       // between modes — arriving, leaving, shifting from work
  | "recovering"          // low energy, low stimulation tolerance
  | "socializing"         // group-activated, scene-seeking
  | "solo_confidence"     // lone high-energy adventure mode
  | "low_energy"          // fatigued, needs comfort/ease
  | "time_constrained"    // hard deadline <30 min
  | "arrival_orientation" // just arrived in an area, needs orientation
  | "weather_detour"      // redirected by conditions, wants indoor/covered option
  | "hungry_now"          // eat intent, high urgency, mealtime
  | "open_to_surprise";   // repeated rejection → exploration reset

export type TravelerStateSource =
  | "voice"         // extracted from voiceIntentParser
  | "context"       // derived from HadeContext fields (deterministic)
  | "geo_velocity"  // computed from location delta (future)
  | "manual"        // user-corrected via RefineSheet
  | "signal";       // from an attached ENVIRONMENTAL signal (future)

export interface InferredTravelerState {
  primary: TravelerState;
  secondary?: TravelerState;
  confidence: number;              // 0–1
  source: TravelerStateSource;
  reason_codes: string[];          // e.g. ["energy=low", "time_of_day=late_night"]
  inferred_at: number;             // Date.now()
  ttl_ms: number;                  // how long this inference is valid; default 900_000 (15 min)
}
```

Add optional `traveler_state` and `traveler_state_confidence` to `HadeContext` (around line 185) and `DecideRequest` (around line 205):

```ts
// On HadeContext:
traveler_state?: InferredTravelerState;

// On HadeDecision (around line 251):
traveler_state_applied?: TravelerState;  // which state was used for this decision
```

Mirror to [src/core/types/decision.ts](src/core/types/decision.ts). Add tolerant validators in [src/app/api/hade/decide/validateDecision.ts](src/app/api/hade/decide/validateDecision.ts): strip unknown state values, clamp confidence to [0,1], strip entire field on parse failure.

---

## 4) Inference Function Design

### New File: `src/lib/hade/travelerState.ts`

```ts
import type { HadeContext, TravelerState, TravelerStateSource, InferredTravelerState } from "@/types/hade";
import type { VoiceIntent } from "@/lib/hade/voiceIntentParser";

interface StateRule {
  state: TravelerState;
  specificityRank: number;   // higher = more specific; used to break ties
  ttl_ms: number;
  predicate: (ctx: HadeContext, voice?: VoiceIntent) => number;  // returns 0–1 confidence
  reason_codes: (ctx: HadeContext) => string[];
}

const STATE_RULES: StateRule[] = [
  // --- Fully deterministic rules (no external data) ---

  {
    state: "hungry_now",
    specificityRank: 10,
    ttl_ms: 600_000,  // 10 min — mealtime windows are narrow
    predicate: (ctx) => {
      const isEatIntent = ctx.situation.intent === "eat";
      const isHighUrgency = ctx.situation.urgency === "high";
      const isMealtime =
        ctx.time_of_day === "midday" ||
        ctx.time_of_day === "early_evening" ||
        ctx.time_of_day === "evening";
      const score =
        (isEatIntent ? 0.5 : 0) +
        (isHighUrgency ? 0.3 : 0) +
        (isMealtime ? 0.2 : 0);
      return score;
    },
    reason_codes: (ctx) => [
      `intent=${ctx.situation.intent}`,
      `urgency=${ctx.situation.urgency}`,
      `time_of_day=${ctx.time_of_day}`,
    ],
  },

  {
    state: "time_constrained",
    specificityRank: 9,
    ttl_ms: ctx => (ctx.constraints.time_available_minutes ?? 60) * 60_000,
    predicate: (ctx) => {
      const mins = ctx.constraints.time_available_minutes;
      if (!mins) return ctx.situation.urgency === "high" ? 0.55 : 0;
      if (mins <= 20) return 1.0;
      if (mins <= 30) return 0.85;
      if (mins <= 45) return 0.65;
      return 0;
    },
    reason_codes: (ctx) => [
      ctx.constraints.time_available_minutes
        ? `time_available=${ctx.constraints.time_available_minutes}min`
        : `urgency=${ctx.situation.urgency}`,
    ],
  },

  {
    state: "waiting",
    specificityRank: 8,
    ttl_ms: 1_800_000,
    predicate: (ctx, voice) => {
      const hasDeadline = (ctx.constraints.time_available_minutes ?? 0) <= 45
        && (ctx.constraints.time_available_minutes ?? 0) > 0;
      const hasWaitKeyword = voice?.rawText
        ? /\b(waiting|killing time|layover|between flights|have time|got time)\b/i.test(voice.rawText)
        : false;
      return hasDeadline ? 0.7 : hasWaitKeyword ? 0.8 : 0;
    },
    reason_codes: (ctx) => [
      `time_available=${ctx.constraints.time_available_minutes}min`,
    ],
  },

  {
    state: "recovering",
    specificityRank: 7,
    ttl_ms: 3_600_000,
    predicate: (ctx, voice) => {
      const isLowEnergy = ctx.state.energy === "low";
      const isLateOrEarly = ctx.time_of_day === "late_night" || ctx.time_of_day === "morning";
      const hasKeyword = voice?.rawText
        ? /\b(tired|exhausted|drained|worn out|need rest|hungover|rough night)\b/i.test(voice.rawText)
        : false;
      return (isLowEnergy ? 0.5 : 0) + (isLateOrEarly ? 0.2 : 0) + (hasKeyword ? 0.3 : 0);
    },
    reason_codes: (ctx) => [`energy=${ctx.state.energy}`, `time_of_day=${ctx.time_of_day}`],
  },

  {
    state: "low_energy",
    specificityRank: 6,
    ttl_ms: 3_600_000,
    predicate: (ctx) => {
      if (ctx.state.energy === "low") return 0.85;
      if (ctx.time_of_day === "late_night") return 0.5;
      return 0;
    },
    reason_codes: (ctx) => [`energy=${ctx.state.energy}`],
  },

  {
    state: "socializing",
    specificityRank: 7,
    ttl_ms: 7_200_000,
    predicate: (ctx) => {
      const isGroup = ctx.social.group_type !== "solo";
      const isEvening = ctx.time_of_day === "evening" || ctx.time_of_day === "early_evening";
      const isSocialIntent = ctx.situation.intent === "drink" || ctx.situation.intent === "scene";
      return (isGroup ? 0.4 : 0) + (isEvening ? 0.25 : 0) + (isSocialIntent ? 0.35 : 0);
    },
    reason_codes: (ctx) => [
      `group_type=${ctx.social.group_type}`,
      `intent=${ctx.situation.intent}`,
    ],
  },

  {
    state: "solo_confidence",
    specificityRank: 6,
    ttl_ms: 7_200_000,
    predicate: (ctx) => {
      const isSolo = ctx.social.group_size === 1;
      const isHighEnergy = ctx.state.energy === "high";
      const isAdventurous = ctx.state.openness === "adventurous";
      return (isSolo ? 0.2 : 0) + (isHighEnergy ? 0.35 : 0) + (isAdventurous ? 0.45 : 0);
    },
    reason_codes: (ctx) => [`energy=${ctx.state.energy}`, `openness=${ctx.state.openness}`],
  },

  {
    state: "exploring",
    specificityRank: 4,
    ttl_ms: 7_200_000,
    predicate: (ctx) => {
      const isOpen = ctx.state.openness === "open" || ctx.state.openness === "adventurous";
      const isLowUrgency = ctx.situation.urgency === "low";
      const noRejections = ctx.rejection_history.length === 0;
      const noIntent = !ctx.situation.intent || ctx.situation.intent === "anything";
      return (isOpen ? 0.25 : 0) + (isLowUrgency ? 0.25 : 0) + (noRejections ? 0.2 : 0) + (noIntent ? 0.3 : 0);
    },
    reason_codes: (ctx) => [`openness=${ctx.state.openness}`, `rejections=${ctx.rejection_history.length}`],
  },

  {
    state: "open_to_surprise",
    specificityRank: 5,
    ttl_ms: 3_600_000,
    predicate: (ctx) => {
      const hasRejections = ctx.rejection_history.length >= 2;
      const isAdventurous = ctx.state.openness === "adventurous";
      const isHighEnergy = ctx.state.energy === "high";
      return (hasRejections ? 0.5 : 0) + (isAdventurous ? 0.3 : 0) + (isHighEnergy ? 0.2 : 0);
    },
    reason_codes: (ctx) => [`rejections=${ctx.rejection_history.length}`, `openness=${ctx.state.openness}`],
  },

  // --- Partial rules (require geo session history or external signals) ---

  {
    state: "arrival_orientation",
    specificityRank: 8,
    ttl_ms: 1_800_000,
    predicate: (ctx) => {
      const isMorningOrMidday = ctx.time_of_day === "morning" || ctx.time_of_day === "midday";
      const hasNoRejections = ctx.rejection_history.length === 0;
      const hasNoIntent = !ctx.situation.intent || ctx.situation.intent === "anything";
      // Partial: without geo history, max confidence = 0.5
      return isMorningOrMidday && hasNoRejections && hasNoIntent ? 0.5 : 0;
    },
    reason_codes: (ctx) => [`time_of_day=${ctx.time_of_day}`, "geo_history=unavailable"],
  },

  {
    state: "weather_detour",
    specificityRank: 9,
    ttl_ms: 3_600_000,
    predicate: (ctx, voice) => {
      const hasKeyword = voice?.rawText
        ? /\b(rain|raining|wet|cold|hot|freezing|storm|shelter|inside|indoors)\b/i.test(voice.rawText)
        : false;
      return hasKeyword ? 0.8 : 0;
      // Full implementation requires ENVIRONMENTAL signal type from device
    },
    reason_codes: () => ["voice_weather_keyword"],
  },

  {
    state: "transitioning",
    specificityRank: 6,
    ttl_ms: 1_800_000,
    predicate: (ctx) => {
      // Partial: without geo delta, infer from time-of-day pattern only
      const isTransitionTime =
        ctx.time_of_day === "early_evening" || ctx.time_of_day === "morning";
      const isLowIntent = !ctx.situation.intent || ctx.situation.intent === "anything";
      return isTransitionTime && isLowIntent ? 0.45 : 0;
    },
    reason_codes: (ctx) => [`time_of_day=${ctx.time_of_day}`],
  },
];

const CONFIDENCE_THRESHOLD = 0.5;

export function inferTravelerState(
  ctx: HadeContext,
  voiceIntent?: VoiceIntent,
  options?: { threshold?: number }
): InferredTravelerState | null {
  const threshold = options?.threshold ?? CONFIDENCE_THRESHOLD;

  const scored = STATE_RULES
    .map((rule) => ({
      state: rule.state,
      specificityRank: rule.specificityRank,
      ttl_ms: typeof rule.ttl_ms === "function" ? rule.ttl_ms(ctx) : rule.ttl_ms,
      confidence: Math.min(1, rule.predicate(ctx, voiceIntent)),
      reason_codes: rule.reason_codes(ctx),
    }))
    .filter((r) => r.confidence >= threshold)
    .sort((a, b) =>
      b.confidence !== a.confidence
        ? b.confidence - a.confidence
        : b.specificityRank - a.specificityRank
    );

  if (scored.length === 0) return null;

  const primary = scored[0];
  const secondary = scored[1];

  const source: TravelerStateSource = voiceIntent?.rawText ? "voice" : "context";

  return {
    primary: primary.state,
    secondary: secondary?.state,
    confidence: primary.confidence,
    source,
    reason_codes: primary.reason_codes,
    inferred_at: Date.now(),
    ttl_ms: primary.ttl_ms,
  };
}
```

### Design Invariants

- **Deterministic only** — no LLM in this function. Accuracy improves through rule calibration, not probabilistic models.
- **All-optional input** — function returns `null` gracefully when context is neutral/defaulted. Zero error surface.
- **Highest specificity wins on tie** — prevents vague states (`exploring`) from outcompeting specific ones (`hungry_now`).
- **TTL per state** — `time_constrained` expires in minutes; `socializing` expires in hours. Prevents stale state lock-in.
- **Phase 1: log only** — `inferTravelerState()` is called but output is only written to `[hade-trace]` logs. Scoring not affected until Phase 5.

---

## 5) Scoring & Ranking Effects by State

Consumed in `scoreOpportunity()` ([src/lib/hade/engine.ts:317–350](src/lib/hade/engine.ts)) and `scoreSpontaneousCandidate()` ([src/core/engine/synthetic.ts:748–813](src/core/engine/synthetic.ts)) when state confidence ≥ 0.65.

| State | Proximity Δ | Signal Δ | Intent Δ | Category Filter | Notes |
|---|---|---|---|---|---|
| `hungry_now` | 0 | 0 | +0.15 | require `eat` affinity | Boost intent alignment hard |
| `time_constrained` | +0.15 | 0 | 0 | None | Radius auto-scales to walking budget |
| `waiting` | +0.10 | 0 | 0 | prefer indoor | Penalise >800m |
| `recovering` | +0.05 | -0.10 | 0 | prefer comfort/chill | Reduce social signal weight |
| `low_energy` | +0.10 | -0.05 | 0 | prefer seated, quiet | Penalise "bar/nightclub" |
| `socializing` | -0.05 | +0.10 | 0 | prefer social venues | Boost SOCIAL_RELAY signal weight |
| `solo_confidence` | -0.10 | +0.05 | +0.05 | None | Wider radius tolerance |
| `exploring` | -0.15 | 0 | -0.10 | None | Discovery bias: de-rank top-signal |
| `open_to_surprise` | -0.20 | -0.10 | -0.15 | None | Novelty boost — seen=penalise |
| `arrival_orientation` | -0.05 | +0.15 | 0 | known/popular venues | Prefer high-trust |
| `weather_detour` | +0.15 | 0 | 0 | outdoor=0, indoor only | Hard filter, not weight |
| `transitioning` | +0.05 | 0 | 0 | None | Slightly tighten radius |

**Weight delta normalisation:** after applying deltas, renormalise weights to sum to 1.0 before scoring. Use `normaliseWeights(w)` utility.

**Phase gate:** apply deltas only when `InferredTravelerState.confidence ≥ 0.65`. Below threshold, score as if no state.

---

## 6) UX Effects by State

### CTA Label Variants (replaces "Take me there" / "Navigate")

| State | Primary CTA | Secondary Hint |
|---|---|---|
| `hungry_now` | "Feed me now" | "Within 5 min walk" |
| `time_constrained` | "Go now — {N} min" | radius derived from time budget |
| `waiting` | "Fill this time" | "Back in time" |
| `recovering` | "Something easy" | "Low-key, close by" |
| `low_energy` | "Something comfortable" | "No effort needed" |
| `socializing` | "Take the group there" | "They're already inside" |
| `solo_confidence` | "I'm in" | "Just me — let's go" |
| `exploring` | "Let's see what's out there" | "Show me more" |
| `open_to_surprise` | "Surprise me" | "Something different" |
| `arrival_orientation` | "Orient me" | "Get my bearings first" |
| `weather_detour` | "Find me shelter" | "Indoors only" |
| `transitioning` | "Bridge the gap" | "Quick stop" |

### Header Chip Variants (replaces "Your move")

| State | Chip Text |
|---|---|
| `hungry_now` | "Feeding you" |
| `time_constrained` | "Working with your window" |
| `waiting` | "Using your gap" |
| `recovering` | "Taking it easy" |
| `low_energy` | "Low-key pick" |
| `socializing` | "For the group" |
| `solo_confidence` | "Your solo adventure" |
| `exploring` | "Explore mode" |
| `open_to_surprise` | "Something unexpected" |
| `arrival_orientation` | "Getting oriented" |
| `weather_detour` | "Weather escape" |
| `transitioning` | "In-between pick" |

### State Pill (ContextSignalBadge)

New variant of [src/components/hade/adaptive/ContextSignalBadge.tsx](src/components/hade/adaptive/ContextSignalBadge.tsx):
- Render only when `confidence ≥ 0.75`
- Format: `"Sensing: [state label]"` (e.g., `"Sensing: low energy"`)
- Tap → opens state-correction row in [RefineSheet.tsx](src/components/hade/mobile/RefineSheet.tsx)
- Dismissed on manual correction; re-infers on next decide call

### RefineSheet Third Row — State Correction

Add below current intent and urgency rows:
- Label: `"What describes you right now?"`
- Options: `["Tired", "Hungry", "Exploring", "Waiting", "Socialising", "Surprised me"]`
- Selection sets `traveler_state` to `manual` source, confidence = 1.0
- Clears inferred state; does NOT re-infer until next decide cycle

### voiceIntentParser Keyword Extensions

Add to [src/lib/hade/voiceIntentParser.ts](src/lib/hade/voiceIntentParser.ts):

| Keyword Group | Maps To |
|---|---|
| "killing time", "layover", "between trains", "got 30 min", "quick stop" | `waiting` + sets time hint |
| "just arrived", "just landed", "new here", "first time", "just got in" | `arrival_orientation` |
| "raining", "it's cold", "too hot", "need to get inside" | `weather_detour` |
| "feeling spontaneous", "surprise me", "anything random" | `open_to_surprise` |
| "on my way", "passing through", "between things" | `transitioning` |

---

## 7) Analytics & Debug Logs

### Extend [hade-trace] Log Block

The existing `[hade-trace]` log block in [src/app/api/hade/decide/route.ts](src/app/api/hade/decide/route.ts) should include:

```ts
// Add to existing trace log:
traveler_state: {
  inferred: inferredState?.primary ?? null,
  secondary: inferredState?.secondary ?? null,
  confidence: inferredState?.confidence ?? null,
  source: inferredState?.source ?? null,
  reason_codes: inferredState?.reason_codes ?? [],
  applied_to_scoring: inferredState && inferredState.confidence >= 0.65,
}
```

### Non-Prod score_debug Object

When `process.env.HADE_SCORE_DEBUG === "true"`:

```ts
score_debug: {
  traveler_state: {
    rule_scores: STATE_RULES.map(r => ({
      state: r.state,
      score: r.predicate(ctx, voiceIntent),
      threshold_met: r.predicate(ctx, voiceIntent) >= 0.5,
    })),
    winner: inferredState?.primary,
    applied_weight_deltas: appliedDeltas,
  }
}
```

### Correction Telemetry Endpoint

New route: `POST /api/hade/state`
Mirrors [src/app/api/hade/signal/route.ts](src/app/api/hade/signal/route.ts) pattern.

Request body:
```ts
{
  session_id: string;
  corrected_state: TravelerState;
  inferred_state: TravelerState | null;
  inferred_confidence: number | null;
  context_snapshot: HadeContext;
  timestamp: number;
}
```

Used to compute:
- Per-rule accuracy: `corrections where inferred_state = X / total inferences of X`
- Activation threshold calibration: if accuracy < 70% on ≥100 samples → raise threshold
- Rule kill-switch: if accuracy < 50% → disable rule, alert

### Per-Rule Accuracy Metrics

Track in a separate telemetry store (not in-band with decide response):
- `rule_id` (state name)
- `inferences`: count
- `corrections`: count (user or implicit)
- `accuracy`: `(inferences - corrections) / inferences`
- `threshold`: current activation threshold (0.5 default, auto-calibrated)

---

## 8) Files To Change

### New Files (6)

| File | Purpose |
|---|---|
| `src/lib/hade/travelerState.ts` | `inferTravelerState()` + `STATE_RULES[]` + TTL logic |
| `src/lib/hade/reachability.ts` | Time → radius scaler (shared with Dead-Time Engine) |
| `src/app/api/hade/state/route.ts` | Correction telemetry POST endpoint |
| `src/components/hade/mobile/CommitmentSheet.tsx` | (shared with Commitment Engine) — state-aware cues |
| `src/lib/hade/__tests__/travelerState.test.ts` | Unit tests for all 12 StateRules |
| `src/lib/hade/__tests__/reachability.test.ts` | Unit tests for time→radius math |

### Core Types & Validation (4 files)

| File | Change |
|---|---|
| [src/types/hade.ts](src/types/hade.ts) | Add `TravelerState` union, `InferredTravelerState`, `TravelerStateSource`; add `traveler_state?` to `HadeContext`; add `traveler_state_applied?` to `HadeDecision` |
| [src/core/types/decision.ts](src/core/types/decision.ts) | Mirror `TravelerState` and `InferredTravelerState` |
| [src/app/api/hade/decide/validateDecision.ts](src/app/api/hade/decide/validateDecision.ts) | Tolerant validator: strip unknown state values, clamp confidence, strip on parse failure |
| [src/lib/hade/engine.ts](src/lib/hade/engine.ts) | State-aware weight delta application in `scoreOpportunity()` (lines 317–350) |

### Engine & API (7 files)

| File | Change |
|---|---|
| [src/lib/hade/engine.ts](src/lib/hade/engine.ts) | Import `inferTravelerState`, apply weight deltas in `scoreOpportunity`, add axis-disambiguation comment block at top |
| [src/app/api/hade/decide/route.ts](src/app/api/hade/decide/route.ts) | Call `inferTravelerState(ctx, voiceIntent)`, add to trace log, pass to scoring layer |
| [src/core/engine/synthetic.ts](src/core/engine/synthetic.ts) | Accept optional `traveler_state` in `scoreSpontaneousCandidate()`, apply weight deltas |
| [src/lib/hade/voiceIntentParser.ts](src/lib/hade/voiceIntentParser.ts) | Add state keyword tables for 5 new traveler hints; extend `VoiceIntent` return type |
| [src/lib/hade/prompt.ts](src/lib/hade/prompt.ts) | Include `traveler_state_applied` in situation summary passed to LLM |
| [src/lib/hade/supportText.ts](src/lib/hade/supportText.ts) | State-aware support copy variants per `traveler_state_applied` |
| [src/lib/hade/confidence.ts](src/lib/hade/confidence.ts) | Optional state-confidence penalty (future: lower decision confidence when state < 0.65) |

### UX Surfaces (8 files)

| File | Change |
|---|---|
| [src/components/hade/mobile/DecisionScreen.tsx](src/components/hade/mobile/DecisionScreen.tsx) | Pass `traveler_state` through to HeroDecisionCard; wire state CTA labels |
| [src/components/hade/mobile/HeroDecisionCard.tsx](src/components/hade/mobile/HeroDecisionCard.tsx) | State-driven header chip variants; CTA label from state map; insert state pill slot |
| [src/components/hade/mobile/PrimaryAction.tsx](src/components/hade/mobile/PrimaryAction.tsx) | Accept `travelerState` prop; resolve label from state map |
| [src/components/hade/mobile/RefineSheet.tsx](src/components/hade/mobile/RefineSheet.tsx) | Add third row: state correction selector |
| [src/components/hade/adaptive/ContextSignalBadge.tsx](src/components/hade/adaptive/ContextSignalBadge.tsx) | New `traveler_state` variant; render when confidence ≥ 0.75; tap → RefineSheet |
| [src/components/hade/mobile/OtherModesPanel.tsx](src/components/hade/mobile/OtherModesPanel.tsx) | Dead-time preset chips (shared with Dead-Time Engine) |
| [src/lib/hade/scenarios.ts](src/lib/hade/scenarios.ts) | New scenarios keyed to traveler states: `recovering_solo`, `group_night_out`, `arrival_scout` |
| [src/lib/hade/useHade.ts](src/lib/hade/useHade.ts) | Surface `traveler_state_applied` from `DecideResponse` to consuming components |

### Tests (4 files)

| File | Tests |
|---|---|
| `src/lib/hade/__tests__/travelerState.test.ts` | 16 unit tests (see Section 9) |
| [src/lib/hade/__tests__/voiceIntentParser.test.ts](src/lib/hade/__tests__/voiceIntentParser.test.ts) | 5 new state keyword extraction tests |
| `src/lib/hade/__tests__/reachability.test.ts` | Time→radius math tests |
| [src/lib/hade/__tests__/decision.behavior.test.ts](src/lib/hade/__tests__/decision.behavior.test.ts) | Integration: verify low-energy context produces low-stimulation venue |

---

## 9) Required Test Cases

### State Inference Unit Tests (travelerState.test.ts)

| ID | Scenario | Expected State | Expected Confidence |
|---|---|---|---|
| TS-01 | intent=eat, urgency=high, time_of_day=midday | `hungry_now` | ≥ 0.9 |
| TS-02 | intent=eat, urgency=low, time_of_day=morning | NOT `hungry_now` | < 0.5 |
| TS-03 | time_available=15min | `time_constrained` | 1.0 |
| TS-04 | time_available=30min | `time_constrained` | ≥ 0.8 |
| TS-05 | time_available=60min | NOT `time_constrained` | < 0.5 |
| TS-06 | energy=low, time_of_day=late_night | `recovering` | ≥ 0.7 |
| TS-07 | group_type=friends, intent=drink, evening | `socializing` | ≥ 0.7 |
| TS-08 | group_size=1, energy=high, openness=adventurous | `solo_confidence` | ≥ 0.7 |
| TS-09 | rejection_history.length=3, openness=adventurous | `open_to_surprise` | ≥ 0.5 |
| TS-10 | all defaults (energy=medium, urgency=low, no intent) | null OR `exploring` | — |
| TS-11 | time_available=20min AND intent=eat AND urgency=high | `hungry_now` wins over `time_constrained` | specificity tiebreak |
| TS-12 | voice "just landed, what's around here" | `arrival_orientation` | ≥ 0.5 |
| TS-13 | voice "it's raining, I need to get inside" | `weather_detour` | ≥ 0.8 |
| TS-14 | voice "I'm tired and just want something easy" | `recovering` or `low_energy` | ≥ 0.7 |
| TS-15 | manual state correction via RefineSheet | source=manual, confidence=1.0 | — |
| TS-16 | inferredState.confidence=0.4 → scoring not applied | weight deltas = zero | — |

### Voice Parser Tests (voiceIntentParser.test.ts additions)

| Input | Expected traveler_hint |
|---|---|
| "I'm killing time between trains" | `waiting` |
| "Just got here, what's good around here?" | `arrival_orientation` |
| "It's pouring outside" | `weather_detour` |
| "Surprise me with something random" | `open_to_surprise` |
| "On my way somewhere, need a quick stop" | `transitioning` |

### Integration Tests (decision.behavior.test.ts additions)

- Given context with `energy=low` → winning venue must NOT be in `nightclub` or `bar` categories
- Given context with `weather_detour` + outdoor venue in candidate set → outdoor venue must not appear in top result
- Given `time_constrained` with `time_available=20min` → radius must be ≤ 20×80=1600m
- Given all-default context → `inferTravelerState()` returns `null` (no false positive states)
- Given `inferredState.confidence=0.4` → `scoreOpportunity()` returns same scores as without state (gate check)

### Cold-Start Tolerance Tests

- `inferTravelerState(ctx)` with null geo → no throw, returns `null`
- `inferTravelerState(ctx)` with empty signals → no throw, returns state from pure context fields
- Validator strips `traveler_state` with invalid state value → decision still valid
- Validator strips `traveler_state_confidence=1.5` → clamps to 1.0

---

## 10) Implementation Order

### Phase 0 — Type Scaffolding (Zero Risk, Foundational)
**Duration: 1–2 days**

- [ ] Add `TravelerState` union to [src/types/hade.ts](src/types/hade.ts) (12 values)
- [ ] Add `TravelerStateSource`, `InferredTravelerState` interfaces to [src/types/hade.ts](src/types/hade.ts)
- [ ] Add `traveler_state?: InferredTravelerState` to `HadeContext` (optional)
- [ ] Add `traveler_state_applied?: TravelerState` to `HadeDecision` (optional)
- [ ] Mirror types to [src/core/types/decision.ts](src/core/types/decision.ts)
- [ ] Add tolerant validators to [validateDecision.ts](src/app/api/hade/decide/validateDecision.ts): strip-on-parse-failure, clamp confidence
- [ ] Add axis-disambiguation comment block to top of [engine.ts](src/lib/hade/engine.ts): Mode / Lens / Preset / Vibe / Intent / HadeState / TravelerState (7 axes, their distinctions, lifecycle)
- [ ] **Ship.** No UI change. No scoring change.

---

### Phase 1 — Deterministic Inference + Logging Only
**Duration: 2–3 days**

- [ ] Create `src/lib/hade/travelerState.ts` with `STATE_RULES[]` and `inferTravelerState()`
- [ ] Wire `inferTravelerState(ctx, voiceIntent)` call in [route.ts](src/app/api/hade/decide/route.ts) (before scoring)
- [ ] Write inferred state to `[hade-trace]` log block ONLY — do NOT write to `HadeDecision` output
- [ ] Write `src/lib/hade/__tests__/travelerState.test.ts` — all 16 unit tests (TS-01 through TS-16)
- [ ] Verify all defaults → `null` (no false positives on neutral context)
- [ ] **Ship. No user-visible change. Logging data starts accumulating.**

---

### Phase 2 — Voice Keyword Extensions
**Duration: 1 day**

- [ ] Extend [voiceIntentParser.ts](src/lib/hade/voiceIntentParser.ts) with state keyword tables (5 groups from Section 6)
- [ ] Return `traveler_hint?: TravelerState` in `VoiceIntent` type
- [ ] Pass `voiceIntent` to `inferTravelerState()` in [route.ts](src/app/api/hade/decide/route.ts)
- [ ] Add voice parser tests (5 new cases)
- [ ] **Ship. Inference accuracy improves for voice-first users.**

---

### Phase 3 — UI Surface (State Pill + Chip Variants)
**Duration: 3–4 days**

- [ ] Write `traveler_state_applied` through to `DecideResponse` (now optional field on response)
- [ ] Extend [ContextSignalBadge.tsx](src/components/hade/adaptive/ContextSignalBadge.tsx) with `traveler_state` variant (renders at confidence ≥ 0.75)
- [ ] Add state-driven header chip variants to [HeroDecisionCard.tsx](src/components/hade/mobile/HeroDecisionCard.tsx)
- [ ] Add CTA label variants to [PrimaryAction.tsx](src/components/hade/mobile/PrimaryAction.tsx)
- [ ] Add state correction row to [RefineSheet.tsx](src/components/hade/mobile/RefineSheet.tsx) (6-option selector)
- [ ] Wire state pill tap → RefineSheet correction row
- [ ] Update [useHade.ts](src/lib/hade/useHade.ts) to surface `traveler_state_applied`
- [ ] **Ship. State becomes visible to user. Correction path opens.**

---

### Phase 4 — Correction Loop + Telemetry
**Duration: 2 days**

- [ ] Create `src/app/api/hade/state/route.ts` (POST endpoint, mirrors signal route)
- [ ] Wire RefineSheet correction → POST `/api/hade/state`
- [ ] Implement per-rule accuracy tracking (server-side, not in-band)
- [ ] Set up accuracy dashboard stub (logs per-rule accuracy to console on non-prod)
- [ ] **Ship. Learning loop active. Accuracy data starts flowing.**

---

### Phase 5 — Activate Scoring (Highest-Accuracy Rules First)
**Duration: 2–3 days per rule batch**

- [ ] Import `inferTravelerState` into `scoreOpportunity()` in [engine.ts](src/lib/hade/engine.ts)
- [ ] Implement `normaliseWeights()` utility
- [ ] Activate weight deltas ONLY for rules with ≥70% accuracy on ≥100 samples
- [ ] Initial batch: `hungry_now`, `time_constrained`, `low_energy` (highest specificity, most deterministic)
- [ ] Integration tests: verify weight deltas apply only above confidence threshold (TS-16)
- [ ] Integration tests: verify venue category filtering for `weather_detour` and `low_energy`
- [ ] **Ship. Scoring improvement visible in output quality.**
- [ ] Second batch (when accuracy data confirms): `waiting`, `recovering`, `socializing`
- [ ] Third batch: `exploring`, `open_to_surprise`, `solo_confidence`

---

### Phase 6 — External Signal Integration (Weather + Arrival)
**Duration: 3–4 days**

- [ ] Add `ENVIRONMENTAL` signal consumption path from device weather API (iOS: `CLWeatherCondition`, web: navigator.geolocation + Open-Meteo)
- [ ] Add `TRAVELER_STATE` as 8th SignalType in [src/types/hade.ts](src/types/hade.ts) (venue-independent signal)
- [ ] Wire weather signal → `weather_detour` rule (replaces voice-keyword-only path)
- [ ] Add session-scoped geo history to enable `arrival_orientation` full inference
- [ ] Outdoor venue filter: tag venues with `outdoor: true` in candidate metadata; apply hard filter when `weather_detour` active
- [ ] **Ship. State inference no longer voice-dependent for weather and arrival.**

---

### Phase 7 — Geo Velocity / Motion State (Optional / Future)
**Duration: 4–5 days**

- [ ] Add `geo_velocity_ms` to `HadeContext` (meters per second, derived from location delta)
- [ ] Wire to `transitioning` rule (high velocity → transitioning confidence boost)
- [ ] Wire to `waiting` rule (near-zero velocity + transit geo-fence → waiting boost)
- [ ] Geo-fence definitions: airport, train station, bus terminal → arrival_orientation boost
- [ ] **Ship. Fully ambient state detection — user never has to say anything.**

---

### Phase 8 — Accuracy Dashboard & Calibration
**Duration: 2 days**

- [ ] Build per-rule accuracy report (aggregate over sliding 7-day window)
- [ ] Auto-calibration: rules below 60% accuracy → threshold raised to 0.7; below 50% → disabled
- [ ] Alert on rule kill-switch
- [ ] **Ongoing. Inference quality self-maintains.**

---

## Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Input starvation: energy/openness default to neutral → low inference accuracy | High | Phase 2 voice keywords; Phase 3 RefineSheet row; log accuracy per-rule before activating scoring |
| Wrong state pill erodes trust ("Sensing: low energy" when user is energised) | High | Only render at confidence ≥ 0.75; one-tap correction; correction resets inference until next decide |
| LLM contract regression (prompt sees traveler_state, hallucinates steps) | Medium | `traveler_state_applied` is informational in prompt — wrap in "context:" not "instructions:"; parser-tolerant response validator |
| Validation drift: 3 type sources (hade.ts, decision.ts, validateDecision.ts) | Medium | Phase 0 task: update all three atomically; add lint check confirming field parity |
| Scoring delta normalisation error: weights don't sum to 1.0 | Low | `normaliseWeights()` utility + unit test on every delta combination |
| Phase 5 activation without enough telemetry data | Medium | Hard gate: require ≥ 100 samples AND ≥ 70% accuracy before activating any rule's scoring delta |
| TTL management: stale state persists across context shifts | Medium | Per-state TTL; re-infer on every `decide()` call; don't cache InferredTravelerState across sessions |
| Cold-start (synthetic engine) receives traveler_state but has no delta logic | Low | `traveler_state` is optional; synthetic engine ignores undefined fields — no regression |

---

## Concept Axis Disambiguation

To prevent confusion as new axes are added:

| Axis | Where Set | Lifecycle | How Used |
|---|---|---|---|
| **Mode** (dining/social/travel) | User-explicit, persists | Session-long | Domain scoring config selection |
| **Lens** | User-explicit, persists | Session-long | Narrative frame + scoring bias |
| **Preset** | User-explicit, one-shot | Single decide call | Context defaults override |
| **Scenario** | System-inferred, stable | Session-long | Context template selection |
| **Intent** | Voice/RefineSheet, explicit | Single decide call | Category affinity scoring |
| **HadeState** (energy/openness) | Voice/defaults, explicit | Single decide call | No current scoring effect |
| **TravelerState** | Inferred + temporal | Minutes to hours (TTL-bound) | Scoring deltas, copy, CTA — when confidence ≥ 0.65 |

**Key distinction:** TravelerState is *inferred and temporal*. All other axes are *explicit and persistent*. This is why TravelerState lives in a separate inference layer and is never user-set directly (only correctable via RefineSheet).

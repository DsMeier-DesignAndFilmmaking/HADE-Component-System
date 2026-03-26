# HADE — Architecture & Technical Blueprint
## The Engine

> **Cross-reference:** The Anti-Choice Mandate in `VISION.md` is the philosophical contract. This file is the technical contract. They must never conflict.

---

## Current State: What Exists

The frontend layer is production-quality. The engine layer is a stub pointing at a backend that does not exist.

### Implemented (Frontend)

| File | Purpose | Status |
|------|---------|--------|
| `src/types/hade.ts` | Full TypeScript schema — Signal, HadeContext, Opportunity, DecideRequest, DecideResponse | ✅ Exists — needs DecideResponse update |
| `src/lib/hade/engine.ts` | buildContext, scoreOpportunity, rankOpportunities, generateRationale, haversine utils | ✅ Exists — client-side scoring must move to backend |
| `src/lib/hade/signals.ts` | emitSignal, aggregateSignals, weightByTrust, filterExpiredSignals | ✅ Exists — keep as-is |
| `src/lib/hade/hooks.ts` | useHadeEngine, useSignals, useAdaptive, HadeAdaptiveContext | ✅ Exists — remove client re-ranking at lines 147–153 |
| `src/components/hade/` | All UI components | ✅ Exists — no changes needed for v0 |

### Missing (Backend — The Entire Engine)

- `hade-api/` — does not exist
- `POST /hade/decide` — does not exist
- LLM integration — does not exist
- Venue data source connection — does not exist
- Session-scoped rejection memory — does not exist

---

## The Backend Contract

### Endpoint

```
POST /hade/decide
Content-Type: application/json
```

### Request Schema

Matches the existing `DecideRequest` type in `src/types/hade.ts` plus time context:

```typescript
{
  // Required
  geo: {
    lat: number;   // User's current latitude
    lng: number;   // User's current longitude
  };

  // Situational context (all optional, backend applies defaults)
  intent?: "eat" | "drink" | "chill" | "scene" | null;  // null = infer from time context
  energy_level?: "low" | "medium" | "high";              // Default: "medium"
  group_size?: number;                                    // Default: 1
  radius_meters?: number;                                 // Default: 1500

  // Time context (frontend derives these via buildContext() in engine.ts)
  time_of_day?: "morning" | "afternoon" | "evening" | "night";
  day_type?: "weekday" | "weekend";

  // Session
  session_id?: string | null;

  // Rejection memory (current session only)
  rejection_history?: Array<{
    venue_id: string;
    venue_name: string;
    pivot_reason: string;
  }>;
}
```

### Response Schema

**Critical: There is no `fallbacks` field. There is no `primary` field. There is one `decision`.**

```typescript
{
  // The decision — one, singular, non-negotiable
  decision: {
    id: string;                  // Venue ID from data source
    venue_name: string;
    category: string;            // e.g. "Italian restaurant"
    geo: { lat: number; lng: number };
    distance_meters: number;
    eta_minutes: number;
    rationale: string;           // 1–2 sentences, specific, non-generic
    why_now: string;             // What contextual factor made this right at this moment
    confidence: number;          // 0–1 composite score
    neighborhood?: string;
  };

  // Debugging surface — never shown in UI, used for observability
  context_snapshot: {
    interpreted_intent: string;  // What the engine inferred if intent was null
    signals_used: string[];      // Signal types that influenced the decision
    decision_basis: string;      // Human-readable summary: "evening + weekend + group of 2"
    venue_candidates_evaluated: number;  // How many venues were considered before deciding
  };

  // Session continuity
  session_id: string;
}
```

### What the Response Must Never Contain

```typescript
// ❌ These fields must not exist in the response
{
  fallbacks: Opportunity[];   // BANNED — violates Anti-Choice Mandate
  primary: Opportunity;       // BANNED — implies there are secondaries
  options: any[];             // BANNED — this is not a search engine
  suggestions: any[];         // BANNED — this is not a recommendation engine
  alternatives: any[];        // BANNED
}
```

---

## Backend Architecture: Three Layers

The backend processes every `/decide` request through three sequential layers:

```
Request
  │
  ▼
┌─────────────────────────────────────┐
│  Layer 1: Venue Retrieval           │
│  Foursquare / Google Places API     │
│  Filter: geo + radius + category    │
│  Output: 10–20 candidate venues     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Layer 2: Context Scoring           │
│  3-Factor composite formula         │
│  Reduces candidates to top 3–5      │
│  Output: scored + ranked shortlist  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Layer 3: LLM Decision + Rationale  │
│  Receives: context + shortlist      │
│  Selects: exactly 1 venue           │
│  Writes: rationale + why_now        │
│  Output: final decision object      │
└──────────────┬──────────────────────┘
               │
               ▼
           Response
```

---

## Layer 1: Venue Retrieval

Use **Foursquare Places API** or **Google Places API (Nearby Search)**. Both support geo + radius + category filtering.

**Pre-filter rules before sending to LLM:**
- Maximum radius: `radius_meters` from request (default 1500m)
- Exclude venues in `rejection_history`
- Filter by category mapped from intent:

```typescript
const intentToCategoryMap = {
  eat:   ["restaurant", "cafe", "bistro", "dining"],
  drink: ["bar", "cocktail lounge", "brewery", "wine bar"],
  chill: ["park", "bookstore", "coffee shop", "museum", "gallery"],
  scene: ["nightclub", "rooftop bar", "event venue", "popup"],
  null:  []  // No filter — let the LLM decide based on time context
};
```

**Candidate count:** Aim for 10–20 venues before scoring. Too few = poor decision quality. Too many = slow LLM response.

---

## Layer 2: The 3-Factor Scoring Formula

This is the formula already implemented client-side in `src/lib/hade/engine.ts:scoreOpportunity()`. The backend must apply it (or supersede it with LLM reasoning) to reduce candidates before the LLM call.

```
composite_score = (proximity × 0.40) + (signal_strength × 0.35) + (intent_alignment × 0.25)
```

### Proximity Score (40%)

```
proximity_score = max(0, 1 - (distance_meters / radius_meters))
```

Linear decay from 1.0 (at origin) to 0.0 (at radius edge). A venue 500m away with a 1500m radius scores `1 - (500/1500) = 0.67`.

### Signal Strength Score (35%)

```
signal_score = mean(trust_attribution.edge_weight) if attributions exist
             else primary_signal.strength
             else 0.0
```

When no signals exist (early v0), this component defaults to 0. The composite score still functions — it degrades gracefully to proximity + intent.

### Intent Alignment Score (25%)

```typescript
const affinityMap = {
  eat:   ["restaurant", "cafe", "food", "dining", "brunch"],
  drink: ["bar", "cocktail", "wine", "brewery", "lounge"],
  chill: ["park", "coffee", "bookstore", "gallery", "spa"],
  scene: ["club", "rooftop", "lounge", "event", "popup"],
};

// Score: 1.0 if keyword match, 0.2 if no match, 0.5 if intent is null
intent_score = intent === null ? 0.5
             : affinityMap[intent].some(k => category.includes(k)) ? 1.0
             : 0.2;
```

**Note:** The `0.5` default for null intent is a placeholder. In practice, the backend should infer intent from `time_of_day` before scoring:

```typescript
function inferIntent(time_of_day, day_type): Intent {
  if (time_of_day === "morning") return "eat";         // breakfast
  if (time_of_day === "afternoon") return "chill";     // daytime browse
  if (time_of_day === "evening") return "eat";         // dinner hour
  if (time_of_day === "night" && day_type === "weekend") return "drink";
  if (time_of_day === "night") return "chill";
  return "anything";
}
```

---

## Layer 3: LLM Decision & Rationale

### System Prompt (Required Structure)

The LLM receives the shortlisted venues (post-scoring, top 3–5) plus the full context. It selects one and writes the rationale.

```
SYSTEM PROMPT:

You are HADE — a human-aware decision engine. Your job is to make one decision.
You receive a list of candidate venues and the user's current situational context.
You must select exactly one venue and explain why in 1–2 sentences.

RULES (non-negotiable):
1. Select exactly one venue from the candidates provided. Never suggest alternatives.
2. Your rationale must be 1–2 sentences maximum.
3. Your rationale must reference at least one of: the time of day, day type, group size, or energy level.
4. Write as a trusted local friend who knows what's right for this moment. Be direct.
5. Never use: "based on your preferences", "you might enjoy", "here are some options",
   "could be a good fit", "might want to consider", or any hedging language.
6. Never write in the third person about HADE.
7. The output must be valid JSON matching the schema provided.

CONTEXT:
- Time: {time_of_day} on a {day_type}
- Group: {group_size} {group_size === 1 ? "person" : "people"}
- Energy: {energy_level}
- Intent: {intent ?? "unspecified — infer from time context"}
- Rejected this session: {rejection_history.map(r => r.venue_name).join(", ") || "none"}

CANDIDATES:
{JSON.stringify(shortlisted_venues, null, 2)}

OUTPUT FORMAT:
{
  "selected_venue_id": "...",
  "rationale": "...",
  "why_now": "..."
}
```

### Rationale Quality Bar

The rationale passes if it meets all three:
1. References a contextual factor (time, day, group, or energy)
2. Contains no hedging language (see banned list above)
3. Is declarative — states what to do, not what the user might like

**Pass examples:**
- "Saturday dinner for two — Cotogna has the right energy tonight. Walk there, don't rush."
- "Late on a weekday, you want something easy. This place is."
- "7pm on a weekend with medium energy is exactly what this spot is built for."

**Fail examples:**
- "Based on your preferences, Cotogna might be a great option." ❌ (hedging)
- "Here are some reasons you might enjoy this venue." ❌ (list framing)
- "This restaurant has good reviews and is close to you." ❌ (no context reference)
- "New discovery nearby — worth checking out." ❌ (generic — this is engine.ts line 145)

---

## Frontend Fixes Required for v0

### Fix 1: Remove Client-Side Re-Ranking

In `src/lib/hade/hooks.ts`, lines 147–153 re-rank whatever the backend returns using the local scoring formula. This overrides the backend's decision. Remove it.

```typescript
// ❌ DELETE THIS (hooks.ts:147–153)
const ranked = rankOpportunities(
  [data.primary, ...data.fallbacks],
  context
);
setOpportunities(
  ranked.map((o, i) => ({ ...o, is_primary: i === 0 }))
);

// ✅ REPLACE WITH
setDecision(data.decision);
```

### Fix 2: Update DecideResponse Type

In `src/types/hade.ts`, replace the current `DecideResponse`:

```typescript
// ❌ Current (remove)
export interface DecideResponse {
  primary: Opportunity;
  fallbacks: Opportunity[];
  context_state_id: string;
  provider?: "gemini" | "openai";
}

// ✅ New
export interface DecideResponse {
  decision: Decision;          // New type — see below
  context_snapshot: {
    interpreted_intent: string;
    signals_used: string[];
    decision_basis: string;
    venue_candidates_evaluated: number;
  };
  session_id: string;
}

export interface Decision {
  id: string;
  venue_name: string;
  category: string;
  geo: GeoLocation;
  distance_meters: number;
  eta_minutes: number;
  rationale: string;
  why_now: string;
  confidence: number;
  neighborhood?: string;
}
```

### Fix 3: Remove Hardcoded Geo

In `src/app/demo/page.tsx`, replace:
```typescript
// ❌ Hardcoded San Francisco
decide({ geo: { lat: 37.7749, lng: -122.4194 } })

// ✅ Use browser API
navigator.geolocation.getCurrentPosition((pos) => {
  decide({ geo: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
});
```

### Fix 4: Update pivot() to Re-Call Backend

In `src/lib/hade/hooks.ts`, `pivot()` currently filters the local list. It must instead re-call `/decide` with the updated rejection_history:

```typescript
const pivot = useCallback((reason: string) => {
  if (!decision) return;
  updateContext({
    rejection_history: [
      ...(context.rejection_history ?? []),
      { venue_id: decision.id, venue_name: decision.venue_name, pivot_reason: reason },
    ],
  });
  setDecision(null);
  decide();  // Re-call — backend uses updated rejection_history
}, [context, decision, updateContext, decide]);
```

---

## Session Memory

Session memory is minimal by design:

- `session_id` — generated on first load, stored in `localStorage`, sent with every request
- `rejection_history` — stored client-side in `HadeContext.rejection_history`, sent to backend each call
- Backend may optionally cache rejection_history server-side by session_id (in-memory dict or Redis)
- TTL: 24 hours. After that, session resets and prior rejections are forgotten.

**No database. No user accounts. No persistent preference model.**

---

## Notes for the AI

> **Read this before modifying any backend or API-related code.**

1. **`DecideResponse` has no `fallbacks` field.** If you write code that populates or consumes `fallbacks`, you are implementing the wrong schema. Refer to the response schema defined in this file.

2. **Never re-rank on the client.** The `rankOpportunities()` function in `engine.ts` is useful for testing and documentation, but must not be called after a `/decide` response. The backend's decision is final.

3. **The LLM receives 3–5 candidates, not all venues.** Pre-filter with the scoring formula before calling the LLM. Sending 20 venues to the LLM is wasteful and slow.

4. **The system prompt above is the minimum.** You may extend it, but you may not remove any of the RULES or the banned language list.

5. **The 3-factor formula is in `engine.ts`.** Do not reimplement it. Import and reuse `scoreOpportunity()` on the backend, or port it directly — it has no dependencies.

6. **`intent: null` is valid.** The backend must handle it by calling `inferIntent(time_of_day, day_type)` before scoring.

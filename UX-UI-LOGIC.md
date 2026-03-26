# HADE — UX & UI Logic
## The Interface Soul

> **Cross-reference:** `VISION.md` defines what HADE must never be (a list, a comparison tool, a search result). This file defines what the UI must do instead.

---

## Core Principle: The UI Reflects the Engine

The interface has one job: make the engine's single decision feel inevitable and trustworthy. The UI does not add options. It does not create navigation away from the decision. It does not suggest that there might be something better.

Every component, animation, and interaction either reinforces the decision or gets out of the way.

---

## Confidence-Driven Rendering

Every `/decide` response includes a `decision.confidence` score (0–1). The UI renders three distinct states based on this score. The user never sees the number — they see its effect.

### State 1: High Confidence (≥ 0.75)

The engine is certain. The UI leads with authority.

- **Venue name:** Large, primary typeface, no qualifiers
- **Rationale:** Single line, declarative tone
- **CTA:** "Walk there now" or "Go" — direct, present tense
- **Signal badges:** Hidden by default (the decision speaks for itself)
- **why_now field:** Not displayed
- **Visual treatment:** Full decision card, clean, no visual noise

```
┌──────────────────────────────────┐
│  Wayfare Tavern                  │
│  American · 6 min walk           │
│                                  │
│  "Saturday night for two —       │
│   this is where you go."         │
│                                  │
│  ────────────────────────────    │
│  [ Go ]                          │
└──────────────────────────────────┘
```

### State 2: Medium Confidence (0.50 – 0.74)

The engine is confident but the context has ambiguity (e.g., intent was null, signal data is sparse). The UI surfaces the reasoning.

- **Venue name:** Same prominence as State 1
- **Rationale:** Full display
- **why_now:** Displayed below rationale in muted text
- **CTA:** "Head there" or "Go" — still direct
- **Signal badges:** Show dominant signal type if available
- **Visual treatment:** Same card, adds one line of context

```
┌──────────────────────────────────┐
│  Wayfare Tavern                  │
│  American · 6 min walk           │
│                                  │
│  "Saturday night for two —       │
│   this is where you go."         │
│                                  │
│  Evening · Weekend · Group of 2  │  ← why_now, muted
│                                  │
│  [ Evening Signal ] [ Weekend ]  │  ← signal badges
│                                  │
│  [ Head there ]                  │
└──────────────────────────────────┘
```

### State 3: Low Confidence (< 0.50)

The engine made a decision but the context was sparse (no intent, no signals, fewest viable venue candidates). The UI is softer but still commits.

- **Venue name:** Same size
- **Rationale:** Full display
- **why_now:** Displayed
- **Signal badges:** Displayed and emphasized — they explain what little data the engine had
- **CTA:** "Worth a look" — slightly softer but still directional
- **Visual treatment:** Same card structure, signal badges above rationale

**Important:** Low confidence does not mean the UI offers alternatives. It means the UI is transparent about its reasoning. One decision. Always.

---

## Signal Badges: Explaining the Why

Signal badges (`SignalBadge.tsx`, `ContextSignalBadge.tsx`) exist to make the engine's reasoning legible — not to show technical metadata.

### When to Show Signal Badges

| Condition | Display Rule |
|-----------|-------------|
| Confidence ≥ 0.75 | Hide badges — decision is self-evident |
| Confidence 0.50–0.74 | Show dominant signal type only |
| Confidence < 0.50 | Show all active signal types |
| SOCIAL_RELAY signal active | Always show — include display_name and time_ago |
| ENVIRONMENTAL signal active | Show if it meaningfully affected the decision |
| BEHAVIORAL signal active | Show if strength > 0.6 |
| PRESENCE signal active | Show only if from a trusted source |

### Signal Badge Copy Rules

Badges communicate in plain language, not technical labels.

| Signal Type | Badge Display | Example |
|-------------|--------------|---------|
| `PRESENCE` | Who's there | "Alex was here 2h ago" |
| `SOCIAL_RELAY` | Friend recommendation | "Mia said go · 4h ago" |
| `ENVIRONMENTAL` | Condition | "Quiet tonight" |
| `BEHAVIORAL` | Browsing signal | "You've looked here before" |
| `AMBIENT` | Background context | "Live music tonight" |
| `EVENT` | Time-specific | "Show starts in 45 min" |

**Never display:**
- Raw signal strength values (e.g., "Strength: 0.7")
- Signal IDs or technical identifiers
- Multiple badges for the same signal type
- More than 3 badges at once

---

## The Gold Path UX

The Gold Path is the canonical reference scenario for all UI decisions. If a new component or interaction works correctly for the Gold Path, it is likely correct.

**Scenario:** Saturday, 7:12pm, Union Square SF, 2 people, energy: medium, intent: not stated.

### Input State

```typescript
{
  geo: { lat: 37.7879, lng: -122.4075 },
  intent: null,              // user did not specify
  energy_level: "medium",
  group_size: 2,
  time_of_day: "evening",   // auto-derived by buildContext()
  day_type: "weekend",      // auto-derived by buildContext()
  session_id: "session_789",
  rejection_history: []
}
```

### Expected Engine Response

```typescript
{
  decision: {
    venue_name: "Wayfare Tavern",
    category: "American brasserie",
    rationale: "Saturday night, two of you — Wayfare fits the hour. Good energy without being loud. Walk there, don't rush.",
    why_now: "Weekend evening, medium energy, small group.",
    confidence: 0.78,
    eta_minutes: 6,
    neighborhood: "Financial District"
  },
  context_snapshot: {
    interpreted_intent: "dinner",
    decision_basis: "time_of_day=evening + day_type=weekend + group_size=2"
  }
}
```

### Expected UI Render

Since confidence = 0.78 (State 2), the UI shows:
- Venue name large
- Rationale displayed
- why_now in muted text below
- One signal badge (if available) or none if no signals are active
- CTA: "Head there"

### What Must NOT Appear in the Gold Path

- A second venue card
- A "See other options" link or button
- A "Compare" tab or mode
- Pagination or swipe indicators suggesting more results
- The text "options," "suggestions," "alternatives," or "recommendations"
- A confidence percentage shown to the user

---

## AdaptiveCard Modes

The `AdaptiveCard` component (`src/components/hade/adaptive/AdaptiveCard.tsx`) supports three modes: `explore`, `compare`, `book`.

**Permitted uses:**

| Mode | When to Use | Context |
|------|-------------|---------|
| `explore` | Browsing mode — not for decision output | Component gallery, onboarding |
| `book` | High urgency state — event starting soon | `urgency="high"` only |
| `compare` | **Never for primary decision view** | Permitted only in future multi-domain side-by-side research context |

**The `compare` mode is banned from the primary decision surface.** It implies the user should be evaluating multiple options. They should not be.

The primary decision view always renders as a custom decision card — not as an `AdaptiveCard` in any mode. `AdaptiveCard` is a utility component for the component library, not the decision output renderer.

---

## Pivot Behavior

When the user dismisses a decision (says "not this"), the system must behave correctly.

### What Must Happen

1. The dismissed venue is added to `rejection_history` with a `pivot_reason`
2. The current decision is cleared from state
3. A loading state is shown immediately
4. A new call to `/decide` is made with the updated `rejection_history`
5. The new decision renders with the same confidence-driven display logic

### What Must Not Happen

- The UI must not slide to "the next item in a list" — there is no list
- The UI must not show a skeleton of the previous card
- The UI must not display "showing result 2 of 5" or any pagination language
- The pivot must not be animated as a swipe left (implies a deck of cards)

**The user experience of pivoting should feel like asking a different question, not flipping through results.**

### Pivot CTA Language

The dismiss action should not be labeled "No" or "Skip" — both imply something negative about the decision. Use:

- "Not feeling it" — soft, casual
- "Try somewhere else" — directional, neutral
- "Not now" — time-based, non-judgmental

---

## Urgency System

The `urgency` field in `UserSignal` drives visual intensity. Rules for when each level activates:

| Urgency | Trigger Condition | Visual Treatment |
|---------|------------------|-----------------|
| `low` | Default state, confidence any level | No urgency indicators, standard CTA |
| `medium` | Confidence < 0.60, or > 30 min until event | Accent highlight on card border, `why_now` visible |
| `high` | Event starting ≤ 30 min, or PRESENCE signal from trusted source | CyberLime glow on card, pulsing ring on CTA, "Going now" CTA text |

The pulse ring animation (`AdaptiveButton` with `urgency="high"`) should fire sparingly. It signals genuine time pressure, not general enthusiasm for the venue. Overusing it degrades trust.

---

## Loading and Error States

### Loading

The decision is loading. Show a single skeleton card — same dimensions as the decision card. Do not show multiple skeletons (this implies multiple results are coming).

```
┌──────────────────────────────────┐
│  ████████████████                │  ← venue name skeleton
│  ██████ · ██████                 │  ← category + distance skeleton
│                                  │
│  ████████████████████████        │  ← rationale skeleton (2 lines)
│  ████████████████                │
│                                  │
│  [ ████████████ ]                │  ← CTA skeleton
└──────────────────────────────────┘
```

### Error

The backend is unreachable or returned an error. Show one message, one retry action.

```
HADE couldn't reach a decision right now.
[ Try again ]
```

Do not show cached results. Do not show a fallback list. If the engine failed, the interface acknowledges the failure and offers to retry.

---

## Typography and Voice in Decision Output

The decision output has its own voice rules. These apply specifically to the `rationale` and `why_now` fields rendered on screen.

**Rationale typography:**
- Font: JetBrains Mono or system serif — adds weight and authority
- Size: 15–16px, comfortable reading
- Color: Primary text (ink)
- Style: Italic optional for emotional emphasis, never for entire text blocks

**Rationale voice rules:**
- Present tense: "this is where you go" not "this would be a good choice"
- Second person: "you" not "the user"
- Active verbs: "fits," "works," "has" — not "might be," "could work," "may suit"
- No qualifiers: not "probably," "typically," "generally," "usually"

---

## Notes for the AI

> **Read this before modifying any component in `src/components/hade/`.**

1. **One card. Always one.** If a PR introduces a second card, a carousel, a list, or any pagination metaphor on the decision output surface, reject it. It violates the Anti-Choice Mandate.

2. **`compare` mode is banned from the decision view.** `AdaptiveCard` in `compare` mode is for future use in non-decision contexts only. Never apply it to the primary output.

3. **Signal badges explain, they do not sell.** Do not add marketing copy or emoji to signal badges. They are informational, not persuasive.

4. **The Gold Path is the acceptance test.** Before shipping any UI change, run it against the Gold Path scenario mentally: Saturday 7pm, 2 people, medium energy, Union Square SF. If the UI handles this scenario correctly, it is likely correct.

5. **Pivot re-calls the backend.** `pivot()` must trigger a new `/decide` call, not a local list traversal. Do not implement pivot as array index manipulation.

6. **Confidence score is internal.** The `decision.confidence` value drives rendering behavior but is never displayed to the user as a number or percentage.

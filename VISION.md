# HADE — Vision
## The North Star

---

## Why HADE Exists

Search is broken for real-time decisions.

When I open an app and ask "where should I eat tonight," the system returns 47 results sorted by an algorithm that has no idea it's Saturday, that I have medium energy, that I'm with one other person, or that I walked 8 miles today. The system has context blindness. It returns options when I need an answer.

HADE exists to fix this. Not to build a better search. Not to build a smarter recommendation engine. To build something categorically different: **a system that decides**.

The output is not a list. The output is a decision.

---

## Radical Trust

HADE operates on a principle I call **Radical Trust** — the belief that a system with full situational context can make a better decision than a person paralyzed by too many options.

This is not arrogance. It is physics. When I am tired, hungry, and standing on a corner at 7pm on a Saturday, my decision-making capacity is degraded. My ability to evaluate 10 options, cross-reference reviews, compare distances, and weigh ambiance against price is at its lowest exactly when I need it most.

HADE steps into that gap. It trusts itself. It says: **go here**.

Like a trusted local friend who knows the neighborhood, knows the hour, knows your energy — and says one thing. Not three things. One thing.

---

## The Anti-Choice Mandate

HADE returns exactly one decision. This is not a limitation. It is the product.

Multiple options are a failure mode masquerading as a feature. The research on decision fatigue is unambiguous: more choices produce worse outcomes and lower satisfaction, even when the "best" choice is in the set. Barry Schwartz called it the Paradox of Choice. Sheena Iyengar demonstrated it with jam. I am building it into an engine.

**Rules that are absolute and non-negotiable:**

- The API returns one `decision` object. Not `primary + fallbacks[]`. One.
- The UI renders one card. Not a carousel. Not a tab set. One card.
- The rationale is one to two sentences. Not a bulleted list of attributes. Prose.
- The CTA is one action. Not "See More" or "Compare Options." One button.

Any engineer, AI assistant, or future version of me that proposes adding a second result, a "not feeling it?" list, or a comparison view to the primary decision surface has violated the core mandate of this system. Do not do it.

---

## Human-Awareness: The Moment Fingerprint

HADE is "human-aware" in a specific, bounded sense. It does not track you over time. It does not build a preference profile. It reads the current moment and acts on it.

Every moment has a fingerprint made of four situational axes:

| Axis | Values | Signal Weight |
|------|--------|--------------|
| **Time of day** | morning / afternoon / evening / night | High — fundamentally changes the decision category |
| **Day type** | weekday / weekend | High — changes energy norms and social expectations |
| **Energy level** | low / medium / high | Medium — changes venue type and walk tolerance |
| **Group size** | 1–N | Medium — changes noise tolerance, table requirements, intimacy |

These four axes combine to produce a moment fingerprint. Saturday evening, medium energy, group of 2 is a fundamentally different fingerprint than Tuesday afternoon, high energy, solo. HADE treats them as different problems with different answers.

No two moments are identical. HADE should not return the same decision for different moments.

---

## The 3-Second Promise

From the moment context is assembled to the moment a decision is rendered on screen: **under 3 seconds**.

This is not an aspiration. It is a product constraint. If it takes longer than 3 seconds, the user has already made their own decision (usually a worse one) or abandoned the system. Speed is trust.

The 3-second budget breaks down roughly as:
- Context assembly: ~100ms (client-side, `buildContext()`)
- Venue retrieval: ~500ms (Foursquare/Places API)
- LLM decision + rationale: ~1.5–2s (primary cost)
- Response parsing + render: ~100ms

Every architectural decision must be evaluated against this budget. If an LLM call is too slow, use a faster model. If venue retrieval is the bottleneck, pre-filter aggressively. The 3-second wall is real.

---

## What HADE Is Not

Being precise about what HADE is not prevents scope creep and architectural drift.

**HADE is not a recommendation engine.**
Recommendation engines optimize for click-through and engagement across a session. HADE optimizes for a single correct decision in a single moment.

**HADE is not a search layer.**
Search returns matching results and lets the user filter. HADE takes context and returns an answer.

**HADE is not a comparison tool.**
Comparison tools exist to help users evaluate options side by side. HADE eliminates the need for comparison by making the evaluation itself.

**HADE is not a preference learner.**
HADE does not track long-term behavior to infer taste. It uses real-time situational signals. A rejection today does not update a preference model — it simply excludes that venue from the current session.

**HADE is not a social platform.**
Trust attributions and social relay signals are in the schema for future use. They are not a v0 priority. HADE works without a social graph.

---

## The Long View

HADE starts in the context of local venue discovery. But the engine is domain-agnostic by design.

The same decision logic — situational context in, single opinionated output out — applies to:
- What to watch tonight (entertainment)
- Which task to work on next (productivity)
- What to cook given what's in the fridge (home)
- Which route to take given current energy (navigation)

The v0 is about proving the engine works for one domain with one gold path scenario. Everything else is future state.

---

## Notes for the AI

> **Read this before touching any part of HADE.**

1. **Never return a list.** If you are building an API endpoint, component, or hook that returns multiple decision options to the user, you have broken the core product principle. Stop and rethink.

2. **Never hedge in rationale.** Phrases like "you might enjoy," "based on your preferences," "here are some options," or "this could be a good fit" are banned. The rationale is declarative, not suggestive.

3. **The `fallbacks` field in `DecideResponse` must not exist.** If you see it in the codebase, it is a bug from a prior state. Remove it. The response schema is defined in `ARCH-TECH.md`.

4. **The 3-second constraint is hard.** If a proposed architecture cannot meet it, it is the wrong architecture.

5. **Check `OPS-ROADMAP.md` before adding features.** If a feature is not in the Day 1–5 plan, do not build it without explicit instruction.

# HADE — Ops & Roadmap
## Build Guardrails

> **Cross-reference:** `VISION.md` defines what HADE is. `ARCH-TECH.md` defines how it works. `UX-UI-LOGIC.md` defines how it looks. This file defines how I build it — alone, fast, and without scope creep.

---

## Solo-Founder Ground Rules

This is an I-project. Every decision is mine. There is no "we," no team sync, no consensus-seeking. The upside is velocity. The downside is nobody stops me from overbuilding.

These rules exist to stop me from overbuilding.

1. **Build for the Gold Path first.** If a feature is not required to make the Gold Path scenario work end-to-end, it does not exist in v0.
2. **Ship function over form.** A working decision with an ugly UI beats a beautiful demo with a broken engine.
3. **Defer the hard problems.** Social graph, ML-based adaptation, multi-domain support — these are real and interesting. They are not Day 1 problems.
4. **Trust the architecture.** `ARCH-TECH.md` defines the contracts. Build to those contracts. Do not renegotiate them mid-sprint without updating the doc.

---

## Definition of Done — v0

v0 is complete when all six of the following are true. Not five. All six.

- [ ] `POST /hade/decide` with a real GPS coordinate returns ONE decision object in under 3 seconds
- [ ] The rationale string references at least one contextual factor (time, day type, group size, or energy level)
- [ ] The word "options" does not appear anywhere in the API response or UI
- [ ] The demo page (`/demo`) uses `navigator.geolocation` — no hardcoded coordinates
- [ ] A new developer can clone the repo, run two commands, and have the full stack running locally in under 5 minutes
- [ ] `npm run type-check` passes with zero errors

These are binary. Either they pass or v0 is not done.

---

## Day-by-Day Execution Plan

### Day 1 — Build the Backend Shell

**Goal:** `POST /hade/decide` returns a real decision object.

**Tasks:**
1. Create `hade-api/` directory in project root
2. Scaffold FastAPI (Python) or Express (Node) — pick whichever is faster to start
3. Connect Foursquare Places API or Google Places Nearby Search
4. Implement the 3-factor scoring formula (port from `src/lib/hade/engine.ts:scoreOpportunity()`)
5. Write the LLM system prompt per `ARCH-TECH.md` spec
6. Wire Claude API or OpenAI — pass top 3–5 scored venues + full context
7. Return response matching the `DecideResponse` schema in `ARCH-TECH.md`
8. Test with `curl` — hardcoded request body is fine on Day 1

**Exit criteria for Day 1:**
```bash
curl -X POST http://localhost:8000/hade/decide \
  -H "Content-Type: application/json" \
  -d '{"geo": {"lat": 37.7749, "lng": -122.4194}, "time_of_day": "evening", "day_type": "weekend", "group_size": 2}'
# Returns: { "decision": { "venue_name": "...", "rationale": "..." }, ... }
```

**Skip on Day 1:** session memory, rejection_history persistence, environment variable setup, Docker, error handling beyond basic 500.

---

### Day 2 — Wire Frontend to Real Backend

**Goal:** The demo page generates a real decision from the user's actual location.

**Tasks:**
1. Remove `rankOpportunities()` re-scoring at `hooks.ts:147–153` (see `ARCH-TECH.md: Fix 1`)
2. Update `DecideResponse` type in `src/types/hade.ts` (see `ARCH-TECH.md: Fix 2`)
3. Replace hardcoded geo in `src/app/demo/page.tsx` with `navigator.geolocation` (see `ARCH-TECH.md: Fix 3`)
4. Update `useAdaptive()` hook state from `opportunities[]` to single `decision`
5. Update demo page to render single decision card instead of opportunity list
6. Wire `pivot()` to re-call backend with updated rejection_history (see `ARCH-TECH.md: Fix 4`)
7. Run Gold Path scenario manually: real location, evening, weekend, group 2

**Exit criteria for Day 2:**
- Demo page loads and requests location permission
- Clicking "Decide" makes a real network call to backend
- A single decision card renders with actual venue name and rationale
- No TypeScript errors

**Skip on Day 2:** adaptive component modes, signal emission UI, confidence-based rendering states.

---

### Day 3 — Rationale Quality Pass

**Goal:** The output consistently passes the human-aware test.

**Tasks:**
1. Run 10 varied test requests (different times, intents, group sizes) and evaluate each rationale
2. Iterate system prompt until ≥8/10 rationales pass the quality bar (see `ARCH-TECH.md: Rationale Quality Bar`)
3. Validate that all four context fields affect output: change `time_of_day`, `day_type`, `group_size`, and `energy_level` independently and confirm rationale changes
4. Test rejection_history: make a decision, pivot, make a new decision — confirm different venue + different rationale
5. Add `context_snapshot` logging to backend (console.log is sufficient — not a structured logging system)

**Rationale quality bar (from `ARCH-TECH.md`):**
- References a contextual factor ✓
- No hedging language ✓
- Declarative, not suggestive ✓

**Skip on Day 3:** UI changes, signal emission, error state refinement.

---

### Day 4 — Gold Path Validation

**Goal:** Walk the Gold Path scenario in a real location. Output must feel human-aware.

**Tasks:**
1. Go to a real location (or use a real coordinate, not SF default)
2. Open demo with actual GPS, set evening + weekend + group 2 + medium energy
3. Run `/decide` — evaluate the output against the Gold Path spec in `UX-UI-LOGIC.md`
4. If rationale fails: fix the prompt, re-run. Do not add features.
5. If venue data is poor: check Foursquare filter parameters, not the LLM
6. Document one real-world example input/output pair in this file (below)

**Gold Path acceptance criteria:**
- ONE venue name, not a list
- ONE rationale sentence referencing the context
- No hedging language
- Rendered in under 3 seconds on a standard connection

---

### Day 5 (Optional) — Minimal Domain Abstraction

**Goal:** Remove venue-specific hard locks from core types. Do NOT build multi-domain support.

**Tasks:**
1. Add `domain?: "venue" | "activity" | "content"` to `HadeContext`
2. Rename `Opportunity` type to `Decision` — keep all venue fields as optional
3. Add generic `label` and `description` fields alongside venue-specific ones
4. Update `DecideResponse` to use `Decision` type
5. Run type-check — no new errors

**This day is skippable.** If Days 1–4 took longer than expected, skip Day 5 and declare v0 done.

---

## What to Ignore (Explicitly)

These are real features. They are not v0 features. Do not build them until the Definition of Done above is satisfied.

| Feature | Why It's Excluded |
|---------|------------------|
| Social graph / trust attribution | No users, no social data |
| ML-based adaptation | No training data, premature |
| Signal emission from real sources | No integrations yet; demo signals are sufficient |
| AdaptiveCard explore/compare modes | Not needed for single decision output |
| User authentication | Not needed for v0 |
| Structured logging / analytics | Console.log is sufficient |
| Test suite | Write tests after Gold Path works |
| Docker / containerization | Not needed for local solo dev |
| CI/CD pipeline | Not needed for v0 |
| Mobile app | Not this sprint |

---

## Build Server Strategy

I have two machines: a primary dev machine (fast, tight feedback loop) and a 2013 iMac acting as a build server (slow, good for long-running tasks).

### Primary Dev Machine — Fast Iteration

- Next.js frontend development
- Backend API iteration (code changes, prompt editing)
- Quick test runs
- UI component work
- Anything with a sub-5 minute feedback loop

### Build Server (2013 iMac) — Heavy Tasks

Offload these to the build server to keep primary dev machine free:

- Long-running LLM prompt evaluation runs (testing 50+ prompts)
- Batch venue data pulls / API rate-limit-constrained fetches
- Any fine-tuning experiments (if ever pursued)
- Background processes that hold ports or consume significant CPU
- Git CI scripts if implemented

**Rule:** If a task will take more than 10 minutes to complete and does not need my active involvement, it runs on the build server.

**How to offload:** SSH into the build server, start the process in a `tmux` session, detach. Check results when convenient.

---

## Critical Files — v0 Touch List

Every file that must be modified or created for v0. Nothing else.

| File | Action | What Changes |
|------|--------|-------------|
| `src/types/hade.ts` | Modify | Replace `DecideResponse` with new schema; add `Decision` type |
| `src/lib/hade/hooks.ts:147–153` | Modify | Remove `rankOpportunities()` re-scoring |
| `src/lib/hade/hooks.ts` | Modify | Update state from `opportunities[]` to single `decision`; update `pivot()` |
| `src/app/demo/page.tsx` | Modify | Replace hardcoded geo with `navigator.geolocation`; update render |
| `hade-api/` | Create | New backend directory — FastAPI or Express |
| `hade-api/main.py` or `server.js` | Create | Backend entry point with `/hade/decide` endpoint |
| `hade-api/prompt.txt` or inline | Create | LLM system prompt per `ARCH-TECH.md` spec |
| `.env.local` | Create | `NEXT_PUBLIC_HADE_API_URL`, `FOURSQUARE_API_KEY`, `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` |
| `hade-api/.env` | Create | Server-side keys (not committed) |

**Files to not touch:**
- `src/lib/hade/engine.ts` — scoring formula is reference-correct, leave it
- `src/lib/hade/signals.ts` — signal utilities are fine, leave them
- `src/components/hade/` — all components stay as-is for v0

---

## Anti-Patterns to Enforce

AI coding assistants introduce these patterns regularly. All of them are wrong for HADE.

| Anti-Pattern | Why It's Wrong | Where It Tends to Appear |
|-------------|---------------|--------------------------|
| `fallbacks: Opportunity[]` in response | Violates Anti-Choice Mandate | Backend response schema |
| `rankOpportunities()` called after API response | Overrides backend decision | `hooks.ts` |
| `"New discovery nearby — worth checking out."` | Generic rationale, engine.ts line 145 | generateRationale() fallback |
| `intent: "anything" → 0.5` magic number | Prevents confident decisions on null intent | `engine.ts:105` |
| Hardcoded `[37.7749, -122.4194]` | Breaks real location testing | `demo/page.tsx` |
| Multiple `<DecisionCard />` renders | Implies list of results | Decision output view |
| `"You might enjoy..."` in rationale | Hedging language, banned by system prompt | LLM output |
| `compare` mode on primary decision | Implies comparison exists | `AdaptiveCard` usage |
| `useEffect` polling `/decide` | Engine should decide once per explicit user action | hooks |

---

## Real-World Example Log

*Populate this after Day 4 Gold Path validation.*

**Scenario:**
```
Date: [TBD]
Location: [TBD]
Time: [TBD]
Input: { intent: null, energy_level: "medium", group_size: 2, day_type: "weekend" }
```

**Decision returned:**
```
venue_name: [TBD]
rationale: [TBD]
confidence: [TBD]
elapsed_ms: [TBD]
```

**Pass/Fail:** [TBD]

---

## Environment Variables

Required for local development. Never committed.

```bash
# .env.local (frontend)
NEXT_PUBLIC_HADE_API_URL=http://localhost:8000

# hade-api/.env (backend)
FOURSQUARE_API_KEY=...
ANTHROPIC_API_KEY=...         # or OPENAI_API_KEY
PLACES_API_KEY=...            # if using Google Places instead of Foursquare
```

---

## Local Setup — 5-Minute Target

The full stack must be runnable by a new developer in under 5 minutes. This is a Definition of Done requirement.

```bash
# Terminal 1 — Frontend
cd "HADE Component System"
npm install
cp .env.local.example .env.local  # fill in NEXT_PUBLIC_HADE_API_URL
npm run dev

# Terminal 2 — Backend (FastAPI example)
cd hade-api
pip install -r requirements.txt
cp .env.example .env  # fill in API keys
uvicorn main:app --reload --port 8000
```

If setup takes more than 5 minutes (excluding API key provisioning), the setup process is broken. Fix it.

---

## Notes for the AI

> **Read this before proposing any new feature or architectural change.**

1. **Check the Definition of Done first.** If all six items are not checked, do not propose new features. Finish what is defined.

2. **Check the "What to Ignore" table.** If a feature you are about to build is in that table, stop and ask before proceeding.

3. **"I" voice, not "we."** This is a solo project. Documentation, commit messages, and comments should use "I" when referring to the builder. No "we."

4. **The build server is not the same machine.** When suggesting long-running tasks (prompt evaluation, batch processing), note that they should run on the build server.

5. **Do not add to the Critical Files touch list** without explicit instruction. If a file is not in the table above, it should not be modified for v0.

6. **The Gold Path is the acceptance test.** Before shipping any backend change, mentally run the Gold Path: Saturday 7pm, 2 people, medium energy, real GPS coordinate. If it produces a correct decision, it is likely correct.

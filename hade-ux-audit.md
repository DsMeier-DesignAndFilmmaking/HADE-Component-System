# HADE UX/UI Audit & Design Strategy

**Product:** HADE Decision Engine — Mobile Web  
**Audit Date:** May 2026  
**Auditor:** Senior Product Design Review  
**Frameworks:** Nielsen Norman Group Heuristics · Apple Human Interface Guidelines · Material Design · Google PAIR Guidebook · Decision-Fatigue Research  
**Codebase:** `src/components/hade/mobile/` — all findings reference production files, verbatim class names, and actual handlers

---

## Executive Summary

HADE's product thesis is unusually disciplined. Per VISION.md: *"The output is not a list. The output is a decision."* At the macro level, the interface mostly honors that thesis — a single full-bleed card, a single primary CTA, no carousel, no compare-grid. That's rare and worth defending.

But the production `HeroDecisionCard.tsx` violates the product's own stated UX contract in one critical way: it does not render `rationale` or `why_now` on the primary surface. The card shows a venue title, a time pill, and a going-count pill — and that is all the AI tells the user before asking them to commit. The reasoning that `UX-UI-LOGIC.md` explicitly mandates (Confidence-Driven Rendering, signal badges, prose rationale) exists in `GuidedDemoSection`, not in the shipped hero card. A system marketed as a decision engine presents output indistinguishable from a generic "nearby venue" suggestion. Trust is asserted, not earned.

Secondary failures cluster around three themes:
- The "Maybe" button is functionally dead — its handler logs and returns with no state change
- Mode labels disagree between `ModeToggle.tsx` ("Dining/Social/Travel") and `HeroDecisionCard.tsx` ("Eat Easy/Something Happening/Explore")
- Tap targets are 42px across all hero card CTAs — two points under the Apple HIG floor

**The gap shape is unusual and recoverable.** Product philosophy and data model score ~9/10. Trust rendering scores ~4/10. Most products fail at the philosophy layer and can never recover. HADE has the harder half right and is leaving the easier half on the floor.

**Overall maturity: 6.2 / 10.** If P0 fixes ship — render the rationale, wire Maybe, unify mode labels, fix tap targets — the realistic next-quarter score is 7.8–8.2.

---

## Full UX Audit

### CTA & Interaction — Score: 5.5 / 10

**What's working**

- The 3-column CTA grid (`grid-cols-[1fr_1fr_auto]`) intentionally shrinks "Not This" to auto width and fades it (`text-ink/55`). This is the right intent — destructive actions should be visually quieter than the primary commit. Aligned with NN/g's principle of least destructive default.
- Solid `bg-blue-600` primary against ghost secondaries gives a clear visual rank order at a glance.
- `focus-visible:ring-2` is present on all three buttons — accessibility-correct and often skipped in startup code.

**What's broken**

- **"Maybe" is a dead button.** `handleMaybe` only does `console.log("[HADE] Maybe →", target.title)` — no state mutation, no defer, no save-for-later. To the user, tapping it does nothing. This is the single most damaging UX bug in the audit because it teaches the user the system is non-responsive on their second-most-likely action.
- **Three CTAs on a "single decision" surface.** VISION.md states: *"The CTA is one action. Not 'See More' or 'Compare Options.' One button."* The card ships three. The footer adds two more (Previous, Refine). The mode toggle adds three more. The shipped surface offers roughly eight tappable choices on a screen whose product DNA is one.
- **Tap targets are 42px (`min-h-[42px]`).** Apple HIG mandates 44pt minimum; Material recommends 48dp. Every CTA in the hero card is sub-spec. Compounds with the deliberately-narrow "Not This" button — auto-width plus 42px height plus `px-3` puts its hit area well under 44×44pt.
- **No loading or disabled state on the primary CTA.** "Let's Go" fires `visitRef.current` synchronously; double-tap during a slow render is undefined behavior.
- **"Not This" reveals a hidden second step.** Tapping doesn't reject — it surfaces a 2×2 grid of reasons. Good for the model, hostile for the user. There is no escape hatch: the user must choose a reason or tap elsewhere to cancel. NN/g #3 (User Control & Freedom) is directly violated.

**Principles violated:** NN/g #1, #3, #4 · Apple HIG hit targets · Fitts's Law

---

### Visual Hierarchy — Score: 7.0 / 10

**What's working**

- Clean type ladder: `text-xs uppercase tracking-[0.18em]` eyebrow → `text-2xl font-semibold` headline → `text-xs` meta pills. The eye lands on the venue name first, which is correct.
- `rounded-3xl` (1.5rem) on the hero card vs `rounded-xl` (1rem) on buttons creates a genuine container/content distinction.
- `shadow-soft` (`0 10px 24px rgba(11,13,18,0.05)`) is calibrated — present enough to lift the card, light enough to not cartoon it.

**What's broken**

- **The "Live" pill competes with the headline.** It uses `emerald-500` with a colored dot in the top-left — a saturated chip at the start of the reading order. It should be quiet or right-aligned so the venue title wins the eye.
- **Two information pills with identical visual treatment.** Time and going-count both render as `rounded-full border border-line bg-white/70 px-3 py-1 text-xs`. Temporal urgency and social proof are presented as peers. They are not peers.
- **No visual weight on rationale because there is no rationale.** The mid-section between meta pills and CTAs is empty whitespace. A user's eye trains on emptiness as "nothing to see," materially reducing perceived intelligence.
- **The mode badge in the header duplicates state already shown in the bottom toggle.** Two indicators of the same value, neither linked to each other.

**Principles violated:** Material 3 emphasis hierarchy · NN/g #8 (Aesthetic & minimalist design — inverted: minimal to the point of being uninformative)

---

### Cognitive Load & Simplicity — Score: 7.5 / 10

**What's working**

- Returning one option instead of a list is the single biggest cognitive-load win available to a recommendations product, and HADE actually does it. This earns a base score of 7 by itself.
- Pivot reasons constrained to four (Too crowded / Wrong vibe / Too far / Overpriced) caps the rejection vocabulary — exactly the Iyengar/Schwartz paradox-of-choice remedy.
- The 400ms "Reframing…" → mode-specific message gives the brain a brief settling moment between contexts.

**What's broken**

- **Four pivot reasons are too few.** Missing the most common real-world rejection: "Been there / want something new." Without it, the engine learns nothing about novelty preference.
- **Mode toggle is visible during every pivot decision.** It whispers "or you could change category entirely" while the user is already mid-deciding. Vohs et al.: visible alternative categories drain executive function more than visible alternative items.
- **No commitment moment after "Let's Go."** No haptic, no breath, no confirmation. Ariely's decision-commitment research shows confirmation rituals materially increase follow-through rates.

**Principles violated:** Hick's Law · Choice architecture (Thaler/Sunstein) · Behavioral commitment theory

---

### Mobile UX Compliance — Score: 6.0 / 10

**What's working**

- Safe-area handling is correctly implemented (`viewportFit: "cover"` in layout, `.pb-safe-floor` using `env(safe-area-inset-bottom)`).
- `100dvh` used in `LoadingState.tsx` — correct dynamic-viewport sizing for iOS Safari URL bar collapse.
- Bottom-of-screen action bar respects thumb zone.

**What's broken**

- **Sub-44pt tap targets across the board.** `min-h-[42px]` on hero card buttons; `py-1.5` (approximately 30px) on ModeToggle items with no `min-h`. The mode toggle controls the largest contextual switch in the product and is borderline missable.
- **No haptics anywhere.** `navigator.vibrate` is absent; no Capacitor bridge; no iOS PWA workaround. Apple HIG explicitly recommends `UIImpactFeedbackGenerator` for committal actions. For a product whose value proposition is "decisive," a silent commit is a missed sensory cue.
- **Drag-to-dismiss only on RefineSheet.** Inconsistent gesture grammar — either commit to "everything dismissible by drag" or "nothing is." Mixing the two reads as a bug.
- **No manual re-decide gesture from the card.** Users who simply want a different option must use "Not This" → reason grid (2 taps plus a forced lie about why).
- **Hover styles on a mobile-only surface.** `hover:bg-blue-700` is wasted bytes and a tell that this began as desktop-first thinking.

**Principles violated:** Apple HIG (≥44pt, haptic feedback for committal actions) · Material (≥48dp) · Gestural consistency

---

### AI Trust & Explainability — Score: 4.0 / 10

This is the weakest category and the one where HADE's identity lives or dies.

**What's working**

- The data model in `src/types/hade.ts` is built for trust: `rationale`, `why_now`, `confidence`, `situation_summary`, `is_fallback`. The contract is excellent.
- `SignalBadge` and `ContextSignalBadge` are well-designed components — color-coded by signal type, optional pulse animation, optional strength percentage.
- The UGC verification flow ("Was it there?" 15 minutes after "Let's Go") is genuinely sophisticated — closed-loop reality grounding that almost no competitor has.
- Confidence is never shown as a number. This is correct. Google PAIR Guidebook: avoid surfacing raw model probabilities because users misread 0.62 as much worse than 0.78 when both are functionally "decent."

**What's broken**

- **The hero card doesn't render rationale or why_now.** This is the audit's headline finding. Between the venue title and the CTA grid in `HeroDecisionCard.tsx` there is only `timeLabel` and `goingCount`. The model's prose reasoning is computed, returned by the API, used in `GuidedDemoSection`, and never shown in production. The user is asked to commit to a venue with no stated why.
- **No signal badges on the hero card.** The `SignalBadge` component exists, `UX-UI-LOGIC.md` prescribes confidence-tiered rendering, the data is on the decision object — and the card renders none of it.
- **No visible model identity.** Users cannot tell if they are seeing a curated editorial pick, a popular venue, a friend signal, or an AI inference. Google PAIR §1.2: "Calibrate user expectations of AI capability through clear cues about what the system is doing."
- **No `is_fallback` surfacing.** When the engine degrades to a fallback path, the user is not told. They will treat fallback decisions with the same trust as primary ones and lose trust in both tiers when fallbacks miss.
- **Pivot history is invisible.** `rejectionHistory` is tracked in state but never reflected back to the user. After four or five rejections, users will feel the engine is randomly cycling rather than learning.
- **"Live" badge is unexplained.** Live what? Currently open? Real-time signal? Without clarification, users invent their own meaning — and most of those meanings will be wrong.

**Why it matters**

A "decision engine" whose interface gives less reasoning than Google Maps gives for a restaurant card is not a decision engine — it is a recommendation widget with extra branding. The infrastructure is built. The render is not.

**Principles violated:** Google PAIR §3 (Explain for understanding, not justification) · §1.2 (Set expectations) · NN/g #1 (Visibility of system status) · HADE's own Radical Trust principle

---

### Mode Switching UX — Score: 5.5 / 10

**What's working**

- Segmented control pattern is Apple-native and immediately legible.
- 400ms intermediate "Reframing…" message prevents flicker and sets expectation before the backend call fires.
- Mode-specific loading copy reinforces the "thinking" metaphor in a controlled way.

**What's broken**

- **Label inconsistency between surfaces.** `ModeToggle.tsx` uses `Dining / Social / Travel`. The badge in `HeroDecisionCard.tsx` renders the same modes as `Eat Easy / Something Happening / Explore`. Users see "Social ⚡" in the toggle and "⚡ Something Happening" in the card and will not reliably understand they refer to the same state. NN/g #4 — direct violation.
- **Modes render as parallel options, but the product treats mode as user-state.** The toggle UI suggests "pick one" like tabs; the data model treats mode as an inferred intent like a verb. If mode is intent, the toggle should feel like a "correct me" affordance ("I'm actually trying to ___") rather than a category switcher.
- **Active state contrast is weak on glance.** Active = `bg-ink text-white`, inactive = `text-ink/50`, on a `border-line/40 bg-white/50` container. The active item should radiate, not just darken.
- **No visual differentiation between modes beyond emoji and label.** Dining vs Social vs Travel decisions could feel materially different. The hero card is identical across all three. The product says the modes are different; the UI says they're the same template with different content.
- **Mode is sticky across sessions with no acknowledgment.** If the user picked Travel three days ago, they reopen into Travel mode with no indication this is a remembered state.

**Principles violated:** NN/g #4 (Consistency & standards) · NN/g #6 (Recognition rather than recall)

---

### Interaction Feedback — Score: 6.5 / 10

**What's working**

- Card transition animation is well-tuned: 240ms easeOut, ±32px horizontal, directional reversal for Previous. Fast enough not to obstruct, slow enough to register as state change.
- Refine sheet uses spring physics (`damping: 32, stiffness: 320`) — feels native iOS, not webby.
- Loading dots animation (3-dot opacity pulse, 2s cycle, "Understanding your context…") is patient and non-anxious compared to spinning wheels.
- Error copy is human-voiced: "Something got in the way." Not "Error 500."

**What's broken**

- **No optimistic UI on "Let's Go."** The button responds only via `active:bg-blue-800`. No "Got it" microstate, no transition to confirmation, no haptic. The most committal action in the product gets less feedback than rejection (which at least animates a card slide).
- **Pivot-reasons grid appears instantly.** After smooth 240ms transitions everywhere else, the raw pop-in reads as a rendering glitch.
- **No undo after rejection.** The card has slid out, the engine has consumed the signal, `rejectionHistory` is updated — and the only way back is the secondary Previous button in the footer. NN/g #3 explicitly requires "Undo and redo."
- **No skeleton on the hero card during pivot loads.** The card disappears entirely and LoadingState replaces it. Modal context is lost; the user must re-orient when the new card lands.
- **Pulse animation overload risk.** `SignalBadge` has `animated`, `AdaptiveButton` has `urgency="high"` pulse rings, and the Live badge has a colored dot. `UX-UI-LOGIC.md` acknowledges this risk: *"Overusing it degrades trust."* But no enforcement exists.

**Principles violated:** NN/g #1 (Visibility of system status) · NN/g #3 (User control & freedom)

---

### Top 5 UX Failures

1. **Rationale and why_now are not rendered on the production hero card.** Output is indistinguishable from a generic venue card. The product is called a decision engine; the surface does not behave like one.

2. **"Maybe" button has no functional handler.** A primary CTA does nothing. This is the single fastest way to teach a user the system is broken.

3. **Mode label inconsistency** between the toggle (Dining/Social/Travel) and the card badge (Eat Easy/Something Happening/Explore). Same state, two names, on the same screen.

4. **Tap targets at 42px** on every CTA in the hero card — two points under the Apple HIG minimum floor.

5. **No undo, no commit ritual.** The two most consequential actions in the product — rejection and commitment — have the weakest feedback loops. Rejection is one tap from irrevocable; commitment lands in silence.

---

### UX Maturity Scorecard

| Category | Score |
|---|---|
| CTA & Interaction | 5.5 |
| Visual Hierarchy | 7.0 |
| Cognitive Load & Simplicity | 7.5 |
| Mobile UX Compliance | 6.0 |
| AI Trust & Explainability | 4.0 |
| Mode Switching UX | 5.5 |
| Interaction Feedback | 6.5 |
| **Weighted Overall** | **6.2 / 10** |

---

## UX Improvement Plan

All recommendations reference the actual production files and existing design tokens. An engineer can open each file and act directly.

---

### 1. Ideal CTA Architecture

**Rule:** one primary, one quiet alternative, one destructive escape. Three actions, one visual rank.

| Tier | Action | Label | Visual Treatment | Placement |
|---|---|---|---|---|
| Primary | Commit | `Take me there` | `bg-accent text-white shadow-glowBlue`, `min-h-[52px]`, full-width | Bottom of card, full-width |
| Secondary | Defer (real behavior) | `Save for later` | Ghost: `border-line bg-surface text-ink`, `min-h-[44px]` | Below primary, half-width left |
| Tertiary | Reject | `Pass` | Text-only: `text-ink/55`, `min-h-[44px]` | Below primary, half-width right |

**Screen layout (mobile, thumb-zone aware)**

```
Header eyebrow + Live indicator + Mode chip
Venue title (28pt semibold)
Why-now line (15pt italic, one sentence)
Rationale (14pt regular, confidence-tiered)
Signal badges (horizontal row, max 3)
Time pill · Going pill
─────────────────────────────────────────
         TAKE ME THERE
  Save for later       Pass
```

**Removed from the card:** mode badge (already in the toggle), Refine and Previous (moved to overflow). The card surface holds three actions, not eight.

**Footer system bar (persistent, below card)**

```
[ ◀ ]    [ Eat | Out | Explore ]    [ ⋯ ]
```

Back-history, mode toggle, and overflow (Refine, Compare, Settings) live here. The card remains clean.

**Hierarchy enforcement:** the primary CTA holds the only shadow, the only fill color, and the only glow. Secondaries are stroke-only. The tertiary has no border. Visual rank is unambiguous at a glance.

---

### 2. Decision Card Redesign

**Target file:** `src/components/hade/mobile/HeroDecisionCard.tsx`

**Element hierarchy (top to bottom, 8pt vertical grid)**

- **Eyebrow row** — `text-[11px] uppercase tracking-[0.18em] text-ink/40` — "YOUR MOVE" · Live dot (no label) · Mode chip right-aligned
- **Venue title** — `text-[28px] font-semibold leading-[1.15]`
- **Why-now line** — `text-[15px] italic text-ink/75` — one sentence, 80 characters maximum
- **Rationale** — `text-[14px] text-ink/65` — confidence-tiered, see table below
- **Signal badges** — horizontal scroll-clip row, maximum 3 visible
- **Meta strip** — single line, tabular numerals: "8 min walk · 23 going · until 11pm"
- **CTA stack** — per Section 1

**Content by confidence tier**

The user never sees the confidence number. They see its effect.

| Confidence | Why-now | Rationale | Badges | CTA copy |
|---|---|---|---|---|
| ≥ 0.75 | Shown, italic | Hidden | Hidden | `Take me there` |
| 0.50–0.74 | Shown | Shown, full | Top 1–2 dominant signals | `Head there` |
| < 0.50 | Shown | Shown with caveat line | All active, max 3 | `Worth a look` |
| `is_fallback: true` | Replaced: *"Best I've got — signal is thin right now."* | Hidden | Hidden | `Try this` (neutral color, no glow) |

**Microcopy fixes**

| Current | Replacement | Reason |
|---|---|---|
| `Let's Go` | `Take me there` | Directional, matches intent |
| `Maybe` | `Save for later` | Functional, not a hedge |
| `Not This` | `Pass` | One syllable, less accusatory |
| `Live` | `Open now` | Concrete, no invented meanings |
| `23 people going` | `23 going tonight` | Time-anchored, tighter |
| Error: `Something got in the way.` | Keep | Human, on-brand |
| Loading: `Understanding your context…` | Keep for cold-start; `Thinking…` for pivots | Shorter on the warm path |

**Visual adjustments**

- Card padding: `p-6` → `p-7` to give rationale room to breathe
- Title size: `text-2xl` → `text-[28px]` for one-glance reading at arm's length
- Card background on `is_fallback`: switch to `bg-background` — subtle desaturation cues honesty without an explicit warning label

---

### 3. Mode Toggle UX Redesign

**Target file:** `src/components/hade/mobile/ModeToggle.tsx`

**Unified vocabulary — one source, used everywhere**

The current inconsistency (toggle says "Dining," card says "Eat Easy") is resolved by deleting both `MODE_LABEL` in `HeroDecisionCard.tsx` and `MODES` in `ModeToggle.tsx`, replacing them with a single exported `MODE_META` constant in `src/lib/hade/modes.ts`.

| ID | Toggle label | Card badge | Loading copy |
|---|---|---|---|
| `dining` | `Eat` | `🍽 Eat` | `Finding somewhere good to eat…` |
| `social` | `Out` | `⚡ Out` | `Looking for something happening…` |
| `travel` | `Explore` | `🌍 Explore` | `Seeing what's nearby…` |

Two-character labels remove translation drift, stay readable at any viewport, and match the verb-as-intent product model.

**Interaction model**

- Tapping a mode corrects the engine's inferred intent. Frame it as: "I'm actually trying to ___" rather than a category switch.
- 400ms `Reframing…` delay: keep, it is good.
- Tap targets: `min-h-[44px]`, `px-4` minimum.
- Active state: `bg-ink text-white shadow-soft` + subtle `ring-1 ring-accent/20` so the selected mode radiates rather than merely darkens.
- Transition: 240ms `easeOut` background morph, `whileTap={{ scale: 0.97 }}` settling to `scale: 1.02` for 240ms then returning.

**Visual temperature per mode**

The card body stays neutral. Only the primary CTA glow and the active mode chip shift hue. One signal color per screen at a time.

| Mode | CTA glow | Chip accent |
|---|---|---|
| Eat | `shadow-glow` (amber) | `bg-amber-500/10 text-amber-700` |
| Out | `shadow-glowBlue` | `bg-blue-500/10 text-blue-700` |
| Explore | `shadow-glowGreen` | `bg-emerald-500/10 text-emerald-700` |

---

### 4. Micro-Interaction System

**Loading states**

| Context | Animation | Copy |
|---|---|---|
| Cold-start | 3-dot opacity pulse (existing) | `Understanding your context…` |
| Pivot | Card slides out, mode-tinted skeleton slides in | `Thinking…` |
| Mode change | Existing 400ms delay | `Reframing…` → mode-specific copy |
| UGC verification | Sheet rises (existing) | `Was it there?` |

**New: pivot skeleton.** Replace the blank LoadingState with a `bg-ink/5 rounded-3xl` card-shaped placeholder containing the eyebrow row and two shimmer bars where the title and rationale were. Preserves modal context; user doesn't lose sense of where they are.

**Transition specs**

| Action | Motion | Timing |
|---|---|---|
| Pivot in | Slide from right, fade | 240ms easeOut, +32px x |
| Previous | Slide from left | Mirrored |
| Pass → reason grid reveal | Fade + rise | 180ms easeOut, +12px y → 0 |
| Reason selected | Reasons fade, skeleton fades in | 120ms |
| Take me there | Button → `bg-emerald-600 shadow-glowGreen`, label morphs to `Heading there →`, `navigator.vibrate(15)`, hold 600ms, then navigate | Commit ritual pattern |
| Save for later | Button bounces (`scale 1 → 1.05 → 1`, 240ms), footer saved-count increments with +1 fly-up | Confirms behavior without leaving the card |
| Pass | Card slides out, undo toast appears at top | 3-second window |

**Rejection feedback — structural fix**

The current 2×2 grid gets one addition and one always-available escape:

```
Too crowded       Wrong vibe
Too far           Been there      ← new: teaches novelty preference
         Skip — just not it       ← always present, no forced reason
```

"Skip — just not it" records a generic negative without forcing the user to lie about why. Solves the NN/g #3 escape-hatch violation.

**Undo toast (3-second window)**

```
Bringing back Lucia's.    Undo
```

Top of viewport, `bg-ink text-white rounded-full`, dismisses on swipe-up or timeout. Eliminates the irrevocable-tap class of regret.

**After 4 consecutive rejections** — insert a soft prompt above the next card:

> *"I'm passing on a lot — looking for something quieter? Calmer? Closer?"*

Buttons: [ Quieter ] [ Calmer ] [ Closer ] [ Keep going ]

This closes the "rejection history invisible" failure the audit identified.

---

### 5. Compare Modes UX Pattern

**Purpose:** A rare-use bypass for the moment a user thinks "What would you give me if I switched mode right now?" — without forcing them to actually switch and abandon the current decision.

**When it appears**

- Never automatically. Only via footer overflow `⋯` → `Compare modes`.
- The menu item is dimmed until the user has rejected ≥2 times in the current mode. Below that threshold there is no trigger to expose it.

**Mobile layout**

Bottom sheet, 85% viewport height, drag-to-dismiss (consistent with RefineSheet grammar).

```
────── drag handle ──────

What if I tried…?

EAT  ── current ──
  Lucia's Wine Bar
  Quiet at this hour, your kind of warm room.

OUT
  The Standard Rooftop
  20-min walk, late kitchen, decent crowd.
  → Switch to Out

EXPLORE
  Mile End to Outremont walk
  60 min, golden hour starting in 12.
  → Switch to Explore

      Back to current decision
```

**Interaction design**

- Three mini preview cards: title + why-now only. No CTAs except "Switch to X."
- Tapping "Switch to X" closes the sheet, fires the mode change, and animates in the full hero card for that mode.
- "Back to current decision" never alters mode state.
- Comparison fetches happen in parallel when the sheet opens, not preloaded — avoids burning API calls on every render.

**Why this works**

Users get a peek without commitment. This kills the FOMO that would otherwise drive carousel demand. The main screen stays one decision; the alternative is a deliberate side-trip, not the default. The product's single-decision philosophy is preserved.

---

### 6. Guided Demo Experience

**Goal:** A first-time user understands "this is a decision engine, not a search box" in under 15 seconds.

**Target file:** existing `GuidedDemoSection` — restructure, do not rebuild.

**Concept: "Try this"**

A 3-step guided run on a synthetic context. No location permission required. No auth required.

**Step 1 — Context injection**

> "Imagine: it's 7pm, you just got off work, a friend wants to grab food."

Button: `Run HADE on this`  
Secondary: `Try a different scenario ▾`

**Step 2 — Decision lands**

A full hero card animates in with rationale, why-now, and signal badges fully visible. The card is fully interactive.

**Step 3 — User taps Pass**

Reason chips appear. User selects one. New decision arrives. This demonstrates the pivot loop in two taps and proves the engine is responsive.

**Exit:** `Try with my real context` → routes to live mode.

**Button structure**

| Step | Primary | Secondary |
|---|---|---|
| 1 | `Run HADE on this` | `Try a different scenario ▾` |
| 2 | Live card CTAs (fully functional) | `Skip the tutorial` |
| 3 | `Try with my real context` | `Restart demo` |

**Three preset scenarios**

- Friday 7pm, hungry, friend with you — dining baseline
- Sunday 3pm, restless, alone — social and exploratory edge case
- Tuesday 11pm, in a new city — travel with low-confidence path

Each scenario sends a hardcoded `UserSignal` payload to the live `/decide` endpoint. No special demo fork. No fake data. The user sees the real engine produce a real decision against a known context. This is the trust-building move: "the thing you just used works on synthetic data exactly like it will work on yours."

**What the demo card exposes**

The demo is the showcase. Lean into explainability here regardless of confidence tier:

- `rationale` and `why_now` always visible
- One `SignalBadge` always visible and animated
- A small "How HADE decided" link that expands a three-line breakdown

Once the production card adopts these patterns, demo and production converge — and the demo stops being a different product.

---

### 7. Trust Layer Enhancements

**Five rules for making the engine feel intentional rather than random**

**1. Always state a why.** Every decision card shows at minimum a `why_now` line. Empty rationale means no card — the engine degrades to fallback before shipping a wordless suggestion.

**2. Reference observable context.** `why_now` must mention something the user can verify: time of day, walking distance, weather, who is there. Generic praise like "popular spot" is prohibited by prompt design. Verifiable references compound trust with each repeated use.

**3. Speak in first-person engine voice.** "I picked this because…" / "I'm passing on a lot — looking for quieter?" A consistent narrator reads as intentional. Variable voice reads as random.

**4. Show that learning happened.** After rejections, the next card's `why_now` references the feedback: "Quieter than the last few — sit-down, no line." Even when surface-stitched, this demonstrates responsiveness.

**5. Admit fallback honestly.** When `is_fallback === true`, swap copy to "Best I've got — signal is thin right now." Losing one decision earns long-term trust.

**Minimal explanation pattern — three layers**

Users access depth only if they want it. Nothing forces them deeper.

- **Layer 1 (always):** `why_now` line on the card
- **Layer 2 (for low/mid confidence):** Signal badge row below rationale
- **Layer 3 (on demand):** "How HADE decided" expands to a three-line breakdown: what you told me · what I noticed · why this beat the alternatives

No drill-downs deeper than Layer 3. No model reasoning chain. Trust is not transparency into internals — trust is legible stated cause.

**Confidence signaling — never a number, always a feeling**

| Confidence | CTA copy | Glow | Tone |
|---|---|---|---|
| High (≥ 0.75) | `Take me there` | Full `shadow-glowBlue` | Declarative |
| Mid (0.50–0.74) | `Head there` | Half-opacity glow | Conversational |
| Low (< 0.50) | `Worth a look` | No glow | Suggestive |
| Fallback | `Try this` | None, `bg-background` | Honest |

The user reads confidence in three half-second cues: how loud the button looks, how strong the glow is, how the verb feels.

**One-pulse rule — enforces against motion overload**

At any given render, at most one element on screen is animated. Priority order:

1. Primary CTA pulse-ring when `urgency: high`
2. Live indicator dot
3. Animated `SignalBadge`

Implement as a `<MotionBudget>` context that grants one animation slot and pre-empts lower-priority items. Excess animations render in their static state. This solves the "anxious screen" failure mode without policing individual component authors.

---

## Final Recommendations

### P0 — Ship before any growth push

These four changes remove the product's most critical trust and usability failures. Combined they require roughly two engineering days.

- **Render `rationale` and `why_now` in `HeroDecisionCard.tsx`.** Slot between meta pills and CTA grid, tiered by confidence. This single change is the difference between a recommendation and a decision.
- **Wire `handleMaybe` to a real behavior.** Save-for-later list, 2-hour defer, or soft-positive signal bias. Pick one. Do not ship a dead primary CTA another release.
- **Unify mode labels into one `MODE_META` source.** Delete the duplicate `MODE_LABEL` and `MODES` objects. One vocabulary, one file.
- **Bump all tap targets to `min-h-[44px]` minimum.** Single-line change on every affected button. Large dividend for minimal effort.

### P1 — Within one sprint

- Add a 3-second undo toast after every rejection
- Add a commit microstate to "Take me there" (600ms confirmation + `navigator.vibrate(15)`)
- Surface `is_fallback` with honest copy and desaturated card background
- Add "Been there" and "Skip — just not it" to the pivot reason grid
- Animate the pivot-reasons grid appearance (180ms fade+rise)

### P2 — Strategic, next quarter

- Render `SignalBadge` rows on the hero card per the confidence tier matrix in `UX-UI-LOGIC.md`
- Reflect rejection history back after N rejections: "I'm passing on a lot…"
- Differentiate visual temperature per mode using existing glow tokens
- Implement `<MotionBudget>` one-pulse context
- Rebuild Compare Modes sheet to the spec in Section 5
- Align demo and production card rendering so the demo stops being a different product

### The gap in one sentence

The product has an unusually clear philosophical foundation and an unusually strong data contract. The gap is entirely in render: the engine knows why it made a decision and is not telling the user. Closing that gap — which is one component file and a handful of conditional renders — transforms the perceived product category from recommendation widget to decision engine.

---

*HADE UX/UI Audit & Design Strategy — May 2026*  
*Prepared against production codebase at `src/components/hade/mobile/`*

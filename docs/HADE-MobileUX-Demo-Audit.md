# HADE Mobile Demo UX Audit

**Scope:** `/demo` page on mobile, all primary surfaces. Read-only.
**Audit date:** 2026-05-22
**Auditor:** Senior Mobile UX Systems Designer

---

## Quick Answers to Audit Questions

1. **What is the first thing a user understands on load?** A 3-dot pulsing animation with the copy "Understanding your context…" ([LoadingState.tsx](src/components/hade/mobile/LoadingState.tsx)). They don't know what HADE *does* — they wait. No tagline, no example, no permission preface.
2. **Action-oriented or place-oriented?** **Place-oriented.** Title = venue name. Header chip = "Your move" or "Community". No verb anywhere on the card. CTA = "Navigate" — a transport instruction, not an action commitment.
3. **Is the primary CTA correct?** **No.** "Navigate" ([DecisionScreen.tsx:1056](src/components/hade/mobile/DecisionScreen.tsx)) is a Maps verb, not a HADE verb. It hands the user off to a maps app, surrendering the moment. A canonical [PrimaryAction.tsx](src/components/hade/mobile/PrimaryAction.tsx) component exports `"Take me there"` but is **unused** in the mobile path — two CTAs diverged, neither commits to action.
4. **Does the user know why this is recommended?** Partially. Support text (e.g., "Low-friction nearby food option for your current energy") explains the *frame*, not the *evidence*. "12 people going" and "Happening now" carry weight; the four LLM why-fields (`rationale`, `why_now`, `why_this`, `decision_frame`) are not all visible.
5. **Can the user quickly express time, energy, mood, or situation?** Only via voice ("Tell HADE what you want") or RefineSheet (which exposes **only intent + urgency** — no time, no energy, no group, no situation). Voice is well-designed but high-effort; RefineSheet is incomplete.
6. **Is the category/lens selector helping or distracting?** **Mildly distracting.** Lives between card and CTA. Each switch triggers a 1–2s `regenerate()` with no skeleton — feels sluggish. Six lenses is one or two too many for a hero surface; should be a sheet, not an inline row.
7. **Are fallback states honest and useful?** Honest (badges turn amber on `is_fallback`), but copy is vague: "Closest useful match while live context is limited." User can't tell what's missing or what to do.
8. **Are loading states too slow or vague?** **Vague.** "Understanding your context…" never updates. No skeleton card. No progress indicator. Refines and lens-switches have no visual continuity.
9. **Is there a visible path to spontaneous action?** Only via the catch-all "Tell HADE what you want." No quick chips for "I'm hungry now" / "Got 30 min" / "Surprise me." Spontaneity is hidden behind voice.
10. **Does the UX support one-handed mobile use?** Partially. Primary CTA and sheet primaries are in the thumb zone ✓. But overflow menu (`···`) sits top-right ✗, "View Other directions" requires shoulder reach, and lens row interrupts thumb travel.

---

## 1) UX Strengths

| # | Strength | Evidence |
|---|---|---|
| S1 | Primary CTA in thumb zone | Fixed bottom bar, `h-12 bg-blue-600` ([DecisionScreen.tsx:1056](src/components/hade/mobile/DecisionScreen.tsx)) |
| S2 | Single clear hero card | [HeroDecisionCard.tsx](src/components/hade/mobile/HeroDecisionCard.tsx) — no carousels, no comparison clutter |
| S3 | Voice input is discoverable + well-designed | [VoiceSheet.tsx](src/components/hade/mobile/VoiceSheet.tsx) — six states (idle/listening/transcript/processing/applied/error), parsed chips, edit affordance |
| S4 | Sheets have consistent affordances | Drag handle + backdrop tap + Cancel; users learn one pattern |
| S5 | Fallback honesty | `isFallback` flips lens chip to amber ([HeroDecisionCard.tsx:182](src/components/hade/mobile/HeroDecisionCard.tsx)) — visible warning, not hidden |
| S6 | Confetti + green confirmation on UGC creation | Tactile reward; reinforces "I made this" agency |
| S7 | Reframe-in-place pulse | When user rejects, card transforms (not navigates) — preserves context |
| S8 | Toast feedback for signals | "📡 Signal Enqueued (+0.2 influence)" — converts intangible signal into visible action |

---

## 2) UX Weaknesses

| # | Weakness | Evidence | Impact |
|---|---|---|---|
| W1 | Two CTA implementations | `PrimaryAction.tsx` exports "Take me there"; mobile uses hard-coded "Navigate" at [DecisionScreen.tsx:1056](src/components/hade/mobile/DecisionScreen.tsx) | Inconsistency; canonical component bypassed |
| W2 | "Navigate" surrenders the moment | `window.open(maps_url)` → user leaves HADE; no return clock, no commitment | Loss of journey ownership |
| W3 | Title is venue name, not action | Card reads "Powell's Books" — not "Go browse Powell's" | Place catalog framing |
| W4 | No verb anywhere on card | Header = "Your move" (passive); support = adjectival ("Low-friction…") | No call to *do* anything |
| W5 | RefineSheet is starved | Only `intent` + `urgency` ([RefineSheet.tsx:15–16](src/components/hade/mobile/RefineSheet.tsx)) — no time/energy/group/state | Inference relies entirely on voice/defaults |
| W6 | LoadingState is static and vague | "Understanding your context…" — never updates | User can't tell if it's progressing or stuck |
| W7 | No skeleton card during regenerate | Lens switch → full re-render via 3-dot animation | Each refinement feels like a fresh page load |
| W8 | Six lenses + three modes + presets compete for hero attention | Lens row inline; modes via overflow; presets desktop-only | Axis overload (7 concept axes, soon more) |
| W9 | Overflow menu top-right | `···` requires shoulder reach from thumb zone | Discoverability of Refine/Compare/Start Meetup is poor |
| W10 | CompareModesSheet is educational, not actionable | No CTA to switch modes from the comparison | Wastes a sheet slot; could be inline |
| W11 | OtherModesPanel.tsx exists but unused on mobile | Dead code path; same concept as CompareModesSheet | Confusion in component graph |
| W12 | "Not this" text link is low visual weight | `text-ink/35` (very faded) below big blue button | Rejection feels hidden; users don't know they can decline |
| W13 | No "I'm ready, what now?" affordance | Empty state on cold load = pure loading; no "tap to start" or example | First-time users don't know HADE is on |
| W14 | Pivot reasons grid blocks card | Expanding 2-column grid mid-screen displaces card visual | Card loses center of attention during refinement |
| W15 | Add-Vibe input mounted on hero card | Text input + Send button competes with primary CTA | Two CTAs visible simultaneously |

---

## 3) Main Friction Points

### F1 — The Cold-Start Gap (0–2s)
User sees 3 dots and a sentence. No example output. No "tap to skip wait." Most users in user-testing close apps that show indeterminate loaders >1.5s. This is the most expensive friction point because it happens before any value is delivered.

### F2 — The CTA Hand-Off Cliff
User taps "Navigate" → Apple/Google Maps opens → HADE is backgrounded → return clock has no answer → vibe collection 15 min later feels disconnected from the action. The single most important moment in the product (commitment + execution) has zero in-app UI.

### F3 — The Refine/Voice Asymmetry
RefineSheet collects 2 fields. VoiceSheet can extract 6+ fields. The product silently rewards voice users — but voice is a 4-tap, 2-second commitment for *each* refinement. Tap users get a worse product.

### F4 — Six Lenses Competing for Hero Space
Lens row between card and CTAs is permanent. User must learn that switching lenses regenerates the decision and waits 1–2s. The lens row is high signal/visibility for low-frequency action.

### F5 — The "Not This" Trap
Tapping it expands a 4-reason grid that *displaces the card down/up*. User loses the visual anchor of what they're rejecting. Reasons themselves ("Too crowded", "Wrong vibe", "Too far", "Overpriced") are 2D — no nuance.

### F6 — Compare Modes as Orphan Affordance
Hidden in overflow. Educational. No CTA to commit to a comparison. Users who find it don't know what to do with it.

### F7 — Add-Vibe-as-Card-Mount
Hero card has a text input inside it. Hits keyboard. Steals focus from "Navigate". Should be a sheet or footer module, not a card-internal input.

### F8 — No "Express Time" Path Without Voice
The single highest-value untapped signal — *"I have 30 minutes"* — has zero tap UI. Time-budget chips do not exist anywhere in the mobile flow.

---

## 4) Missing Interaction States

| # | State | Why It's Needed |
|---|---|---|
| MS1 | **First-run welcome** | Replaces 3-dot LoadingState with: "HADE finds your next move. One pick at a time." + example card preview + "Start" tap to skip |
| MS2 | **Skeleton decision card** | Renders during `regenerate()` — matches card height/layout, prevents layout shift |
| MS3 | **In-flight decision delta** | When refining, animate which fields are changing (subtle highlight on chips being recomputed) |
| MS4 | **Time-budget chip row** | Above hero card: `[15 min] [30 min] [1 hr] [Open]` — taps set `time_available_minutes` |
| MS5 | **Quick-state chips** | Above hero card: `[Hungry] [Tired] [With friends] [Surprise me]` — fast traveler-state input |
| MS6 | **Return clock during navigation** | Persistent floating widget after "Navigate" tap: "12 min there · be back by 4:50" |
| MS7 | **Decision diff badge** | After refine, "Updated for: 30 min" pill animates onto card |
| MS8 | **Empty-state actionable** | When no candidates: "Try widening your window" or "Tell HADE more about you" — never just spinner |
| MS9 | **Lens-switching skeleton** | Card greys + chips skeleton; new card slides in. No 3-dot drop. |
| MS10 | **Commitment sheet** | After tap of primary CTA, before maps open: shows ordered steps + duration + return path |
| MS11 | **Confidence-low state on card** | When confidence < 0.5: hero card explicitly says "Best guess — refine for sharper" with link to RefineSheet |
| MS12 | **Backgrounded re-entry** | When user returns from Maps app, surface VibeSheet immediately (don't wait 15 min) |

---

## 5) Copy Issues

### Tone Inconsistency

| Surface | Current | Issue |
|---|---|---|
| Header chip | "Your move" | Vague; doesn't say what move |
| CTA | "Navigate" | Verbs maps, not action |
| Support text | "Low-friction nearby food option for your current energy" | Describes the *option*, not what you'll *do* |
| Loading | "Understanding your context…" | Mystical; says nothing about progress |
| Fallback | "Closest useful match while live context is limited" | Apologetic, jargon-y ("live context") |
| Voice prompt | "Tell HADE what you want" | Anthropomorphizes app; better: "What are you in the mood for?" |
| Add Vibe | "+ Already here? Share the Vibe" | Two questions in one chip; ambiguous when to tap |
| Pivot reasons | "Too far", "Wrong vibe", "Overpriced", "Too crowded" | All negative; no positive redirects ("Closer", "Quieter", "Cheaper", "More energy") |

### Verb-Audit Failures

Every primary surface uses **descriptive** copy where **imperative** copy would commit the user to action.

| Replace | With |
|---|---|
| "Your move" | "Go now" / "Grab this" / "Try this" |
| "Powell's Books" (title) | "Browse Powell's Books" / "Coffee at Stumptown" |
| "Low-friction nearby food option…" | "5-min walk. Order at counter. Back in 20." |
| "Navigate" | "Start walking" / "Take me there" / verb varies by bucket |
| "Understanding your context…" | "Reading the room…" / "Finding your next move…" |
| "+ Already here? Share the Vibe" | "Made it. Tell HADE." (separate from card) |

### Missing Copy

- No "why now" tag on hero card (it's a HadeDecision field but unrendered as a chip)
- No "buffer" copy after time budget set ("12 min walk · 22 min there · 6 min back · 0 buffer")
- No "X people chose this in last hour" social-proof line
- No copy for when HADE *is wrong* — accountability copy ("This pick missed — tell us why")

---

## 6) CTA Hierarchy Issues

### Current Hierarchy (Mobile)

```
LEVEL 1: "Navigate" (blue, h-12, full-width, fixed bottom)         ← primary
LEVEL 2: "Not this" (text-only, text-ink/35)                       ← rejection (too faded)
LEVEL 3: "← Previous" + "···"                                      ← navigation/menu
LEVEL 4: "+ Add something" + "Tell HADE what you want"             ← entry points
LEVEL 5: "View Other directions"                                   ← lens switch
LEVEL 6: "+ Already here? Share the Vibe" (on card)                ← signal capture
LEVEL 7: Overflow → Refine, Compare Modes, Start Meetup            ← refinement
```

### Issues

1. **Levels 4–7 compete for screen real-estate above CTA.** Five distinct entry affordances visible at once.
2. **Level 2 is invisible.** `text-ink/35` is the lowest opacity in the system. Users don't know they can reject.
3. **Level 6 is mounted on the card.** Should be Level 5 or below, in its own sheet/footer.
4. **Levels 4 and 7 are split.** "+ Add something" is inline; "Start Meetup" is in overflow — same concept, two doors.
5. **No Level 1.5 commitment CTA.** Between "Navigate" and rejecting, there is no "Yes, but tell me how to do this" — i.e., no commitment sheet entry.
6. **"View Other directions" copies "View"** — but the action is *switch*, not *view*. Should be "Switch lens".

### Proposed Hierarchy (Mobile)

```
LEVEL 0: Time/state chip row (above card)                          ← context capture
LEVEL 1: Hero card with verb-led title                             ← decision
LEVEL 2: PRIMARY CTA — bucket-aware verb ("Go now", "Start loop")  ← commitment
LEVEL 3: "How does this work?" (small, opens CommitmentSheet)      ← deepen
LEVEL 4: "Not this" (border button, not text-only)                 ← rejection (visible)
LEVEL 5: "← Previous"                                              ← history
LEVEL 6: "···" overflow → Refine, Switch lens, Voice, Compare     ← consolidated
```

---

## 7) Proposed Mobile Card Hierarchy

Replace the current card structure with this top-to-bottom order:

```
┌──────────────────────────────────────────────────┐
│ STATE PILL (conditional, confidence ≥ 0.75)      │  ← e.g. "Sensing: 30 min window"
├──────────────────────────────────────────────────┤
│ HEADER CHIP — bucket/state-driven verb           │  ← "Quick break" / "Loop pick" / "Your move"
├──────────────────────────────────────────────────┤
│ TITLE — verb-led, not venue-led                  │  ← "Coffee at Stumptown" not "Stumptown"
│  subtitle: venue + neighborhood                  │  ← "Stumptown Coffee · Downtown"
├──────────────────────────────────────────────────┤
│ FITS-IN-WINDOW PROOF (when time set)             │  ← "4 min walk · 12 min there · 4 min back"
│  badge: "✓ Fits your 30 min" or "Over budget"    │
├──────────────────────────────────────────────────┤
│ COMMITMENT PREVIEW (when commitment present)     │  ← "Order at counter. Sit by the window."
│  inline 1-2 lines max; full sheet on tap         │
├──────────────────────────────────────────────────┤
│ WHY NOW + WHY THIS (single line)                 │  ← "Quiet now. 12 people just left."
│  ▾ tap to expand for full LLM reasoning          │
├──────────────────────────────────────────────────┤
│ META CHIPS (compact row)                         │  ← [● Live] [12 going] [Happening now]
└──────────────────────────────────────────────────┘
```

### Card Rules

- **No text input on the card.** Add-Vibe moves to a footer module or post-Navigate sheet.
- **No CTA on the card.** All actions live in the bottom bar.
- **Maximum 7 lines visible.** Beyond that, ▾ tap-to-expand.
- **Verb-led title.** Title text starts with an action verb whenever a bucket or state is known.

---

## 8) Proposed Sheet Hierarchy

### Tier 1 — Always one tap away (footer or chips)
- **WindowEntrySheet** (NEW) — time budget + dead-time context
- **RefineSheet** (extended) — intent, urgency, time, energy, state correction
- **VoiceSheet** (existing) — natural language all-in-one

### Tier 2 — Two taps (overflow)
- **CommitmentSheet** (NEW) — full step-by-step "how to do this"
- **Switch lens** (rename from CompareModes; make actionable, not educational)
- **Start Meetup** → ActivityCreationView

### Tier 3 — Contextual / post-action
- **VibeSheet** (existing, surface immediately on return from Maps, not after 15-min timer)
- **MicroAdventureSheet** (NEW) — multi-stop loop view, opens when `micro_adventure.stops.length ≥ 2`

### Tier 4 — Embedded affordances
- **PinSpotSheet** (existing, lives inside ActivityCreationView)
- **UgcVerificationSheet** (existing, currently dormant — surface after return from Maps)

### Sheet Pattern Rules

| Rule | Reason |
|---|---|
| Single sheet open at a time | Prevents nested-sheet z-index confusion |
| Drag handle + backdrop tap + explicit Close all work | Consistency = learnability |
| Primary action: full-width, bottom-anchored | Thumb-zone discipline |
| Tier 1 sheets always have "Skip & decide" footer | User can always opt out without committing |

---

## 9) Proposed State Chips / Quick Controls

### Row 1 — Above the card (when no context set)
A horizontally-scrollable chip row that captures the highest-value untapped signals:

```
[I have 15 min] [30 min] [1 hr] · [Hungry] [Tired] [With friends] · [Surprise me]
```

- Tap → sets corresponding `HadeContext` field (time_available_minutes, intent, social.group_type, openness=adventurous)
- Once set, row collapses into inline pill: `"30 min · Hungry · Tap to edit"`
- Visible on cold start AND after every decision until 3 chips have been used (then collapses by default)

### Row 2 — Reject reasons (positive, not negative)
Replace the current 4-cell negative grid with paired positive redirects:

| Current | Proposed |
|---|---|
| "Too crowded" | "Quieter" |
| "Too far" | "Closer" |
| "Overpriced" | "Cheaper" |
| "Wrong vibe" | "Different mood" |

Each redirect is a *positive intention* — sets the next decision's bias rather than blacklisting attributes.

### Row 3 — State pill (when inferred, confidence ≥ 0.75)
Above the card, single chip:

```
Sensing: low energy · tap to confirm
```

- Tap → opens RefineSheet third row pre-selected to current state
- One-tap dismiss; persists until next inference

### Row 4 — Quick-redo
On any card, a small icon chip in the meta row:

```
↻ Try again with same context     (or)     ⇄ Switch lens
```

---

## 10) Implementation Priority List

### P0 — Bleeding edges (this sprint, low risk, high impact)

- [ ] **P0.1** — Consolidate CTAs to canonical [PrimaryAction.tsx](src/components/hade/mobile/PrimaryAction.tsx); delete hard-coded "Navigate" at [DecisionScreen.tsx:1056](src/components/hade/mobile/DecisionScreen.tsx)
- [ ] **P0.2** — Replace LoadingState 3-dot animation with skeleton card matching real hero card layout ([LoadingState.tsx](src/components/hade/mobile/LoadingState.tsx), new SkeletonCard)
- [ ] **P0.3** — Bump "Not this" from `text-ink/35` to a border-button — actually visible ([DecisionScreen.tsx](src/components/hade/mobile/DecisionScreen.tsx))
- [ ] **P0.4** — Replace "Navigate" with verb-led label by bucket/state (when known); fallback to "Take me there" ([PrimaryAction.tsx](src/components/hade/mobile/PrimaryAction.tsx))
- [ ] **P0.5** — Remove the Add-Vibe text input from the hero card; move to dedicated VibeSheet auto-surfaced on app re-entry ([HeroDecisionCard.tsx](src/components/hade/mobile/HeroDecisionCard.tsx), [VibeSheet.tsx](src/components/hade/mobile/VibeSheet.tsx))
- [ ] **P0.6** — Add a verb to the header chip when bucket/state known ("Quick break" / "Loop pick" / "Recovering pick") ([HeroDecisionCard.tsx](src/components/hade/mobile/HeroDecisionCard.tsx))

---

### P1 — Context capture (next sprint, medium effort)

- [ ] **P1.1** — Time-budget chip row above hero card ([DecisionScreen.tsx](src/components/hade/mobile/DecisionScreen.tsx), new WindowEntryChips)
- [ ] **P1.2** — Extend RefineSheet with time/energy/state rows ([RefineSheet.tsx](src/components/hade/mobile/RefineSheet.tsx))
- [ ] **P1.3** — Positive pivot reasons instead of negative ([DecisionScreen.tsx](src/components/hade/mobile/DecisionScreen.tsx) pivot grid)
- [ ] **P1.4** — First-run welcome surface (replaces blank LoadingState on cold start; new WelcomeOverlay)
- [ ] **P1.5** — Skeleton card during `regenerate()` — no full LoadingState drop on refinement ([DecisionScreen.tsx](src/components/hade/mobile/DecisionScreen.tsx), [useHade.ts](src/lib/hade/useHade.ts))
- [ ] **P1.6** — Lens switcher: move from inline row to overflow sheet; rename "View Other directions" → "Switch lens" ([DecisionScreen.tsx](src/components/hade/mobile/DecisionScreen.tsx), [IndustryLensSheet.tsx](src/components/hade/mobile/IndustryLensSheet.tsx))

---

### P2 — Commitment layer (depends on Commitment Engine audit)

- [ ] **P2.1** — CommitmentSheet — inline preview on card + full sheet on tap of primary CTA (new CommitmentSheet.tsx, [HeroDecisionCard.tsx](src/components/hade/mobile/HeroDecisionCard.tsx))
- [ ] **P2.2** — "Fits your N min" badge on card when `time_available` is set ([HeroDecisionCard.tsx](src/components/hade/mobile/HeroDecisionCard.tsx))
- [ ] **P2.3** — Return clock: floating widget after Navigate tap (new ReturnClock.tsx)
- [ ] **P2.4** — VibeSheet auto-surface on app re-entry from Maps instead of 15-min timer ([DecisionScreen.tsx](src/components/hade/mobile/DecisionScreen.tsx))

---

### P3 — State awareness (depends on TravelerState Engine audit)

- [ ] **P3.1** — TravelerState pill on card (confidence ≥ 0.75) ([HeroDecisionCard.tsx](src/components/hade/mobile/HeroDecisionCard.tsx), [ContextSignalBadge.tsx](src/components/hade/adaptive/ContextSignalBadge.tsx))
- [ ] **P3.2** — State-correction third row in RefineSheet ([RefineSheet.tsx](src/components/hade/mobile/RefineSheet.tsx))
- [ ] **P3.3** — Quick-state chips: Hungry / Tired / With friends / Surprise me ([DecisionScreen.tsx](src/components/hade/mobile/DecisionScreen.tsx))

---

### P4 — Micro-adventure (depends on MicroAdventure Engine audit)

- [ ] **P4.1** — MicroAdventureSheet: stacked multi-stop view (new MicroAdventureSheet.tsx)
- [ ] **P4.2** — Inline "next stop in 6 min" hint on card during loop ([HeroDecisionCard.tsx](src/components/hade/mobile/HeroDecisionCard.tsx))

---

### P5 — Polish & system hygiene

- [ ] **P5.1** — Delete [OtherModesPanel.tsx](src/components/hade/mobile/OtherModesPanel.tsx) (dead code path — same concept as CompareModesSheet)
- [ ] **P5.2** — CompareModesSheet → actionable: tap a mode-card to switch ([CompareModesSheet.tsx](src/components/hade/mobile/CompareModesSheet.tsx))
- [ ] **P5.3** — Move `···` overflow menu from top-right to thumb-zone-adjacent position ([DecisionScreen.tsx](src/components/hade/mobile/DecisionScreen.tsx))
- [ ] **P5.4** — Full copy verb-audit pass across all mobile components
- [ ] **P5.5** — Confidence-low explicit state on hero card ([HeroDecisionCard.tsx](src/components/hade/mobile/HeroDecisionCard.tsx), [confidence.ts](src/lib/hade/confidence.ts))

---

## Before / After Visual Summary

### Current State

```
LoadingState (3 dots, "Understanding your context…")
   ↓
[Lens chip: 🍽 Food & Dining]           ← inline, always visible
   ↓
┌──────────────────────────────┐
│ Your move                    │  ← passive header chip
│ Powell's Books               │  ← venue name, no verb
│ Low-friction nearby food…    │  ← descriptive, not imperative
│ [12 going] [Happening now]   │
│ + Already here? Share Vibe ▢ │  ← text input ON card
└──────────────────────────────┘
[+ Add something]                       ← 4 affordances above CTA
[Tell HADE what you want]
[View Other directions]
   ↓
[← Previous]    [···]
[NAVIGATE]                              ← primary CTA (wrong verb)
[Not this]                              ← invisible (text-ink/35)
```

### Proposed State

```
WelcomeOverlay (first run) → SkeletonCard (returning)
   ↓
[15 min] [30 min] [1 hr] · [Hungry] [Tired] [Surprise me]   ← context chips
   ↓
┌──────────────────────────────┐
│ Sensing: low energy          │  ← state pill (conditional)
│ Quick break                  │  ← bucket/state header chip (verb)
│ Coffee at Stumptown          │  ← verb-led title
│ Stumptown Coffee · Downtown  │  ← venue + neighborhood
│ ✓ Fits your 30 min           │  ← window proof badge
│ 4 min walk · 12 there · 4 bk │
│ Order at counter.            │  ← commitment preview (1-2 lines)
│ Quiet now. 12 people there.  │  ← why-line (tap to expand)
│ [● Live] [12 going] [Now]    │  ← meta chips
└──────────────────────────────┘
   ↓
[GO NOW — 30 min]                       ← bucket-aware primary CTA
[Not this] (border button)  [Switch]    ← visible secondary
[← Previous]    [···]                   ← history / overflow
```

---

## Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Consolidating CTAs may surface latent bugs in PrimaryAction.tsx | Low | Test matrix per bucket; canary on demo path |
| Verb-led titles need backend coordination | Medium | Frontend can derive from intent + category as floor; LLM enriches |
| State chips compete with existing lens row for space | Medium | Collapse strategy: chips disappear after first 3 uses; lens row moves to overflow |
| Skeleton card requires schema stability | Low | Card already renders consistently across decision types |
| Removing Add-Vibe from card affects signal collection rate | Medium | Surface VibeSheet on app re-entry instead — likely *higher* completion rate |
| Positive pivot reasons require backend bias support | Medium | Frontend can map "Quieter" → `state.openness=comfort` locally; backend additions later |
| VibeSheet on re-entry may feel intrusive | Low | Respect ≥5 min since Navigate tap; one-tap dismiss; never block navigation |

---

## Cross-Audit Dependencies

This UX audit drives surface changes that depend on three backend audits:

| UX Priority | Depends On |
|---|---|
| P2 — Commitment layer | [HADE-Commitment-Engine-Audit.md](docs/HADE-Commitment-Engine-Audit.md) — `CommitmentSheet.tsx`, `fits_in_window` field |
| P3 — State awareness | [HADE-TravelerState-Engine-Audit.md](docs/HADE-TravelerState-Engine-Audit.md) — `inferTravelerState()`, state pills |
| P4 — Micro-adventure | [HADE-MicroAdventure-DeadTime-Engine-Audit.md](../HADE-MicroAdventure-DeadTime-Engine-Audit.md) — `MicroAdventureSheet.tsx`, `fits_in_window` |
| P0–P1 — Copy + chips | Standalone — no backend dependency |

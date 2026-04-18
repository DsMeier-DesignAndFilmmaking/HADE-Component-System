# HADE One-Screen Mobile Architecture

```text
Passive Context Inputs
  |- LocationManager
  |- MotionManager
  |- TimeContextProvider
            |
            v
     ContextInterpreter
            |
            v
   HadeHeadlessClientProtocol
   (native bridge mirroring useHade)
            |
            v
       HadeViewModel
  - owns HadeState
  - soft updates only
  - keeps last ready decision visible
            |
            v
        DecisionView
  |- DecisionCard
  |- ReasoningList
  |- PrimaryCTAButton
  |- RefineBottomSheet
```

Loop:

`context -> interpret -> decide -> explain -> update UI`

Lifecycle:

1. App launches into `DecisionView` immediately.
2. Placeholder renders in under 2 seconds with `Understanding your context...`.
3. `HadeViewModel` subscribes to passive context streams.
4. First meaningful context snapshot triggers a decision request.
5. Returned decision hydrates the single-screen UI.
6. Later context deltas trigger soft refreshes with no full-screen reset.

Constraint checks:

- One screen only: enforced by a single `WindowGroup` root and no navigation containers.
- One primary CTA: `PrimaryCTAButton` is the only filled action.
- No feeds/lists/search/filters: UI uses a fixed `VStack` with max three reasoning bullets.
- No scrolling: layout is built to fit within one viewport using `GeometryReader` and bounded spacing.
- One decision at a time: `HadeState` stores a single optional `Decision`.

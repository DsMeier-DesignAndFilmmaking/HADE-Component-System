# HADE One-Screen App Scaffold

Standalone SwiftUI scaffold for a production-oriented HADE mobile app built around one rule: render one decision immediately and keep the entire experience on a single screen.

## Included

- `DecisionView`: single-screen root, no navigation containers
- `DecisionCard`: title + distance + ETA
- `ReasoningList`: max three short lines
- `PrimaryCTAButton`: only primary action in the interface
- `RefineBottomSheet`: bottom sheet constrained to 55-68% height
- `HadeViewModel`: native state owner with soft update behavior
- `HadeHeadlessClient`: bridge protocol mirroring `useHade()` semantics
- Passive context managers for location, motion, and time

## Headless Integration Contract

This native bridge mirrors the web contract from `src/lib/hade/useHade.ts`:

```ts
useHade() => {
  decision,
  reasoning,
  status,
  regenerate(),
  refine()
}
```

In production, swap `HadeHeadlessClient` for a real bridge backed by:

- a shared Kotlin/Swift headless package, or
- an API client that calls the existing HADE decision endpoint, or
- a React Native / JSCore bridge if the TypeScript engine remains canonical.

## Validation

- No scrolling: the root view uses bounded spacing within a `GeometryReader`
- One primary CTA: `PrimaryCTAButton` only
- No feeds/lists/search/filters: fixed content only
- Zero onboarding: fallback location and passive context allow immediate use
- Value within ~2 seconds: loading card appears immediately; forced fallback request starts at 1.8s if context is still incomplete

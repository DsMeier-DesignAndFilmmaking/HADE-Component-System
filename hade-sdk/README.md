# HADE SDK

HADE is an opinionated SDK for one job: deliver one context-aware decision with a single immediate action.

It is intentionally not a search SDK, recommendation feed, or browsing framework.

## Architecture Diagram

```text
External App
  |
  v
createHade(config?)
  |
  +-- core/
  |    |- defaults.ts       -> fallback geo, time context, no-setup boot
  |    |- createHade.ts     -> getDecision / regenerate / refine
  |    |- normalize.ts      -> one decision contract only
  |
  +-- react/
  |    |- useHade.ts        -> auto-load binding for React apps
  |
  +-- ui/
  |    |- SingleScreenFrame -> no-scroll shell
  |    |- DecisionCard      -> one decision presentation
  |    |- ReasoningList     -> max 3 reasons
  |    |- PrimaryCTA        -> fixed "Go" action
  |
  +-- swift/
  |    |- HadeSDK.swift     -> native wrapper pattern
  |
  +-- android/
       |- HadeSDK.kt        -> native wrapper pattern
```

## Package Structure

```text
/hade-sdk
  /core
  /react
  /swift
  /android
  /ui
```

## Quick Start

1. Install `hade-sdk`.
2. Initialize with defaults: `const hade = createHade()`.
3. Call `await hade.getDecision()`.
4. Render `decision`, `reasoning`, and one `Go` action.
5. Optionally call `regenerate()` or `refine()` on lifecycle changes.

## Core API

```ts
import { createHade } from "hade-sdk/core";

const hade = createHade();
const result = await hade.getDecision();
```

Response shape is always:

```ts
{
  status: "loading" | "ready",
  decision: {
    title: string,
    distance: string,
    eta?: string
  } | null,
  reasoning: string[],
  confidence: number
}
```

## Web Integration

```tsx
import { useHade } from "hade-sdk/react";
import { DecisionCard, PrimaryCTA, ReasoningList, SingleScreenFrame } from "hade-sdk/ui";

export function HadeDecisionScreen() {
  const { decision, reasoning, status, regenerate } = useHade();

  return (
    <SingleScreenFrame>
      <DecisionCard response={{ status, decision, reasoning, confidence: 0.82 }} />
      <ReasoningList response={{ status, decision, reasoning, confidence: 0.82 }} />
      <div>
        <PrimaryCTA onGo={() => console.log("Go", decision?.title)} />
        <button type="button" onClick={() => void regenerate()}>Refine</button>
      </div>
    </SingleScreenFrame>
  );
}
```

## iOS SwiftUI Integration

```swift
import SwiftUI

@MainActor
final class HadeViewModel: ObservableObject {
    @Published var response = HadeDecisionResponse(status: "loading", decision: nil, reasoning: [], confidence: 0)
    private let hade = HadeSDK(baseURL: URL(string: "https://example.com/api")!)

    func load() {
        Task {
            response = try await hade.getDecision()
        }
    }
}
```

```swift
struct DecisionView: View {
    @StateObject private var model = HadeViewModel()

    var body: some View {
        VStack(spacing: 16) {
            Text(model.response.decision?.title ?? "Understanding your context...")
            Text(model.response.decision?.distance ?? "Locating...")
            ForEach(Array(model.response.reasoning.prefix(3)), id: \.self) { item in
                Text(item)
            }
            Button("Go") {}
        }
        .task { model.load() }
    }
}
```

## Misuse Prevention Strategy

- `createHade()` exposes no query parameter and no search method.
- `HadeSDKResponse` contains one `decision` field only, never an array.
- `getAlternative()` returns one replacement decision, not ranked results.
- `DecisionCard` accepts a single `response` object, not collections.
- `ReasoningList` truncates to three short lines.
- `PrimaryCTA` always renders one fixed primary action: `Go`.
- `SingleScreenFrame` locks the shell to viewport height and `overflow: hidden`.
- `SingleScreenFrame` runtime-guards against multiple `DecisionCard`, `ReasoningList`, or `PrimaryCTA` instances.
- No list, feed, grid, or comparison components are exported.

## Validation

- Integrate in under one day: yes, default config works without setup screens.
- Only one decision returned: yes, enforced in types and normalization.
- Feed creation by default: no, no arrays or list primitives are exposed.
- Default config works immediately: yes, geo and time have sensible fallbacks.

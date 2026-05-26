# @hade/testkit

Fixtures, scripted mock adapters, and deterministic clocks for code that consumes `@hade/core`. Framework-free — works with vitest, jest, uvu, or vanilla Node.

## Install

```bash
npm install -D @hade/testkit
# Optional: only if you want the vitest matcher sub-path
npm install -D vitest
```

## Fixtures

```ts
import {
  makeConfig,
  makeDecision,
  makeDecisionEngineOutput,
  makeVenueCandidate,
} from "@hade/testkit";

const cfg = makeConfig({ active_domain: "ecommerce" });
// → fully-resolved ResolvedHadeConfig (defaults filled in)

const decision = makeDecision({ confidence: 0.9, venue_name: "Joe's" });
const output = makeDecisionEngineOutput({ confidence: 0.9 });

const candidate = makeVenueCandidate({ name: "Joe's", category: "pizza" });
```

## Mock adapters

Scripted adapters that record every call AND consume a canned response queue.

```ts
import { createHade } from "@hade/core";
import {
  mockVenueAdapter,
  mockLLMAdapter,
  mockCacheAdapter,
  mockGeoAdapter,
  makeVenueCandidate,
} from "@hade/testkit";

const venue = mockVenueAdapter({
  batches: [[makeVenueCandidate({ name: "Joe's" })]],
});

const llm = mockLLMAdapter({
  responses: [{ rationale: "great pick", why_now: "lunch time" }],
});

const cache = mockCacheAdapter({ initial: { "warm-key": "hit" } });
const geo = mockGeoAdapter({ coords: [{ lat: 40.71, lng: -74.01 }] });

const client = createHade({ adapters: { venue, llm, cache, geo } });
await client.decide({ situation: { intent: "eat" } });

expect(venue.calls).toHaveLength(1);
expect(venue.calls[0].kind).toBe("searchForContext");
expect(llm.calls[0].prompt).toContain("dining");
expect(geo.calls).toBe(1);
```

Failure paths:

```ts
mockVenueAdapter({ alwaysFail: true });
mockVenueAdapter({ alwaysFail: new Error("custom message") });
```

## Deterministic clock

```ts
import { fakeClock } from "@hade/testkit";

const clock = fakeClock({ nowMs: 1_700_000_000_000, randomSeed: 0.42 });
try {
  const output = await client.decide({ ... });
  expect(output.generated_at_ms).toBe(1_700_000_000_000);
  clock.advance(60_000);
  // ...
} finally {
  clock.restore();
}
```

## Vitest matchers (optional sub-path)

```ts
// vitest.setup.ts
import "@hade/testkit/vitest";

// test file:
expect(output).toBeValidDecisionEngineOutput();
expect(output).toHaveConfidenceBand("high");
expect(output).toBeFallback("places_timeout");
```

The `@hade/testkit/vitest` import requires `vitest` as a peer dep. Jest/uvu users can use everything except this sub-path.

## Boundary rules

`@hade/testkit` MUST NOT import:
- `react`, `react-dom`, or any DOM API
- Any provider SDK (`openai`, `@upstash/redis`, `@googlemaps/*`)
- Any `@hade/adapters-*` package (those are runtime, not test, dependencies)

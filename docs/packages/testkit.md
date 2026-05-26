# @hade/testkit — package reference

Fixtures, scripted mock adapters, and deterministic clocks for code that consumes `@hade/core`. Framework-free.

## Fixtures

### `makeConfig(overrides?)`

Returns a fully-resolved `ResolvedHadeConfig` — all defaults filled in (built-in domains, scoring profiles, copy keys). Pass partial `HadeConfig` overrides; the fixture deep-merges through `loadConfig()` so behavior matches the real engine.

```ts
const cfg = makeConfig({ active_domain: "ecommerce" });
cfg.domains.ecommerce.default_radius_meters;   // → 0
cfg.copy.locale;                                // → "en-US" (default)
```

### `makeDecision(overrides?)`

Returns a structurally-valid `HadeDecisionLike` with auto-incrementing IDs. The input shape that `fromHadeDecision()` and `fromDecideResponse()` accept.

```ts
resetDecisionCounter();
makeDecision();                                 // → { id: "decision-1", ... }
makeDecision({ confidence: 0.9 });              // → { id: "decision-2", confidence: 0.9 }
```

### `makeDecisionEngineOutput(decisionOverrides?, outputOverrides?)`

Returns a fully-assembled `DecisionEngineOutput`. Routes through `fromHadeDecision()` so every derived field (`confidence.band`, `ux_state`, `copy_tokens.keys`, theme tokens) is computed consistently with the real engine.

```ts
const out = makeDecisionEngineOutput({ confidence: 0.9 });
out.confidence.band;                            // → "high"
out.ux_state.next_action;                       // → "commit"
out.copy_tokens.keys["action.primary_cta"];     // → "Go now"
```

### `makeVenueCandidate(overrides?)`

Returns a `VenueCandidate` with auto-incrementing IDs.

```ts
resetVenueCandidateCounter();
makeVenueCandidate({ name: "Joe's", category: "pizza" });
```

## Mock adapters

All four mock adapters record every call and consume a scripted response queue. Cleaner than `vi.mock()`-style spies because the contract (return type, error mode) is explicit and reusable across files.

### `mockVenueAdapter(options?)`

```ts
const venue = mockVenueAdapter({
  batches: [
    [makeVenueCandidate({ name: "Joe's" })],     // first call returns Joe's
    [makeVenueCandidate({ name: "Tony's" })],    // second call returns Tony's
  ],
  loop: false,                                    // true → cycle batches indefinitely
});

const client = createHade({ adapters: { venue } });
await client.decide({ ... });

venue.calls;        // ReadonlyArray<VenueAdapterCall> — every search call
venue.calls[0];     // { kind: "searchForContext", args, categories }
venue.reset();      // clear log + rewind cursor
```

Failure mode:

```ts
mockVenueAdapter({ alwaysFail: true });            // throws on every call
mockVenueAdapter({ alwaysFail: new Error("custom") }); // throws your error
```

### `mockLLMAdapter(options?)`

```ts
const llm = mockLLMAdapter({
  responses: [
    { rationale: "great pick", why_now: "lunch time" },
    null,                                          // simulate a per-call null
    { why_this: "matches your mood" },
  ],
});

await llm.enhanceCopy("prompt text", { model: "gpt-4" });
llm.calls[0].prompt;                              // "prompt text"
llm.calls[0].options?.model;                      // "gpt-4"
```

### `mockCacheAdapter(options?)`

```ts
const cache = mockCacheAdapter({
  initial: { "warm-key": "value" },
  mode: "FULL",                                   // or "DEGRADED"
});

await cache.get("warm-key");                      // "value", logged as hit
await cache.set("cold-key", { foo: "bar" }, 60);  // logged with TTL
cache.calls;                                       // ReadonlyArray<CacheCall>
cache.store;                                       // direct ReadonlyMap access
```

### `mockGeoAdapter(options?)`

```ts
const geo = mockGeoAdapter({
  coords: [{ lat: 40.71, lng: -74.01 }, null, { lat: 41, lng: -75 }],
});

await geo.resolveCoords();                        // { lat: 40.71, lng: -74.01 }
await geo.resolveCoords();                        // null (simulated failure)
await geo.resolveCoords();                        // { lat: 41, lng: -75 }
await geo.resolveCoords();                        // null (queue exhausted)
geo.calls;                                        // → 4
```

## `fakeClock`

Patches `Date.now()` and `Math.random()` globally for the lifetime of the returned controller. Restores both on `restore()`.

```ts
const clock = fakeClock({ nowMs: 1_700_000_000_000, randomSeed: 0.42 });
try {
  const output = await client.decide({ ... });
  expect(output.generated_at_ms).toBe(1_700_000_000_000);
  clock.advance(60_000);                          // jump 60s forward
  // ...
} finally {
  clock.restore();
}
```

Use in `beforeEach`/`afterEach` to make request IDs and timestamps deterministic without mocking the entire `Date` constructor.

## Vitest matchers (opt-in)

`@hade/testkit/vitest` extends `expect` with three matchers. Vitest is an **optional** peer — Jest / uvu users can skip this sub-path.

```ts
// vitest.setup.ts
import "@hade/testkit/vitest";
```

```ts
expect(output).toBeValidDecisionEngineOutput();
expect(output).toHaveConfidenceBand("high");
expect(output).toBeFallback();                    // any fallback
expect(output).toBeFallback("places_timeout");    // specific reason
```

## Why scripted mocks instead of `vi.mock()`?

| | `vi.mock()` style | `@hade/testkit` mocks |
|---|---|---|
| Type safety | Loses adapter interface | Returns the actual `VenueAdapter` etc. |
| Reuse across files | Repeated setup boilerplate | Import + go |
| Call inspection | Manual spy wiring | Built-in `.calls` array |
| Determinism | Test author's responsibility | Built-in via fixtures + `fakeClock` |
| Cross-framework | vitest-coupled | Works in Jest, uvu, Node test runner |

## Why are testkit mocks NOT in `@hade/core`?

`@hade/core` ships `emptyVenues()`, `noopLLM()`, `memoryCache()` as graceful-fallback defaults — they run in production when no adapter is wired. They return `[]` / `null` always.

`@hade/testkit` mocks are SCRIPTED — they consume canned responses and record calls. Mixing the two would bloat the core bundle for consumers who never test, and would mislead readers about which behavior runs in production.

## Boundary rules

`@hade/testkit` MUST NOT import:
- `react`, `react-dom`, or any DOM API
- Any provider SDK (`openai`, `@upstash/redis`, `@googlemaps/*`)
- Any `@hade/adapters-*` package (those are runtime, not test, deps)

Enforced by `eslint.sdk.config.mjs`.

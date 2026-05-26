# @hade/react

React hooks + provider for `@hade/core`. Headless. SSR + edge safe.

## Install

```bash
npm install @hade/react @hade/core react react-dom
```

## Quickstart

```tsx
"use client";

import { HadeProvider, useHade } from "@hade/react";
import { googlePlaces } from "@hade/adapters-google-places";

function App() {
  return (
    <HadeProvider
      config={{ active_domain: "dining" }}
      adapters={{ venue: googlePlaces({ apiKey: process.env.NEXT_PUBLIC_GP_KEY! }) }}
    >
      <DecisionScreen />
    </HadeProvider>
  );
}

function DecisionScreen() {
  const { output, error, isLoading, refine } = useHade({
    geo: { lat: 40.7128, lng: -74.006 },
    situation: { intent: "eat" },
  });

  if (isLoading) return <p>Thinking…</p>;
  if (error) return <p>Error: {error.message}</p>;
  if (!output) return null;

  return (
    <article>
      <h1>{output.decision.venue_name}</h1>
      <p>{output.rationale.primary_text}</p>
      <button onClick={() => refine("quieter")}>Refine</button>
    </article>
  );
}
```

## Hooks

### `<HadeProvider>` + `useHadeClient()`

Provides a single `HadeClient` to the subtree. Pass `config` + `adapters` to let the provider call `createHade()` itself, OR pass a pre-built `client` (for SSR or test harnesses).

```tsx
// Auto-construction (most apps)
<HadeProvider config={cfg} adapters={{ venue, llm }}>
  <App />
</HadeProvider>

// Pre-built (SSR or shared test harness)
const client = createHade({ ... });
<HadeProvider client={client}>
  <App />
</HadeProvider>
```

### `useHade(input?)` — primary decision hook

Auto-runs on mount + input change when `input` is supplied. Returns:

```ts
{
  output: DecisionEngineOutput | null;
  error: Error | null;
  isLoading: boolean;
  decide: (input, opts?) => Promise<DecisionEngineOutput>;
  refine: (input, opts?) => Promise<DecisionEngineOutput>;
  reset: () => void;
}
```

Lazy / button-driven flow — omit the input:

```tsx
const { output, decide } = useHade();
return <button onClick={() => decide({ geo: ... })}>Find me a place</button>;
```

**Cancellation:** every new call cancels any in-flight request. The hook commits only the latest response — stale results are discarded.

### `useHadeConfig()`

Returns the fully-resolved `ResolvedHadeConfig` from the active client. Useful for settings UI, debug panels, or analytics tags.

```tsx
const cfg = useHadeConfig();
return <span>Active vertical: {cfg.active_domain}</span>;
```

## SSR / RSC notes

- `HadeProvider`, `useHade`, and `useHadeConfig` are marked `"use client"` — they cannot run in Server Components directly.
- For server-rendered decisions, call `createHade()` + `client.decide()` in your route handler / RSC and pass the resulting `DecisionEngineOutput` as a prop. Render with pure components (no hooks needed).
- The standalone `decide()` helper from `@hade/core` is the simplest server path: `await decide({ geo, situation })` in a `route.ts`.

## Boundary rules

`@hade/react` MUST NOT import:
- Any `@hade/adapters-*` package (consumers wire those at the provider boundary)
- Any provider SDK (`openai`, `@upstash/redis`, `@googlemaps/*`)
- Any DOM globals at module scope (the hooks use `useEffect` for I/O)

## Peer dependencies

| Peer        | Range       |
|-------------|-------------|
| `@hade/core` | `*`         |
| `react`      | `>=18.2.0`  |
| `react-dom`  | `>=18.2.0`  |

Tested against React 18.3 and React 19.0.

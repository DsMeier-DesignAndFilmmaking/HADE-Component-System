# @hade/react — package reference

Minimal headless React wrapper around `@hade/core`. SSR-safe. Edge-safe. No DOM access at module scope.

## What's included

| Export             | Kind     | Purpose                                                  |
|--------------------|----------|----------------------------------------------------------|
| `HadeProvider`     | Component | Supplies a single `HadeClient` to descendants            |
| `useHadeClient()`  | Hook     | Read the client from the nearest provider                |
| `useHade(input?)`  | Hook     | Auto-run decide on mount + input change, or lazy mode    |
| `useHadeConfig()`  | Hook     | Read the resolved `HadeConfig` from the client            |

## `HadeProvider`

Two construction modes:

### Mode A — provider constructs the client (most apps)

```tsx
<HadeProvider
  config={{ active_domain: "dining" }}
  adapters={{
    venue: googlePlaces({ apiKey: process.env.NEXT_PUBLIC_GP_KEY! }),
    llm:   openai({ apiKey: process.env.OPENAI_API_KEY! }),
  }}
>
  <App />
</HadeProvider>
```

The client is constructed lazily on first render, cached for the provider's lifetime, and `client.close()` is called on unmount.

### Mode B — pass a pre-built client (SSR / shared test harness)

```tsx
const client = createHade({ config, adapters });

// In React Server Component:
<HadeProvider client={client}>
  <App />
</HadeProvider>
```

In Mode B, the provider does NOT call `close()` on unmount — you own lifecycle.

## `useHade(input?)`

### Auto-run mode

When `input` is supplied, the hook runs `decide()` on mount AND whenever the JSON-stringified input changes:

```tsx
function VenueCard({ lat, lng, intent }: Props) {
  const { output, error, isLoading, refine } = useHade({
    geo: { lat, lng },
    situation: { intent },
  });

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorBanner error={error} />;
  if (!output) return null;

  return (
    <article>
      <h1>{output.decision.venue_name}</h1>
      <p>{output.rationale.primary_text}</p>
      <button onClick={() => refine("quieter")}>Quieter</button>
    </article>
  );
}
```

### Lazy mode

Omit `input` — the hook returns a stable shape with `decide`/`refine`/`reset` callbacks for event-driven flows:

```tsx
function FindMeAPlace() {
  const { output, isLoading, decide } = useHade();
  return (
    <>
      <button
        disabled={isLoading}
        onClick={async () => {
          const { coords } = await navigator.geolocation.getCurrentPosition();
          await decide({ geo: { lat: coords.latitude, lng: coords.longitude } });
        }}
      >
        Find me a place
      </button>
      {output && <Card output={output} />}
    </>
  );
}
```

### Return shape

```ts
interface UseHadeResult {
  output: DecisionEngineOutput | null;
  error: Error | null;
  isLoading: boolean;
  decide: (input: DecideInput, options?: DecideOptions) => Promise<DecisionEngineOutput>;
  refine: (input: RefineInput, options?: DecideOptions) => Promise<DecisionEngineOutput>;
  reset: () => void;
}
```

### Cancellation

Every new call cancels any in-flight request from the same hook instance via `AbortController`. The hook commits ONLY the latest response — stale results are discarded silently. Unmount also cancels in-flight requests.

This matches the standard React-Query / SWR pattern. You don't need to wrap with your own debouncer / cancellation logic.

## `useHadeConfig()`

Returns the resolved `HadeConfig` from the active client. Useful for:

- Settings UIs ("Active vertical: dining" labels)
- Analytics tagging (`config_hash`)
- Conditional rendering based on resolved tone / locale

```tsx
function ActiveDomainBadge() {
  const cfg = useHadeConfig();
  return <span>{cfg.domains[cfg.active_domain]?.display_name}</span>;
}
```

The returned object is reference-stable — safe to use directly in `useEffect` deps without `useMemo`.

## SSR / RSC patterns

`HadeProvider`, `useHade`, and `useHadeConfig` are marked `"use client"`. They cannot run inside Server Components.

### Pattern A — server decide, client display (recommended for SEO)

```tsx
// app/recommend/page.tsx (Server Component)
import { decide } from "@hade/core";

export default async function Page() {
  const output = await decide({ geo: serverDetectedGeo(), situation: {...} });
  return <DecisionCard output={output} />;  // pure component, no hooks
}
```

### Pattern B — client-side hooks (when geo / refine matter)

```tsx
// app/layout.tsx (Server Component)
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

// app/Providers.tsx (Client Component)
"use client";
import { HadeProvider } from "@hade/react";
export function Providers({ children }) {
  return <HadeProvider config={...} adapters={...}>{children}</HadeProvider>;
}
```

## Testing

Pair with `@hade/testkit` for full coverage:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { HadeProvider, useHade } from "@hade/react";
import { mockVenueAdapter, makeVenueCandidate } from "@hade/testkit";

it("renders the first candidate", async () => {
  const venue = mockVenueAdapter({
    batches: [[makeVenueCandidate({ name: "Joe's" })]],
  });

  const wrapper = ({ children }) => (
    <HadeProvider adapters={{ venue }}>{children}</HadeProvider>
  );

  const { result } = renderHook(
    () => useHade({ geo: { lat: 40.71, lng: -74.01 } }),
    { wrapper },
  );

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.output?.decision.venue_name).toBe("Joe's");
  expect(venue.calls).toHaveLength(1);
});
```

## Boundary rules

`@hade/react` MUST NOT import:
- Any `@hade/adapters-*` package (the consumer wires adapters at the provider boundary)
- Any provider SDK (`openai`, `@upstash/redis`, `@googlemaps/*`)
- DOM globals at module scope (`window`, `document`, `navigator`)

Enforced by `eslint.sdk.config.mjs`.

## What's NOT in this package

For v1, the published surface is hooks + provider. The 30+ React components in the demo (`src/components/hade/{adaptive,mobile,layout,buttons,typography}`) stay as a reference implementation. Extract into `@hade/react-ui` once external consumers validate which components are universal vs. demo-specific.

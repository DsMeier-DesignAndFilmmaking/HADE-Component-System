# @hade/core

Pure-TypeScript decision engine. Zero framework dependencies. Edge-runtime safe.

## Install

```bash
npm install @hade/core
```

## Five-minute quickstart

```ts
import { createHade } from "@hade/core";
import { googlePlaces } from "@hade/adapters-google-places";
import { openai } from "@hade/adapters-openai";

const hade = createHade({
  config: {
    active_domain: "dining",
    copy: { tone: "casual" },
  },
  adapters: {
    venue: googlePlaces({ apiKey: process.env.GOOGLE_PLACES_API_KEY! }),
    llm:   openai({ apiKey: process.env.OPENAI_API_KEY! }),
  },
});

const output = await hade.decide({
  geo: { lat: 40.7128, lng: -74.006 },
  situation: { intent: "eat" },
});

console.log(output.decision.venue_name);   // "Joe's Pizza"
console.log(output.confidence.band);       // "high" | "medium" | "low"
console.log(output.copy_tokens.keys["action.take_me_there"]); // "Take me there"
```

## Config

Drop a `hade.config.json` in your project root and reference the bundled JSON Schema for VS Code autocomplete + inline validation:

```json
{
  "$schema": "./node_modules/@hade/core/schema/hade-config.schema.json",
  "$schema_version": "1.0",
  "product": { "id": "myapp", "name": "My App", "domain": "dining" },
  "active_domain": "dining",
  "copy": { "tone": "casual" }
}
```

Then pass it to `createHade`:

```ts
import hadeConfig from "./hade.config.json" assert { type: "json" };
const hade = createHade({ config: hadeConfig });
```

Pre-v1.0 configs (just `{ defaults: { radius_meters: 800 } }`) are silently auto-migrated. Existing consumers see zero breakage.

### Custom verticals (open vertical map)

The `domains` key is an open string map — add any vertical without forking the SDK:

```json
{
  "$schema_version": "1.0",
  "active_domain": "ecommerce",
  "domains": {
    "ecommerce": {
      "id": "ecommerce",
      "display_name": "Shopping",
      "default_intents": ["browse", "buy"],
      "default_radius_meters": 0,
      "primary_signals": ["BEHAVIORAL", "INTENT"],
      "category_buckets": [["electronics"], ["clothing"]],
      "scoring_profile": "intent_heavy",
      "copy_overrides": {
        "action.take_me_there": "Add to cart",
        "label.strong_pick":    "Top match"
      }
    }
  },
  "scoring": {
    "profiles": {
      "intent_heavy": { "proximity": 0.10, "signal": 0.45, "intent": 0.45 }
    }
  },
  "mobility": { "walking_meters_per_minute": 0, "driving_meters_per_minute": 0 }
}
```

See `examples/configs/` for complete, runnable configs for dining, social, travel, and ecommerce.

## API

### `createHade(clientConfig?)`

Returns a `HadeClient`. Synchronous. Edge-safe. No I/O at construction time.

```ts
interface HadeClientConfig {
  config?:   HadeConfig;           // inline config (wins over defaults)
  adapters?: PartialHadeAdapters;  // DI: venue, llm, cache, geo
  clientId?: string;
}
```

Omitting `adapters` uses built-in no-op stubs — the engine falls back gracefully to static results. Wire real adapters for live venue search and LLM copy enhancement.

### `client.decide(input, options?)`

```ts
const output: DecisionEngineOutput = await client.decide({
  geo?:            { lat: number; lng: number },
  radius_meters?:  number,          // overrides config default
  situation?:      { intent: string | null },
  categories?:     string[],
  request_id?:     string,
});
```

### `client.refine(input, prior?, options?)`

```ts
await client.refine("somewhere quieter");            // tone shorthand
await client.refine({ intent: "coffee" });           // intent override
await client.refine({ radius_meters: 2000 });        // radius override
```

### `client.getConfig()`

Returns the fully-resolved `ResolvedHadeConfig` — useful for inspecting effective defaults, active domain, and config hash.

### `decide(input, options?)` — standalone

One-shot helper that constructs a client per call. Handy for serverless / edge handlers:

```ts
import { decide } from "@hade/core";

export async function GET(req: Request) {
  const output = await decide({ geo: { lat: 40.71, lng: -74.01 } });
  return Response.json(output);
}
```

### `defineConfig(config)` — typed helper

Pass-through at runtime; provides autocomplete and type-checking at compile time:

```ts
import { defineConfig } from "@hade/core";

export default defineConfig({
  active_domain: "travel",
  copy: { tone: "playful" },
});
```

## Output shape

`DecisionEngineOutput` is the headless contract — no rendering assumptions, no React, no DOM.

```ts
{
  output_version: "1.0";
  request_id:     string;
  source:         "llm" | "synthetic" | "cold_start_synthetic" | "offline_cache" | "static_fallback";
  is_fallback:    boolean;

  decision: {
    id:               string;
    venue_name:       string;
    category:         string;
    geo:              { lat: number; lng: number };
    distance_meters:  number;
    eta_minutes:      number;
    neighborhood?:    string;
    address?:         string;
  };

  confidence: {
    score:    number;     // 0–1
    band:     "high" | "medium" | "low";
    label_id: string;     // "strong_pick" | "good_fit" | "exploratory"
  };

  rationale: {
    primary_text:  string;
    secondary_text: string;
    cited_signals: Array<{ signal_id: string; weight: number }>;
  };

  copy_tokens: {
    locale: string;
    keys:   Record<string, string>;   // resolved copy bundle (locale + overrides)
  };

  action_tokens: {
    primary:   ActionToken;
    secondary: ActionToken[];
  };

  layout_tokens:  { surface: string; density: string; show_slots: string[] };
  theme_tokens:   { palette_ref: string; semantic: { confidence_color_id: string; ... } };
  ux_state:       { next_action: string; suggested_sheet: string | null; escalation_path: string[] };
  analytics:      { engine_tier: string; config_hash: string; ... };
  fallback_meta?: { reason: string; degraded_fields: string[]; user_visible: boolean };
}
```

## Config validation

`loadConfig` throws `HadeConfigValidationError` on invalid input. Catch it for structured error reporting:

```ts
import { loadConfig, HadeConfigValidationError } from "@hade/core";

try {
  const cfg = loadConfig(raw);
} catch (err) {
  if (err instanceof HadeConfigValidationError) {
    for (const issue of err.issues) {
      console.error(`[${issue.path}] ${issue.message}`);
    }
  }
}
```

## Boundary rules

`@hade/core` MUST NOT import:
- React or any React-specific API
- DOM APIs (`window`, `document`, `navigator`)
- Any provider SDK (`openai`, `@upstash/redis`, `@googlemaps/*`)
- Any `@hade/adapters-*` package

All provider integration lives in the `@hade/adapters-*` family and is wired at call-site via `createHade({ adapters: { ... } })`.

# HADE SDK — Quickstart

## Install

```bash
npm install @hade/core
# Wire one or more adapters for real venue search + LLM copy
npm install @hade/adapters-google-places @hade/adapters-openai
```

## Minimal working example

```ts
import { createHade } from "@hade/core";
import { googlePlaces } from "@hade/adapters-google-places";
import { openai }        from "@hade/adapters-openai";

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

// Geo-aware decision
const output = await hade.decide({
  geo: { lat: 40.7128, lng: -74.006 },
  situation: { intent: "eat" },
});

console.log(output.decision.venue_name);           // "Joe's Pizza"
console.log(output.confidence.band);               // "high"
console.log(output.copy_tokens.keys["action.take_me_there"]); // "Take me there"
```

## Config file (optional, recommended)

Add a `hade.config.json` to your project root:

```json
{
  "$schema": "./node_modules/@hade/core/schema/hade-config.schema.json",
  "$schema_version": "1.0",
  "product": { "id": "myapp", "name": "My App", "domain": "dining" },
  "active_domain": "dining",
  "copy": { "locale": "en-US", "tone": "casual" },
  "timeouts": { "adapter_ms": 5000 }
}
```

The `$schema` line gives VS Code (and any JSON-Schema-aware editor) autocomplete and inline validation for every config field.

Import and wire it:

```ts
import hadeConfig from "./hade.config.json" assert { type: "json" };
const hade = createHade({ config: hadeConfig });
```

## Verticals

Four built-in verticals ship with default values: **dining**, **social**, **travel**, **ecommerce**.

Override a single field without redeclaring the rest:

```json
{
  "$schema_version": "1.0",
  "active_domain": "dining",
  "domains": {
    "dining": { "default_radius_meters": 2500 }
  }
}
```

### Custom verticals

Add any vertical as a new key in `domains` — no SDK fork required:

```json
{
  "$schema_version": "1.0",
  "active_domain": "fitness",
  "domains": {
    "fitness": {
      "id": "fitness",
      "display_name": "Fitness",
      "default_intents": ["workout", "yoga"],
      "default_radius_meters": 1500,
      "primary_signals": ["AMBIENT", "BEHAVIORAL"],
      "category_buckets": [["gym"], ["yoga_studio"], ["park"]],
      "scoring_profile": "balanced"
    }
  }
}
```

See `packages/core/examples/configs/` for complete examples (dining, social, travel, ecommerce).

## Copy overrides

Rename any copy key globally or per-vertical:

```json
{
  "$schema_version": "1.0",
  "active_domain": "ecommerce",
  "copy": {
    "overrides": {
      "action.take_me_there": "Shop now",
      "label.strong_pick": "Best match"
    }
  }
}
```

Per-vertical overrides win over global ones:

```json
{
  "domains": {
    "ecommerce": {
      "copy_overrides": {
        "action.take_me_there": "Add to cart"
      }
    }
  }
}
```

Resolved copy appears in `output.copy_tokens.keys`.

## Refine

```ts
// Tone shorthand — engine re-runs with softer constraints
const output2 = await hade.refine("somewhere quieter", output);

// Intent override
const output3 = await hade.refine({ intent: "coffee" }, output);

// Wider radius
const output4 = await hade.refine({ radius_meters: 3000 }, output);
```

## Fallback behavior

When no venue is found (or geo is unavailable), the engine returns `is_fallback: true` with `fallback_meta` explaining why. The output shape is identical — UI code doesn't need a special branch.

```ts
if (output.is_fallback) {
  // output.fallback_meta.reason: "no_signal" | "places_timeout" | "offline_cache"
  // output.fallback_meta.user_visible: true — safe to surface
}
```

## Standalone `decide()` (serverless / edge)

For one-shot handlers, skip `createHade` — use the exported `decide` helper directly:

```ts
import { decide } from "@hade/core";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "0");
  const lng = parseFloat(searchParams.get("lng") ?? "0");

  const output = await decide({ geo: { lat, lng } });
  return Response.json(output);
}
```

## Config validation

Validation errors throw `HadeConfigValidationError` with a structured `issues` array:

```ts
import { loadConfig, HadeConfigValidationError } from "@hade/core";

try {
  const cfg = loadConfig({ active_domain: "unknown_vertical" });
} catch (err) {
  if (err instanceof HadeConfigValidationError) {
    // err.issues: Array<{ path: string; message: string; value?: unknown }>
    console.error(err.issues[0].message);
    // → must reference a key in "domains" (got "unknown_vertical", ...)
  }
}
```

## TypeScript types

All public types are re-exported from `@hade/core`:

```ts
import type {
  HadeConfig,          // input type (all fields optional; auto-migrated)
  ResolvedHadeConfig,  // what the engine sees after defaults are applied
  HadeClient,
  DecisionEngineOutput,
  DecisionSource,
  ConfidenceBand,
} from "@hade/core";
```

Use `defineConfig` for typed config authoring without a JSON file:

```ts
import { defineConfig } from "@hade/core";

export default defineConfig({
  active_domain: "travel",
  copy: { tone: "playful" },
  domains: {
    travel: { default_radius_meters: 4000 },
  },
});
```

## Adapter wiring

Adapters are DI — the engine never resolves them by string ID:

```ts
import { createHade }      from "@hade/core";
import { googlePlaces }    from "@hade/adapters-google-places";
import { openai }          from "@hade/adapters-openai";
import { upstash }         from "@hade/adapters-upstash";
import { headerGeo }       from "@hade/core";   // built-in geo adapters ship with core

const hade = createHade({
  adapters: {
    venue: googlePlaces({ apiKey: "..." }),
    llm:   openai({ apiKey: "..." }),
    cache: upstash({ url: "...", token: "..." }),
    geo:   headerGeo({ source: "cf-ipcountry" }),  // Cloudflare Workers geo
  },
});
```

Omitting any slot falls back silently to a no-op default. The engine degrades gracefully — no crash on partial wiring.

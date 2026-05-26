# HadeConfig examples

Four worked examples of `hade.config.json` — one per built-in vertical. Each
parses through `loadConfig()` without error and demonstrates the most relevant
overrides for its vertical.

| File | Vertical | Notable settings |
|---|---|---|
| `dining.config.json` | Dining | Balanced 0.4/0.35/0.25 scoring, casual tone, 2500m radius |
| `social.config.json` | Social | Signal-heavy 0.25/0.50/0.25, playful tone, 10s adapter timeout |
| `travel.config.json` | Travel | Intent-heavy 0.25/0.25/0.50, 4000m radius |
| `ecommerce.config.json` | Ecommerce (digital) | Zero radius, zero mobility, rating-heavy, CTA copy overrides ("Add to cart"), custom adapter metadata |

## Open-vertical contract

The schema's `domains` field is an open `Record<string, HadeDomainConfig>`. Any
consumer can ship a brand-new vertical without forking the SDK — see
`ecommerce.config.json` for the smallest viable non-physical vertical (radius
and mobility both zero; venue adapter metadata points to a non-Places provider).

## Loading an example

```ts
import { createHade } from "@hade/core";
import diningConfig from "@hade/core/examples/configs/dining.config.json";

const client = createHade({ config: diningConfig });
```

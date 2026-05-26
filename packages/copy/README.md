# @hade/copy

Locale string bundles for HADE. Pure JSON + lazy loaders. Framework-free.

**Status: Phase A scaffold.** Phase G populates the full string table extracted from the audit's inventory of ~40 inline strings.

## Exports

- `@hade/copy` — `getCopy(slot, locale)`, `defineCopy()`, types
- `@hade/copy/en-US` — the en-US bundle as a typed const

## Usage (target)

```ts
import { getCopy } from "@hade/copy";

const label = getCopy("action.take_me_there", "en-US"); // "Take me there"
```

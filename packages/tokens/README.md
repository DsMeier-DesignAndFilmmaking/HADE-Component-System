# @hade/tokens

W3C-shaped design tokens for HADE. Pure data. Framework-free.

**Status: Phase A scaffold.** Real token values land in Phase E.

## Exports

- `@hade/tokens` — `defaultTheme`, `defaultLayout`, types
- `@hade/tokens/tailwind` — Tailwind preset
- `@hade/tokens/css-vars` — `themeToCSSVars(theme)` serializer

## Usage (target)

```ts
import { defaultTheme } from "@hade/tokens";
import { themeToCSSVars } from "@hade/tokens/css-vars";

const css = `:root { ${themeToCSSVars(defaultTheme).join(" ")} }`;
```

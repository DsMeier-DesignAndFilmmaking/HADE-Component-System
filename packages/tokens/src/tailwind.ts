// @hade/tokens/tailwind — Tailwind preset (Phase A scaffold)
//
// Phase E will populate this with a full Tailwind preset extracted from
// tailwind.config.ts. The demo will not consume it in v1.0 (Non-Negotiable:
// `/demo` renders identically) but new consumers can opt in.

import { defaultTheme } from "./index.js";

export const hadeTailwindPreset = {
  theme: {
    extend: {
      colors: {
        "hade-accent": defaultTheme.color.brand.accent.$value,
        "hade-bg": defaultTheme.color.surface.background.$value,
        "hade-ink": defaultTheme.color.text.primary.$value,
      },
    },
  },
} as const;

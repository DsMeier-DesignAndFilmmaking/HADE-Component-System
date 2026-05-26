// @hade/tokens — W3C-shaped design tokens (Phase A scaffold)
//
// Tokens are PURE DATA. No functions that touch the DOM, no React imports,
// no framework coupling. Consumers (React, SwiftUI, Webflow) decide how to
// apply them.
//
// Real token values arrive in Phase E (extracted from tailwind.config.ts
// `accent: "#316BFF"` and the signal color palette). For now we ship the
// shape so type-check and bundle-budget gates pass.

export interface ColorToken {
  $value: string;
  $type: "color";
  $description?: string;
}

export interface DimensionToken {
  $value: string;
  $type: "dimension";
  $description?: string;
}

export interface ThemeTokens {
  color: {
    brand: { accent: ColorToken };
    surface: { background: ColorToken; elevated: ColorToken; muted: ColorToken };
    text: { primary: ColorToken; secondary: ColorToken; inverted: ColorToken };
    signal: { strong: ColorToken; medium: ColorToken; weak: ColorToken };
  };
  radius: { sm: DimensionToken; md: DimensionToken; lg: DimensionToken };
  space: { xs: DimensionToken; sm: DimensionToken; md: DimensionToken; lg: DimensionToken };
}

export interface LayoutTokens {
  density: "comfortable" | "compact";
  surface: "hero_card" | "list_row" | "map_pin" | "compact_pill";
}

/**
 * Phase E will replace this with the real default theme extracted from
 * tailwind.config.ts. For now: a minimal placeholder.
 */
export const defaultTheme: ThemeTokens = {
  color: {
    brand: { accent: { $value: "#316BFF", $type: "color" } },
    surface: {
      background: { $value: "#ffffff", $type: "color" },
      elevated: { $value: "#ffffff", $type: "color" },
      muted: { $value: "#f4f4f5", $type: "color" },
    },
    text: {
      primary: { $value: "#0b0d12", $type: "color" },
      secondary: { $value: "#4b5563", $type: "color" },
      inverted: { $value: "#ffffff", $type: "color" },
    },
    signal: {
      strong: { $value: "#10b981", $type: "color" },
      medium: { $value: "#f59e0b", $type: "color" },
      weak: { $value: "#94a3b8", $type: "color" },
    },
  },
  radius: {
    sm: { $value: "4px", $type: "dimension" },
    md: { $value: "8px", $type: "dimension" },
    lg: { $value: "16px", $type: "dimension" },
  },
  space: {
    xs: { $value: "4px", $type: "dimension" },
    sm: { $value: "8px", $type: "dimension" },
    md: { $value: "16px", $type: "dimension" },
    lg: { $value: "24px", $type: "dimension" },
  },
};

export const defaultLayout: LayoutTokens = {
  density: "comfortable",
  surface: "hero_card",
};

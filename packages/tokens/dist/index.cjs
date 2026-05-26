'use strict';

// src/index.ts
var defaultTheme = {
  color: {
    brand: { accent: { $value: "#316BFF", $type: "color" } },
    surface: {
      background: { $value: "#ffffff", $type: "color" },
      elevated: { $value: "#ffffff", $type: "color" },
      muted: { $value: "#f4f4f5", $type: "color" }
    },
    text: {
      primary: { $value: "#0b0d12", $type: "color" },
      secondary: { $value: "#4b5563", $type: "color" },
      inverted: { $value: "#ffffff", $type: "color" }
    },
    signal: {
      strong: { $value: "#10b981", $type: "color" },
      medium: { $value: "#f59e0b", $type: "color" },
      weak: { $value: "#94a3b8", $type: "color" }
    }
  },
  radius: {
    sm: { $value: "4px", $type: "dimension" },
    md: { $value: "8px", $type: "dimension" },
    lg: { $value: "16px", $type: "dimension" }
  },
  space: {
    xs: { $value: "4px", $type: "dimension" },
    sm: { $value: "8px", $type: "dimension" },
    md: { $value: "16px", $type: "dimension" },
    lg: { $value: "24px", $type: "dimension" }
  }
};
var defaultLayout = {
  density: "comfortable",
  surface: "hero_card"
};

exports.defaultLayout = defaultLayout;
exports.defaultTheme = defaultTheme;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map
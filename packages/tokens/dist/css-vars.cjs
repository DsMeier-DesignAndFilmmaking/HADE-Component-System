'use strict';

// src/css-vars.ts
function themeToCSSVars(theme, prefix = "hade") {
  const lines = [];
  walk(theme, [prefix], lines);
  return lines;
}
function walk(node, path, out) {
  for (const [key, value] of Object.entries(node)) {
    if (value && typeof value === "object" && "$value" in value) {
      const token = value;
      out.push(`--${[...path, key].join("-")}: ${token.$value};`);
    } else if (value && typeof value === "object") {
      walk(value, [...path, key], out);
    }
  }
}

exports.themeToCSSVars = themeToCSSVars;
//# sourceMappingURL=css-vars.cjs.map
//# sourceMappingURL=css-vars.cjs.map
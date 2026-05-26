// src/index.ts
var defaultTheme = {
  color: {
    brand: { accent: { $value: "#316BFF"} },
    surface: {
      background: { $value: "#ffffff"}},
    text: {
      primary: { $value: "#0b0d12"}}}};

// src/tailwind.ts
var hadeTailwindPreset = {
  theme: {
    extend: {
      colors: {
        "hade-accent": defaultTheme.color.brand.accent.$value,
        "hade-bg": defaultTheme.color.surface.background.$value,
        "hade-ink": defaultTheme.color.text.primary.$value
      }
    }
  }
};

export { hadeTailwindPreset };
//# sourceMappingURL=tailwind.js.map
//# sourceMappingURL=tailwind.js.map
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic light theme tokens
        background: "#FAFAFA",
        surface: "#FFFFFF",
        textPrimary: "#1F2937",
        textMuted: "#4B5563",
        accentPrimary: "#316BFF",
        accentSecondary: "#F59E0B",
        border: "#E5E7EB",
        // Core HADE palette
        ink: "#0b0d12",
        surfaceLegacy: "#f6f7f9",
        line: "#d8dce3",
        accent: "#316BFF",
        accentSoft: "#E7EEFF",
        // Deep Field / dark palette
        obsidian: "#080b11",
        slateGlass: "#1c2236",
        // Accent highlights
        cyberLime: "#F59E0B",
        electricBlue: "#316BFF",
        // Signal type colors
        signal: {
          presence: "#10B981",
          social: "#8B5CF6",
          environmental: "#3B82F6",
          behavioral: "#F59E0B",
          ambient: "#EC4899",
          event: "#EF4444",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "Menlo", "Monaco", "monospace"],
      },
      boxShadow: {
        panel: "0 18px 40px rgba(11, 13, 18, 0.08)",
        soft: "0 10px 24px rgba(11, 13, 18, 0.05)",
        glow: "0 0 24px rgba(245, 158, 11, 0.22)",
        glowBlue: "0 0 24px rgba(49, 107, 255, 0.22)",
        glowGreen: "0 0 20px rgba(16, 185, 129, 0.18)",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.4s ease-out forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;

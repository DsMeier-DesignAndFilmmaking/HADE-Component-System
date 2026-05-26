// eslint.sdk.config.mjs
//
// SDK-only ESLint config. Runs against packages/ to enforce import boundaries.
// Kept SEPARATE from the demo's `next lint` config (eslint-config-next) so
// nothing in src/ is affected (Non-Negotiable #1: /demo renders identically).
//
// Invoked by: npm run sdk:check:boundaries
// See plan: /Users/danielmeier/.claude/plans/you-are-a-senior-keen-sonnet.md

import importPlugin from "eslint-plugin-import";
import tsParser from "@typescript-eslint/parser";

/**
 * Boundary rules (audit Non-Negotiable: engine purity preserved):
 * - @hade/core MUST NOT import React, DOM, provider SDKs, or any adapter package.
 * - @hade/react MUST NOT import any adapter package.
 * - Adapter packages MUST NOT import each other.
 * - Legacy packages may depend on new packages; reverse is forbidden.
 */
const FORBIDDEN_IN_CORE = [
  "react",
  "react-dom",
  "next",
  "next/*",
  "framer-motion",
  "openai",
  "@anthropic-ai/sdk",
  "@upstash/redis",
  "@googlemaps/*",
  "@hade/adapters-*",
  "@hade/react",
  "@hade/react-legacy",
];

const FORBIDDEN_IN_REACT = ["@hade/adapters-*"];

const FORBIDDEN_IN_ADAPTERS = ["@hade/adapters-*"]; // adapters MUST NOT import siblings

export default [
  {
    files: ["packages/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      "import/no-cycle": ["error", { maxDepth: 10 }],
    },
  },

  // @hade/core — strictest boundary
  {
    files: ["packages/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: FORBIDDEN_IN_CORE.map((pattern) => ({
            group: [pattern],
            message: `@hade/core is framework-free. '${pattern}' is forbidden — move adapters/UI to their own package.`,
          })),
        },
      ],
    },
  },

  // @hade/react — no adapter imports
  {
    files: ["packages/react/**/*.{ts,tsx}", "packages/react-legacy/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: FORBIDDEN_IN_REACT.map((pattern) => ({
            group: [pattern],
            message: `@hade/react must not depend on adapters. '${pattern}' is forbidden — adapters are wired at createHade() time, not imported by UI.`,
          })),
        },
      ],
    },
  },

  // @hade/adapters-* — no sibling imports
  {
    files: ["packages/adapters-*/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: FORBIDDEN_IN_ADAPTERS.map((pattern) => ({
            group: [pattern],
            message: `Adapters must not import each other. '${pattern}' is forbidden — compose at the call site.`,
          })),
        },
      ],
    },
  },

  // tokens, copy — pure data, no framework or adapter imports
  {
    files: ["packages/tokens/**/*.{ts,tsx}", "packages/copy/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-dom", "next", "next/*"], message: "@hade/tokens and @hade/copy are pure data — no framework imports." },
            { group: ["@hade/adapters-*"], message: "Pure data packages must not import adapters." },
          ],
        },
      ],
    },
  },

  // @hade/testkit — fixtures + mocks. Vitest is an OPTIONAL peer (consumed by
  // src/assertions/vitest.ts only); no React, no DOM, no adapter package, no
  // provider SDKs.
  {
    files: ["packages/testkit/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "next", "next/*", "framer-motion"],
              message: "@hade/testkit is framework-free. Move React-specific helpers to @hade/react.",
            },
            {
              group: ["@hade/adapters-*"],
              message: "@hade/testkit provides SCRIPTED mocks; real adapter packages are runtime deps, not test deps.",
            },
            {
              group: ["openai", "@anthropic-ai/sdk", "@upstash/redis", "@googlemaps/*"],
              message: "@hade/testkit must not import provider SDKs — mocks should be inlined.",
            },
          ],
        },
      ],
    },
  },

  // Phase 9 — every package is forbidden from importing apps/ code. The SDK
  // is a one-way dependency: apps consume packages, never the reverse.
  // ESLint + scripts/audit-package-purity.mjs are the two layers; ESLint is
  // bypassable with eslint-disable, the audit script is not.
  {
    files: ["packages/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/*"],
              message:
                "Demo path alias '@/' is forbidden in packages/. The SDK is a one-way dependency — refactor shared code into a package or duplicate.",
            },
            {
              group: ["**/apps/**", "**/apps/demo/**"],
              message:
                "Packages MUST NOT import from apps/. Refactor the shared code into a package, or duplicate.",
            },
          ],
        },
      ],
    },
  },

  {
    ignores: [
      "packages/**/dist/**",
      "packages/**/node_modules/**",
      "packages/**/*.test.ts",
    ],
  },
];

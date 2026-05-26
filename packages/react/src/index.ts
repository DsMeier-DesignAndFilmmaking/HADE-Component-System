// @hade/react — public API surface.
//
// Minimal headless React wrapper around @hade/core's createHade(). All hooks
// are SSR-safe (they read from React context; useEffect-guarded I/O). No DOM
// access at module scope. No provider SDK imports.
//
// For the full demo experience (signal badges, geo cascades, adaptive
// containers, mode switching), see the reference implementation in
// `src/lib/hade/` of the HADE Component System repo — those components are
// intentionally kept out of the published package until consumer feedback
// validates which ones are universal vs. demo-specific.

export const HADE_REACT_VERSION = "0.1.0" as const;

export { HadeProvider, useHadeClient } from "./HadeProvider.js";
export type { HadeProviderProps } from "./HadeProvider.js";

export { useHade } from "./useHade.js";
export type { UseHadeResult } from "./useHade.js";

export { useHadeConfig } from "./useHadeConfig.js";

// Re-export the most-used types from @hade/core so consumers writing
// component props don't need a second import line.
export type {
  DecideInput,
  DecideOptions,
  DecisionEngineOutput,
  HadeClient,
  HadeClientConfig,
  HadeConfig,
  RefineInput,
  ResolvedHadeConfig,
} from "@hade/core";

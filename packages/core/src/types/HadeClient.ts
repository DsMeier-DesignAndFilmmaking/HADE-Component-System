/**
 * HadeClient — the runtime value returned by {@link createHade}.
 *
 * Holds the resolved adapter bundle and merged config. Exposes `decide` and
 * `refine` as the primary entry points; adapters are accessible via
 * `client.adapters` for advanced callers (tests, mocks, custom orchestration).
 *
 * See plan: /Users/danielmeier/.claude/plans/you-are-a-senior-keen-sonnet.md §1
 */

import type { DecisionEngineOutput } from "./DecisionEngineOutput.js";
import type {
  GeoCoords,
  HadeAdapters,
  PartialHadeAdapters,
  VenueContextLike,
} from "./adapters.js";
import type { HadeConfig, HadeConfigDefaults, ResolvedHadeConfig } from "../config/schema.js";

/** Inputs accepted by {@link createHade}. All slots optional — sensible defaults applied. */
export interface HadeClientConfig {
  readonly config?: HadeConfig;
  readonly adapters?: PartialHadeAdapters;
  /** Stable identifier used as a logging prefix and cache namespace. */
  readonly clientId?: string;
}

/**
 * Friendly input shape for {@link HadeClient.decide}. Coordinates may be
 * omitted — the configured GeoAdapter resolves them.
 */
export interface DecideInput {
  readonly geo?: GeoCoords | null;
  readonly situation?: { readonly intent?: string | null };
  readonly radius_meters?: number;
  readonly categories?: readonly string[];
  /** Optional per-request id. Auto-generated when absent. */
  readonly request_id?: string;
}

/** Friendly input for {@link HadeClient.refine}. Either tone shorthand OR rich shape. */
export type RefineToneShorthand = "closer" | "faster" | "quieter";

export type RefineInput =
  | RefineToneShorthand
  | { readonly tone: RefineToneShorthand }
  | {
      readonly intent?: string | null;
      readonly urgency?: "low" | "medium" | "high";
      readonly radius_meters?: number;
      readonly categories?: readonly string[];
    };

/** Per-call options on every entry point. */
export interface DecideOptions {
  /** Caller-supplied cancellation source (e.g. the inbound HTTP signal). */
  readonly signal?: AbortSignal;
  /** Stable request correlation id. Overrides any `input.request_id`. */
  readonly requestId?: string;
  /** Per-call timeout override (milliseconds). */
  readonly timeoutMs?: number;
}

/**
 * The HADE client. Construction is synchronous and edge-safe; all I/O happens
 * inside `decide`/`refine` calls.
 */
export interface HadeClient {
  /** Pure structural assembly + adapter calls. Never throws — returns degraded output on failure. */
  decide(input: DecideInput, options?: DecideOptions): Promise<DecisionEngineOutput>;

  /** Adjusts the prior input and re-runs `decide`. `prior` is optional; the client tracks its last output. */
  refine(
    input: RefineInput,
    prior?: DecisionEngineOutput,
    options?: DecideOptions,
  ): Promise<DecisionEngineOutput>;

  /** Inspectable snapshot of resolved config (including `config_hash`). */
  getConfig(): ResolvedHadeConfig;

  /** Direct access to the wired adapter bundle. Useful for tests, mocks, custom orchestration. */
  readonly adapters: HadeAdapters;

  /** Lifecycle hook. Phase D adds adapter `close()` invocations; today a no-op. */
  close(): Promise<void>;
}

/** Re-export helper for narrowing in adapter implementations. */
export type { VenueContextLike };
export type { HadeConfig, HadeConfigDefaults, ResolvedHadeConfig };

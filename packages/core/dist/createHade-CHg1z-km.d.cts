import { b as DecisionEngineOutput } from './DecisionEngineOutput-RR3Y_eDj.cjs';
import { b as GeoCoords, H as HadeAdapters, P as PartialHadeAdapters } from './adapters-2-CsI3Kq.cjs';
import { ResolvedHadeConfig, HadeConfig } from './config/schema.cjs';

/**
 * HadeClient — the runtime value returned by {@link createHade}.
 *
 * Holds the resolved adapter bundle and merged config. Exposes `decide` and
 * `refine` as the primary entry points; adapters are accessible via
 * `client.adapters` for advanced callers (tests, mocks, custom orchestration).
 *
 * See plan: /Users/danielmeier/.claude/plans/you-are-a-senior-keen-sonnet.md §1
 */

/** Inputs accepted by {@link createHade}. All slots optional — sensible defaults applied. */
interface HadeClientConfig {
    readonly config?: HadeConfig;
    readonly adapters?: PartialHadeAdapters;
    /** Stable identifier used as a logging prefix and cache namespace. */
    readonly clientId?: string;
}
/**
 * Friendly input shape for {@link HadeClient.decide}. Coordinates may be
 * omitted — the configured GeoAdapter resolves them.
 */
interface DecideInput {
    readonly geo?: GeoCoords | null;
    readonly situation?: {
        readonly intent?: string | null;
    };
    readonly radius_meters?: number;
    readonly categories?: readonly string[];
    /** Optional per-request id. Auto-generated when absent. */
    readonly request_id?: string;
}
/** Friendly input for {@link HadeClient.refine}. Either tone shorthand OR rich shape. */
type RefineToneShorthand = "closer" | "faster" | "quieter";
type RefineInput = RefineToneShorthand | {
    readonly tone: RefineToneShorthand;
} | {
    readonly intent?: string | null;
    readonly urgency?: "low" | "medium" | "high";
    readonly radius_meters?: number;
    readonly categories?: readonly string[];
};
/** Per-call options on every entry point. */
interface DecideOptions {
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
interface HadeClient {
    /** Pure structural assembly + adapter calls. Never throws — returns degraded output on failure. */
    decide(input: DecideInput, options?: DecideOptions): Promise<DecisionEngineOutput>;
    /** Adjusts the prior input and re-runs `decide`. `prior` is optional; the client tracks its last output. */
    refine(input: RefineInput, prior?: DecisionEngineOutput, options?: DecideOptions): Promise<DecisionEngineOutput>;
    /** Inspectable snapshot of resolved config (including `config_hash`). */
    getConfig(): ResolvedHadeConfig;
    /** Direct access to the wired adapter bundle. Useful for tests, mocks, custom orchestration. */
    readonly adapters: HadeAdapters;
    /** Lifecycle hook. Phase D adds adapter `close()` invocations; today a no-op. */
    close(): Promise<void>;
}

/**
 * createHade — the v1.0 factory.
 *
 * Returns a {@link HadeClient} whose decide/refine methods orchestrate the
 * wired adapter bundle. Phase C delivers a minimal-but-real decide():
 *
 *   1. Resolve geo (caller-supplied OR via GeoAdapter)
 *   2. Call venue.searchForContext for candidates
 *   3. Build a DecisionEngineOutput via the existing buildDecisionEngineOutput
 *      (no synthetic ranking yet — that lands in Phase D/E)
 *
 * Failures degrade to a fallback output via DecisionSource = "static_tier3_fallback"
 * preserving the engine's existing no-key path.
 *
 * See plan: /Users/danielmeier/.claude/plans/you-are-a-senior-keen-sonnet.md §1
 */

/**
 * Builds and returns a HadeClient. Sync. Edge-safe. No I/O.
 *
 * If `clientConfig.adapters` is omitted (or partial), defaults are filled in:
 *   - venue → emptyVenues()
 *   - llm   → noopLLM()
 *   - cache → memoryCache()
 *   - geo   → staticGeo({ coords: DEFAULT_GEO })
 *
 * If `registerDefaultAdapters` has been called at app boot, those win over the
 * built-in defaults; explicit `adapters` in `clientConfig` wins over both.
 */
declare function createHade(clientConfig?: HadeClientConfig): HadeClient;

export { type DecideInput as D, type HadeClient as H, type RefineInput as R, type DecideOptions as a, type HadeClientConfig as b, type RefineToneShorthand as c, createHade as d };

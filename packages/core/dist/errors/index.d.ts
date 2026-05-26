import { a as AdapterKind } from '../adapters-2-CsI3Kq.js';

/**
 * Structured error type for @hade/core and every @hade/adapters-* package.
 *
 * Adapters never throw raw `Error` — they throw `HadeError` constructed via the
 * pre-bound `HadeErrorFactory` (see {@link createHadeErrorFactory}), which
 * guarantees `context.adapterKind` and `context.adapterName` on every error.
 *
 * The engine's `callAdapter` wrapper converts thrown `HadeError`s into a
 * typed `Result.err`, so the engine never wraps adapter calls in try/catch.
 *
 * See plan: /Users/danielmeier/.claude/plans/you-are-a-senior-keen-sonnet.md §3
 */

/** Adapter-attributable identity used in error logs and metrics. */
type AdapterName = `${string}@${string}`;
/** Stable error codes. Add new entries here; never remove or renumber existing ones. */
type HadeErrorCode = "ADAPTER_FAILED" | "ADAPTER_TIMEOUT" | "ADAPTER_NOT_CONFIGURED" | "ADAPTER_CANCELLED" | "CONFIG_INVALID" | "INPUT_INVALID" | "UNKNOWN";
/** Adapter kind union — kept here as a string so this file is import-cycle-free. */
type AdapterKindOrUnknown = AdapterKind | "unknown";
/** Context attached to every {@link HadeError}. */
interface HadeErrorContext {
    readonly adapterKind: AdapterKindOrUnknown;
    readonly adapterName: AdapterName | "unknown";
    readonly requestId?: string;
    readonly cause?: unknown;
    /** Free-form fields the engine or adapter may attach for log enrichment. */
    readonly fields?: Readonly<Record<string, unknown>>;
}
/** The canonical HADE error class. `instanceof HadeError` is the discriminator. */
declare class HadeError extends Error {
    readonly code: HadeErrorCode;
    readonly context: HadeErrorContext;
    constructor(code: HadeErrorCode, message: string, context: HadeErrorContext);
}
/** Convenience predicate. */
declare function isHadeError(value: unknown): value is HadeError;
/**
 * Pre-bound factory handed to adapters via `AdapterCallContext.errors`. Adapters
 * never construct `HadeError` directly — they call `ctx.errors.failed(...)`, etc.
 * This guarantees `adapterKind` and `adapterName` are always populated.
 */
interface HadeErrorFactory {
    failed(message: string, cause: unknown, fields?: Record<string, unknown>): HadeError;
    timeout(timeoutMs: number, fields?: Record<string, unknown>): HadeError;
    notConfigured(missing: string, fields?: Record<string, unknown>): HadeError;
    cancelled(reason?: string, fields?: Record<string, unknown>): HadeError;
}
/** Inputs for {@link createHadeErrorFactory}. */
interface CreateHadeErrorFactoryOptions {
    readonly adapterKind: AdapterKindOrUnknown;
    readonly adapterName: AdapterName | "unknown";
    readonly requestId?: string;
}
/**
 * Builds a {@link HadeErrorFactory} pre-bound to an adapter identity.
 * Engine code (createHade, callAdapter) constructs one factory per call;
 * adapter code receives it as `ctx.errors`.
 */
declare function createHadeErrorFactory(options: CreateHadeErrorFactoryOptions): HadeErrorFactory;

export { type AdapterName, type CreateHadeErrorFactoryOptions, HadeError, type HadeErrorCode, type HadeErrorContext, type HadeErrorFactory, createHadeErrorFactory, isHadeError };

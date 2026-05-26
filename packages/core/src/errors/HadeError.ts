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

import type { AdapterKind } from "../types/adapters.js";

/** Adapter-attributable identity used in error logs and metrics. */
export type AdapterName = `${string}@${string}`;

/** Stable error codes. Add new entries here; never remove or renumber existing ones. */
export type HadeErrorCode =
  | "ADAPTER_FAILED"
  | "ADAPTER_TIMEOUT"
  | "ADAPTER_NOT_CONFIGURED"
  | "ADAPTER_CANCELLED"
  | "CONFIG_INVALID"
  | "INPUT_INVALID"
  | "UNKNOWN";

/** Adapter kind union — kept here as a string so this file is import-cycle-free. */
type AdapterKindOrUnknown = AdapterKind | "unknown";

/** Context attached to every {@link HadeError}. */
export interface HadeErrorContext {
  readonly adapterKind: AdapterKindOrUnknown;
  readonly adapterName: AdapterName | "unknown";
  readonly requestId?: string;
  readonly cause?: unknown;
  /** Free-form fields the engine or adapter may attach for log enrichment. */
  readonly fields?: Readonly<Record<string, unknown>>;
}

/** The canonical HADE error class. `instanceof HadeError` is the discriminator. */
export class HadeError extends Error {
  readonly code: HadeErrorCode;
  readonly context: HadeErrorContext;

  constructor(code: HadeErrorCode, message: string, context: HadeErrorContext) {
    super(message);
    this.name = "HadeError";
    this.code = code;
    this.context = context;
    // Maintain prototype chain across ES targets (matters when downlevel emitted).
    Object.setPrototypeOf(this, HadeError.prototype);
  }
}

/** Convenience predicate. */
export function isHadeError(value: unknown): value is HadeError {
  return value instanceof HadeError;
}

/**
 * Pre-bound factory handed to adapters via `AdapterCallContext.errors`. Adapters
 * never construct `HadeError` directly — they call `ctx.errors.failed(...)`, etc.
 * This guarantees `adapterKind` and `adapterName` are always populated.
 */
export interface HadeErrorFactory {
  failed(message: string, cause: unknown, fields?: Record<string, unknown>): HadeError;
  timeout(timeoutMs: number, fields?: Record<string, unknown>): HadeError;
  notConfigured(missing: string, fields?: Record<string, unknown>): HadeError;
  cancelled(reason?: string, fields?: Record<string, unknown>): HadeError;
}

/** Inputs for {@link createHadeErrorFactory}. */
export interface CreateHadeErrorFactoryOptions {
  readonly adapterKind: AdapterKindOrUnknown;
  readonly adapterName: AdapterName | "unknown";
  readonly requestId?: string;
}

/**
 * Builds a {@link HadeErrorFactory} pre-bound to an adapter identity.
 * Engine code (createHade, callAdapter) constructs one factory per call;
 * adapter code receives it as `ctx.errors`.
 */
export function createHadeErrorFactory(options: CreateHadeErrorFactoryOptions): HadeErrorFactory {
  const baseContext = (): Pick<HadeErrorContext, "adapterKind" | "adapterName" | "requestId"> => ({
    adapterKind: options.adapterKind,
    adapterName: options.adapterName,
    requestId: options.requestId,
  });

  return {
    failed(message, cause, fields) {
      return new HadeError("ADAPTER_FAILED", message, {
        ...baseContext(),
        cause,
        fields,
      });
    },
    timeout(timeoutMs, fields) {
      return new HadeError("ADAPTER_TIMEOUT", `Adapter call timed out after ${timeoutMs}ms`, {
        ...baseContext(),
        fields: { ...fields, timeoutMs },
      });
    },
    notConfigured(missing, fields) {
      return new HadeError("ADAPTER_NOT_CONFIGURED", `Adapter missing configuration: ${missing}`, {
        ...baseContext(),
        fields: { ...fields, missing },
      });
    },
    cancelled(reason, fields) {
      return new HadeError("ADAPTER_CANCELLED", reason ?? "Adapter call cancelled", {
        ...baseContext(),
        fields,
      });
    },
  };
}

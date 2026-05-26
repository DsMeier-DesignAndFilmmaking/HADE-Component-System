/**
 * Engine-side wrapper for every adapter call.
 *
 * Responsibilities:
 *   • Enforce timeout via AbortController + Promise.race
 *   • Catch thrown errors (HadeError or otherwise) and convert to typed `Result.err`
 *   • Honor caller-supplied AbortSignal (composes with the internal timeout signal)
 *
 * The engine NEVER wraps adapter calls in try/catch. It calls this wrapper and
 * branches on the returned Result. Adapters that ignore the signal still get
 * cancelled at the wrapper boundary because Promise.race resolves whichever
 * settles first.
 *
 * Not re-exported from `packages/core/src/index.ts` — internal to @hade/core.
 *
 * See plan: /Users/danielmeier/.claude/plans/you-are-a-senior-keen-sonnet.md §3
 */

import {
  HadeError,
  type AdapterName,
  type HadeErrorCode,
  type HadeErrorFactory,
  createHadeErrorFactory,
  isHadeError,
} from "../errors/HadeError.js";
import type { AdapterKind } from "../types/adapters.js";

/** Discriminated union for typed success/failure without throwing. */
export type Result<T, E = HadeError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Inputs to {@link callAdapter}. */
export interface CallAdapterOptions {
  /** Per-call hard deadline. After this many ms the wrapper aborts. */
  readonly timeoutMs: number;
  /** Stable request correlation id. Propagated into errors. */
  readonly requestId?: string;
  /** Caller-supplied cancellation source (e.g. from the inbound HTTP request). */
  readonly parentSignal?: AbortSignal;
  /** Adapter identity, used for error attribution. */
  readonly adapter: {
    readonly kind: AdapterKind | "unknown";
    readonly name: AdapterName | "unknown";
  };
}

/**
 * Runs an adapter call with timeout + error capture.
 *
 * The `task` callback receives an `AdapterCallTools` bundle. Two things go in:
 *   - `signal`: aborts on either timeout OR parent cancellation
 *   - `errors`: pre-bound HadeErrorFactory the task uses to throw typed errors
 *
 * The task may:
 *   - resolve a value → `{ ok: true, value }`
 *   - throw a HadeError → `{ ok: false, error }`
 *   - throw anything else → `{ ok: false, error: wrapped HadeError }`
 *   - run past the deadline → `{ ok: false, error: timeout HadeError }`
 *
 * The wrapper itself NEVER throws.
 */
export interface AdapterCallTools {
  readonly signal: AbortSignal;
  readonly errors: HadeErrorFactory;
}

export async function callAdapter<T>(
  options: CallAdapterOptions,
  task: (tools: AdapterCallTools) => Promise<T>,
): Promise<Result<T, HadeError>> {
  const { timeoutMs, requestId, parentSignal, adapter } = options;

  const controller = new AbortController();
  const errors = createHadeErrorFactory({
    adapterKind: adapter.kind,
    adapterName: adapter.name,
    requestId,
  });

  if (parentSignal?.aborted) {
    return { ok: false, error: errors.cancelled("Cancelled before start") };
  }

  // The wrapper races three promises:
  //   1. the task's own resolution
  //   2. the timeout deadline
  //   3. the parent abort (when supplied)
  //
  // Whichever settles first wins. Independent of what the task does after its
  // own signal aborts (return, throw, hang), the wrapper resolves promptly —
  // matching standard fetch+AbortSignal semantics.

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(errors.timeout(timeoutMs));
    }, timeoutMs);
  });

  let parentAbortHandler: (() => void) | null = null;
  const parentAbortPromise = new Promise<never>((_, reject) => {
    if (!parentSignal) return; // pending forever — harmless, GC'd on settle
    parentAbortHandler = (): void => {
      controller.abort(parentSignal.reason);
      reject(errors.cancelled("Parent cancelled"));
    };
    parentSignal.addEventListener("abort", parentAbortHandler, { once: true });
  });

  const cleanup = (): void => {
    if (timeoutId !== null) clearTimeout(timeoutId);
    if (parentSignal && parentAbortHandler) {
      parentSignal.removeEventListener("abort", parentAbortHandler);
    }
  };

  try {
    const value = await Promise.race([
      task({ signal: controller.signal, errors }),
      timeoutPromise,
      parentAbortPromise,
    ]);
    cleanup();
    return { ok: true, value };
  } catch (raw: unknown) {
    cleanup();

    if (isHadeError(raw)) {
      return { ok: false, error: raw };
    }

    if (timedOut) {
      // The task's own rejection raced the timeout and won — still surface as timeout.
      return { ok: false, error: errors.timeout(timeoutMs) };
    }

    if (raw instanceof Error && raw.name === "AbortError") {
      return {
        ok: false,
        error: errors.cancelled(parentSignal?.aborted ? "Parent cancelled" : "Aborted"),
      };
    }

    return {
      ok: false,
      error: errors.failed(
        raw instanceof Error ? raw.message : "Unknown adapter failure",
        raw,
      ),
    };
  }
}

/** Re-exported for caller convenience — same name kept stable. */
export type { HadeErrorCode };

/**
 * SignalQueue — non-blocking UGC signal flush pipeline.
 *
 * Design contract:
 *  - enqueue() returns immediately; the caller's render cycle is never blocked.
 *  - Signals are batched and dispatched to POST /api/hade/signal on idle frames
 *    via requestIdleCallback (with a setTimeout(0) fallback for environments
 *    that don't support rIC, e.g. Node test runners).
 *  - On network failure: exponential backoff, max MAX_RETRIES attempts, then drop.
 *  - Fire-and-forget semantics: the client does not await the ingest result
 *    before continuing. node_versions are reconciled passively on the next decide().
 */

import type { VibeSignal, SignalIngestResponse } from "@/types/hade";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES    = 3;
const BASE_DELAY_MS  = 500;  // Initial retry backoff (doubles each attempt)
const INGEST_URL     = "/api/hade/signal";

// ─── Types ────────────────────────────────────────────────────────────────────

type FlushCallback = (response: SignalIngestResponse) => void;
type ErrorCallback = (error: Error, droppedSignals: VibeSignal[]) => void;

interface QueueOptions {
  /** Called after a successful flush. Use for debug/observability only. */
  onFlush?:  FlushCallback;
  /** Called after all retries are exhausted for a batch. */
  onError?:  ErrorCallback;
  /** Session ID forwarded with each ingest request. */
  sessionId?: string;
}

// ─── SignalQueue ──────────────────────────────────────────────────────────────

export class SignalQueue {
  private queue: VibeSignal[]    = [];
  private scheduled: boolean     = false;
  private readonly options: QueueOptions;

  constructor(options: QueueOptions = {}) {
    this.options = options;
  }

  /** Add a signal to the queue and schedule a flush on the next idle frame. */
  enqueue(signal: VibeSignal): void {
    this.queue.push(signal);
    this.scheduleFlush();
  }

  /** Drain all pending signals. Called automatically on idle; also safe to call manually. */
  flush(): void {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.queue.length); // drain atomically
    this.scheduled = false;

    this.dispatchWithRetry(batch, 0).catch(() => {
      // Error already handled inside dispatchWithRetry — swallow here
    });
  }

  /**
   * Synchronous-style flush that returns a Promise — awaitable before a decide() call.
   * Use this when you need signals to reach the server before the next request fires
   * (e.g., pivot() must not race with the signal it just emitted).
   *
   * Resolves after the network round-trip (or all retries). Never rejects.
   */
  async flushAsync(): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.queue.length); // drain atomically
    this.scheduled = false;

    try {
      await this.dispatchWithRetry(batch, 0);
    } catch {
      // Error already handled inside dispatchWithRetry — swallow here
    }
  }

  /** Update the session ID (e.g., after a new decide() call). */
  setSessionId(id: string | null): void {
    this.options.sessionId = id ?? undefined;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private scheduleFlush(): void {
    if (this.scheduled) return;
    this.scheduled = true;

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      window.requestIdleCallback(() => this.flush(), { timeout: 2000 });
    } else {
      setTimeout(() => this.flush(), 0);
    }
  }

  private async dispatchWithRetry(
    batch:   VibeSignal[],
    attempt: number,
  ): Promise<void> {
    try {
      const res = await fetch(INGEST_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signals:    batch,
          session_id: this.options.sessionId,
        }),
        // No credentials — signal ingest is public-key-free for MVP
      });

      if (!res.ok) {
        throw new Error(`[SignalQueue] HTTP ${res.status} from ${INGEST_URL}`);
      }

      const data = (await res.json()) as SignalIngestResponse;
      this.options.onFlush?.(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
        return this.dispatchWithRetry(batch, attempt + 1);
      }

      // All retries exhausted — invoke error callback and drop
      this.options.onError?.(error, batch);
    }
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

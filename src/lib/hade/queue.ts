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
 *
 * Offline durability:
 *  - When navigator.onLine === false, batches are persisted to IndexedDB via
 *    idb-keyval (key "hade:queue:pending") instead of attempting a fetch.
 *  - A Background Sync tag is registered so the SW can notify on reconnect.
 *  - On the "online" event, the persisted queue is drained first (oldest signals
 *    first), then any in-memory queue is flushed.
 *  - The persisted store is only cleared after all signal IDs appear in sentIds
 *    (i.e. after confirmed server acknowledgement).
 *
 * Deduplication:
 *  - sentIds (in-memory Set, session-scoped) tracks every signal ID that has
 *    been confirmed sent. Any replay path filters against this set so the same
 *    signal is never POSTed twice, even across the SW and app paths.
 */

import type { VibeSignal, SignalIngestResponse } from "@/types/hade";
import { getDeviceId } from "@/lib/hade/deviceId";
import { get, set, del } from "idb-keyval";

// Background Sync is not yet in the standard lib types.
type SyncCapableSW = ServiceWorkerRegistration & {
  sync?: { register: (tag: string) => Promise<void> };
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES    = 3;
const BASE_DELAY_MS  = 500;  // Initial retry backoff (doubles each attempt)
const INGEST_URL     = "/api/hade/signal";
/** idb-keyval key for the app-side offline persistence store. */
const IDB_KEY        = "hade:queue:pending";

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
  /**
   * In-memory deduplication set. Tracks signal IDs confirmed sent this session.
   * Prevents double-send when the same signal could appear in both the
   * idb-keyval (app offline path) and SW (failed-fetch path) stores.
   * Session-scoped only — never persisted across page reloads.
   */
  private readonly sentIds       = new Set<string>();

  constructor(options: QueueOptions = {}) {
    this.options = options;
    this.setupOnlineListener();
  }

  /** Add a signal to the queue and schedule a flush on the next idle frame. */
  enqueue(signal: VibeSignal): void {
    this.queue.push(signal);
    this.scheduleFlush();
  }

  /**
   * Drain all pending signals. Called automatically on idle; also safe to call manually.
   * If offline, persists the batch to IndexedDB instead of attempting a fetch.
   */
  flush(): void {
    if (this.queue.length === 0) return;

    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    const batch = this.queue.splice(0, this.queue.length); // drain atomically
    this.scheduled = false;

    if (isOffline) {
      void this.persistOffline(batch);
      return;
    }

    this.dispatchWithRetry(batch, 0).catch(() => {
      // Error already handled inside dispatchWithRetry — swallow here
    });
  }

  /**
   * Synchronous-style flush that returns a Promise — awaitable before a decide() call.
   * Use this when you need signals to reach the server before the next request fires
   * (e.g., pivot() must not race with the signal it just emitted).
   * If offline, awaits the IndexedDB persist before returning.
   *
   * Resolves after the network round-trip (or persist). Never rejects.
   */
  async flushAsync(): Promise<void> {
    if (this.queue.length === 0) return;

    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    const batch = this.queue.splice(0, this.queue.length); // drain atomically
    this.scheduled = false;

    if (isOffline) {
      await this.persistOffline(batch);
      return;
    }

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

  /**
   * Persist a batch to idb-keyval when the device is offline.
   *
   * Merges incoming signals into the existing persisted array, deduplicating by
   * signal ID against both the existing store and sentIds. Registers a Background
   * Sync tag as a best-effort hint — if the tab closes, the SW's sync event drains
   * the SW's own hade-offline queue; the app's idb-keyval signals are replayed
   * by the online listener when the tab next opens.
   *
   * Never throws — if persistence fails, signals are dropped on close, which is
   * the same behaviour as before this change was introduced.
   */
  private async persistOffline(batch: VibeSignal[]): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      const existing    = (await get<VibeSignal[]>(IDB_KEY)) ?? [];
      const existingIds = new Set(existing.map((s) => s.id));
      const incoming    = batch.filter(
        (s) => !existingIds.has(s.id) && !this.sentIds.has(s.id),
      );
      if (incoming.length > 0) {
        await set(IDB_KEY, [...existing, ...incoming]);
      }
      // Best-effort Background Sync registration
      const reg = await navigator.serviceWorker?.ready;
      const syncManager = (reg as SyncCapableSW | undefined)?.sync;
      if (syncManager) {
        await syncManager.register("hade-signals");
      }
    } catch {
      // Best-effort — signals are dropped on close if persistence fails
    }
  }

  /**
   * Drain the idb-keyval persisted queue on reconnect.
   *
   * Filters already-sent signal IDs before dispatching. Only clears the store
   * after all signals in the batch are confirmed sent (sentIds growth check).
   * If the dispatch fails (all retries exhausted), the store is left intact so
   * the next reconnect can retry.
   */
  private async drainPersisted(): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      const persisted = await get<VibeSignal[]>(IDB_KEY);
      if (!persisted || persisted.length === 0) return;

      const toSend = persisted.filter((s) => !this.sentIds.has(s.id));
      if (toSend.length === 0) {
        await del(IDB_KEY);
        return;
      }

      const sizeBefore = this.sentIds.size;
      await this.dispatchWithRetry(toSend, 0);

      // dispatchWithRetry never throws on exhaustion (calls onError and returns
      // normally), so we check sentIds growth to detect success.
      const allSent = this.sentIds.size - sizeBefore === toSend.length;
      if (allSent) {
        await del(IDB_KEY);
      }
      // else: leave persisted for next reconnect attempt
    } catch {
      // Leave persisted for next reconnect
    }
  }

  /**
   * Registers a one-time window "online" listener.
   * Drain order: IndexedDB first (older, offline-persisted signals), then in-memory.
   * Gated behind typeof window check — safe in SSR / Node test runners.
   */
  private setupOnlineListener(): void {
    if (typeof window === "undefined") return;
    window.addEventListener("online", () => {
      this.drainPersisted()
        .then(() => {
          if (this.queue.length > 0) {
            this.flush();
          }
        })
        .catch(() => {});
    });
  }

  private async dispatchWithRetry(
    batch:   VibeSignal[],
    attempt: number,
  ): Promise<void> {
    // Deduplication guard — skip any signal already confirmed sent this session
    const toSend = batch.filter((s) => !this.sentIds.has(s.id));
    if (toSend.length === 0) return;

    try {
      const res = await fetch(INGEST_URL, {
        method:  "POST",
        headers: {
          "Content-Type":     "application/json",
          "x-hade-device-id": getDeviceId(),
        },
        body: JSON.stringify({
          signals:    toSend,
          session_id: this.options.sessionId,
        }),
        // No credentials — signal ingest is public-key-free for MVP
      });

      if (!res.ok) {
        throw new Error(`[SignalQueue] HTTP ${res.status} from ${INGEST_URL}`);
      }

      const data = (await res.json()) as SignalIngestResponse;
      // Mark all as sent AFTER confirmed server acknowledgement
      toSend.forEach((s) => this.sentIds.add(s.id));
      this.options.onFlush?.(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
        // Pass toSend (already deduped) rather than original batch
        return this.dispatchWithRetry(toSend, attempt + 1);
      }

      // All retries exhausted — invoke error callback and drop
      this.options.onError?.(error, toSend);
    }
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

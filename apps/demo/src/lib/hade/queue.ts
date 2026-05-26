/**
 * HADE Signal Queue (UI ONLY)
 *
 * ⚠️ DO NOT SEND NETWORK REQUESTS FROM THIS FILE
 * Service Worker is the only execution layer responsible for delivery.
 */

import type { VibeSignal, SignalIngestResponse } from "@/types/hade";
import { get, set } from "idb-keyval";

type SyncCapableSW = ServiceWorkerRegistration & {
  sync?: { register: (tag: string) => Promise<void> };
};

const IDB_KEY = "hade:queue:pending";
const SYNC_TAG = "hade-signals";
const FLUSH_MESSAGE = "HADE_SIGNAL_FLUSH";

type FlushCallback = (response: SignalIngestResponse) => void;
type ErrorCallback = (error: Error, droppedSignals: VibeSignal[]) => void;

interface QueueOptions {
  onFlush?: FlushCallback;
  onError?: ErrorCallback;
  sessionId?: string;
}

export async function enqueueSignal(signal: VibeSignal): Promise<void> {
  const pending = (await get<VibeSignal[]>(IDB_KEY)) ?? [];

  if (pending.some((entry) => entry.id === signal.id)) {
    return;
  }

  await set(IDB_KEY, [...pending, signal]);
  await registerBackgroundSync();
}

export class SignalQueue {
  private queue: VibeSignal[] = [];
  private scheduled = false;
  private readonly options: QueueOptions;
  private readonly pendingWrites = new Map<string, Promise<void>>();

  constructor(options: QueueOptions = {}) {
    this.options = options;
  }

  enqueue(signal: VibeSignal): void {
    this.queue.push(signal);
    console.log(`[HADE stability] signal_enqueue | queue_size=${this.queue.length} | id=${signal.id.slice(0, 16)}`);

    const write = enqueueSignal(signal)
      .catch((error: unknown) => {
        const resolved =
          error instanceof Error ? error : new Error(String(error));
        this.options.onError?.(resolved, [signal]);
      })
      .finally(() => {
        if (this.pendingWrites.get(signal.id) === write) {
          this.pendingWrites.delete(signal.id);
        }
      });

    this.pendingWrites.set(signal.id, write);
    this.scheduleFlush();
  }

  flush(): void {
    void this.flushAsync();
  }

  async flushAsync(): Promise<void> {
    if (this.pendingWrites.size > 0) {
      await Promise.allSettled([...this.pendingWrites.values()]);
    }

    console.log(`[HADE stability] signal_flush | flushing queue_size=${this.queue.length}`);
    this.queue = [];
    this.scheduled = false;

    if (typeof window !== "undefined" && navigator.serviceWorker) {
      await requestServiceWorkerFlush();
      return;
    }
  }

  setSessionId(id: string | null): void {
    this.options.sessionId = id ?? undefined;
  }

  private scheduleFlush(): void {
    if (this.scheduled) return;
    this.scheduled = true;

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      window.requestIdleCallback(() => this.flush(), { timeout: 2000 });
      return;
    }

    setTimeout(() => this.flush(), 0);
  }
}

async function registerBackgroundSync(): Promise<void> {
  if (typeof window === "undefined" || !navigator.serviceWorker) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const syncManager = (registration as SyncCapableSW).sync;

    if (syncManager) {
      await syncManager.register(SYNC_TAG);
    }
  } catch {
    // Best-effort persistence only; delivery remains SW-owned.
  }
}

async function requestServiceWorkerFlush(): Promise<void> {
  if (typeof window === "undefined" || !navigator.serviceWorker) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const target =
      navigator.serviceWorker.controller ??
      registration.active ??
      registration.waiting ??
      registration.installing;

    if (!target) {
      return;
    }

    await new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      const timeout = window.setTimeout(resolve, 2000);

      channel.port1.onmessage = () => {
        window.clearTimeout(timeout);
        resolve();
      };

      target.postMessage({ type: FLUSH_MESSAGE }, [channel.port2]);
    });
  } catch {
    // The queue is already durable in IndexedDB.
  }
}

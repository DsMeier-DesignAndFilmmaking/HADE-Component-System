/// <reference lib="WebWorker" />

import { defaultCache } from "@serwist/next/worker";
import { del, get, set } from "idb-keyval";
import type {
  PrecacheEntry,
  SerwistGlobalConfig,
  BackgroundSyncQueueEntry,
} from "serwist";
import { BackgroundSyncQueue, Serwist } from "serwist";
import type { SignalIngestRequest, VibeSignal } from "@/types/hade";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const INGEST_PATH = "/api/hade/signal";
const UI_PENDING_KEY = "hade:queue:pending";
const SEEN_KEY = "hade:sw:seen";
const FLUSH_MESSAGE = "HADE_SIGNAL_FLUSH";

const seenIds = new Set<string>();
let seenLoadPromise: Promise<void> | null = null;

const signalQueue = new BackgroundSyncQueue("hade-signals", {
  maxRetentionTime: 24 * 60,
  onSync: async ({ queue }) => {
    await drainPendingSignals();
    await replayQueuedRequests(queue);
  },
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.registerCapture(
  ({ url, request }) =>
    url.origin === self.location.origin &&
    url.pathname === INGEST_PATH &&
    request.method === "POST",
  async ({ request }) => handleSignalPost(request),
  "POST",
);

self.addEventListener("message", (event) => {
  const messageEvent = event as ExtendableMessageEvent;

  if (messageEvent.data?.type !== FLUSH_MESSAGE) {
    return;
  }

  messageEvent.waitUntil(
    drainPendingSignals()
      .catch(() => undefined)
      .then(() => {
        messageEvent.ports[0]?.postMessage({ ok: true });
      }),
  );
});

serwist.addEventListeners();
void drainPendingSignals().catch(() => undefined);

async function handleSignalPost(request: Request): Promise<Response> {
  const payload = await parseSignalRequest(request.clone());

  if (!payload) {
    return fetch(request);
  }

  const unseenSignals = await filterUnseenSignals(payload.signals);

  if (unseenSignals.length === 0) {
    return createAcceptedResponse([]);
  }

  const signalIds = unseenSignals.map((signal) => signal.id);
  await markSeenIds(signalIds);

  if (isOffline()) {
    try {
      await enqueueRetryBatch(unseenSignals, payload.session_id);
      return createAcceptedResponse([]);
    } catch (error) {
      await forgetSeenIds(signalIds);
      throw error;
    }
  }

  try {
    const response = await fetch(buildSignalRequest(unseenSignals, payload.session_id));
    await removePendingSignals(signalIds);
    return response;
  } catch {
    try {
      await enqueueRetryBatch(unseenSignals, payload.session_id);
      return createAcceptedResponse([]);
    } catch (error) {
      await forgetSeenIds(signalIds);
      throw error;
    }
  }
}

async function drainPendingSignals(): Promise<void> {
  const pending = uniqueSignals((await get<VibeSignal[]>(UI_PENDING_KEY)) ?? []);

  if (pending.length === 0) {
    return;
  }

  const unseenSignals = await filterUnseenSignals(pending);

  if (unseenSignals.length === 0) {
    return;
  }

  const signalIds = unseenSignals.map((signal) => signal.id);
  await markSeenIds(signalIds);

  if (isOffline()) {
    try {
      await enqueueRetryBatch(unseenSignals);
      return;
    } catch (error) {
      await forgetSeenIds(signalIds);
      throw error;
    }
  }

  try {
    await fetch(buildSignalRequest(unseenSignals));
    await removePendingSignals(signalIds);
  } catch {
    try {
      await enqueueRetryBatch(unseenSignals);
    } catch (error) {
      await forgetSeenIds(signalIds);
      throw error;
    }
  }
}

async function replayQueuedRequests(
  queue: BackgroundSyncQueue,
): Promise<void> {
  let entry: BackgroundSyncQueueEntry | undefined;

  while ((entry = await queue.shiftRequest())) {
    const signalIds = getEntrySignalIds(entry);

    try {
      await fetch(entry.request.clone());
      if (signalIds.length > 0) {
        await removePendingSignals(signalIds);
      }
    } catch (error) {
      await queue.unshiftRequest(entry);
      throw error;
    }
  }
}

async function filterUnseenSignals(
  signals: VibeSignal[],
): Promise<VibeSignal[]> {
  const unseen: VibeSignal[] = [];

  for (const signal of uniqueSignals(signals)) {
    if (!(await hasSeen(signal.id))) {
      unseen.push(signal);
    }
  }

  return unseen;
}

async function hasSeen(id: string | undefined): Promise<boolean> {
  if (!id) {
    return false;
  }

  await loadSeenIds();
  return seenIds.has(id);
}

async function markSeenIds(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  await loadSeenIds();

  let changed = false;
  for (const id of ids) {
    if (!seenIds.has(id)) {
      seenIds.add(id);
      changed = true;
    }
  }

  if (changed) {
    await set(SEEN_KEY, [...seenIds]);
  }
}

async function forgetSeenIds(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  await loadSeenIds();

  let changed = false;
  for (const id of ids) {
    if (seenIds.delete(id)) {
      changed = true;
    }
  }

  if (changed) {
    await set(SEEN_KEY, [...seenIds]);
  }
}

async function loadSeenIds(): Promise<void> {
  if (!seenLoadPromise) {
    seenLoadPromise = (async () => {
      const stored = (await get<string[]>(SEEN_KEY)) ?? [];
      for (const id of stored) {
        seenIds.add(id);
      }
    })();
  }

  await seenLoadPromise;
}

async function enqueueRetryBatch(
  signals: VibeSignal[],
  sessionId?: string,
): Promise<void> {
  const request = buildSignalRequest(signals, sessionId);
  const signalIds = signals.map((signal) => signal.id);

  await signalQueue.pushRequest({
    request,
    metadata: { signalIds },
  });
}

async function removePendingSignals(signalIds: string[]): Promise<void> {
  if (signalIds.length === 0) {
    return;
  }

  const pending = (await get<VibeSignal[]>(UI_PENDING_KEY)) ?? [];
  const pendingIds = new Set(signalIds);
  const remaining = pending.filter((signal) => !pendingIds.has(signal.id));

  if (remaining.length === 0) {
    await del(UI_PENDING_KEY);
    return;
  }

  await set(UI_PENDING_KEY, remaining);
}

function buildSignalRequest(
  signals: VibeSignal[],
  sessionId?: string,
): Request {
  const headers = new Headers({
    "Content-Type": "application/json",
  });

  const deviceId = signals.find((signal) => signal.source_user_id)?.source_user_id;
  if (deviceId) {
    headers.set("x-hade-device-id", deviceId);
  }

  const body: SignalIngestRequest = { signals };
  if (sessionId) {
    body.session_id = sessionId;
  }

  return new Request(new URL(INGEST_PATH, self.location.origin).toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function parseSignalRequest(
  request: Request,
): Promise<SignalIngestRequest | null> {
  try {
    const body = (await request.json()) as Partial<SignalIngestRequest>;
    if (!Array.isArray(body.signals)) {
      return null;
    }

    return {
      signals: uniqueSignals(body.signals.filter(isSignal)),
      session_id: body.session_id ?? undefined,
    };
  } catch {
    return null;
  }
}

function getEntrySignalIds(entry: BackgroundSyncQueueEntry): string[] {
  const value = entry.metadata?.signalIds;
  if (Array.isArray(value)) {
    return value.filter((id): id is string => typeof id === "string");
  }

  return [];
}

function uniqueSignals(signals: VibeSignal[]): VibeSignal[] {
  const deduped = new Map<string, VibeSignal>();

  for (const signal of signals) {
    deduped.set(signal.id, signal);
  }

  return [...deduped.values()];
}

function isSignal(value: unknown): value is VibeSignal {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      typeof (value as { id: unknown }).id === "string",
  );
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && "onLine" in navigator && navigator.onLine === false;
}

function createAcceptedResponse(signalIds: string[]): Response {
  return new Response(
    JSON.stringify({
      accepted: 0,
      rejected: 0,
      signal_ids: signalIds,
      node_versions: {},
    }),
    {
      status: 202,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

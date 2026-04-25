const DB_NAME = "hade-offline";
const STORE_NAME = "hade:queue:pending";
const SYNC_TAG = "hade-signals";
const SIGNAL_PATH = "/api/hade/signal";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function withStore(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const result = fn(store);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function getAllQueuedSignals() {
  return withStore("readonly", (store) =>
    new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    }),
  );
}

function addQueuedSignal(entry) {
  return withStore("readwrite", (store) =>
    new Promise((resolve, reject) => {
      const req = store.add(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }),
  );
}

function removeQueuedSignal(id) {
  return withStore("readwrite", (store) =>
    new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }),
  );
}

function clearQueue() {
  return withStore("readwrite", (store) =>
    new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }),
  );
}

function requestToQueueEntry(request, bodyText) {
  const headers = {};
  for (const [k, v] of request.headers.entries()) {
    headers[k] = v;
  }
  return {
    url: request.url,
    method: request.method,
    headers,
    body: bodyText,
    timestamp: Date.now(),
  };
}

async function registerSignalSync() {
  if (!self.registration || !self.registration.sync) return;
  try {
    await self.registration.sync.register(SYNC_TAG);
  } catch {
    // Best-effort; replay can still occur on next startup/fetch.
  }
}

async function enqueueSignalRequest(request) {
  const body = await request.clone().text();
  await addQueuedSignal(requestToQueueEntry(request, body));
  await registerSignalSync();
}

async function processQueue() {
  const queue = await getAllQueuedSignals();
  if (!queue.length) {
    await clearQueue();
    return;
  }

  for (const req of queue) {
    try {
      const res = await fetch(req.url, {
        method: "POST",
        headers: req.headers,
        body: req.body,
      });
      if (!res.ok) {
        break;
      }
      await removeQueuedSignal(req.id);
    } catch {
      break;
    }
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(processQueue());
  }
});

self.addEventListener("online", () => {
  if (self.registration && self.registration.sync) {
    self.registration.sync.register(SYNC_TAG);
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "POST") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname !== SIGNAL_PATH) return;

  event.respondWith(
    (async () => {
      try {
        return await fetch(req.clone());
      } catch {
        await enqueueSignalRequest(req.clone());
        return new Response(
          JSON.stringify({
            accepted: 0,
            rejected: 0,
            signal_ids: [],
            node_versions: {},
          }),
          {
            status: 202,
            headers: {
              "Content-Type": "application/json",
              "x-hade-queued": "1",
            },
          },
        );
      }
    })(),
  );
});

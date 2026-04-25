"use client";

import { useEffect } from "react";

const SYNC_TAG = "hade-signals";

type SyncCapableSW = ServiceWorkerRegistration & {
  sync?: {
    register: (tag: string) => Promise<void>;
  };
};

export function PwaServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let onlineHandler: (() => void) | null = null;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const syncManager = (registration as SyncCapableSW).sync;
        if (syncManager) {
          await syncManager.register(SYNC_TAG).catch(() => undefined);
        }

        onlineHandler = () => {
          navigator.serviceWorker.ready
            .then((reg) => {
              const sm = (reg as SyncCapableSW).sync;
              if (sm) {
                return sm.register(SYNC_TAG).catch(() => undefined);
              }
              return undefined;
            })
            .catch(() => undefined);
        };

        window.addEventListener("online", onlineHandler);
      } catch {
        // Best-effort registration; app remains usable without SW.
      }
    };

    void register();

    return () => {
      if (onlineHandler) {
        window.removeEventListener("online", onlineHandler);
      }
    };
  }, []);

  return null;
}

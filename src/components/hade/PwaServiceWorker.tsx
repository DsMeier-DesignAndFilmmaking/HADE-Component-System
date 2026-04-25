"use client";

import { useEffect } from "react";

const SYNC_TAG = "hade-signals";

export function PwaServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let onlineHandler: (() => void) | null = null;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        if ("sync" in registration) {
          await registration.sync.register(SYNC_TAG).catch(() => undefined);
        }

        onlineHandler = () => {
          navigator.serviceWorker.ready
            .then((reg) => {
              if ("sync" in reg) {
                return reg.sync.register(SYNC_TAG).catch(() => undefined);
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

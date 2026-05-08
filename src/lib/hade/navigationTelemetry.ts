import type { VibeSignal } from "@/types/hade";
import { getDeviceId } from "./deviceId";
import { enqueueSignal } from "./queue";

const INGEST_PATH = "/api/hade/signal";
const emittedConversions = new Set<string>();

export interface NavigationTelemetryInput {
  objectId: string;
  title: string;
  lat: number;
  lng: number;
  url: string;
  platform: string;
  coordinatesValid: boolean;
}

function buildConversionSignal(input: NavigationTelemetryInput): VibeSignal {
  const now = new Date();
  const expires = new Date(now.getTime() + 14_400_000);

  return {
    id: `nav_${input.objectId}_${Math.round(input.lat * 1e6)}_${Math.round(input.lng * 1e6)}`,
    type: "INTENT",
    venue_id: input.objectId,
    location_node_id: input.objectId,
    content: "navigation_conversion",
    strength: 1,
    emitted_at: now.toISOString(),
    expires_at: expires.toISOString(),
    geo: { lat: input.lat, lng: input.lng },
    event_id: input.objectId,
    source_user_id: getDeviceId(),
    source: "user",
    category: "vibe",
    shareable: false,
    validation_status: "pending",
    vibe_tags: ["worth_it"],
    sentiment: "positive",
  };
}

export function recordNavigationTelemetry(input: NavigationTelemetryInput): void {
  const dedupeKey = `${input.objectId}:${input.url}`;

  if (emittedConversions.has(dedupeKey)) {
    console.debug("[HADE TELEMETRY]", {
      event: "navigation_conversion_deduped",
      objectId: input.objectId,
      url: input.url,
    });
    return;
  }

  emittedConversions.add(dedupeKey);

  const signal = buildConversionSignal(input);
  const payload = { signals: [signal] };
  const body = JSON.stringify(payload);

  console.debug("[HADE TELEMETRY]", {
    event: "navigation_conversion_prepared",
    endpoint: INGEST_PATH,
    signalId: signal.id,
    objectId: input.objectId,
    platform: input.platform,
    coordinatesValid: input.coordinatesValid,
    url: input.url,
    payloadShape: {
      signals: payload.signals.length,
      signalKeys: Object.keys(signal).sort(),
    },
  });

  if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
    const accepted = navigator.sendBeacon(
      INGEST_PATH,
      new Blob([body], { type: "application/json" }),
    );

    console.debug("[HADE TELEMETRY]", {
      event: accepted ? "sendBeacon_accepted" : "sendBeacon_rejected",
      signalId: signal.id,
    });

    if (accepted) return;
  }

  void enqueueSignal(signal).then(
    () => {
      console.debug("[HADE TELEMETRY]", {
        event: "queued_after_beacon_unavailable",
        signalId: signal.id,
      });
    },
    (error: unknown) => {
      console.warn("[HADE TELEMETRY]", {
        event: "queue_fallback_failed",
        signalId: signal.id,
        error,
      });
    },
  );

  if (typeof fetch !== "undefined") {
    void fetch(INGEST_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hade-device-id": signal.source_user_id ?? "unknown",
      },
      body,
      keepalive: true,
    }).then(
      () => {
        console.debug("[HADE TELEMETRY]", {
          event: "fetch_keepalive_dispatched",
          signalId: signal.id,
        });
      },
      (error: unknown) => {
        console.warn("[HADE TELEMETRY]", {
          event: "fetch_keepalive_failed",
          signalId: signal.id,
          error,
        });
      },
    );
  }
}

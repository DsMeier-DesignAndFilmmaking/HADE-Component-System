import type { Signal, SignalType, GeoLocation } from "@/types/hade";

// ─── Emit ─────────────────────────────────────────────────────────────────────

/**
 * Constructs a new Signal with sensible defaults.
 * TTL: PRESENCE 30m, EVENT 24h, others 2h.
 */
export function emitSignal(
  type: SignalType,
  payload: Partial<Signal> = {}
): Signal {
  const now = new Date();
  const ttlMs = getDefaultTTL(type);
  const expires = new Date(now.getTime() + ttlMs);

  return {
    id: payload.id ?? generateId(),
    type,
    venue_id: payload.venue_id ?? null,
    content: payload.content ?? null,
    strength: payload.strength ?? 0.7,
    emitted_at: payload.emitted_at ?? now.toISOString(),
    expires_at: payload.expires_at ?? expires.toISOString(),
    geo: payload.geo ?? { lat: 0, lng: 0 },
    event_id: payload.event_id ?? null,
    source_user_id: payload.source_user_id ?? null,
  };
}

function getDefaultTTL(type: SignalType): number {
  const ttlMap: Record<SignalType, number> = {
    PRESENCE: 30 * 60 * 1000,        // 30 min
    SOCIAL_RELAY: 2 * 60 * 60 * 1000, // 2 hr
    ENVIRONMENTAL: 1 * 60 * 60 * 1000, // 1 hr
    BEHAVIORAL: 2 * 60 * 60 * 1000,   // 2 hr
    AMBIENT: 4 * 60 * 60 * 1000,      // 4 hr
    EVENT: 24 * 60 * 60 * 1000,       // 24 hr
    INTENT: 2 * 60 * 60 * 1000,       // 2 hr
  };
  return ttlMap[type];
}

// ─── Aggregate ───────────────────────────────────────────────────────────────

/**
 * Deduplicates and merges signals from the same source/venue.
 * When two signals share (type + venue_id), keeps the more recent one
 * and averages their strength.
 */
export function aggregateSignals(signals: Signal[]): Signal[] {
  const map = new Map<string, Signal>();

  for (const sig of signals) {
    const key = `${sig.type}::${sig.venue_id ?? sig.id}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, { ...sig });
    } else {
      // Keep more recent timestamp, average strength
      const existingDate = new Date(existing.emitted_at).getTime();
      const incomingDate = new Date(sig.emitted_at).getTime();
      map.set(key, {
        ...(incomingDate > existingDate ? sig : existing),
        strength: (existing.strength + sig.strength) / 2,
      });
    }
  }

  return Array.from(map.values());
}

// ─── Filter ───────────────────────────────────────────────────────────────────

/** Removes signals whose expires_at is in the past. */
export function filterExpiredSignals(signals: Signal[]): Signal[] {
  const now = Date.now();
  return signals.filter((s) => new Date(s.expires_at).getTime() > now);
}

/** Filters signals by one or more types. */
export function filterByType(signals: Signal[], types: SignalType[]): Signal[] {
  return signals.filter((s) => types.includes(s.type));
}

/** Filters signals by minimum strength threshold. */
export function filterByStrength(signals: Signal[], minStrength: number): Signal[] {
  return signals.filter((s) => s.strength >= minStrength);
}

// ─── Trust Weighting ─────────────────────────────────────────────────────────

/**
 * Adjusts signal strength based on social graph edge weights.
 * socialEdgeMap: { source_user_id → edge_weight (0–1) }
 *
 * SOCIAL_RELAY signals from close connections get a boost (×1.5 max).
 * Signals with no known source are kept as-is.
 */
export function weightByTrust(
  signals: Signal[],
  socialEdgeMap: Record<string, number>
): Signal[] {
  return signals.map((sig) => {
    if (!sig.source_user_id) return sig;

    const edgeWeight = socialEdgeMap[sig.source_user_id];
    if (edgeWeight === undefined) return sig;

    const boost = sig.type === "SOCIAL_RELAY" ? 1.5 : 1.2;
    const weighted = Math.min(1, sig.strength * (1 + edgeWeight * (boost - 1)));

    return { ...sig, strength: weighted };
  });
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

/** Sorts signals by strength descending, then by recency. */
export function sortSignals(signals: Signal[]): Signal[] {
  return [...signals].sort((a, b) => {
    if (b.strength !== a.strength) return b.strength - a.strength;
    return (
      new Date(b.emitted_at).getTime() - new Date(a.emitted_at).getTime()
    );
  });
}

// ─── Signal Meta ─────────────────────────────────────────────────────────────

/** Returns a human-readable label for a signal type. */
export function signalTypeLabel(type: SignalType): string {
  const labels: Record<SignalType, string> = {
    PRESENCE: "Presence",
    SOCIAL_RELAY: "Social Relay",
    ENVIRONMENTAL: "Environmental",
    BEHAVIORAL: "Behavioral",
    AMBIENT: "Ambient",
    EVENT: "Event",
    INTENT: "Intent",
  };
  return labels[type];
}

/** Returns the Tailwind color class for a signal type. */
export function signalTypeColor(type: SignalType): string {
  const colors: Record<SignalType, string> = {
    PRESENCE: "signal-presence",
    SOCIAL_RELAY: "signal-social",
    ENVIRONMENTAL: "signal-environmental",
    BEHAVIORAL: "signal-behavioral",
    AMBIENT: "signal-ambient",
    EVENT: "signal-event",
    INTENT: "signal-intent",
  };
  return colors[type];
}

/** Returns hex color for a signal type (for use outside Tailwind). */
export function signalTypeHex(type: SignalType): string {
  const hex: Record<SignalType, string> = {
    PRESENCE: "#10B981",
    SOCIAL_RELAY: "#8B5CF6",
    ENVIRONMENTAL: "#3B82F6",
    BEHAVIORAL: "#F59E0B",
    AMBIENT: "#EC4899",
    EVENT: "#EF4444",
    INTENT: "#14B8A6",
  };
  return hex[type];
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function generateId(): string {
  return `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatTimeAgo(isoTimestamp: string): string {
  const diff = Date.now() - new Date(isoTimestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

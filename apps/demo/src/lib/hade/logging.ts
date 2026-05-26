type LogLevel = "debug" | "log" | "warn" | "error";

type GeoLike = {
  lat?: unknown;
  lng?: unknown;
};

const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z_-]{20,}/g,
  /sk-[0-9A-Za-z_-]{16,}/g,
  /(x-api-key["':\s]+)[^"',\s}]+/gi,
  /(api[_-]?key["':\s]+)[^"',\s}]+/gi,
  /(authorization["':\s]+bearer\s+)[^"',\s}]+/gi,
];

export function hadeDebugLogsEnabled(): boolean {
  return (
    process.env.HADE_DEBUG_LOGS === "true" ||
    process.env.NEXT_PUBLIC_HADE_DEBUG_LOGS === "true"
  );
}

export function roundGeo<T extends GeoLike | null | undefined>(
  geo: T,
): { lat: number; lng: number } | null {
  const lat = geo?.lat;
  const lng = geo?.lng;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }
  return {
    lat: Number(lat.toFixed(3)),
    lng: Number(lng.toFixed(3)),
  };
}

export function sanitizeLogText(value: unknown): string {
  const raw =
    value instanceof Error
      ? `${value.name}: ${value.message}`
      : typeof value === "string"
        ? value
        : JSON.stringify(value);

  return SECRET_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, "$1[redacted]"),
    raw,
  ).slice(0, 500);
}

export function safeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: sanitizeLogText(error.message),
    };
  }
  return {
    name: "Error",
    message: sanitizeLogText(error),
  };
}

export function safePayloadSummary(body: Record<string, unknown> | null | undefined) {
  const situation = body?.situation && typeof body.situation === "object"
    ? (body.situation as Record<string, unknown>)
    : {};
  const state = body?.state && typeof body.state === "object"
    ? (body.state as Record<string, unknown>)
    : {};
  const social = body?.social && typeof body.social === "object"
    ? (body.social as Record<string, unknown>)
    : {};
  const signals = Array.isArray(body?.signals) ? body.signals : [];
  const rejectionHistory = Array.isArray(body?.rejection_history)
    ? body.rejection_history
    : [];

  return {
    geo: roundGeo(body?.geo as GeoLike | null | undefined),
    mode: typeof body?.mode === "string" ? body.mode : undefined,
    time_of_day: typeof body?.time_of_day === "string" ? body.time_of_day : undefined,
    day_type: typeof body?.day_type === "string" ? body.day_type : undefined,
    intent: typeof situation.intent === "string" ? situation.intent : null,
    urgency: typeof situation.urgency === "string" ? situation.urgency : undefined,
    energy: typeof state.energy === "string" ? state.energy : undefined,
    openness: typeof state.openness === "string" ? state.openness : undefined,
    group_type: typeof social.group_type === "string" ? social.group_type : undefined,
    group_size: typeof social.group_size === "number" ? social.group_size : undefined,
    signal_count: signals.length,
    rejection_count: rejectionHistory.length,
    has_persona: Boolean(body?.persona),
    has_settings: Boolean(body?.settings),
  };
}

export function hadeLog(
  level: LogLevel,
  message: string,
  meta?: unknown,
  options?: { debugOnly?: boolean },
): void {
  if (options?.debugOnly && !hadeDebugLogsEnabled()) return;
  const logger = console[level] ?? console.log;
  if (meta === undefined) {
    logger(message);
  } else {
    logger(message, meta);
  }
}

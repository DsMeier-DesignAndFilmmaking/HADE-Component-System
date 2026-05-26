/**
 * /api/hade/ugc — UGC entity CRUD.
 *
 *   POST  /api/hade/ugc                  — create / overwrite a UGCEntity
 *   GET   /api/hade/ugc?lat=&lng=&radius — list entities near a point
 *
 * Both responses include `x-hade-degraded: 1` when the Redis backend is
 * degraded, matching the convention used by /api/hade/decide.
 */

import { NextResponse, type NextRequest } from "next/server";

import { getRedisMode } from "@/lib/hade/redis";
import { getNearbyUGC, putUGC } from "@/lib/hade/ugc";
import type { GeoLocation, UGCEntity } from "@/types/hade";

const DEFAULT_RADIUS_METERS = 1500;
const MAX_RADIUS_METERS = 10_000;
const LOCATION_SOURCES = new Set<NonNullable<UGCEntity["location_source"]>>([
  "browser_geolocation",
  "fallback_geo",
  "manual",
  "map_pin",
  "place_picker",
  "unknown",
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function withDegradedHeader(headers: Record<string, string> = {}): Record<string, string> {
  const degraded = getRedisMode() !== "FULL";
  return { ...headers, "x-hade-degraded": degraded ? "1" : "0" };
}

type GeoValidation =
  | { ok: true; geo?: GeoLocation }
  | { ok: false; error: string };

function extractOptionalGeo(body: unknown): GeoValidation {
  if (!body || typeof body !== "object") return { ok: true };
  const raw = (body as { geo?: unknown }).geo;
  if (raw === undefined || raw === null) return { ok: true };
  if (typeof raw !== "object") return { ok: false, error: "geo must have finite lat and lng when provided" };
  const { lat, lng } = raw as { lat?: unknown; lng?: unknown };
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return { ok: false, error: "geo must have finite lat and lng when provided" };
  }

  if (lat === 0 && lng === 0) return { ok: true };

  return { ok: true, geo: { lat, lng } };
}

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeLocationSource(value: unknown, geo: GeoLocation | undefined): UGCEntity["location_source"] | undefined {
  const source = typeof value === "string" && LOCATION_SOURCES.has(value as NonNullable<UGCEntity["location_source"]>)
    ? (value as NonNullable<UGCEntity["location_source"]>)
    : undefined;

  if (!geo) {
    if (!source) return undefined;
    return source === "fallback_geo" || source === "manual" ? source : "unknown";
  }

  return source;
}

type ValidationOk = { ok: true; entity: UGCEntity };
type ValidationErr = { ok: false; error: string };

function validateUgcEntity(body: unknown): ValidationOk | ValidationErr {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.id !== "string" || !b.id.trim()) {
    return { ok: false, error: "id must be a non-empty string" };
  }
  if (typeof b.venue_name !== "string" || !b.venue_name.trim()) {
    return { ok: false, error: "venue_name must be a non-empty string" };
  }
  if (typeof b.category !== "string" || !b.category.trim()) {
    return { ok: false, error: "category must be a non-empty string" };
  }

  const geoValidation = extractOptionalGeo(b);
  if (!geoValidation.ok) {
    return { ok: false, error: geoValidation.error };
  }
  const geo = geoValidation.geo;

  if (typeof b.created_at !== "string" || !Number.isFinite(Date.parse(b.created_at))) {
    return { ok: false, error: "created_at must be an ISO-8601 timestamp" };
  }

  if (
    b.expires_at !== undefined &&
    (typeof b.expires_at !== "string" || !Number.isFinite(Date.parse(b.expires_at)))
  ) {
    return { ok: false, error: "expires_at must be an ISO-8601 timestamp" };
  }

  if (b.created_by !== undefined && typeof b.created_by !== "string") {
    return { ok: false, error: "created_by must be a string when provided" };
  }

  const address = optionalTrimmedString(b.address);
  const placeName = optionalTrimmedString(b.place_name);
  const locationLabel = optionalTrimmedString(b.location_label);
  const locationSource = normalizeLocationSource(b.location_source, geo);
  const placeId = optionalTrimmedString(b.place_id);

  const entity: UGCEntity = {
    id: b.id.trim(),
    venue_name: b.venue_name.trim(),
    category: b.category.trim(),
    created_at: b.created_at,
    ...(geo ? { geo } : {}),
    ...(typeof b.expires_at === "string" ? { expires_at: b.expires_at } : {}),
    ...(typeof b.created_by === "string" ? { created_by: b.created_by } : {}),
    ...(address ? { address } : {}),
    ...(placeName ? { place_name: placeName } : {}),
    ...(locationLabel ? { location_label: locationLabel } : {}),
    ...(locationSource ? { location_source: locationSource } : {}),
    ...(placeId ? { place_id: placeId } : {}),
  };

  return { ok: true, entity };
}

// ─── POST: create / overwrite ────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON body" },
      { status: 400, headers: withDegradedHeader() },
    );
  }

  const validated = validateUgcEntity(body);
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, error: validated.error },
      { status: 400, headers: withDegradedHeader() },
    );
  }

  const { success, durable } = await putUGC(validated.entity);

  if (!success) {
    return NextResponse.json(
      { ok: false, durable: false, error: "persist_failed" },
      { status: 503, headers: withDegradedHeader() },
    );
  }

  return NextResponse.json(
    { ok: true, durable, id: validated.entity.id },
    { status: 200, headers: withDegradedHeader() },
  );
}

// ─── GET: list by radius ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const latRaw = searchParams.get("lat");
  const lngRaw = searchParams.get("lng");
  const radiusRaw = searchParams.get("radius");

  const lat = latRaw !== null ? Number(latRaw) : NaN;
  const lng = lngRaw !== null ? Number(lngRaw) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { ok: false, error: "lat and lng query params must be finite numbers" },
      { status: 400, headers: withDegradedHeader() },
    );
  }

  let radius = radiusRaw !== null ? Number(radiusRaw) : DEFAULT_RADIUS_METERS;
  if (!Number.isFinite(radius) || radius <= 0) radius = DEFAULT_RADIUS_METERS;
  radius = Math.min(radius, MAX_RADIUS_METERS);

  const entities = await getNearbyUGC({ lat, lng }, radius);
  return NextResponse.json(
    { entities },
    { status: 200, headers: withDegradedHeader() },
  );
}

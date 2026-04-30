/**
 * GET /api/places
 *
 * Server-side proxy for Google Places (New API v1).
 * GOOGLE_API_KEY is read exclusively here — it is never sent to the client.
 *
 * Query params:
 *   lat         {number}  required — latitude
 *   lng         {number}  required — longitude
 *   radius      {number}  optional — metres, default 800, max 50 000
 *   intent      {string}  optional — eat | drink | chill | scene | anything
 *   open_now    {boolean} optional — default true
 *   max_results {number}  optional — default 20, max 20
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchNearbyGrounded } from "@/core/services/places";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;

  const rawLat = searchParams.get("lat");
  const rawLng = searchParams.get("lng");

  const lat = rawLat !== null ? Number(rawLat) : NaN;
  const lng = rawLng !== null ? Number(rawLng) : NaN;

  console.log("[HADE ENV CHECK]", {
    keyExists: !!process.env.GOOGLE_API_KEY,
    runtime: typeof window === "undefined" ? "server" : "client",
  });

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.error("[HADE GEO ERROR] Missing coordinates", { lat, lng });
    return NextResponse.json(
      { error: "lat and lng query params are required and must be finite numbers" },
      { status: 400 },
    );
  }

  if (lat === 0 && lng === 0) {
    console.error("[HADE GEO ERROR] Invalid coordinates (0,0)");
    return NextResponse.json(
      { error: "Invalid coordinates: (0, 0) is not a valid location" },
      { status: 400 },
    );
  }

  console.log("[HADE GEO VALID]", { lat, lng });

  const radius     = Number(searchParams.get("radius") ?? 800);
  const intent     = searchParams.get("intent") ?? undefined;
  const openNow    = searchParams.get("open_now") !== "false";
  const maxResults = Math.min(Number(searchParams.get("max_results") ?? 20), 20);

  const validIntents = new Set(["eat", "drink", "chill", "scene", "anything"]);
  const resolvedIntent =
    intent && validIntents.has(intent)
      ? (intent as "eat" | "drink" | "chill" | "scene" | "anything")
      : undefined;

  console.log("[HADE PLACES] Fetching", { lat, lng });

  try {
    const places = await fetchNearbyGrounded({
      geo: { lat, lng },
      radius_meters: Number.isFinite(radius) && radius > 0 ? radius : 800,
      intent: resolvedIntent,
      open_now: openNow,
      max_results: maxResults,
    });

    console.log("[HADE PLACES] Parsed places", places);

    if (places.length === 0) {
      console.warn("[HADE] Falling back due to no places");
    }

    return NextResponse.json(
      { places, count: places.length },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "x-hade-places-count": String(places.length),
        },
      },
    );
  } catch (err) {
    console.error("[HADE PLACES ERROR]", err);
    return NextResponse.json(
      { error: "Places fetch failed", places: [] },
      { status: 500 },
    );
  }
}

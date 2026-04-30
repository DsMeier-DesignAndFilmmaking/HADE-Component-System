"""HADE Venue Ingestion Layer

Fetches, filters, and normalizes real-world venue data from Google Places API
for use in the HADE decision pipeline.

Pipeline: Fetch → Filter → Normalize
"""

from __future__ import annotations

import logging
import os
from typing import Optional

import httpx
from pydantic import BaseModel

logger = logging.getLogger("hade.venues")

# ─── Constants ────────────────────────────────────────────────────────────────

PLACES_API_URL = "https://places.googleapis.com/v1/places:searchText"

FIELD_MASK = ",".join([
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.rating",
    "places.userRatingCount",
    "places.location",
    "places.types",
    "places.businessStatus",
    "places.currentOpeningHours",
])

DEFAULT_INCLUDED_TYPES = ["restaurant", "bar", "cafe", "park"]


# ─── Venue Model ──────────────────────────────────────────────────────────────

class Venue(BaseModel):
    """Normalized venue representation for HADE decision pipeline."""

    id: str
    name: str
    address: str
    rating: float | None = None
    user_ratings_total: int | None = None
    latitude: float
    longitude: float
    types: list[str] = []
    open_now: bool = True


# ─── Internal Helpers ─────────────────────────────────────────────────────────

def _passes_hade_filter(place: dict) -> bool:
    """Apply HADE spontaneity filter: OPERATIONAL + not explicitly closed.

    Venues missing opening hours data are included by default — missing
    data is not the same as closed. Only exclude if openNow is explicitly False.
    """
    if place.get("businessStatus") != "OPERATIONAL":
        return False

    opening_hours = place.get("currentOpeningHours")
    if opening_hours is None:
        return True  # No hours data — include, don't penalize

    return opening_hours.get("openNow", True) is not False


def _parse_venue(place: dict) -> Venue:
    """Map a Google Places API response object to HADE Venue."""
    display_name = place.get("displayName", {})
    location = place.get("location", {})
    name = display_name.get("text", "Unknown")
    venue_id = place.get("id") or f"v_{name.strip().lower().replace(' ', '_')[:20]}"

    return Venue(
        id=venue_id,
        name=name,
        address=place.get("formattedAddress", ""),
        rating=place.get("rating"),
        user_ratings_total=place.get("userRatingCount"),
        latitude=location.get("latitude", 0.0),
        longitude=location.get("longitude", 0.0),
        types=place.get("types", []),
        open_now=True,  # Guaranteed by _passes_hade_filter
    )


# ─── Public API ───────────────────────────────────────────────────────────────

async def get_nearby_venues(
    lat: float,
    lng: float,
    radius_meters: float = 1500,
    included_types: Optional[list[str]] = None,
) -> list[Venue]:
    """Fetch nearby venues from Google Places and return HADE-filtered results.

    Args:
        lat: User latitude.
        lng: User longitude.
        radius_meters: Search radius in meters (default 1500).
        included_types: Place types to include (default: restaurant, bar, cafe, park).

    Returns:
        List of Venue objects that are OPERATIONAL and currently open.
        Returns an empty list on any API failure (graceful degradation).
    """
    api_key = os.environ.get("GOOGLE_API_KEY")
    print(f"[venues] lat={lat}, lng={lng}, api_key_set={bool(api_key)}")
    if not api_key:
        logger.warning("GOOGLE_API_KEY not set — skipping venue fetch")
        return []

    if included_types is None:
        included_types = DEFAULT_INCLUDED_TYPES

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": FIELD_MASK,
    }

    body = {
        "textQuery": "restaurants cafes bars parks",
        "locationBias": {
            "circle": {
                "center": {
                    "latitude": lat,
                    "longitude": lng,
                },
                "radius": radius_meters,
            }
        },
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(PLACES_API_URL, headers=headers, json=body)

        print(f"[venues] Google Places API status={response.status_code}")
        if response.status_code != 200:
            logger.error(
                "Google Places API error: status=%d body=%s",
                response.status_code,
                response.text[:500],
            )
            return []

        data = response.json()
        places = data.get("places", [])
        print(f"[venues] raw results={len(places)}")

        venues = [
            _parse_venue(place)
            for place in places
            if _passes_hade_filter(place)
        ]
        print(f"[venues] after HADE filter={len(venues)}")

        logger.info(
            "Venue fetch: %d raw results → %d after HADE filter (lat=%.4f, lng=%.4f)",
            len(places),
            len(venues),
            lat,
            lng,
        )

        return venues

    except httpx.TimeoutException:
        logger.error("Google Places API timed out (lat=%.4f, lng=%.4f)", lat, lng)
        return []
    except Exception:
        logger.exception("Unexpected error fetching venues (lat=%.4f, lng=%.4f)", lat, lng)
        return []

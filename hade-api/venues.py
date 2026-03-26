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
    """Apply HADE spontaneity filter: OPERATIONAL + currently open.

    Venues missing opening hours data are excluded (strict spontaneity
    requirement — we only recommend places we *know* are open right now).
    """
    if place.get("businessStatus") != "OPERATIONAL":
        return False

    opening_hours = place.get("currentOpeningHours")
    if opening_hours is None:
        return False

    return opening_hours.get("openNow", False) is True


def _parse_venue(place: dict) -> Venue:
    """Map a Google Places API response object to HADE Venue."""
    display_name = place.get("displayName", {})
    location = place.get("location", {})

    return Venue(
        name=display_name.get("text", "Unknown"),
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
    api_key = os.environ.get("GOOGLE_PLACES_API_KEY")
    if not api_key:
        logger.warning("GOOGLE_PLACES_API_KEY not set — skipping venue fetch")
        return []

    if included_types is None:
        included_types = DEFAULT_INCLUDED_TYPES

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": FIELD_MASK,
    }

    body = {
        "textQuery": "places",
        "locationBias": {
            "circle": {
                "center": {
                    "latitude": lat,
                    "longitude": lng,
                },
                "radius": radius_meters,
            }
        },
        "includedTypes": included_types,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(PLACES_API_URL, headers=headers, json=body)

        if response.status_code != 200:
            logger.error(
                "Google Places API error: status=%d body=%s",
                response.status_code,
                response.text[:500],
            )
            return []

        data = response.json()
        places = data.get("places", [])

        venues = [
            _parse_venue(place)
            for place in places
            if _passes_hade_filter(place)
        ]

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

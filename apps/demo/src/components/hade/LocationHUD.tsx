"use client";

import { useState, useEffect } from "react";
import { MapPin } from "lucide-react";

// ─── US State Abbreviations ───────────────────────────────────────────────────
// Nominatim returns full state names. Map to 2-char USPS abbreviations.
// International states fall back to the full name from Nominatim.

const US_STATE_ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR",
  California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS",
  Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
  "New York": "NY", "North Carolina": "NC", "North Dakota": "ND",
  Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA",
  "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
  Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV",
  Wisconsin: "WI", Wyoming: "WY",
  // DC
  "District of Columbia": "DC",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocationHUDProps {
  /** Live coordinates from navigator.geolocation, or null before acquired. */
  geo: { lat: number; lng: number } | null;
  /** Geolocation acquisition status from the parent. */
  geoStatus: "idle" | "loading" | "denied";
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * LocationHUD
 *
 * A pill-shaped "System Status" badge that reverse-geocodes the user's live
 * coordinates via Nominatim and renders:
 *
 *   ● Signal: Denver, CO
 *
 * The green ping dot indicates an active location signal.
 * Sits at the top-right of the demo page header.
 */
export function LocationHUD({ geo, geoStatus, className = "" }: LocationHUDProps) {
  const [locationName, setLocationName] = useState<string | null>(null);
  const [geocodeStatus, setGeocodeStatus] = useState<"idle" | "loading" | "error">("idle");

  // ─── Reverse Geocode ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!geo) return;

    let cancelled = false;
    setGeocodeStatus("loading");

    async function fetchLocation() {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${geo!.lat}&lon=${geo!.lng}`,
          {
            headers: { "Accept-Language": "en" },
          }
        );

        if (!res.ok) throw new Error(`Nominatim ${res.status}`);

        const data = await res.json();
        if (cancelled) return;

        const city =
          data.address?.city ??
          data.address?.town ??
          data.address?.village ??
          data.address?.county ??
          null;

        const rawState = data.address?.state ?? "";
        const state = US_STATE_ABBR[rawState] ?? rawState;

        if (city) {
          setLocationName(state ? `${city}, ${state}` : city);
        } else {
          setLocationName(state || null);
        }

        setGeocodeStatus("idle");
      } catch {
        if (!cancelled) setGeocodeStatus("error");
      }
    }

    fetchLocation();
    return () => { cancelled = true; };
  }, [geo]);

  // ─── Display Text Resolution ──────────────────────────────────────────────
  let displayText: string;

  if (geoStatus === "loading" || (geoStatus === "idle" && !geo && !locationName)) {
    displayText = "Locating...";
  } else if (geoStatus === "denied") {
    // Geolocation was blocked — parent falls back to Denver coords; show that
    displayText = locationName ?? "Denver, CO";
  } else if (geocodeStatus === "loading") {
    displayText = "Locating...";
  } else if (locationName) {
    displayText = locationName;
  } else if (geocodeStatus === "error") {
    // Nominatim failed — show raw coords as a last resort
    displayText = geo ? `${geo.lat.toFixed(3)}, ${geo.lng.toFixed(3)}` : "Active";
  } else {
    displayText = "Locating...";
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className={[
        "inline-flex items-center gap-2",
        "bg-surface/50 border border-border backdrop-blur-sm",
        "px-3 py-1.5 rounded-full",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Live signal ping dot */}
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal-presence opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-signal-presence" />
      </span>

      {/* MapPin icon */}
      <MapPin size={10} className="text-ink/40 shrink-0" strokeWidth={2.5} />

      {/* Location label */}
      <span className="font-mono text-[10px] uppercase tracking-widest text-ink/60 whitespace-nowrap">
        Signal: {displayText}
      </span>
    </div>
  );
}

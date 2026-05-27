"use client";

import { useCallback, useEffect, useState } from "react";
import Map, { Marker, type MarkerDragEvent } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  DEFAULT_ZOOM,
  MAPBOX_STYLE_URL,
  MAX_ZOOM,
  MIN_ZOOM,
  getMapboxToken,
} from "@/lib/hade/mapboxConfig";

export interface PinSpotSheetProps {
  /** Center the map here on open. Null = no anchor, render the missing-context state. */
  initialGeo: { lat: number; lng: number } | null;
  /** Optional contextual label shown above the map (e.g. the picked place's name). */
  anchorLabel?: string;
  onConfirm: (geo: { lat: number; lng: number }) => void;
  onCancel: () => void;
}

function isFiniteGeo(g: { lat: number; lng: number } | null): g is { lat: number; lng: number } {
  return Boolean(g && Number.isFinite(g.lat) && Number.isFinite(g.lng) && !(g.lat === 0 && g.lng === 0));
}

export default function PinSpotSheet({ initialGeo, anchorLabel, onConfirm, onCancel }: PinSpotSheetProps) {
  const token = getMapboxToken();
  const validInitial = isFiniteGeo(initialGeo) ? initialGeo : null;
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(validInitial);

  useEffect(() => {
    if (validInitial && !pin) setPin(validInitial);
  }, [validInitial, pin]);

  const handleMarkerDrag = useCallback((evt: MarkerDragEvent) => {
    setPin({ lat: evt.lngLat.lat, lng: evt.lngLat.lng });
  }, []);

  const handleConfirm = useCallback(() => {
    if (pin) onConfirm(pin);
  }, [pin, onConfirm]);

  const showMap = token !== null && validInitial !== null;

  return (
    <div
      role="dialog"
      aria-label="Pin exact spot"
      className="w-full overflow-hidden rounded-2xl border border-line/70 bg-surface"
    >
      {anchorLabel && (
        <div className="border-b border-line/60 bg-surface/85 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/65">
          {anchorLabel}
        </div>
      )}

      <div
        className="relative w-full overflow-hidden bg-ink/[0.04]"
        style={{ height: "min(60dvh, 360px)", touchAction: "pan-x pan-y" }}
      >
        {showMap && validInitial ? (
          <Map
            mapboxAccessToken={token!}
            mapStyle={MAPBOX_STYLE_URL}
            initialViewState={{
              latitude: validInitial.lat,
              longitude: validInitial.lng,
              zoom: DEFAULT_ZOOM,
            }}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            attributionControl={false}
            dragRotate={false}
            touchPitch={false}
            pitchWithRotate={false}
            style={{ width: "100%", height: "100%" }}
          >
            {pin && (
              <Marker
                latitude={pin.lat}
                longitude={pin.lng}
                draggable
                onDrag={handleMarkerDrag}
                onDragEnd={handleMarkerDrag}
                anchor="bottom"
              >
                <div
                  aria-hidden="true"
                  className="h-4 w-4 rounded-full border-[2px] border-white bg-accent shadow-md"
                  style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }}
                />
              </Marker>
            )}
          </Map>
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-[12px] leading-snug text-ink/65">
            {token === null
              ? "Pin spot unavailable on this build."
              : "Pick a place or use current location first, then refine the exact spot."}
          </div>
        )}
      </div>

      <div className="border-t border-line/60 bg-surface px-3 py-2 text-[11px] leading-snug text-ink/65">
        {pin
          ? "Drag the pin to your exact spot."
          : "No location anchor — cancel and pick a place or use current location first."}
      </div>

      <div className="flex gap-2 px-3 pb-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] flex-1 rounded-xl border border-line/70 bg-background/70 px-3 text-[13px] font-semibold text-ink/70 transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent active:bg-surface"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!pin}
          className="min-h-[44px] flex-1 rounded-2xl bg-accent px-3 text-[13px] font-semibold text-white shadow-glowBlue transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40 active:bg-accent/80"
        >
          Use this spot
        </button>
      </div>
    </div>
  );
}

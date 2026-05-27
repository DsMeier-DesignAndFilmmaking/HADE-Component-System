"use client";

import { useEffect, useRef, useState, type FocusEvent, type MouseEvent, type PointerEvent } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import type { GeoLocation, PlaceOption, SpontaneousObject, UGCEntity } from "@/types/hade";
import { RADIUS } from "@/core/constants/radius";
import { getDeviceId } from "@/lib/hade/deviceId";
import { useHadeAdaptiveContext } from "@/lib/hade/hooks";
import { isMapboxEnabled } from "@/lib/hade/mapboxConfig";
import { resetMobileViewportAfterInput } from "@/lib/hade/mobileViewport";

// PinSpotSheet ships mapbox-gl (~210 KB gz). Lazy + client-only so users
// who never tap the Pin step pay zero bytes for it.
const PinSpotSheet = dynamic(() => import("./PinSpotSheet"), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border border-line/70 bg-white px-3 py-6 text-center text-[12px] text-ink/55">
      Loading map…
    </div>
  ),
});

// ─── Vibe options ─────────────────────────────────────────────────────────────

const VIBES = [
  { id: "chill",       label: "Chill",       vibe_tag: "chill",       signal: "worth_it"    },
  { id: "social",      label: "Social",      vibe_tag: "social",      signal: "good_energy" },
  { id: "productive",  label: "Productive",  vibe_tag: "focused",     signal: "worth_it"    },
  { id: "spontaneous", label: "Spontaneous", vibe_tag: "spontaneous", signal: "perfect_vibe"},
] as const;

type VibeId = (typeof VIBES)[number]["id"];

// ─── Confetti ─────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = [
  "#6366f1", "#f59e0b", "#10b981",
  "#ef4444", "#8b5cf6", "#f97316",
  "#06b6d4", "#84cc16",
];

type Particle = {
  id:    number;
  x:     number;
  color: string;
  size:  number;
  delay: number;
  shape: "square" | "circle";
};

function makeParticles(count = 18): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id:    i,
    x:     (Math.random() - 0.5) * 220,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size:  5 + Math.random() * 7,
    delay: Math.random() * 0.2,
    shape: Math.random() > 0.5 ? "square" : "circle",
  }));
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Step   = "what" | "vibe" | "details";
type Status = "idle" | "submitting" | "success" | "local" | "error";
type FocusableSheetField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type TimePeriod = "AM" | "PM";
type TimeParts = {
  hour12: string;
  minute: string;
  period: TimePeriod;
};
type LocationCaptureMode = "none" | "current" | "place" | "manual" | "pin";
type LocationAvailability = "checking" | "available" | "denied" | "unavailable";
type PlaceSearchStatus = "idle" | "loading" | "ready" | "empty" | "error";
type SheetKeyboardEnvironment = {
  isIOS: boolean;
  isStandalonePWA: boolean;
};
type NearbyPlacesResponse = {
  places?: PlaceOption[];
};
type UgcPersistResponse = {
  ok: boolean;
  durable?: boolean;
  id?: string;
  error?: string;
};
type UgcPersistResult =
  | { status: "durable"; response: UgcPersistResponse }
  | { status: "degraded"; response: UgcPersistResponse; reason: string }
  | { status: "failed"; reason: string };
type SignalPayload = {
  signals: Array<Record<string, unknown>>;
};
type LocalUgcDraft = {
  saved_at: string;
  reason: string;
  ugc: Record<string, unknown>;
  spontaneous: SpontaneousObject;
  signal: SignalPayload;
};

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
const UGC_STORAGE_TIMEOUT_MS = 4_000;
const PLACE_SEARCH_TIMEOUT_MS = 5_000;
const LOCAL_UGC_DRAFTS_KEY = "hade.demo.localUgcDrafts";
const LOCAL_SAVE_MESSAGE = "Saved on this device. We'll retry when the connection is back.";

interface ActivityCreationViewProps {
  onCreate?: (object: SpontaneousObject) => void;
  onClose?: () => void;
}

function getDefaultActivityTime() {
  const next = new Date();
  const minutes = next.getMinutes();
  const roundedMinutes = minutes === 0 ? 0 : minutes <= 30 ? 30 : 60;
  next.setMinutes(roundedMinutes, 0, 0);

  return `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
}

function isValidTimeValue(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function parseTimeParts(value: string): TimeParts | null {
  if (!isValidTimeValue(value)) return null;

  const [hourText, minute] = value.split(":");
  const hour24 = Number(hourText);
  const period: TimePeriod = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return {
    hour12: String(hour12),
    minute,
    period,
  };
}

function toTimeValue(hour12Value: string, minute: string, period: TimePeriod) {
  const hour12 = Number(hour12Value);
  if (!Number.isInteger(hour12) || hour12 < 1 || hour12 > 12) return null;
  if (!/^[0-5]\d$/.test(minute)) return null;

  let hour24 = hour12 % 12;
  if (period === "PM") hour24 += 12;

  return `${String(hour24).padStart(2, "0")}:${minute}`;
}

function formatTimeLabel(value: string) {
  const parts = parseTimeParts(value);
  if (!parts) return "Select a time";

  return `${parts.hour12}:${parts.minute} ${parts.period}`;
}

function isFocusableSheetField(element: Element | null): element is FocusableSheetField {
  return element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement;
}

function isInteractiveSheetTarget(element: Element | null) {
  return Boolean(element?.closest(
    "input, textarea, select, button, a, label, [role='button'], [role='switch'], [contenteditable='true']",
  ));
}

function getSheetKeyboardEnvironment(): SheetKeyboardEnvironment {
  if (typeof window === "undefined") {
    return { isIOS: false, isStandalonePWA: false };
  }

  const userAgent = navigator.userAgent;
  const platform = navigator.platform;
  const isTouchMac = platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) || isTouchMac;
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  const isStandalonePWA = window.matchMedia?.("(display-mode: standalone)").matches ||
    standaloneNavigator.standalone === true;

  return { isIOS, isStandalonePWA };
}

function debugSheetKeyboard(message: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.debug("[HADE SHEET KEYBOARD]", message, details);
}

function debugUgcStorage(message: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.debug("[HADE UGC STORAGE]", message, details);
}

function isUsableGeo(geo: { lat: number; lng: number } | null): geo is { lat: number; lng: number } {
  return Boolean(
    geo &&
    Number.isFinite(geo.lat) &&
    Number.isFinite(geo.lng) &&
    !(geo.lat === 0 && geo.lng === 0),
  );
}

function isPlaceSearchResult(value: unknown): value is PlaceOption {
  if (!value || typeof value !== "object") return false;
  const place = value as Partial<PlaceOption>;
  return Boolean(
    typeof place.id === "string" &&
    typeof place.name === "string" &&
    place.geo &&
    Number.isFinite(place.geo.lat) &&
    Number.isFinite(place.geo.lng) &&
    !(place.geo.lat === 0 && place.geo.lng === 0),
  );
}

function getPlaceDisplay(place: PlaceOption) {
  return place.address ? `${place.name}, ${place.address}` : place.name;
}

function getStorageErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = UGC_STORAGE_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error("malformed_response");
    }

    return { response, data };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("request_timeout");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function readLocalUgcDrafts(storage: Storage): LocalUgcDraft[] {
  const raw = storage.getItem(LOCAL_UGC_DRAFTS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as LocalUgcDraft[] : [];
  } catch {
    return [];
  }
}

function writeLocalUgcDraft(storage: Storage, draft: LocalUgcDraft) {
  const sanitizedDraft = sanitizeLocalUgcDraft(draft);
  const existing = readLocalUgcDrafts(storage).filter((item) => item.spontaneous.id !== draft.spontaneous.id);
  storage.setItem(LOCAL_UGC_DRAFTS_KEY, JSON.stringify([...existing, sanitizedDraft]));
}

function replaceLocalUgcDrafts(storage: Storage, drafts: LocalUgcDraft[]) {
  if (drafts.length === 0) {
    storage.removeItem(LOCAL_UGC_DRAFTS_KEY);
    return;
  }
  storage.setItem(LOCAL_UGC_DRAFTS_KEY, JSON.stringify(drafts));
}

function saveLocalUgcDraft(draft: LocalUgcDraft) {
  try {
    writeLocalUgcDraft(window.localStorage, draft);
    return { ok: true, storage: "localStorage" };
  } catch (localError) {
    debugUgcStorage("localStorage_failed", { error: getStorageErrorMessage(localError) });
  }

  try {
    writeLocalUgcDraft(window.sessionStorage, draft);
    return { ok: true, storage: "sessionStorage" };
  } catch (sessionError) {
    debugUgcStorage("sessionStorage_failed", { error: getStorageErrorMessage(sessionError) });
    return { ok: false, storage: null };
  }
}

function sanitizeLocalUgcDraft(draft: LocalUgcDraft): LocalUgcDraft {
  const spontaneous = { ...draft.spontaneous } as Omit<SpontaneousObject, "location"> & { location?: GeoLocation };
  if (spontaneous.location?.lat === 0 && spontaneous.location.lng === 0) {
    delete spontaneous.location;
  }

  return {
    ...draft,
    spontaneous: spontaneous as SpontaneousObject,
  };
}

async function syncLocalUgcDraftsFromStorage(storage: Storage, storageName: string) {
  const drafts = readLocalUgcDrafts(storage);
  if (drafts.length === 0 || !navigator.onLine) return;

  const remaining: LocalUgcDraft[] = [];
  for (const draft of drafts) {
    try {
      const { response, data } = await fetchJsonWithTimeout("/api/hade/ugc", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(draft.ugc),
      });

      if (!data || typeof data !== "object" || typeof (data as UgcPersistResponse).ok !== "boolean") {
        remaining.push(draft);
        continue;
      }

      const parsed = data as UgcPersistResponse;
      const stillDegraded = response.headers.get("x-hade-degraded") === "1" || parsed.durable === false;
      if (!response.ok || !parsed.ok || stillDegraded) {
        remaining.push(draft);
        continue;
      }

      const deviceId = typeof draft.ugc.created_by === "string" ? draft.ugc.created_by : getDeviceId();
      void fetchJsonWithTimeout("/api/hade/signal", {
        method:  "POST",
        headers: {
          "Content-Type":     "application/json",
          "x-hade-device-id": deviceId,
        },
        body: JSON.stringify(draft.signal),
      }).catch((error) => {
        debugUgcStorage("queued_signal_sync_failed_non_blocking", { error: getStorageErrorMessage(error) });
      });
    } catch (error) {
      remaining.push(draft);
      debugUgcStorage("queued_ugc_sync_failed", {
        storage: storageName,
        error: getStorageErrorMessage(error),
      });
    }
  }

  replaceLocalUgcDrafts(storage, remaining);
  debugUgcStorage("queued_ugc_sync_complete", {
    storage: storageName,
    attempted: drafts.length,
    remaining: remaining.length,
  });
}

async function syncLocalUgcDrafts() {
  try {
    await syncLocalUgcDraftsFromStorage(window.localStorage, "localStorage");
  } catch (error) {
    debugUgcStorage("localStorage_sync_unavailable", { error: getStorageErrorMessage(error) });
  }

  try {
    await syncLocalUgcDraftsFromStorage(window.sessionStorage, "sessionStorage");
  } catch (error) {
    debugUgcStorage("sessionStorage_sync_unavailable", { error: getStorageErrorMessage(error) });
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ActivityCreationView({ onCreate, onClose }: ActivityCreationViewProps) {
  const { emitVibeSignal, context } = useHadeAdaptiveContext();

  const [step,      setStep]      = useState<Step>("what");
  const [title,     setTitle]     = useState("");
  const [vibeId,    setVibeId]    = useState<VibeId | null>(null);
  const [notes,     setNotes]     = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [locationMode, setLocationMode] = useState<LocationCaptureMode>("none");
  const [locationStatus, setLocationStatus] = useState<LocationAvailability>("checking");
  const [timeText,  setTimeText]  = useState(getDefaultActivityTime);
  const [listening, setListening] = useState(false);
  const [location,  setLocation]  = useState<{ lat: number; lng: number } | null>(null);
  const [locationSource, setLocationSource] = useState<NonNullable<UGCEntity["location_source"]>>("unknown");
  const [selectedPlace, setSelectedPlace] = useState<PlaceOption | null>(null);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceOption[]>([]);
  const [placeSearchStatus, setPlaceSearchStatus] = useState<PlaceSearchStatus>("idle");
  const [pinnedGeo, setPinnedGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [pinSheetOpen, setPinSheetOpen] = useState(false);
  const mapboxEnabled = isMapboxEnabled();
  const [status,    setStatus]    = useState<Status>("idle");
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const sheetRef = useRef<HTMLElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const suppressFooterClickRef = useRef(false);
  const placeSearchRequestRef = useRef(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef = useRef<any>(null);

  useEffect(() => {
    requestCurrentLocation(false);
  }, []);

  useEffect(() => () => { recogRef.current?.abort(); }, []);

  useEffect(() => {
    const handleOnline = () => {
      void syncLocalUgcDrafts();
    };

    window.addEventListener("online", handleOnline);
    if (navigator.onLine) void syncLocalUgcDrafts();

    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  function requestCurrentLocation(selectAfterResolve = true) {
    if (!navigator.geolocation) {
      setLocation(null);
      setLocationSource("unknown");
      setLocationStatus("unavailable");
      if (selectAfterResolve) setLocationMode("none");
      return;
    }

    setLocationStatus("checking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextGeo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (isUsableGeo(nextGeo)) {
          setLocation(nextGeo);
          setLocationSource("browser_geolocation");
          setLocationStatus("available");
          if (selectAfterResolve) {
            setLocationMode("current");
            setSelectedPlace(null);
          }
          return;
        }

        setLocation(null);
        setLocationSource("unknown");
        setLocationStatus("unavailable");
        if (selectAfterResolve) setLocationMode("none");
      },
      (error) => {
        setLocation(null);
        setLocationSource("unknown");
        setLocationStatus(error.code === 1 ? "denied" : "unavailable");
        if (selectAfterResolve) setLocationMode("none");
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 5_000 },
    );
  }

  function startListening() {
    if (recogRef.current) {
      recogRef.current.abort();
      recogRef.current = null;
      setListening(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const W = window as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR: (new () => any) | undefined = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!SR) return;

    const recog = new SR();
    recog.continuous     = false;
    recog.interimResults = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recog.onresult = (e: any) => {
      setTitle(e.results[0][0].transcript);
      setListening(false);
      recogRef.current = null;
    };
    recog.onerror = () => { setListening(false); recogRef.current = null; };
    recog.onend   = () => { setListening(false); recogRef.current = null; };
    recogRef.current = recog;
    recog.start();
    setListening(true);
  }

  const stepNumber = step === "what" ? 1 : step === "vibe" ? 2 : 3;
  const selectedVibe = VIBES.find((v) => v.id === vibeId) ?? null;
  const selectedTimeParts = parseTimeParts(timeText) ?? parseTimeParts(getDefaultActivityTime());
  const trimmedPlaceQuery = placeQuery.trim();
  const searchOrigin = isUsableGeo(location)
    ? location
    : isUsableGeo(context.geo)
      ? context.geo
      : null;
  const filteredPlaceResults = trimmedPlaceQuery
    ? placeResults.filter((place) => {
        const query = trimmedPlaceQuery.toLowerCase();
        return place.name.toLowerCase().includes(query) ||
          place.address?.toLowerCase().includes(query);
      })
    : placeResults;
  const timeValidationMessage = isValidTimeValue(timeText) ? null : "Choose a valid start time.";
  const submitDisabled = status === "submitting" ||
    status === "success" ||
    status === "local" ||
    Boolean(timeValidationMessage);
  const submitLabel =
    status === "submitting" ? "Saving..." :
    status === "success"    ? "Saved" :
    status === "local"      ? "Saved on device" :
    status === "error"      ? "Try Again" :
    "Start Something";
  const manualLocationNote = locationLabel.trim();
  const locationSummary =
    locationMode === "pin" && pinnedGeo
      ? selectedPlace
        ? `Pinned spot near ${selectedPlace.name}`
        : "Pinned spot saved"
      : locationMode === "place" && selectedPlace
        ? getPlaceDisplay(selectedPlace)
        : locationMode === "current" && isUsableGeo(location)
          ? "Current location saved"
          : locationMode === "manual" && manualLocationNote
            ? manualLocationNote
            : locationStatus === "denied"
              ? "Location permission was denied. You can still search for a place or add a note."
              : locationStatus === "unavailable"
                ? "Location unavailable"
                : "No location added yet";

  const pinInitialGeo: { lat: number; lng: number } | null =
    pinnedGeo
    ?? (selectedPlace && isUsableGeo(selectedPlace.geo) ? selectedPlace.geo : null)
    ?? (locationMode === "current" && isUsableGeo(location) ? location : null)
    ?? (context?.geo && isUsableGeo(context.geo) ? { lat: context.geo.lat, lng: context.geo.lng } : null);

  useEffect(() => {
    if (locationMode !== "place") return;

    if (trimmedPlaceQuery.length < 2) {
      placeSearchRequestRef.current += 1;
      setPlaceResults([]);
      setPlaceSearchStatus("idle");
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetchNearbyPlaces(trimmedPlaceQuery);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [locationMode, trimmedPlaceQuery, searchOrigin?.lat, searchOrigin?.lng]);

  function handleFieldFocus(event: FocusEvent<FocusableSheetField>) {
    const element = event.currentTarget;
    const environment = getSheetKeyboardEnvironment();
    const shouldRunSafetyPass = environment.isIOS || environment.isStandalonePWA;

    const scrollFocusedFieldIntoView = (phase: "immediate" | "settled" | "safety") => {
      if (document.activeElement !== element) return;
      if (!sheetRef.current?.contains(element)) return;

      const scrollContainer = scrollContainerRef.current;
      if (scrollContainer?.contains(element)) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const centeredOffset =
          elementRect.top - containerRect.top -
          (containerRect.height / 2) +
          (elementRect.height / 2);
        const nextScrollTop = scrollContainer.scrollTop + centeredOffset;

        scrollContainer.scrollTo({
          top: Math.max(0, nextScrollTop),
          behavior: "smooth",
        });

        debugSheetKeyboard("scoped_scroll", {
          phase,
          field: element.tagName.toLowerCase(),
          inputType: element instanceof HTMLInputElement ? element.type : undefined,
          isIOS: environment.isIOS,
          isStandalonePWA: environment.isStandalonePWA,
        });
        return;
      }

      element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      debugSheetKeyboard("fallback_scroll_into_view", {
        phase,
        field: element.tagName.toLowerCase(),
        isIOS: environment.isIOS,
        isStandalonePWA: environment.isStandalonePWA,
      });
    };

    requestAnimationFrame(() => scrollFocusedFieldIntoView("immediate"));
    window.setTimeout(() => scrollFocusedFieldIntoView("settled"), 90);
    if (shouldRunSafetyPass) {
      window.setTimeout(() => scrollFocusedFieldIntoView("safety"), 220);
    }
  }

  function getFocusedSheetField() {
    const activeElement = document.activeElement;
    if (!sheetRef.current?.contains(activeElement) || !isFocusableSheetField(activeElement)) {
      return null;
    }
    return activeElement;
  }

  function handleSheetPointerDownCapture(event: PointerEvent<HTMLElement>) {
    const activeField = getFocusedSheetField();
    if (!activeField || !(event.target instanceof Element)) return;
    if (isInteractiveSheetTarget(event.target)) return;

    activeField.blur();
  }

  function handleFooterPointerDownCapture(event: PointerEvent<HTMLElement>) {
    const activeField = getFocusedSheetField();
    if (!activeField || !(event.target instanceof Element)) return;
    if (!event.target.closest("button")) return;

    suppressFooterClickRef.current = true;
    window.setTimeout(() => { suppressFooterClickRef.current = false; }, 250);
    activeField.blur();
    event.preventDefault();
    event.stopPropagation();
  }

  function handleFooterClickCapture(event: MouseEvent<HTMLElement>) {
    if (!suppressFooterClickRef.current) return;

    suppressFooterClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleTimePartChange(nextParts: Partial<TimeParts>) {
    if (!selectedTimeParts) {
      setErrorMsg("Choose a valid start time.");
      return;
    }

    const nextTime = toTimeValue(
      nextParts.hour12 ?? selectedTimeParts.hour12,
      nextParts.minute ?? selectedTimeParts.minute,
      nextParts.period ?? selectedTimeParts.period,
    );

    if (!nextTime) {
      setErrorMsg("Choose a valid start time.");
      return;
    }

    setErrorMsg(null);
    setTimeText(nextTime);
  }

  function handleUseCurrentLocation() {
    setSelectedPlace(null);
    setLocationLabel("");
    setPinnedGeo(null);
    requestCurrentLocation(true);
  }

  function handleManualLocationMode() {
    setLocationMode("manual");
    setSelectedPlace(null);
    setPinnedGeo(null);
  }

  function handlePlaceSearchMode() {
    setLocationMode("place");
    setSelectedPlace(null);
    setPinnedGeo(null);
  }

  function handlePlaceQueryChange(value: string) {
    setPlaceQuery(value);
    setSelectedPlace(null);
    setPlaceResults([]);
  }

  async function fetchNearbyPlaces(query: string) {
    const requestId = placeSearchRequestRef.current + 1;
    placeSearchRequestRef.current = requestId;

    if (!searchOrigin) {
      setPlaceSearchStatus("error");
      return;
    }

    setPlaceSearchStatus("loading");
    try {
      const params = new URLSearchParams({
        lat: String(searchOrigin.lat),
        lng: String(searchOrigin.lng),
        radius: "1600",
        intent: "anything",
        open_now: "false",
        max_results: "10",
      });
      const { data } = await fetchJsonWithTimeout(
        `/api/places?${params.toString()}`,
        { method: "GET" },
        PLACE_SEARCH_TIMEOUT_MS,
      );
      const parsed = data as NearbyPlacesResponse;
      const places = Array.isArray(parsed.places)
        ? parsed.places.filter(isPlaceSearchResult)
        : [];
      const normalizedQuery = query.trim().toLowerCase();
      const matchingPlaces = places.filter((place) =>
        place.name.toLowerCase().includes(normalizedQuery) ||
        place.address?.toLowerCase().includes(normalizedQuery),
      );

      if (placeSearchRequestRef.current !== requestId) return;
      setPlaceResults(matchingPlaces);
      setPlaceSearchStatus(matchingPlaces.length > 0 ? "ready" : "empty");
    } catch (error) {
      if (placeSearchRequestRef.current !== requestId) return;
      setPlaceSearchStatus("error");
      debugUgcStorage("nearby_place_search_failed", { error: getStorageErrorMessage(error) });
    }
  }

  function handleSelectPlace(place: PlaceOption) {
    setSelectedPlace(place);
    setLocationMode("place");
    setLocation(place.geo);
    setLocationSource("place_picker");
    setLocationStatus("available");
    setLocationLabel("");
    setPinnedGeo(null);
  }

  function handlePinSpotMode() {
    setPinSheetOpen(true);
  }

  function handlePinConfirm(geo: { lat: number; lng: number }) {
    setPinnedGeo(geo);
    setLocation(geo);
    setLocationMode("pin");
    setLocationSource("map_pin");
    setLocationStatus("available");
    setLocationLabel("");
    setPinSheetOpen(false);
  }

  function handlePinCancel() {
    setPinSheetOpen(false);
  }

  function handleChangePin() {
    setPinSheetOpen(true);
  }

  function handleRemovePin() {
    setPinnedGeo(null);
    if (locationMode === "pin") {
      setLocation(null);
      setLocationSource("unknown");
      setLocationMode("none");
    }
  }

  function handleHeaderBack() {
    if (status === "submitting") return;
    if (step === "details") {
      setStep("vibe");
      return;
    }
    if (step === "vibe") {
      setStep("what");
      return;
    }
    onClose?.();
  }

  async function persistUgc(ugcPayload: Record<string, unknown>): Promise<UgcPersistResult> {
    if (!navigator.onLine) {
      debugUgcStorage("offline", { endpoint: "/api/hade/ugc" });
      return { status: "failed", reason: "offline" };
    }

    try {
      const { response, data } = await fetchJsonWithTimeout("/api/hade/ugc", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(ugcPayload),
      });

      if (!data || typeof data !== "object" || typeof (data as UgcPersistResponse).ok !== "boolean") {
        return { status: "failed", reason: "malformed_response" };
      }

      const parsed = data as UgcPersistResponse;
      const degraded = response.headers.get("x-hade-degraded") === "1";
      if (!response.ok || !parsed.ok) {
        return {
          status: "failed",
          reason: parsed.error ?? `http_${response.status}`,
        };
      }

      if (degraded || parsed.durable === false) {
        return {
          status: "degraded",
          response: parsed,
          reason: degraded ? "server_degraded" : "non_durable_persistence",
        };
      }

      return { status: "durable", response: parsed };
    } catch (error) {
      return {
        status: "failed",
        reason: getStorageErrorMessage(error),
      };
    }
  }

  async function emitStorageSignal(signalPayload: SignalPayload, deviceId: string) {
    if (!navigator.onLine) {
      debugUgcStorage("signal_skipped_offline", {});
      return;
    }

    try {
      const { response, data } = await fetchJsonWithTimeout("/api/hade/signal", {
        method:  "POST",
        headers: {
          "Content-Type":     "application/json",
          "x-hade-device-id": deviceId,
        },
        body: JSON.stringify(signalPayload),
      });

      debugUgcStorage("signal_result", {
        ok: response.ok,
        status: response.status,
        malformed: !data || typeof data !== "object",
      });
    } catch (error) {
      debugUgcStorage("signal_failed_non_blocking", { error: getStorageErrorMessage(error) });
    }
  }

  async function handleCreate() {
    if (!title.trim() || status === "submitting" || status === "success" || status === "local") return;
    if (!isValidTimeValue(timeText)) {
      setErrorMsg("Choose a valid start time.");
      return;
    }

    setStatus("submitting");
    setErrorMsg(null);

    const now      = Date.now();
    const end      = now + 60 * 60_000; // default 1 hr
    const entityId = crypto.randomUUID();
    const deviceId = getDeviceId();
    const expiresAt = new Date(end).toISOString();
    const resolvedTitle = title.trim();
    const resolvedLocationLabel = locationLabel.trim();
    const category = selectedVibe?.vibe_tag ?? "social";
    const signalTag = selectedVibe?.signal ?? "good_energy";
    const selectedPlaceGeo = selectedPlace && isUsableGeo(selectedPlace.geo) ? selectedPlace.geo : null;
    const currentGeoSelected = locationMode === "current" && isUsableGeo(location) ? location : null;
    const pinSelected = locationMode === "pin" && pinnedGeo && isUsableGeo(pinnedGeo) ? pinnedGeo : null;
    const resolvedGeo: GeoLocation | null = pinSelected ?? selectedPlaceGeo ?? currentGeoSelected;
    const payloadLocationSource: UGCEntity["location_source"] = pinSelected
      ? "map_pin"
      : selectedPlace
        ? "place_picker"
        : currentGeoSelected
          ? "browser_geolocation"
          : resolvedLocationLabel
            ? "manual"
            : undefined;
    // When the pin started from a selected place, preserve place_id / place_name
    // so the backend keeps canonical anchor identity alongside the exact geo.
    const resolvedLocationMetadata = {
      ...(selectedPlace
        ? {
            location_label: selectedPlace.name,
            place_name: selectedPlace.name,
            ...(selectedPlace.address ? { address: selectedPlace.address } : {}),
            place_id: selectedPlace.id,
          }
        : resolvedLocationLabel
          ? { location_label: resolvedLocationLabel }
          : {}),
    };
    const ugcPayload = {
      id:         entityId,
      venue_name: resolvedTitle,
      category,
      created_at: new Date(now).toISOString(),
      expires_at: expiresAt,
      created_by: deviceId,
      ...(payloadLocationSource ? { location_source: payloadLocationSource } : {}),
      ...(resolvedGeo ? { geo: resolvedGeo } : {}),
      ...resolvedLocationMetadata,
    };
    const signalPayload: SignalPayload = {
      signals: [{
        id:               `vsig_${entityId}`,
        location_node_id: entityId,
        venue_id:         entityId,
        vibe_tags:        [signalTag],
        strength:         0.9,
        sentiment:        "positive",
        emitted_at:       new Date(now).toISOString(),
        expires_at:       expiresAt,
        source_user_id:   deviceId,
        type:             "ugc_event",
        vibe_tag:         category,
        ...(resolvedGeo ? { geo: resolvedGeo } : {}),
        metadata:         {
          expires_at: expiresAt,
          is_meetup: true,
          notes,
          timeText,
          ...(payloadLocationSource ? { location_source: payloadLocationSource } : {}),
          ...resolvedLocationMetadata,
        },
      }],
    };

    const spontaneous: SpontaneousObject = {
      id:          entityId,
      type:        "ugc_event",
      title:       resolvedTitle,
      time_window: { start: now, end },
      location:    resolvedGeo ?? { lat: 0, lng: 0 },
      radius:      RADIUS.ACTIVITY_CREATION,
      going_count: 0,
      maybe_count: 0,
      user_state:  null,
      created_at:  now,
      expires_at:  end,
      trust_score: 0.7,
      vibe_tag:    category,
      source:      "user",
      ...(payloadLocationSource ? { location_source: payloadLocationSource } : {}),
      ...resolvedLocationMetadata,
    };

    console.log("[HADE UGC CREATED]", spontaneous);

    const persistResult = await persistUgc(ugcPayload);
    debugUgcStorage("persist_result", {
      status: persistResult.status,
      reason: "reason" in persistResult ? persistResult.reason : undefined,
      id: entityId,
    });

    if (persistResult.status !== "durable") {
      const localResult = saveLocalUgcDraft({
        saved_at: new Date().toISOString(),
        reason: persistResult.reason,
        ugc: ugcPayload,
        spontaneous,
        signal: signalPayload,
      });

      debugUgcStorage("local_fallback_result", {
        ok: localResult.ok,
        storage: localResult.storage,
        id: entityId,
      });

      if (!localResult.ok) {
        setErrorMsg("Couldn't save yet. Your entry is still here; try again when the connection returns.");
        setStatus("error");
        return;
      }

      emitVibeSignal(entityId, [signalTag], "positive", 0.9);
      void emitStorageSignal(signalPayload, deviceId);
      setErrorMsg(LOCAL_SAVE_MESSAGE);
      setStatus("local");
      return;
    }

    void emitStorageSignal(signalPayload, deviceId);
    emitVibeSignal(entityId, [signalTag], "positive", 0.9);

    setParticles(makeParticles());
    setStatus("success");
    resetMobileViewportAfterInput();
    onCreate?.(spontaneous);

    setTimeout(() => {
      setStatus("idle");
      setStep("what");
      setTitle("");
      setVibeId(null);
      setNotes("");
      setLocationLabel("");
      setLocationMode("none");
      setSelectedPlace(null);
      setPlaceQuery("");
      setPlaceResults([]);
      setPlaceSearchStatus("idle");
      setPinnedGeo(null);
      setPinSheetOpen(false);
      setTimeText(getDefaultActivityTime());
      setParticles([]);
    }, 2200);
  }

  return (
    <section
      ref={sheetRef}
      onPointerDownCapture={handleSheetPointerDownCapture}
      className="hade-add-sheet relative flex max-h-[calc(100dvh-16px)] min-h-0 w-full max-w-full flex-col overflow-hidden rounded-t-[24px] border border-b-0 border-line/70 bg-surface shadow-panel"
    >

      {/* ── Confetti burst ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 1, y: 0, x: 0, scale: 1, rotate: 0 }}
            animate={{ opacity: 0, y: -180, x: p.x, scale: 0.3, rotate: 480 }}
            transition={{ duration: 0.85 + p.delay, ease: "easeOut", delay: p.delay }}
            style={{
              position:      "absolute",
              bottom:        "50%",
              left:          "50%",
              width:         p.size,
              height:        p.size,
              borderRadius:  p.shape === "circle" ? "50%" : 2,
              background:    p.color,
              pointerEvents: "none",
              zIndex:        20,
            }}
          />
        ))}
      </AnimatePresence>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-line/50 px-4 pb-3 pt-2.5">
        <div className="mb-2 flex justify-center">
          <span className="h-1 w-9 rounded-full bg-ink/15" aria-hidden="true" />
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Add something</p>
            <h2 className="mt-0.5 text-lg font-semibold leading-tight text-ink">
              {step === "what"    ? "What's happening?" :
               step === "vibe"    ? "What's the vibe?"  : "Any details?"}
            </h2>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/40">
              Step {stepNumber} of 3
            </p>
          </div>
          {(step !== "what" || onClose) && (
            <button
              type="button"
              onClick={handleHeaderBack}
              disabled={status === "submitting"}
              className="min-h-8 shrink-0 rounded-full border border-line/60 bg-white/70 px-3 text-[11px] font-semibold text-ink/55 transition-colors active:bg-white disabled:opacity-45 focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
            >
              {step === "what" ? "Close" : "Back"}
            </button>
          )}
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 scroll-pb-28 overflow-y-auto overscroll-contain px-4 pb-4 pt-4"
      >
        <AnimatePresence mode="wait" initial={false}>

          {/* ── Step 1: Title input + mic ───────────────────────────────────── */}
          {step === "what" && (
            <motion.div
              key="what"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <div className="relative mb-4 flex items-center">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onFocus={handleFieldFocus}
                  placeholder="What do you want to add?"
                  className="w-full rounded-xl border border-line bg-white/70 px-3.5 py-3 pr-11 text-base text-ink placeholder:text-ink/30 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
                <button
                  type="button"
                  onClick={startListening}
                  aria-label={listening ? "Stop listening" : "Speak to describe your event"}
                  className={`absolute right-2.5 flex h-8 w-8 items-center justify-center rounded-full text-base transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    listening
                      ? "animate-pulse bg-accent/20 ring-1 ring-accent/40"
                      : "text-ink/35 hover:text-ink/60"
                  }`}
                >
                  🎤
                </button>
              </div>

            </motion.div>
          )}

          {/* ── Step 2: Vibe selection ──────────────────────────────────────── */}
          {step === "vibe" && (
            <motion.div
              key="vibe"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <div className="mb-4 grid grid-cols-2 gap-2">
                {VIBES.map((v) => {
                  const active = vibeId === v.id;
                  return (
                    <motion.button
                      key={v.id}
                      type="button"
                      whileTap={{ scale: 0.93 }}
                      onClick={() => setVibeId(active ? null : v.id)}
                      className={`min-h-10 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        active
                          ? "border-accent bg-accent text-white"
                          : "border-line bg-white/70 text-ink/70"
                      }`}
                    >
                      {v.label}
                    </motion.button>
                  );
                })}
              </div>

            </motion.div>
          )}

          {/* ── Step 3: Details + submit ────────────────────────────────────── */}
          {step === "details" && (
            <motion.div
              key="details"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {/* Summary row */}
              <div className="mb-3 flex items-center gap-2 rounded-xl bg-ink/5 px-3 py-2">
                <p className="flex-1 truncate text-[13px] font-semibold text-ink">{title}</p>
                {selectedVibe && (
                  <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                    {selectedVibe.label}
                  </span>
                )}
              </div>

              <fieldset className="mb-2.5">
                <legend className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/38">
                  Starts around
                </legend>
                <div className="rounded-xl border border-line bg-white/75 px-3 py-2.5 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
                  <div className="flex min-h-10 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/[0.055] text-[15px]"
                    >
                      ◷
                    </span>
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Start hour</span>
                      <select
                        value={selectedTimeParts?.hour12 ?? ""}
                        onChange={(e) => handleTimePartChange({ hour12: e.target.value })}
                        onFocus={handleFieldFocus}
                        aria-label="Start hour"
                        aria-invalid={Boolean(timeValidationMessage)}
                        className="h-10 w-full rounded-lg border border-line/70 bg-white px-2 text-base font-semibold text-ink outline-none focus:border-accent"
                      >
                        {HOUR_OPTIONS.map((hour) => (
                          <option key={hour} value={hour}>{hour}</option>
                        ))}
                      </select>
                    </label>
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Start minute</span>
                      <select
                        value={selectedTimeParts?.minute ?? ""}
                        onChange={(e) => handleTimePartChange({ minute: e.target.value })}
                        onFocus={handleFieldFocus}
                        aria-label="Start minute"
                        aria-invalid={Boolean(timeValidationMessage)}
                        className="h-10 w-full rounded-lg border border-line/70 bg-white px-2 text-base font-semibold text-ink outline-none focus:border-accent"
                      >
                        {MINUTE_OPTIONS.map((minute) => (
                          <option key={minute} value={minute}>{minute}</option>
                        ))}
                      </select>
                    </label>
                    <label className="w-[72px] shrink-0">
                      <span className="sr-only">Start time period</span>
                      <select
                        value={selectedTimeParts?.period ?? "AM"}
                        onChange={(e) => handleTimePartChange({ period: e.target.value as TimePeriod })}
                        onFocus={handleFieldFocus}
                        aria-label="Start time period"
                        aria-invalid={Boolean(timeValidationMessage)}
                        className="h-10 w-full rounded-lg border border-line/70 bg-white px-2 text-base font-semibold text-ink outline-none focus:border-accent"
                      >
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                      </select>
                    </label>
                  </div>
                  <p className="mt-1.5 text-[11px] font-medium text-ink/45">
                    {formatTimeLabel(timeText)}
                  </p>
                </div>
              </fieldset>

              <div className="mb-2.5 rounded-xl border border-line bg-white/70 px-3.5 py-3">
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/38">
                    Where is this?
                  </span>
                  <span className="mt-1 block text-[12px] leading-snug text-ink/45">
                    Add a location so people nearby can actually find it.
                  </span>
                </div>

                <div className="mt-2.5 grid grid-cols-1 gap-1.5 min-[390px]:grid-cols-3">
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    className={`min-h-10 rounded-xl border px-2.5 text-[12px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      locationMode === "current"
                        ? "border-accent bg-accent text-white"
                        : "border-line/70 bg-white text-ink/65"
                    }`}
                  >
                    Use current location
                  </button>
                  <button
                    type="button"
                    onClick={handlePlaceSearchMode}
                    className={`min-h-10 rounded-xl border px-2.5 text-[12px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      locationMode === "place"
                        ? "border-accent bg-accent text-white"
                        : "border-line/70 bg-white text-ink/65"
                    }`}
                  >
                    Search nearby place
                  </button>
                  <button
                    type="button"
                    onClick={handleManualLocationMode}
                    className={`min-h-10 rounded-xl border px-2.5 text-[12px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      locationMode === "manual"
                        ? "border-accent bg-accent text-white"
                        : "border-line/70 bg-white text-ink/65"
                    }`}
                  >
                    Add location note
                  </button>
                  {mapboxEnabled && (
                    <button
                      type="button"
                      onClick={handlePinSpotMode}
                      className={`min-h-10 rounded-xl border px-2.5 text-[12px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        locationMode === "pin"
                          ? "border-accent bg-accent text-white"
                          : "border-line/70 bg-white text-ink/65"
                      }`}
                    >
                      Pin exact spot
                    </button>
                  )}
                </div>

                <div
                  className={`mt-2.5 rounded-xl border px-3 py-2 text-[12px] font-medium leading-snug ${
                    locationStatus === "denied" && locationMode === "none"
                      ? "border-amber-300/40 bg-amber-50 text-amber-800"
                      : "border-line/60 bg-white/70 text-ink/56"
                  }`}
                  role={locationStatus === "denied" ? "status" : undefined}
                >
                  {locationSummary}
                </div>

                {pinSheetOpen && (
                  <div className="mt-2.5">
                    <PinSpotSheet
                      initialGeo={pinInitialGeo}
                      anchorLabel={selectedPlace?.name}
                      onConfirm={handlePinConfirm}
                      onCancel={handlePinCancel}
                    />
                  </div>
                )}

                {locationMode === "pin" && pinnedGeo && !pinSheetOpen && (
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={handleChangePin}
                      className="min-h-[44px] flex-1 rounded-xl border border-line/70 bg-white px-3 text-[12px] font-semibold text-ink/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent active:bg-ink/[0.04]"
                    >
                      Change pin
                    </button>
                    <button
                      type="button"
                      onClick={handleRemovePin}
                      className="min-h-[44px] flex-1 rounded-xl border border-line/70 bg-white px-3 text-[12px] font-semibold text-ink/55 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent active:bg-ink/[0.04]"
                    >
                      Remove pin
                    </button>
                  </div>
                )}

                {locationMode === "place" && (
                  <div className="mt-2.5 space-y-2">
                    <input
                      type="search"
                      value={placeQuery}
                      onChange={(e) => handlePlaceQueryChange(e.target.value)}
                      onFocus={handleFieldFocus}
                      placeholder="Search nearby places"
                      className="w-full rounded-xl border border-line/70 bg-white px-3 py-2.5 text-base text-ink placeholder:text-ink/30 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />

                    {placeSearchStatus === "idle" && (
                      <p className="rounded-lg bg-ink/[0.04] px-3 py-2 text-[11px] text-ink/45">
                        Type at least 2 characters to search nearby places.
                      </p>
                    )}

                    {placeSearchStatus === "loading" && (
                      <p className="rounded-lg bg-ink/[0.04] px-3 py-2 text-[11px] text-ink/45">
                        Finding nearby places...
                      </p>
                    )}

                    {placeSearchStatus === "empty" && (
                      <p className="rounded-lg bg-ink/[0.04] px-3 py-2 text-[11px] text-ink/45">
                        No nearby places found yet. You can add a note instead.
                      </p>
                    )}

                    {placeSearchStatus === "error" && (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                        Couldn’t load places. You can still add a location note.
                      </p>
                    )}

                    {filteredPlaceResults.length > 0 && (
                      <div className="max-h-36 space-y-1.5 overflow-y-auto pr-0.5">
                        {filteredPlaceResults.slice(0, 6).map((place) => {
                          const active = selectedPlace?.id === place.id;
                          return (
                            <button
                              key={place.id}
                              type="button"
                              onClick={() => handleSelectPlace(place)}
                              className={`w-full rounded-xl border px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                                active
                                  ? "border-accent bg-accent/10"
                                  : "border-line/65 bg-white"
                              }`}
                            >
                              <span className="block truncate text-[13px] font-semibold text-ink">
                                {place.name}
                              </span>
                              {place.address && (
                                <span className="mt-0.5 block truncate text-[11px] text-ink/42">
                                  {place.address}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {locationMode === "manual" && (
                  <div className="mt-2.5">
                    <label htmlFor="activity-location-label" className="sr-only">
                      Add location note
                    </label>
                    <input
                      id="activity-location-label"
                      type="text"
                      value={locationLabel}
                      onChange={(e) => setLocationLabel(e.target.value)}
                      onFocus={handleFieldFocus}
                      placeholder="e.g. Bluebird Cafe, Main Street, near the trailhead"
                      className="w-full rounded-xl border border-line/70 bg-white px-3.5 py-2.5 text-base text-ink placeholder:text-ink/30 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                  </div>
                )}

                <p className="mt-1.5 text-[11px] leading-snug text-ink/38">
                  Only add a location if it helps people find it.
                </p>
              </div>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onFocus={handleFieldFocus}
                placeholder="Notes (optional)"
                rows={2}
                className="mb-4 w-full resize-none rounded-xl border border-line bg-white/70 px-3.5 py-2.5 text-base text-ink placeholder:text-ink/30 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />

              {(timeValidationMessage || errorMsg) && (
                <p
                  className={`mb-3 rounded-lg px-3 py-2 text-xs ${
                    status === "local"
                      ? "bg-accent/10 text-accent"
                      : "bg-red-50 text-red-600"
                  }`}
                  role={status === "local" ? "status" : "alert"}
                >
                  {errorMsg ?? timeValidationMessage}
                </p>
              )}

            </motion.div>
          )}

        </AnimatePresence>
      </div>

      <footer
        onPointerDownCapture={handleFooterPointerDownCapture}
        onClickCapture={handleFooterClickCapture}
        className="sticky bottom-0 z-10 shrink-0 border-t border-line/60 bg-surface/95 px-4 pb-[max(14px,calc(env(safe-area-inset-bottom,0px)+14px))] pt-3 backdrop-blur"
      >
        <AnimatePresence mode="wait" initial={false}>
          {step === "what" && (
            <motion.div
              key="what-actions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
              <button
                type="button"
                disabled={!title.trim()}
                onClick={() => setStep("vibe")}
                className="h-11 w-full rounded-xl bg-black text-sm font-semibold text-white transition-opacity disabled:opacity-35 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent active:opacity-80"
              >
                Continue
              </button>
            </motion.div>
          )}

          {step === "vibe" && (
            <motion.div
              key="vibe-actions"
              className="flex gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
              <button
                type="button"
                onClick={() => setStep("what")}
                className="min-h-10 rounded-xl border border-line bg-white/70 px-4 text-sm font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep("details")}
                className="min-h-10 flex-1 rounded-xl bg-black text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent active:opacity-80"
              >
                Continue
              </button>
            </motion.div>
          )}

          {step === "details" && (
            <motion.div
              key="details-actions"
              className="flex gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
              <button
                type="button"
                onClick={() => setStep("vibe")}
                disabled={status === "submitting"}
                className="min-h-10 rounded-xl border border-line bg-white/70 px-4 text-sm font-semibold text-ink disabled:opacity-50 focus:outline-none"
              >
                Back
              </button>
              <motion.button
                type="button"
                onClick={handleCreate}
                disabled={submitDisabled}
                whileTap={!submitDisabled ? { scale: 0.97 } : undefined}
                className="min-h-10 flex-1 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {submitLabel}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </footer>
    </section>
  );
}

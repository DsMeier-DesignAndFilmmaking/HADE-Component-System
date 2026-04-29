export type SpontaneousObjectType = "ugc_event" | "place_opportunity";
export type UserState = "going" | "maybe" | null;

export interface SpontaneousObject {
  id: string;
  type: SpontaneousObjectType;
  title: string;
  time_window: { start: number; end: number };
  location: { lat: number; lng: number; place_id?: string };
  radius: number;
  going_count: number;
  maybe_count: number;
  user_state: "going" | "maybe" | null;
  created_at: number;
  expires_at: number;
  trust_score: number;
  vibe_tag?: string;
  source?: string;
}

/** Raw Google Places API response shape accepted by fromGooglePlace. */
export interface GooglePlaceInput {
  place_id: string;
  name: string;
  geometry: { location: { lat: number; lng: number } };
  vibe?: string;
}

export interface UGCInput {
  id: string;
  title: string;
  location: { lat: number; lng: number; place_id?: string };
  type?: SpontaneousObjectType;
  time_window?: { start?: number; end?: number };
  radius?: number;
  going_count?: number;
  maybe_count?: number;
  user_state?: UserState;
  trust_score?: number;
  vibe_tag?: string;
  source?: string;
  created_at?: number;
  expires_at?: number;
}

export function fromGooglePlace(place: GooglePlaceInput): SpontaneousObject {
  const now = Date.now();
  return {
    id: place.place_id,
    type: "place_opportunity",
    title: place.name,
    time_window: { start: now, end: now + 60 * 60 * 1000 },
    location: { lat: place.geometry.location.lat, lng: place.geometry.location.lng, place_id: place.place_id },
    radius: 500,
    going_count: 0,
    maybe_count: 0,
    user_state: null,
    created_at: now,
    expires_at: now + 2 * 60 * 60 * 1000,
    trust_score: 0.5,
    vibe_tag: place.vibe,
    source: "google_places",
  };
}

export function fromUGC(input: UGCInput): SpontaneousObject {
  const now = Date.now();
  return {
    id: input.id,
    type: "ugc_event",
    title: input.title,
    time_window: {
      start: input.time_window?.start ?? now,
      end: input.time_window?.end ?? now + 2 * 60 * 60 * 1000,
    },
    location: input.location,
    radius: input.radius ?? 300,
    going_count: input.going_count ?? 0,
    maybe_count: input.maybe_count ?? 0,
    user_state: input.user_state ?? null,
    created_at: input.created_at ?? now,
    expires_at: input.expires_at ?? now + 2 * 60 * 60 * 1000,
    trust_score: input.trust_score ?? 0.5,
    vibe_tag: input.vibe_tag,
    source: input.source,
  };
}

export function updateParticipation(
  object: SpontaneousObject,
  newState: UserState,
): SpontaneousObject {
  if (object.user_state === newState) return object;

  let going = object.going_count;
  let maybe = object.maybe_count;

  if (object.user_state === "going") going = Math.max(0, going - 1);
  if (object.user_state === "maybe") maybe = Math.max(0, maybe - 1);

  if (newState === "going") going += 1;
  if (newState === "maybe") maybe += 1;

  return { ...object, going_count: going, maybe_count: maybe, user_state: newState };
}

export function generateExplanation(object: SpontaneousObject): string {
  const now = Date.now();
  const minutesUntilStart = Math.max(0, Math.ceil((object.time_window.start - now) / 60_000));
  const timeCopy = object.time_window.start <= now ? "happening now" : `starting in ${minutesUntilStart} min`;
  const participationCopy = object.going_count === 1 ? "1 person is going" : `${object.going_count} people are going`;
  return `This is ${timeCopy}, and ${participationCopy}.`;
}

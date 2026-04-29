export type SpontaneousObjectType = "ugc_event" | "place_opportunity";
export type SpontaneousUserState = "going" | "maybe" | null;

export interface SpontaneousObject {
  id: string;
  type: SpontaneousObjectType;
  title: string;
  time_window: {
    start: number;
    end: number;
  };
  location: {
    lat: number;
    lng: number;
    place_id?: string;
  };
  radius: number;
  going_count: number;
  maybe_count: number;
  user_state: SpontaneousUserState;
  created_at: number;
  expires_at: number;
  trust_score: number;
  vibe_tag?: string;
  source?: string;
}

export function fromGooglePlace(place: any): SpontaneousObject {
  const now = Date.now();
  return {
    id: place.place_id || crypto.randomUUID(),
    type: "place_opportunity",
    title: place.name,
    time_window: { start: now, end: now + 60 * 60 * 1000 },
    location: {
      lat: place.geometry?.location?.lat,
      lng: place.geometry?.location?.lng,
      place_id: place.place_id
    },
    radius: 100,
    going_count: 0,
    maybe_count: 0,
    user_state: null,
    created_at: now,
    expires_at: now + 60 * 60 * 1000,
    trust_score: 0.5
  };
}

export function fromUGC(input: Partial<SpontaneousObject>): SpontaneousObject {
  const now = Date.now();
  return {
    id: input.id || crypto.randomUUID(),
    type: "ugc_event",
    title: input.title || "Untitled activity",
    time_window: input.time_window || { start: now, end: now + 60 * 60 * 1000 },
    location: input.location!,
    radius: input.radius || 100,
    going_count: 0,
    maybe_count: 0,
    user_state: null,
    created_at: now,
    expires_at: input.expires_at || now + 2 * 60 * 60 * 1000,
    trust_score: 0.7,
    vibe_tag: input.vibe_tag,
    source: input.source
  };
}

export function updateParticipation(
  object: SpontaneousObject,
  newState: SpontaneousUserState
): SpontaneousObject {
  if (object.user_state === newState) return object;

  const next = { ...object };

  if (object.user_state === "going") {
    next.going_count = Math.max(0, next.going_count - 1);
  }
  if (object.user_state === "maybe") {
    next.maybe_count = Math.max(0, next.maybe_count - 1);
  }

  if (newState === "going") {
    next.going_count += 1;
  }
  if (newState === "maybe") {
    next.maybe_count += 1;
  }

  next.user_state = newState;
  return next;
}

export function generateExplanation(object: SpontaneousObject): string {
  const now = Date.now();
  const start = object.time_window.start;
  const minutesUntilStart = Math.max(0, Math.ceil((start - now) / 60_000));
  const timeCopy = start <= now ? "happening now" : `starting in ${minutesUntilStart} min`;
  const participationCopy =
    object.going_count === 1
      ? "1 person is going"
      : `${object.going_count} people are going`;

  return `This is ${timeCopy}, and ${participationCopy}.`;
}

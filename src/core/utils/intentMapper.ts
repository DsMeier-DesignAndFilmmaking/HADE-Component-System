import type { TimeOfDay } from "@/types/hade";

export type SyntheticIntentCluster =
  | "focus"
  | "nature"
  | "energy"
  | "fuel"
  | "anything";

const CLUSTER_TYPE_MAP: Record<Exclude<SyntheticIntentCluster, "anything">, string[]> = {
  focus: ["cafe", "library", "book_store"],
  nature: ["park", "campground", "aquarium"],
  energy: ["bar", "nightclub", "tourist_attraction"],
  fuel: ["restaurant", "bakery", "cafe"],
};

const FOCUS_KEYWORDS = ["focus", "work", "study"];
const NATURE_KEYWORDS = ["nature", "fresh air", "quiet"];
const ENERGY_KEYWORDS = ["energy", "vibe", "social", "scene"];
const FUEL_KEYWORDS = ["fuel", "eat", "drink", "coffee", "food"];

export function resolveIntentCluster(intent: string | null | undefined): SyntheticIntentCluster {
  const normalized = intent?.trim().toLowerCase() ?? "";

  if (!normalized || normalized === "anything") return "anything";
  if (matchesAny(normalized, FOCUS_KEYWORDS)) return "focus";
  if (matchesAny(normalized, NATURE_KEYWORDS)) return "nature";
  if (matchesAny(normalized, ENERGY_KEYWORDS)) return "energy";
  if (matchesAny(normalized, FUEL_KEYWORDS)) return "fuel";

  switch (normalized) {
    case "chill":
      return "nature";
    case "scene":
      return "energy";
    case "eat":
    case "drink":
      return "fuel";
    default:
      return "anything";
  }
}

export function mapIntentToPlacesCategory(
  intent: string,
  time?: TimeOfDay | string | null,
): string[] {
  const cluster = resolveIntentCluster(intent);
  const normalizedTime = normalizeTime(time);

  if (cluster === "anything") {
    return [];
  }

  const base = CLUSTER_TYPE_MAP[cluster];

  if (cluster === "focus" && isLateFocusWindow(normalizedTime)) {
    return dedupe(["coffee_shop", "cafe", "library", "book_store", ...base]);
  }

  if (cluster === "energy" && isMorningEnergyWindow(normalizedTime)) {
    return dedupe(["cafe", "gym", "tourist_attraction", "bar", "nightclub", ...base]);
  }

  return [...base];
}

function matchesAny(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function normalizeTime(time: TimeOfDay | string | null | undefined): string | null {
  return typeof time === "string" ? time.toLowerCase() : null;
}

function isLateFocusWindow(time: string | null): boolean {
  const hour = extractHour(time);
  if (hour !== null) return hour >= 21;
  return time === "late_night";
}

function isMorningEnergyWindow(time: string | null): boolean {
  const hour = extractHour(time);
  if (hour !== null) return hour < 11;
  return time === "morning";
}

function extractHour(time: string | null): number | null {
  if (!time) return null;

  const match = time.match(/^(\d{1,2})(?::\d{2})?/);
  if (!match) return null;

  const hour = Number(match[1]);
  return Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

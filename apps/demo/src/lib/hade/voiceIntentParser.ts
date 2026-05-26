import type { Intent } from "@/types/hade";

export interface VoiceIntent {
  intent: Intent | null;
  urgency: "low" | "medium" | "high" | null;
  state?: { energy: "low" | "medium" | "high" };
  constraints?: {
    time_available_minutes?: number;
    distance_tolerance?: "walking" | "short_drive" | "any";
  };
  candidate_categories_exclude?: string[];
  raw_transcript: string;
  parsed_summary: string;
}

const FOOD_CATEGORIES = ["restaurant", "cafe", "bakery", "meal_takeaway", "food"] as const;

const INTENT_KEYWORDS: Array<{ intent: Intent; words: string[] }> = [
  { intent: "eat",     words: ["eat", "food", "hungry", "restaurant", "meal", "bite", "lunch", "dinner", "snack", "pizza", "burger", "sushi"] },
  { intent: "drink",   words: ["drink", "coffee", "tea", "beer", "cocktail", "bar", "cafe", "latte", "espresso", "juice", "thirsty"] },
  { intent: "chill",   words: ["chill", "relax", "quiet", "calm", "park", "slow", "unwind", "peaceful", "rest", "sit", "lounge"] },
  { intent: "scene",   words: ["scene", "vibe", "interesting", "culture", "explore", "gallery", "museum", "art", "event", "live", "social", "people", "buzz"] },
  { intent: "anything", words: ["anything", "surprise", "whatever", "no preference"] },
];

const URGENCY_HIGH_WORDS = ["quick", "hurry", "fast", "urgent", "asap", "immediately", "in a rush"];
const URGENCY_LOW_WORDS  = ["slow", "relaxed", "no rush", "take my time", "leisurely", "not in a hurry", "low pressure"];

const ENERGY_LOW_WORDS  = ["tired", "exhausted", "drained", "low energy", "worn out", "worn down"];
const ENERGY_HIGH_WORDS = ["energetic", "pumped", "wired", "fired up"];

const EXCLUSION_PHRASES = ["not a restaurant", "no food", "nothing to eat", "not hungry", "skip the restaurant", "no dining"];

function containsPhrase(text: string, phrases: string[]): boolean {
  return phrases.some((p) => text.includes(p));
}

function containsWord(text: string, words: string[]): boolean {
  return words.some((w) => {
    if (w.includes(" ")) return text.includes(w);
    const re = new RegExp(`(?:^|\\W)${w}(?:\\W|$)`);
    return re.test(text);
  });
}

function parseTimeMinutes(text: string): number | null {
  const explicit = /(\d+)\s*(?:min(?:utes?)?|mins?)/.exec(text);
  if (explicit) return parseInt(explicit[1], 10);
  if (/half\s*(?:an?\s*)?hour/.test(text)) return 30;
  if (/(?:an?\s*)?hour/.test(text)) return 60;
  return null;
}

function buildSummary(parts: string[]): string {
  return parts.length > 0 ? parts.join(" · ") : "No preferences detected";
}

export function parseVoiceIntent(transcript: string): VoiceIntent {
  const raw = transcript;
  const t = transcript.trim().toLowerCase();

  if (!t) {
    return { intent: null, urgency: null, raw_transcript: raw, parsed_summary: "No preferences detected" };
  }

  // Category exclusion (detect before intent matching so we can strip the phrases)
  const candidate_categories_exclude = containsPhrase(t, EXCLUSION_PHRASES)
    ? [...FOOD_CATEGORIES]
    : undefined;

  // Strip exclusion phrases before intent matching to avoid false positives
  // e.g. "not a restaurant" should not trigger the "eat" intent via "restaurant"
  let intentText = t;
  for (const phrase of EXCLUSION_PHRASES) {
    intentText = intentText.replace(phrase, " ");
  }

  // Intent (first match wins)
  let intent: Intent | null = null;
  for (const { intent: i, words } of INTENT_KEYWORDS) {
    if (containsWord(intentText, words)) { intent = i; break; }
  }

  // Time
  const time_available_minutes = parseTimeMinutes(t) ?? undefined;

  // Urgency
  let urgency: VoiceIntent["urgency"] = null;
  if (time_available_minutes !== undefined && time_available_minutes <= 20) {
    urgency = "high";
  } else if (containsWord(t, URGENCY_HIGH_WORDS)) {
    urgency = "high";
  } else if (containsWord(t, URGENCY_LOW_WORDS) || containsWord(t, ENERGY_LOW_WORDS)) {
    urgency = "low";
  }

  // Energy state
  let energy: "low" | "medium" | "high" | undefined;
  if (containsWord(t, ENERGY_LOW_WORDS)) energy = "low";
  else if (containsWord(t, ENERGY_HIGH_WORDS)) energy = "high";

  // Distance
  let distance_tolerance: "walking" | "short_drive" | "any" | undefined;
  if (containsWord(t, ["close", "nearby", "walking", "on foot", "around here", "near me"])) {
    distance_tolerance = "walking";
  } else if (containsPhrase(t, ["short drive", "not too far", "a bit of a trip"])) {
    distance_tolerance = "short_drive";
  } else if (containsPhrase(t, ["doesn't matter how far", "anywhere"])) {
    distance_tolerance = "any";
  }

  // Summary
  const summaryParts: string[] = [];
  if (intent)                              summaryParts.push(`Mood: ${intent.charAt(0).toUpperCase() + intent.slice(1)}`);
  else                                     summaryParts.push("No specific mood");
  if (urgency === "high")                  summaryParts.push(time_available_minutes ? `${time_available_minutes} min` : "Urgency: High");
  if (urgency === "low")                   summaryParts.push("Urgency: Low");
  if (energy === "low")                    summaryParts.push("Low energy");
  if (energy === "high")                   summaryParts.push("High energy");
  if (distance_tolerance === "walking")    summaryParts.push("Walking distance");
  if (distance_tolerance === "short_drive") summaryParts.push("Short drive OK");
  if (candidate_categories_exclude)        summaryParts.push("No food/restaurants");

  const constraints = (time_available_minutes !== undefined || distance_tolerance !== undefined)
    ? { ...(time_available_minutes !== undefined && { time_available_minutes }), ...(distance_tolerance && { distance_tolerance }) }
    : undefined;

  return {
    intent,
    urgency,
    ...(energy !== undefined && { state: { energy } }),
    ...(constraints && { constraints }),
    ...(candidate_categories_exclude && { candidate_categories_exclude }),
    raw_transcript: raw,
    parsed_summary: buildSummary(summaryParts),
  };
}

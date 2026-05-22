import type {
  HadeContext,
  Signal,
  TravelerState,
  TravelerStateLabel,
} from "@/types/hade";

export interface TravelerStateInferenceInput {
  constraints?: Partial<HadeContext["constraints"]>;
  situation?: Partial<HadeContext["situation"]>;
  state?: Partial<HadeContext["state"]>;
  social?: Partial<HadeContext["social"]>;
  signals?: Signal[];
  rejection_history?: HadeContext["rejection_history"];
  candidate_categories?: readonly string[];
  day_type?: HadeContext["day_type"];
  intent?: unknown;
  lens?: unknown;
  mode?: unknown;
}

const LOW_ENERGY_TERMS = [
  "tired",
  "exhausted",
  "drained",
  "low energy",
  "low_energy",
  "recover",
  "recovery",
  "rest",
  "quiet",
  "chill",
];

const ADVENTURE_TERMS = [
  "adventure",
  "adventurous",
  "explore",
  "exploration",
  "discover",
  "surprise",
  "wander",
  "new",
  "novel",
];

const WELLNESS_TERMS = ["wellness", "health", "yoga", "spa", "gym", "recovery"];
const SOCIAL_TERMS = ["social", "scene", "friends", "group", "bar", "event", "nightlife"];

const STATE_PRIORITY: TravelerStateLabel[] = [
  "decision_fatigue",
  "recovering",
  "socializing",
  "waiting",
  "time_constrained",
  "micro_adventure_ready",
  "low_energy",
  "high_energy",
  "adventurous",
  "open_to_surprise",
  "open_to_anything",
];

function normalize(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[\s-]+/g, "_")
    : "";
}

function humanize(token: string): string {
  return token.replace(/_/g, " ");
}

function includesAny(haystack: string, terms: readonly string[]): boolean {
  const normalized = haystack.replace(/_/g, " ");
  return terms.some((term) => normalized.includes(term.replace(/_/g, " ")));
}

function addState(
  states: TravelerStateLabel[],
  state: TravelerStateLabel,
): void {
  if (!states.includes(state)) states.push(state);
}

function priorityOf(state: TravelerStateLabel): number {
  const index = STATE_PRIORITY.indexOf(state);
  return index === -1 ? STATE_PRIORITY.length : index;
}

function getIntent(input: TravelerStateInferenceInput): string {
  return normalize(input.situation?.intent ?? input.intent);
}

function getSignals(input: TravelerStateInferenceInput): Signal[] {
  return Array.isArray(input.signals)
    ? input.signals.filter((signal): signal is Signal => Boolean(signal))
    : [];
}

function getTextCorpus(input: TravelerStateInferenceInput): string {
  const signals = getSignals(input);
  const parts = [
    input.intent,
    input.situation?.intent,
    input.mode,
    input.lens,
    input.state?.energy,
    input.state?.openness,
    ...(input.candidate_categories ?? []),
    ...signals.map((signal) => signal.content),
    ...(input.rejection_history ?? []).map((entry) => entry.pivot_reason),
  ];

  return parts
    .map((part) => (typeof part === "string" ? part : ""))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildExplanation(primary: TravelerStateLabel, states: TravelerStateLabel[]): string {
  const reason = (() => {
    switch (primary) {
      case "waiting":
        return "Short available time suggests a waiting state.";
      case "micro_adventure_ready":
        return "Available time is enough for a compact micro-adventure.";
      case "decision_fatigue":
        return "Multiple rejections suggest decision fatigue.";
      case "open_to_surprise":
        return "No intent or signals were present, so the user appears open to surprise.";
      case "recovering":
        return "Wellness context or low-energy wording suggests recovery.";
      case "socializing":
        return "Social mode or social wording suggests a socializing state.";
      case "low_energy":
        return "Low-energy wording or state suggests a lower-effort option.";
      case "high_energy":
        return "High-energy or exploration wording suggests an active state.";
      case "time_constrained":
        return "The available time window is tight.";
      default:
        return `Detected traveler state: ${humanize(primary)}.`;
    }
  })();

  if (states.length <= 1) return reason;
  return `${reason} Secondary states: ${states.slice(1).map(humanize).join(", ")}.`;
}

function confidenceFor(states: TravelerStateLabel[], evidenceCount: number): number {
  const confidence = 0.5 + Math.min(states.length, 4) * 0.06 + Math.min(evidenceCount, 4) * 0.04;
  return Math.round(Math.min(0.95, Math.max(0.5, confidence)) * 100) / 100;
}

export function inferTravelerState(input: TravelerStateInferenceInput = {}): TravelerState {
  const states: TravelerStateLabel[] = [];
  const text = getTextCorpus(input);
  const mode = normalize(input.mode);
  const lens = normalize(input.lens);
  const intent = getIntent(input);
  const signals = getSignals(input);
  const timeAvailable = input.constraints?.time_available_minutes;
  const rejectionCount = input.rejection_history?.length ?? 0;

  if (typeof timeAvailable === "number" && Number.isFinite(timeAvailable)) {
    if (timeAvailable <= 20) {
      addState(states, "waiting");
      addState(states, "time_constrained");
    } else if (timeAvailable <= 45) {
      addState(states, "micro_adventure_ready");
    }
  }

  if (rejectionCount >= 2) addState(states, "decision_fatigue");
  if (!intent && signals.length === 0) addState(states, "open_to_surprise");

  if (mode === "wellness" || lens === "wellness" || includesAny(text, WELLNESS_TERMS)) {
    addState(states, "recovering");
  }

  if (mode === "social" || lens === "social" || lens === "social_interaction" || includesAny(text, SOCIAL_TERMS)) {
    addState(states, "socializing");
  }

  if (input.state?.energy === "low" || includesAny(text, LOW_ENERGY_TERMS)) {
    addState(states, "low_energy");
  }

  if (input.state?.energy === "high") {
    addState(states, "high_energy");
  }

  if (input.state?.openness === "adventurous" || includesAny(text, ADVENTURE_TERMS)) {
    addState(states, input.state?.energy === "high" ? "high_energy" : "adventurous");
  }

  if (states.length === 0) addState(states, "open_to_anything");

  states.sort((a, b) => {
    const priorityDiff = priorityOf(a) - priorityOf(b);
    return priorityDiff !== 0 ? priorityDiff : a.localeCompare(b);
  });

  const evidenceCount = [
    typeof timeAvailable === "number",
    rejectionCount > 0,
    Boolean(intent),
    signals.length > 0,
    Boolean(mode || lens),
    Boolean(input.state?.energy),
    Boolean(input.state?.openness),
  ].filter(Boolean).length;

  return {
    primary_state: states[0],
    secondary_states: states.slice(1),
    confidence: confidenceFor(states, evidenceCount),
    explanation: buildExplanation(states[0], states),
  };
}

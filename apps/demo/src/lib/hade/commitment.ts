import type {
  CommitmentAction,
  HadeDecision,
  RejectionEntry,
  Signal,
  TravelerState,
} from "@/types/hade";
import { getLensProfile } from "@/lib/hade/lensProfiles";
import { inferTravelerState, type TravelerStateInferenceInput } from "@/lib/hade/travelerState";

export interface BuildCommitmentActionInput {
  traveler_state?: TravelerState | null;
  constraints?: { time_available_minutes?: number };
  situation?: { intent?: string | null };
  mode?: string;
  lens?: string;
  venue_name?: string;
  title?: string;
  category?: string;
  neighborhood?: string;
  location?: string;
  eta_minutes?: number;
}

type CommitmentTemplateKey = "food" | "outdoor" | "surprise" | "social" | "default";

const FOOD_CATEGORIES = new Set([
  "cafe",
  "coffee",
  "restaurant",
  "bakery",
  "meal_takeaway",
  "food",
  "bar",
]);

const OUTDOOR_CATEGORIES = new Set(["park", "campground"]);

const TEMPLATES: Record<
  CommitmentTemplateKey,
  {
    action_title: string;
    action_steps: readonly string[];
    default_minutes: number;
    cta_short: string;
  }
> = {
  food: {
    action_title: "Use this as a quick food reset",
    action_steps: [
      "Head there now.",
      "Order something simple.",
      "Stay within your available time window.",
    ],
    default_minutes: 25,
    cta_short: "Start quick reset",
  },
  outdoor: {
    action_title: "Take a low-effort reset walk",
    action_steps: [
      "Walk one simple loop.",
      "Keep it relaxed.",
      "Head back before your next stop.",
    ],
    default_minutes: 30,
    cta_short: "Start reset walk",
  },
  surprise: {
    action_title: "Turn this into a small spontaneous move",
    action_steps: [
      "Go with this pick.",
      "Keep it light.",
      "Bail early if it doesn't feel right.",
    ],
    default_minutes: 20,
    cta_short: "Start spontaneous move",
  },
  social: {
    action_title: "Drop in for a low-key social moment",
    action_steps: [
      "Head there now.",
      "Stay open to the vibe.",
      "Leave when your window ends.",
    ],
    default_minutes: 45,
    cta_short: "Start social stop",
  },
  default: {
    action_title: "Make this your next move",
    action_steps: [
      "Head there now.",
      "Stay as long as it feels right.",
      "Leave when your window ends.",
    ],
    default_minutes: 25,
    cta_short: "Do this now",
  },
};

const TIME_BOX_MIN = 10;
const TIME_BOX_MAX = 90;

function normalize(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[\s-]+/g, "_")
    : "";
}

function normalizeCategory(category: unknown): string {
  const normalized = normalize(category);
  if (!normalized) return "";

  if (FOOD_CATEGORIES.has(normalized)) return normalized;
  if (OUTDOOR_CATEGORIES.has(normalized)) return normalized;
  if (normalized.includes("coffee") || normalized.includes("cafe")) return "cafe";
  if (normalized.includes("restaurant") || normalized.includes("food")) return "restaurant";
  if (normalized.includes("park")) return "park";
  return normalized;
}

function getIntent(input: BuildCommitmentActionInput): string {
  return normalize(input.situation?.intent);
}

function getVenueName(input: BuildCommitmentActionInput): string | undefined {
  const name = (input.venue_name ?? input.title)?.trim();
  return name || undefined;
}

function isFoodContext(input: BuildCommitmentActionInput, category: string): boolean {
  const intent = getIntent(input);
  const mode = normalize(input.mode);
  const lens = normalize(input.lens);

  if (FOOD_CATEGORIES.has(category)) return true;
  if (intent === "eat" || intent === "drink") return true;
  if (mode === "dining") return true;
  if (lens === "food_dining" || lens === "food") return true;
  return false;
}

function isOutdoorContext(input: BuildCommitmentActionInput, category: string): boolean {
  const lens = normalize(input.lens);
  const mode = normalize(input.mode);

  if (OUTDOOR_CATEGORIES.has(category)) return true;
  if (lens === "wellness" && (category === "park" || category === "")) return true;
  if (mode === "wellness" && OUTDOOR_CATEGORIES.has(category)) return true;
  return false;
}

function isSocialContext(input: BuildCommitmentActionInput): boolean {
  const intent = getIntent(input);
  const mode = normalize(input.mode);
  const lens = normalize(input.lens);
  const primary = normalize(input.traveler_state?.primary_state);

  if (intent === "scene") return true;
  if (mode === "social") return true;
  if (lens === "social_interaction" || lens === "social") return true;
  if (primary === "socializing") return true;
  return false;
}

function isSurpriseContext(input: BuildCommitmentActionInput, category: string): boolean {
  const primary = normalize(input.traveler_state?.primary_state);
  const intent = getIntent(input);

  if (primary === "open_to_surprise") return true;
  if (!intent && !category) return true;
  return false;
}

function pickTemplate(input: BuildCommitmentActionInput): CommitmentTemplateKey {
  const category = normalizeCategory(input.category);

  if (isSurpriseContext(input, category) && !isFoodContext(input, category) && !isOutdoorContext(input, category)) {
    return "surprise";
  }
  if (isFoodContext(input, category)) return "food";
  if (isOutdoorContext(input, category)) return "outdoor";
  if (isSocialContext(input)) return "social";
  return "default";
}

function clampTimeBox(minutes: number): number {
  if (!Number.isFinite(minutes)) return TEMPLATES.default.default_minutes;
  return Math.min(TIME_BOX_MAX, Math.max(TIME_BOX_MIN, Math.round(minutes)));
}

function resolveTimeBoxMinutes(
  input: BuildCommitmentActionInput,
  templateKey: CommitmentTemplateKey,
): number {
  const available = input.constraints?.time_available_minutes;
  const templateDefault = TEMPLATES[templateKey].default_minutes;

  if (typeof available === "number" && Number.isFinite(available) && available > 0) {
    const eta = input.eta_minutes;
    if (typeof eta === "number" && Number.isFinite(eta) && eta > 0) {
      return clampTimeBox(available - 2 * eta);
    }
    return clampTimeBox(available);
  }

  return clampTimeBox(templateDefault);
}

function personalizeFirstStep(firstStep: string, venueName?: string): string {
  if (!venueName) return firstStep;
  if (firstStep.startsWith("Head there")) {
    return `Head to ${venueName} now.`;
  }
  if (firstStep.startsWith("Go with")) {
    return `Go with ${venueName}.`;
  }
  return firstStep;
}

function buildPrimaryCtaLabel(timeBoxMinutes: number, ctaShort: string): string {
  if (timeBoxMinutes >= TIME_BOX_MIN && timeBoxMinutes <= TIME_BOX_MAX) {
    return `Start ${timeBoxMinutes}-minute plan`;
  }
  return ctaShort;
}

/**
 * Deterministic commitment action for a selected HADE recommendation.
 * Safe under missing fields; no LLM or external API usage.
 */
export function buildCommitmentAction(
  input: BuildCommitmentActionInput = {},
): CommitmentAction {
  const templateKey = pickTemplate(input);
  const template = TEMPLATES[templateKey];
  const time_box_minutes = resolveTimeBoxMinutes(input, templateKey);
  const venueName = getVenueName(input);

  const action_steps = template.action_steps.map((step, index) =>
    index === 0 ? personalizeFirstStep(step, venueName) : step,
  );

  return {
    action_title: template.action_title,
    action_steps,
    time_box_minutes,
    primary_cta_label: buildPrimaryCtaLabel(time_box_minutes, template.cta_short),
  };
}

/** Spec alias for Phase 3+ API integration. */
export const deriveCommitmentAction = buildCommitmentAction;

function isValidCommitmentAction(value: unknown): value is CommitmentAction {
  if (!value || typeof value !== "object") return false;
  const c = value as CommitmentAction;
  return (
    typeof c.action_title === "string" &&
    c.action_title.trim().length > 0 &&
    Array.isArray(c.action_steps) &&
    c.action_steps.length > 0 &&
    c.action_steps.every((step) => typeof step === "string" && step.trim().length > 0) &&
    typeof c.time_box_minutes === "number" &&
    Number.isFinite(c.time_box_minutes) &&
    c.time_box_minutes > 0 &&
    typeof c.primary_cta_label === "string" &&
    c.primary_cta_label.trim().length > 0
  );
}

/**
 * Maps a finalized decision plus decide-request body into commitment builder input.
 */
export function buildCommitmentInputFromRequest(
  decision: HadeDecision,
  body: Record<string, unknown> = {},
): BuildCommitmentActionInput {
  const situation = body.situation as TravelerStateInferenceInput["situation"];
  const constraints = body.constraints as TravelerStateInferenceInput["constraints"];
  const state = body.state as TravelerStateInferenceInput["state"];
  const social = body.social as TravelerStateInferenceInput["social"];
  const mode = typeof body.mode === "string" ? body.mode : undefined;
  const lens = getLensProfile(mode).id;
  const title =
    typeof (decision as { title?: unknown }).title === "string"
      ? (decision as { title: string }).title
      : undefined;

  const inferenceInput: TravelerStateInferenceInput = {
    constraints,
    situation,
    state,
    social,
    signals: Array.isArray(body.signals) ? (body.signals as Signal[]) : undefined,
    rejection_history: Array.isArray(body.rejection_history)
      ? (body.rejection_history as RejectionEntry[])
      : undefined,
    candidate_categories: Array.isArray(body.candidate_categories)
      ? (body.candidate_categories as string[])
      : undefined,
    mode,
    lens,
    intent: situation?.intent,
  };

  const traveler_state = inferTravelerState(inferenceInput);

  return {
    traveler_state,
    constraints,
    situation,
    mode,
    lens,
    venue_name: decision.venue_name ?? title,
    title,
    category: decision.category,
    neighborhood: decision.neighborhood,
    eta_minutes: decision.eta_minutes,
  };
}

/**
 * Attach optional commitment metadata to a decision without mutating ranking or copy.
 * Never throws — returns the original decision when generation fails.
 */
export function enrichDecisionWithCommitment(
  decision: HadeDecision,
  body?: Record<string, unknown> | null,
): HadeDecision {
  try {
    const commitment = buildCommitmentAction(
      buildCommitmentInputFromRequest(decision, body ?? {}),
    );
    if (!isValidCommitmentAction(commitment)) {
      return decision;
    }
    return { ...decision, commitment };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn("[HADE COMMITMENT] attachment_failed", { detail });
    return decision;
  }
}

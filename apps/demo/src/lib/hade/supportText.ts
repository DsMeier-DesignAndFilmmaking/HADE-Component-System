import type { HadeContext } from "@/types/hade";

export type DecisionSupportLens = {
  id: string;
  label: string;
  headline?: string;
  subtext?: string;
  decisionSupportText?: string;
  context?: string;
  frame?: string;
};

export type DecisionCandidateType = "venue" | "ugc" | "created_ugc" | "fallback";

export type DecisionSupportInput = {
  lens: DecisionSupportLens;
  source?: string;
  candidateType: DecisionCandidateType;
  confidence: number;
  isFallback: boolean;
  isUGC: boolean;
  vibe?: string;
  context?: HadeContext | null;
  rationale?: string;
  whyNow?: string;
  /** ≤12-word contextual badge — preferred detail source when present. */
  whyThis?: string;
  decisionFrame?: string;
};

export type DecisionSupportText = {
  label: string;
  detail?: string;
};

const UGC_LINES = [
  "Recently added through the HADE community.",
  "Community-added nearby.",
  "Added nearby by another user.",
] as const;

const STATIC_LENS_PATTERNS = [
  "something worth doing tonight",
  "something nearby worth doing tonight",
  "reduce decision fatigue nearby",
  "inspiration over endless searching",
  "what makes sense right here, right now",
  "low-friction spontaneous connection",
  "context-aware nudges and resets",
  "make the next move easier",
  "a practical nearby decision based on where you are now",
  "best nearby move based on distance timing and current context",
  "reset without overthinking it",
  "a nearby wellness move matched to your energy time and season",
  "chosen for a low-friction reset based on time location and current conditions",
] as const;

function stableIndex(seed: string, length: number): number {
  if (length <= 1) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

function normalizeCopy(value: string): string {
  return value.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

function isStaticLensCopy(value: string | undefined, lens: DecisionSupportLens): boolean {
  if (!value) return true;
  const normalized = normalizeCopy(value);
  if (!normalized) return true;

  const lensContext = normalizeCopy(lens.context ?? "");
  const lensFrame = normalizeCopy(lens.frame ?? "");
  const lensHeadline = normalizeCopy(lens.headline ?? "");
  const lensSubtext = normalizeCopy(lens.subtext ?? "");
  const decisionSupportText = normalizeCopy(lens.decisionSupportText ?? "");
  if (
    normalized === lensContext ||
    normalized === lensFrame ||
    normalized === lensHeadline ||
    normalized === lensSubtext ||
    normalized === decisionSupportText
  ) {
    return true;
  }

  return STATIC_LENS_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function cleanCopy(value: string | undefined, lens: DecisionSupportLens): string | undefined {
  if (!value || isStaticLensCopy(value, lens)) return undefined;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < 12 || trimmed.length > 82) return undefined;
  return trimmed;
}

function isKnownLocation(context?: HadeContext | null): boolean {
  const geo = context?.geo;
  return Boolean(
    geo &&
      Number.isFinite(geo.lat) &&
      Number.isFinite(geo.lng) &&
      !(geo.lat === 0 && geo.lng === 0),
  );
}

function isGroupContext(context?: HadeContext | null): boolean {
  const social = context?.social;
  return Boolean(social && (social.group_size > 1 || social.group_type !== "solo"));
}

function fallbackSupport(source: string | undefined, context?: HadeContext | null): DecisionSupportText {
  if (source === "degraded_location" || !isKnownLocation(context)) {
    return { label: "Closest useful match with limited location context." };
  }

  if (source === "offline_cache") {
    return { label: "Best recent match while live context is limited." };
  }

  return {
    label:
      context?.situation.urgency === "high"
        ? "Closest useful match while live context is limited."
        : "Best nearby match while live context is limited.",
  };
}

function venueSupport(input: DecisionSupportInput): DecisionSupportText {
  const { context, confidence, lens } = input;
  const urgency = context?.situation.urgency;
  const energy = context?.state.energy;
  const openness = context?.state.openness;
  const group = isGroupContext(context);
  const knownLocation = isKnownLocation(context);

  if (lens.id === "food" || lens.id === "food_dining") {
    if (urgency === "high") return { label: "Closest useful food option right now." };
    if (group) return { label: "Nearby food option that should be easy for the group." };
    if (energy === "low") return { label: "Low-friction nearby food option for your current energy." };
    if (openness === "adventurous") return { label: "Nearby food pick with a little discovery built in." };
    return { label: "Low-friction nearby food option for your current window." };
  }

  if (lens.id === "wellness" || lens.id === "wellness_reset") {
    if (urgency === "high") return { label: "Closest useful reset for your current energy." };
    if (group) return { label: "Nearby reset that can work for the group." };
    return {
      label: knownLocation
        ? "Nearby reset that fits your current energy."
        : "Quiet reset that fits your current energy.",
    };
  }

  if (urgency === "high") {
    return {
      label: knownLocation ? "Closest useful match right now." : "Useful match for the moment right now.",
    };
  }

  if (group) {
    return { label: "Nearby option that should be easy for the group." };
  }

  if (energy === "low") {
    return {
      label: knownLocation
        ? "Low-friction nearby option for your current energy."
        : "Low-friction option for your current energy.",
    };
  }

  if (openness === "adventurous") {
    return {
      label: knownLocation
        ? "Nearby pick with a little discovery built in."
        : "Exploratory pick for your current mood.",
    };
  }

  switch (lens.id) {
    case "retail":
      return {
        label: knownLocation
          ? "Nearby browse that fits an open-ended moment."
          : "Useful browse for an open-ended moment.",
      };
    case "mobility":
    case "urban_mobility":
      return {
        label: knownLocation
          ? "Good nearby option based on your current direction."
          : "Practical next move for your current direction.",
      };
    case "entertainment":
      return {
        label: knownLocation
          ? "Nearby activity with low planning friction."
          : "Low-planning activity for right now.",
      };
    case "social":
    case "social_interaction":
      return {
        label: knownLocation
          ? "Nearby place with optional social energy."
          : "Low-pressure place for optional social energy.",
      };
    default:
      return {
        label:
          confidence >= 0.7
            ? "Popular nearby stop with low planning friction."
            : "Nearby place matching your current lens.",
      };
  }
}

function distinctDetail(label: string, detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  const normalizedLabel = normalizeCopy(label);
  const normalizedDetail = normalizeCopy(detail);
  if (!normalizedDetail || normalizedDetail === normalizedLabel) return undefined;
  if (normalizedDetail.includes(normalizedLabel) || normalizedLabel.includes(normalizedDetail)) return undefined;
  return detail;
}

export function resolveDecisionSupportText(input: DecisionSupportInput): DecisionSupportText {
  if (input.isUGC || input.candidateType === "ugc" || input.candidateType === "created_ugc") {
    const seed = `${input.source ?? ""}:${input.vibe ?? ""}:${input.lens.id}`;
    return {
      label: UGC_LINES[stableIndex(seed, UGC_LINES.length)],
    };
  }

  if (input.isFallback || input.candidateType === "fallback") {
    const fallback = fallbackSupport(input.source, input.context);
    const detail = cleanCopy(input.whyNow, input.lens);
    return { ...fallback, detail: distinctDetail(fallback.label, detail) };
  }

  const resolved = venueSupport(input);
  // Prefer the shortest contextual signal first (why_this ≤12 words),
  // then why_now (moment-specific reasoning), then rationale (full sentence),
  // with decision_frame as last resort since it's the most generic.
  const groundedDetail =
    cleanCopy(input.whyThis, input.lens) ??
    cleanCopy(input.whyNow, input.lens) ??
    cleanCopy(input.rationale, input.lens) ??
    cleanCopy(input.decisionFrame, input.lens);

  return {
    ...resolved,
    detail: distinctDetail(resolved.label, groundedDetail),
  };
}

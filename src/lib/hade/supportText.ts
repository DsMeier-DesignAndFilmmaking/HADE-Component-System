import type { HadeContext } from "@/types/hade";

export type DecisionSupportLens = {
  id: string;
  label: string;
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
  "Someone nearby just put this on the map.",
  "A fresh local note makes this worth a look.",
  "Recently added by someone in the area.",
] as const;

const STATIC_LENS_PATTERNS = [
  "something worth doing tonight",
  "something nearby worth doing tonight",
  "reduce decision fatigue nearby",
  "inspiration over endless searching",
  "what makes sense right here, right now",
  "low-friction spontaneous connection",
  "context-aware nudges and resets",
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
  if (normalized === lensContext || normalized === lensFrame) return true;

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
  const geoSource = context?.geo_source;

  if (source === "decision_request_timeout") {
    return {
      label: "Live results took too long, so this is a dependable backup.",
    };
  }

  if (source === "degraded_location" || geoSource === "unknown" || !isKnownLocation(context)) {
    return {
      label: "Location is unavailable, so this avoids pretending to be precise.",
    };
  }

  if (geoSource === "ip" || geoSource === "stored") {
    return {
      label: "Location is approximate, so this keeps the next move conservative.",
    };
  }

  if (source === "offline_cache" || source === "cache_recovery") {
    return { label: "Using a recent local option while live updates catch up." };
  }

  return {
    label:
      context?.situation.urgency === "high"
        ? "Live context is thin, so this keeps the next move simple."
        : "Live context is thin, so this is a dependable backup pick.",
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
    if (urgency === "high") return { label: "Quick food that should not turn into another search." };
    if (group) return { label: "An easy food call for more than one person." };
    if (energy === "low") return { label: "Simple food nearby, without a lot of effort." };
    if (openness === "adventurous") return { label: "A food pick with just enough discovery in it." };
    return { label: "A practical food call for the window you have." };
  }

  if (lens.id === "wellness" || lens.id === "wellness_reset") {
    if (urgency === "high") return { label: "A quick reset that should be easy to act on." };
    if (group) return { label: "A calmer option that can work for the group." };
    return {
      label: knownLocation
        ? "A nearby reset that matches the pace you seem to need."
        : "A quiet reset that matches the pace you seem to need.",
    };
  }

  if (urgency === "high") {
    return {
      label: knownLocation ? "The easiest useful move from here." : "A useful move for this moment.",
    };
  }

  if (group) {
    return { label: "A low-drama option for the group." };
  }

  if (energy === "low") {
    return {
      label: knownLocation
        ? "Close enough to say yes without overthinking it."
        : "Low-effort enough to say yes without overthinking it.",
    };
  }

  if (openness === "adventurous") {
    return {
      label: knownLocation
        ? "A small detour that still feels manageable."
        : "A small detour for an open-ended mood.",
    };
  }

  switch (lens.id) {
    case "retail":
      return {
        label: knownLocation
          ? "A browse-worthy stop without a big commitment."
          : "A browse-worthy stop for an open-ended moment.",
      };
    case "mobility":
    case "urban_mobility":
      return {
        label: knownLocation
          ? "A practical next move from where you are."
          : "A practical next move for the direction you are in.",
      };
    case "entertainment":
      return {
        label: knownLocation
          ? "Something to do without planning the whole night."
          : "Something to do without planning the whole night.",
      };
    case "social":
    case "social_interaction":
      return {
        label: knownLocation
          ? "A social option that does not force the night."
          : "A low-pressure place for optional social energy.",
      };
    default:
      return {
        label:
          confidence >= 0.7
            ? "A solid stop that should be easy to commit to."
            : "A reasonable fit for what you asked for.",
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

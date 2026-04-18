import { formatDistance, formatEta } from "./format";
import type { HadeSDKReasoning, HadeSDKResponse, RawDecisionAPIResponse } from "./types";

const FALLBACK_REASONS = [
  "Fits this moment",
  "Simple next move",
  "Ready right now",
] as const;

function cleanReason(text: string | undefined): string | null {
  if (!text) return null;

  const firstClause = text.split(/[.!?]/)[0]?.trim();
  if (!firstClause) return null;

  const compact = firstClause.replace(/\s+/g, " ").trim();
  if (!compact) return null;

  return compact.split(" ").slice(0, 8).join(" ");
}

function buildReasoning(input: RawDecisionAPIResponse): HadeSDKReasoning {
  const unique = new Set<string>();
  const orderedCandidates = [
    cleanReason(input.decision?.why_now),
    cleanReason(input.decision?.rationale),
    cleanReason(input.context_snapshot?.situation_summary ?? input.decision?.situation_summary),
    ...FALLBACK_REASONS,
  ];

  const reasons: string[] = [];

  for (const candidate of orderedCandidates) {
    if (!candidate || unique.has(candidate)) continue;
    unique.add(candidate);
    reasons.push(candidate);
    if (reasons.length === 3) break;
  }

  if (reasons.length >= 3) return [reasons[0], reasons[1], reasons[2]];
  if (reasons.length === 2) return [reasons[0], reasons[1]];
  if (reasons.length === 1) return [reasons[0], FALLBACK_REASONS[1]];
  return [];
}

export function toSDKResponse(input: RawDecisionAPIResponse | null): HadeSDKResponse {
  if (!input?.decision) {
    return {
      status: "loading",
      decision: null,
      reasoning: [],
      confidence: 0,
    };
  }

  return {
    status: "ready",
    decision: {
      title: input.decision.venue_name,
      distance: formatDistance(input.decision.distance_meters),
      eta: formatEta(input.decision.eta_minutes),
    },
    reasoning: buildReasoning(input),
    confidence: input.decision.confidence,
  };
}

import type {
  HadeContext,
  HadeResponse,
  TimeOfDay,
  DayType,
} from "@/types/hade";

// ---------------------------------------------------------------------------
// A scored reason candidate from a single context signal.
// Lower priority number = selected first.
// Tag prevents two reasons from the same signal type.
// ---------------------------------------------------------------------------

interface ReasonCandidate {
  text: string;
  priority: number;
  tag: string;
}

const MAX_WORDS = 8;
const MAX_REASONS = 3;

// ---------------------------------------------------------------------------
// Signal → Human Language
// ---------------------------------------------------------------------------

function proximityReason(eta: number): ReasonCandidate | null {
  if (typeof eta !== "number" || eta < 0) return null;
  let text: string;
  if (eta === 0) text = "You're right here";
  else if (eta <= 2) text = "Around the corner";
  else if (eta <= 5) text = `${eta} min walk`;
  else text = `${eta} min away`;
  return { text, priority: 10, tag: "proximity" };
}

// Temporal phrases keyed on (day_type, time_of_day).
// Each phrase should answer "what makes RIGHT NOW interesting?"
const TEMPORAL: Partial<Record<DayType, Partial<Record<TimeOfDay, string>>>> = {
  weekend_prime: {
    early_evening: "Weekend night ahead",
    evening: "Friday night energy",
    late_night: "Night's just starting",
  },
  weekday_evening: {
    early_evening: "Post-work wind-down",
    evening: "Weeknight treat",
    late_night: "Late weeknight out",
  },
  weekday: {
    morning: "Good morning spot",
    midday: "Perfect for lunch",
    afternoon: "Afternoon escape",
    early_evening: "End-of-day stop",
    evening: "Evening pick",
    late_night: "Late night option",
  },
  weekend: {
    morning: "Lazy weekend morning",
    midday: "Weekend lunch spot",
    afternoon: "Weekend afternoon",
    evening: "Weekend evening out",
    late_night: "Late weekend night",
  },
  holiday: {
    morning: "Holiday morning treat",
    midday: "Holiday lunch spot",
    afternoon: "Holiday afternoon",
    evening: "Holiday night out",
    late_night: "Late holiday night",
  },
};

function temporalReason(
  timeOfDay: TimeOfDay,
  dayType: DayType,
): ReasonCandidate {
  const phrase = TEMPORAL[dayType]?.[timeOfDay];
  if (phrase) return { text: phrase, priority: 35, tag: "temporal" };
  const label = timeOfDay.replace(/_/g, " ");
  return {
    text: `${label.charAt(0).toUpperCase() + label.slice(1)} pick`,
    priority: 38,
    tag: "temporal",
  };
}

// User-intent alignment — only surfaces when the user explicitly refined.
const INTENT_PHRASES: Record<string, string> = {
  eat: "Solid food here",
  drink: "Great drinks spot",
  chill: "Good place to unwind",
  scene: "The vibe is right",
};

function intentReason(
  intent: string | null | undefined,
): ReasonCandidate | null {
  if (!intent || intent === "anything") return null;
  const phrase = INTENT_PHRASES[intent];
  if (!phrase) return null;
  return { text: phrase, priority: 20, tag: "intent" };
}

function urgencyReason(urgency: string | undefined): ReasonCandidate | null {
  if (urgency === "high")
    return { text: "Open and ready now", priority: 22, tag: "urgency" };
  return null;
}

function energyReason(energy: string | undefined): ReasonCandidate | null {
  if (energy === "low")
    return { text: "Low-key spot", priority: 25, tag: "energy" };
  if (energy === "high")
    return { text: "High energy here", priority: 25, tag: "energy" };
  return null;
}

function opennessReason(openness: string | undefined): ReasonCandidate | null {
  if (openness === "adventurous")
    return { text: "Worth discovering", priority: 30, tag: "openness" };
  return null;
}

function socialReason(
  groupType: string | undefined,
  groupSize: number | undefined,
): ReasonCandidate | null {
  if (!groupType || (groupType === "solo" && (!groupSize || groupSize <= 1)))
    return null;
  const phrases: Record<string, string> = {
    couple: "Date night ready",
    friends: "Fun with the group",
    family: "Family friendly",
    work: "Good for the team",
  };
  const phrase = phrases[groupType];
  if (phrase) return { text: phrase, priority: 24, tag: "social" };
  if (groupSize && groupSize > 1)
    return { text: `Room for ${groupSize}`, priority: 24, tag: "social" };
  return null;
}

// ---------------------------------------------------------------------------
// LLM-sourced signals — lower priority, quality-gated
// ---------------------------------------------------------------------------

const ROBOTIC_MARKERS = [
  "based on",
  "according to",
  "optimized",
  "algorithm",
  "calculated",
  "analysis",
  "data suggest",
  "your profile",
  "behavioral",
  "relevance score",
  "geolocation",
  "your current location",
];

function cleanLlmText(raw: string | undefined): string | null {
  if (!raw) return null;
  let text = raw.trim();
  if (!text) return null;

  // Take first clause only
  text = text.split(/[.;!]/)[0]?.trim() ?? "";
  if (!text) return null;

  // Strip trailing punctuation
  text = text.replace(/[.,;:!]+$/, "");
  if (!text) return null;

  // Reject robotic language
  const lower = text.toLowerCase();
  if (ROBOTIC_MARKERS.some((m) => lower.includes(m))) return null;

  // Enforce word limit — if too long, the phrase isn't scannable
  if (text.split(/\s+/).length > MAX_WORDS) return null;

  return text;
}

function whyNowReason(whyNow: string | undefined): ReasonCandidate | null {
  const text = cleanLlmText(whyNow);
  if (!text) return null;
  return { text, priority: 40, tag: "why_now" };
}

function situationReason(
  summary: string | undefined,
): ReasonCandidate | null {
  const text = cleanLlmText(summary);
  if (!text) return null;
  return { text, priority: 50, tag: "situation" };
}

// ---------------------------------------------------------------------------
// Orchestrator
//
// Priority tiers (lower = selected first):
//   10       proximity   — anchors trust with something verifiable
//   20–28    user intent — surfaces the user's own refinement choices
//   35       temporal    — "right now" backdrop
//   40–50    LLM text    — venue-specific insight from the AI
//
// When the user hasn't refined, reasons are: proximity + temporal + LLM.
// After refine, user signals replace temporal in the top 3.
// ---------------------------------------------------------------------------

export function deriveReasons(
  response: HadeResponse,
  context: HadeContext,
): string[] {
  const { decision } = response;
  const candidates: ReasonCandidate[] = [];

  // Always-available signals
  const prox = proximityReason(decision.eta_minutes);
  if (prox) candidates.push(prox);
  candidates.push(temporalReason(context.time_of_day, context.day_type));

  // User-explicit signals — only surface when actively set
  const int = intentReason(context.situation?.intent);
  if (int) candidates.push(int);

  const urg = urgencyReason(context.situation?.urgency);
  if (urg) candidates.push(urg);

  const eng = energyReason(context.state?.energy);
  if (eng) candidates.push(eng);

  const opn = opennessReason(context.state?.openness);
  if (opn) candidates.push(opn);

  const soc = socialReason(
    context.social?.group_type,
    context.social?.group_size,
  );
  if (soc) candidates.push(soc);

  // LLM-generated signals
  const wn = whyNowReason(decision.why_now);
  if (wn) candidates.push(wn);

  const sit = situationReason(decision.situation_summary);
  if (sit) candidates.push(sit);

  // Sort by priority (lower number = higher priority)
  candidates.sort((a, b) => a.priority - b.priority);

  // Pick top reasons: one per tag, no substring overlap
  const usedTags = new Set<string>();
  const results: string[] = [];

  for (const c of candidates) {
    if (results.length >= MAX_REASONS) break;
    if (usedTags.has(c.tag)) continue;

    const cl = c.text.toLowerCase();
    const overlaps = results.some((r) => {
      const rl = r.toLowerCase();
      return rl.includes(cl) || cl.includes(rl);
    });
    if (overlaps) continue;

    usedTags.add(c.tag);
    results.push(c.text);
  }

  return results;
}

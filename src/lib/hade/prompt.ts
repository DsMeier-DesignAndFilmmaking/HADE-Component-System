import type { HadeContext, HadeDecision, Opportunity } from "@/types/hade";
import { generateSituationSummary, inferIntentFromTime } from "./engine";

// ─── System Prompt ────────────────────────────────────────────────────────────

/**
 * The static system prompt for the HADE decision LLM.
 *
 * This is loaded once and sent with every /decide request.
 * It establishes the engine's identity, core rules, and output contract.
 *
 * Rules are enumerated explicitly because LLMs will default to list-giving,
 * hedging, and recommendation patterns without explicit constraint.
 */
export function buildSystemPrompt(): string {
  return `You are HADE — a Human-Aware Decision Engine.

Your role is to make one decision. Not suggest. Not recommend. Decide.

You receive:
1. A Situation Summary — a natural-language description of the current moment
2. The full context (time, energy, group, constraints)
3. A list of 3–5 pre-scored candidate venues

You must select exactly one venue and explain why in 1–2 sentences.

═══════════════════════════════════════
RULES — NON-NEGOTIABLE
═══════════════════════════════════════

RULE 1: Select exactly one venue from the candidates provided.
         Never mention the other candidates. Never say "another option would be."

RULE 2: Your rationale must be 1–2 sentences. Not a list. Not bullet points.
         Prose only. Write like a trusted local friend, not a review aggregator.

RULE 3: Your rationale MUST reference at least one of:
         - The time of day or day type
         - The energy level
         - The group size or group type
         - A specific constraint (budget, time window, distance)
         If it does not reference any of these, it is wrong.

RULE 4: Your why_now must be one sentence explaining what made this venue
         the right call for THIS specific moment — not in general.

RULE 5: Write in the second person. "You" not "one" or "the user."

═══════════════════════════════════════
BANNED PHRASES — NEVER USE THESE
═══════════════════════════════════════

- "Based on your preferences..."
- "You might enjoy..."
- "You might like..."
- "Here are some options..."
- "Consider also..."
- "Another great choice would be..."
- "This could be a good fit..."
- "You may want to..."
- "It might be worth..."
- "One option is..."
- "This is one of the best..."
- "Many people enjoy..."
- "Known for its..."
- "Popular among..."
- "New discovery nearby — worth checking out."
- Any sentence that begins with "Based on"
- Any sentence that contains "might" or "could be"
- Any list of any kind

═══════════════════════════════════════
TONE
═══════════════════════════════════════

Opinionated. Decisive. Local. Radically helpful.

Good: "Saturday prime for two with high energy — Death & Co is the move. Walk there."
Bad:  "Based on your preferences, Death & Co might be a great option for you."

Good: "It's late and you're low energy — this place is quiet and two blocks away."
Bad:  "You might enjoy this spot, which could be convenient given your location."

═══════════════════════════════════════
OUTPUT FORMAT — STRICT JSON
═══════════════════════════════════════

Return ONLY valid JSON. No markdown. No explanation outside the JSON.

{
  "selected_venue_id": "<id from candidates>",
  "rationale": "<1–2 sentence rationale referencing the context>",
  "why_now": "<1 sentence: what made this right specifically now>",
  "confidence": <0.0–1.0>
}

Do not add any fields. Do not wrap in markdown code blocks.
Do not explain your reasoning outside the JSON object.`;
}

// ─── Decision Prompt ──────────────────────────────────────────────────────────

/**
 * The per-request user prompt — dynamic, built for each /decide call.
 *
 * Structure:
 * 1. Situation Summary (the anchor — must be first)
 * 2. Full context breakdown
 * 3. Candidate venues (pre-scored, top 3–5)
 * 4. Output schema reminder
 *
 * The Situation Summary is injected first because it anchors LLM reasoning
 * before detailed fields are presented. This reduces hallucinated context.
 */
export function buildDecisionPrompt(
  context: HadeContext,
  candidates: Opportunity[]
): string {
  const summary = generateSituationSummary(context);
  const resolvedIntent =
    context.situation.intent === null || context.situation.intent === "anything"
      ? inferIntentFromTime(context.time_of_day)
      : context.situation.intent;

  const candidateList = candidates
    .slice(0, 5)
    .map((c, i) =>
      JSON.stringify({
        rank: i + 1,
        id: c.id,
        venue_name: c.venue_name,
        category: c.category,
        distance_meters: c.distance_meters,
        eta_minutes: c.eta_minutes,
        neighborhood: c.neighborhood ?? null,
        score: c.score ?? null,
        signal_content: c.primary_signal?.content ?? null,
        trust_attribution: c.trust_attributions[0]
          ? {
              display_name: c.trust_attributions[0].display_name,
              time_ago: c.trust_attributions[0].time_ago,
              quote: c.trust_attributions[0].quote ?? null,
            }
          : null,
      })
    )
    .join("\n");

  const constraintLines: string[] = [];
  if (context.constraints.budget)
    constraintLines.push(`Budget: ${context.constraints.budget}`);
  if (context.constraints.time_available_minutes)
    constraintLines.push(`Time available: ${context.constraints.time_available_minutes} minutes`);
  if (context.constraints.distance_tolerance)
    constraintLines.push(`Distance: ${context.constraints.distance_tolerance}`);

  const rejectedNames = (context.rejection_history ?? [])
    .map((r) => r.venue_name)
    .join(", ");

  return `SITUATION SUMMARY (use this as your primary anchor):
"${summary}"

CONTEXT BREAKDOWN:
- Time of day: ${context.time_of_day}
- Day type: ${context.day_type}
- Energy: ${context.state.energy}
- Openness: ${context.state.openness}
- Group: ${context.social.group_size} ${context.social.group_type}
- Intent: ${context.situation.intent ?? `null (inferred: ${resolvedIntent ?? "none"})`}
- Urgency: ${context.situation.urgency}
${constraintLines.length > 0 ? constraintLines.map((l) => `- ${l}`).join("\n") : "- No constraints"}
${rejectedNames ? `- Already rejected this session: ${rejectedNames}` : "- No rejections this session"}

CANDIDATE VENUES (pre-scored, rank 1 = strongest match):
${candidateList}

Make your decision. Return JSON only.`;
}

// ─── Gold-Path Example ────────────────────────────────────────────────────────

/**
 * The canonical Gold Path scenario for HADE v0.
 * Scenario: Saturday evening, couple in Denver, high energy, adventurous,
 * no specific intent, 2-hour window, walking distance, medium budget.
 *
 * Use this to validate that buildDecisionPrompt produces the correct anchor
 * and that the LLM returns a decision matching the quality bar.
 */
export const GOLD_PATH_CONTEXT: HadeContext = {
  geo: { lat: 39.7392, lng: -104.9903 },
  time_of_day: "evening",
  day_type: "weekend_prime",
  situation: {
    intent: null,
    urgency: "low",
  },
  state: {
    energy: "high",
    openness: "adventurous",
  },
  social: {
    group_size: 2,
    group_type: "couple",
  },
  constraints: {
    budget: "medium",
    time_available_minutes: 120,
    distance_tolerance: "walking",
  },
  radius_meters: 1500,
  session_id: "sess_gold_path_001",
  signals: [],
  rejection_history: [],
};

/**
 * Expected Situation Summary for GOLD_PATH_CONTEXT:
 * "Evening on a prime weekend, couple, high energy, adventurous,
 *  no specific intent (likely eat), 2-hour window, walking distance only, medium budget."
 *
 * Expected HadeDecision shape:
 * {
 *   venue_name: "<a specific Denver venue>",
 *   rationale: "Saturday prime for two with high energy and 2 hours — [venue] is the move. Walk there, no plan needed.",
 *   why_now: "Weekend prime energy with an open evening window is exactly what this place is built for.",
 *   confidence: 0.80–0.90
 * }
 */
export const GOLD_PATH_EXPECTED_DECISION: Omit<
  HadeDecision,
  "id" | "geo" | "distance_meters" | "eta_minutes"
> = {
  venue_name: "[Specific Denver venue — determined by real venue data]",
  category: "Cocktail bar or restaurant",
  rationale:
    "Saturday prime for two with high energy and 2 hours — this is exactly where you go. Walk there, no plan needed.",
  why_now:
    "Weekend prime energy with an open evening window is exactly what this place is built for.",
  confidence: 0.84,
  situation_summary:
    "Evening on a prime weekend, couple, high energy, adventurous, no specific intent (likely eat), 2-hour window, walking distance only, medium budget.",
};

/**
 * Full Gold-Path JSON example — the complete reference object.
 * Input + expected output for the Saturday Night Spontaneity scenario.
 */
export const GOLD_PATH_EXAMPLE = {
  input: {
    geo: { lat: 39.7392, lng: -104.9903 },
    time_of_day: "evening",
    day_type: "weekend_prime",
    situation: { intent: null, urgency: "low" },
    state: { energy: "high", openness: "adventurous" },
    social: { group_size: 2, group_type: "couple" },
    constraints: {
      budget: "medium",
      time_available_minutes: 120,
      distance_tolerance: "walking",
    },
    session_id: "sess_denver_001",
    signals: [],
    rejection_history: [],
  },
  situation_summary:
    "Evening on a prime weekend, couple, high energy, adventurous, no specific intent (likely eat), 2-hour window, walking distance only, medium budget.",
  expected_output: {
    decision: {
      id: "venue_xyz",
      venue_name: "Death & Co Denver",
      category: "Cocktail bar",
      geo: { lat: 39.7425, lng: -104.9868 },
      distance_meters: 420,
      eta_minutes: 5,
      neighborhood: "RiNo",
      rationale:
        "Saturday prime for two with high energy and 2 hours — Death & Co is the move. Walk over, no plan needed.",
      why_now:
        "Weekend prime energy with an open evening window is exactly what this place is built for.",
      confidence: 0.84,
      situation_summary:
        "Evening on a prime weekend, couple, high energy, adventurous, 2-hour window, walking distance.",
    },
    context_snapshot: {
      situation_summary:
        "Evening on a prime weekend, couple, high energy, adventurous, 2-hour window, walking distance only, medium budget.",
      interpreted_intent: "eat/drink (inferred from weekend_prime + evening + high energy + couple)",
      decision_basis:
        "day_type=weekend_prime + time_of_day=evening + state.energy=high + state.openness=adventurous + constraints.time=120min",
      candidates_evaluated: 14,
    },
    session_id: "sess_denver_001",
  },
} as const;

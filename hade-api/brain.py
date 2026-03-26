"""HADE Brain — LLM Orchestration Layer

Constructs context-aware prompts, calls the configured LLM provider,
and parses structured decisions. This module is the reasoning core of
the HADE decision pipeline.

Pipeline: Build Prompt → Call LLM → Parse Response → (Fallback if needed)
"""

from __future__ import annotations

import json
import logging
import re
from typing import TYPE_CHECKING

from providers import get_llm_provider
from venues import Venue

if TYPE_CHECKING:
    from main import DecideRequest

logger = logging.getLogger("hade.brain")


# ─── HADE System Prompt ───────────────────────────────────────────────────────

HADE_SYSTEM_PROMPT = """\
You are the HADE (Holistic Adaptive Decision Engine) Orchestrator. Your role is \
to transform raw environmental signals into a single, high-conviction \
'Spontaneous Decision' for a traveler.

## The Input Data

You will receive a structured context containing:
1. HadeContext: Energy (Low/Med/High), Openness, Social (Solo/Group), Time, DayType, Location.
2. VenueList: A collection of real-world venues confirmed open right now.

## The Selection Heuristic (Priority Tiers)

You must select ONE venue based on these tiers in order:

Tier 1 — ENERGY MATCHING: If Energy is 'low', do not suggest a high-decibel \
club or busy bar. If Energy is 'high', avoid a silent library café or mellow \
wine bar. The venue's type and atmosphere must match the stated energy level.

Tier 2 — TEMPORAL INTENTIONALITY: Why this place right now? Ground your \
why_now in the actual time window. Examples: 'The golden hour light hits the \
patio', 'It's the only quiet corner open past 11 PM', 'Happy hour ends in 30 \
minutes — move now.' Do not write generic time references.

Tier 3 — SOCIAL CONTEXT: A Solo traveler needs a different seat than a Work \
Group. A couple needs different energy than a party of 6. Match the venue's \
social fit to the group composition.

## Decision Rules

1. Select exactly ONE venue from the provided list using its exact venue_id.
2. Do NOT hallucinate venues — only choose from the provided list.
3. Your rationale MUST explicitly mention the user's Energy level AND Social \
context. Example: 'Since you're solo and low-energy...'
4. Do NOT use generic phrases like "looks like a good spot" or "seems nice."
5. Confidence (0.0–1.0) reflects signal match across all three tiers — \
1.0 means perfect alignment.
6. If any venues appear in the rejection history, do NOT re-select them.

## The Voice

Editorial, minimalist, and grounded. No hallucinated amenities — if the data \
says it's a 'Dive Bar', don't call it 'Elegant'. Use a Modern Organic tone: \
warm but technical. Short sentences. No filler.

## Output Format (Strict JSON Only)

Respond with ONLY a JSON object — no markdown, no explanation, no preamble:

{
  "venue_id": "id from the venue list",
  "venue_name": "exact name from the venue list",
  "confidence": 0.85,
  "rationale": "2 sentences. Must mention their Energy level and Social context. (e.g. Since you're solo and low-energy, this is the right call.)",
  "why_now": "1 sentence vibe check grounded in the current time window.",
  "situation_summary": "1 sentence system note. (e.g. Late Night in Denver, Solo, Low Energy.)"
}
"""


# ─── Prompt Construction ──────────────────────────────────────────────────────

def _build_user_prompt(
    req: DecideRequest,
    venues: list[Venue],
    situation_summary: str,
) -> str:
    """Format the decision context and venue list into a structured user prompt."""
    lines: list[str] = []

    # Anchor sentence
    lines.append(f"SITUATION: {situation_summary}")
    lines.append("")

    # Structured context
    lines.append("CONTEXT:")
    lines.append(f"  Intent: {req.situation.intent or 'not specified (infer from situation)'}")
    lines.append(f"  Urgency: {req.situation.urgency}")
    lines.append(f"  Energy: {req.state.energy}")
    lines.append(f"  Openness: {req.state.openness}")
    lines.append(f"  Group: {req.social.group_size} ({req.social.group_type})")

    if req.constraints.budget:
        lines.append(f"  Budget: {req.constraints.budget}")
    if req.constraints.time_available_minutes:
        lines.append(f"  Time available: {req.constraints.time_available_minutes} minutes")
    if req.constraints.distance_tolerance:
        lines.append(f"  Distance tolerance: {req.constraints.distance_tolerance}")
    if req.time_of_day:
        lines.append(f"  Time of day: {req.time_of_day}")
    if req.day_type:
        lines.append(f"  Day type: {req.day_type}")

    lines.append("")

    # Rejection history
    if req.rejection_history:
        lines.append("REJECTED VENUES (do NOT re-select):")
        for entry in req.rejection_history:
            lines.append(f"  - {entry.venue_name} (reason: {entry.pivot_reason})")
        lines.append("")

    # Venue list
    lines.append("AVAILABLE VENUES:")
    for i, v in enumerate(venues, 1):
        venue_id = f"venue_{i}"
        rating_str = f"{v.rating}/5 ({v.user_ratings_total} reviews)" if v.rating else "no rating"
        types_str = ", ".join(v.types[:3]) if v.types else "unknown"
        lines.append(f"  {i}. {v.name}")
        lines.append(f"     ID: {venue_id}")
        lines.append(f"     Address: {v.address}")
        lines.append(f"     Types: {types_str}")
        lines.append(f"     Rating: {rating_str}")

    lines.append("")
    lines.append("Select one venue. Respond with JSON only.")

    return "\n".join(lines)


# ─── Response Parsing ─────────────────────────────────────────────────────────

def _extract_json(text: str) -> str:
    """Strip markdown code fences if present, returning raw JSON string."""
    # Match ```json ... ``` or ``` ... ```
    fence_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
    if fence_match:
        return fence_match.group(1).strip()
    return text.strip()


def _parse_llm_response(raw: str, venues: list[Venue]) -> dict:
    """Parse LLM output into a validated decision dict.

    Returns a dict with: venue_name, venue_id, rationale, why_now, situation_summary, confidence.
    Falls back to first venue if parsing or matching fails.
    """
    cleaned = _extract_json(raw)
    data = json.loads(cleaned)

    # Validate required keys
    venue_name = data.get("venue_name", "")
    rationale = data.get("rationale", "")
    why_now = data.get("why_now", "Open now and close to you.")
    venue_id = data.get("venue_id", "")
    situation_summary = data.get("situation_summary", "")
    confidence = float(data.get("confidence", 0.5))

    if not venue_name or not rationale:
        raise ValueError("LLM response missing required fields (venue_name, rationale)")

    # Clamp confidence to valid range
    confidence = max(0.0, min(1.0, confidence))

    # Verify the selected venue exists in the list (case-insensitive match)
    matched = _match_venue_name(venue_name, venues)
    if matched is None:
        logger.warning(
            "LLM selected '%s' which doesn't match any venue — falling back to first",
            venue_name,
        )
        matched = venues[0].name

    return {
        "venue_name": matched,
        "venue_id": venue_id,
        "rationale": rationale,
        "why_now": why_now,
        "situation_summary": situation_summary,
        "confidence": confidence,
    }


def _match_venue_name(name: str, venues: list[Venue]) -> str | None:
    """Case-insensitive venue name matching against the venue list."""
    name_lower = name.strip().lower()

    # Exact match first
    for v in venues:
        if v.name.strip().lower() == name_lower:
            return v.name

    # Substring containment fallback
    for v in venues:
        if name_lower in v.name.strip().lower() or v.name.strip().lower() in name_lower:
            return v.name

    return None


# ─── Fallback Decision ────────────────────────────────────────────────────────

def _fallback_decision(venues: list[Venue]) -> dict:
    """Generate a fallback decision using the first venue when LLM fails."""
    top = venues[0]
    return {
        "venue_name": top.name,
        "venue_id": "venue_1",
        "rationale": f"Found nearby: {top.name}",
        "why_now": "Open now and close to you.",
        "situation_summary": "",
        "confidence": 0.0,
    }


# ─── Public API ───────────────────────────────────────────────────────────────

async def run_hade_decision(
    req: DecideRequest,
    venues: list[Venue],
    situation_summary: str,
) -> dict:
    """Run the HADE decision pipeline: prompt → LLM → parse → structured decision.

    Args:
        req: The full DecideRequest with all user context.
        venues: Pre-filtered list of open, operational venues.
        situation_summary: Anchor sentence describing the current situation.

    Returns:
        Dict with keys: selected_venue_name, rationale, why_now, confidence.
        Always returns a valid decision — falls back to first venue on any failure.
    """
    if not venues:
        return {
            "selected_venue_name": "",
            "rationale": "No venues available",
            "why_now": "",
            "confidence": 0.0,
        }

    # Build prompts
    user_prompt = _build_user_prompt(req, venues, situation_summary)

    # Get provider and call LLM
    try:
        provider = get_llm_provider()
        logger.info("Calling LLM for decision (%d venues)", len(venues))

        raw_response = await provider.generate(HADE_SYSTEM_PROMPT, user_prompt)
        logger.debug("LLM raw response: %s", raw_response[:500])

        decision = _parse_llm_response(raw_response, venues)
        logger.info(
            "LLM decision: venue='%s' confidence=%.2f",
            decision["selected_venue_name"],
            decision["confidence"],
        )
        return decision

    except Exception:
        logger.warning("LLM decision failed — using fallback", exc_info=True)
        return _fallback_decision(venues)

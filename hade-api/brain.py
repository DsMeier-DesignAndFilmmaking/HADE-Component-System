"""HADE Brain — LLM Orchestration Layer

Constructs context-aware prompts, calls the configured LLM provider,
and parses structured decisions. This module is the reasoning core of
the HADE decision pipeline.

Pipeline: Build Prompt → Call LLM → Parse Response → (Fallback if needed)
"""

from hade_assembler import assemble_hade_prompt

from __future__ import annotations

import asyncio
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
You are HADE. Select ONE venue. Output strict JSON only — no markdown, no preamble.

Prioritize in order:
1. Energy match: low→quiet/chill, high→lively/active.
2. Temporal: why_now must be specific to this time window, never generic.
3. Social fit: match group size and type to venue atmosphere.

Rules: use exact venue_id and venue_name from the list; rationale must name \
the energy level and social context; skip any rejected venues; \
confidence 0.0–1.0 reflects all three criteria.

{"venue_id":"…","venue_name":"…","confidence":0.85,"rationale":"2 sentences mentioning energy+social.","why_now":"1 sentence specific to now.","situation_summary":"1 sentence."}
"""

def get_contextual_guidance(lat, lon, weather_data):
    # This now runs on the iMac, saving your MacBook Pro's battery
    agent_instruction = assemble_hade_prompt(
        location=f"{lat}, {lon}",
        weather=weather_data['summary'],
        mood="adventurous"
    )
    return agent_instruction

def process_spontaneous_event(signal):
    # Use the iMac to build the prompt
    prompt = assemble_hade_prompt(signal.loc, signal.wx, signal.mood)
    
    # Then continue with your brain's logic...
    print(f"Brain received prompt from iMac: {prompt}")

# ─── Prompt Construction ──────────────────────────────────────────────────────

def _build_user_prompt(
    req: DecideRequest,
    venues: list[Venue],
    situation_summary: str,
) -> str:
    """Format the decision context and venue list into a compact user prompt."""
    lines: list[str] = [situation_summary]

    # Core context — one line
    lines.append(
        f"energy:{req.state.energy} group:{req.social.group_size} {req.social.group_type}"
        f" urgency:{req.situation.urgency}"
    )

    # Optional context only when set
    if req.situation.intent:
        lines.append(f"intent:{req.situation.intent}")
    extras = []
    if req.constraints.budget:
        extras.append(f"budget:{req.constraints.budget}")
    if req.constraints.time_available_minutes:
        extras.append(f"time:{req.constraints.time_available_minutes}min")
    if extras:
        lines.append(" ".join(extras))

    # Rejection history
    if req.rejection_history:
        skip = ", ".join(e.venue_name for e in req.rejection_history)
        lines.append(f"SKIP: {skip}")

    # High-strength signals — inject top 3 so the LLM can act on them
    if req.signals:
        strong = [s for s in req.signals if s.strength >= 0.6][:3]
        if strong:
            sig_parts = "; ".join(
                f"{s.type}:{s.content or '?'}({s.strength:.1f})"
                for s in strong
            )
            lines.append(f"SIGNALS: {sig_parts}")

    # Compact venue list — one line each
    lines.append("VENUES:")
    for i, v in enumerate(venues, 1):
        rating = f"{v.rating}★" if v.rating else "?"
        types = ",".join(v.types[:2]) if v.types else "?"
        lines.append(f"venue_{i}|{v.name}|{types}|{rating}|{v.address}")

    lines.append("JSON only:")
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

def _compute_context_confidence(
    req: DecideRequest,
    top: Venue,
    candidates: list[Venue],
) -> float:
    """Score 0.0–1.0 reflecting the richness of context and quality of the top candidate."""
    score = 0.5  # base

    # Context richness signals
    if req.situation.intent:
        score += 0.15
    if req.situation.urgency != "low":
        score += 0.05
    if req.constraints.budget:
        score += 0.05
    if req.constraints.time_available_minutes:
        score += 0.05

    # Top candidate quality
    if top.rating and top.rating >= 4.0:
        score += 0.10
    if top.types:
        score += 0.05

    # Score gap: clear leader boosts confidence
    if len(candidates) >= 2 and top.rating and candidates[1].rating:
        if top.rating - candidates[1].rating >= 0.5:
            score += 0.05

    return min(1.0, score)


def _fallback_decision(
    candidates: list[Venue],
    req: DecideRequest,
    *,
    failure_reason: str = "provider_error",
) -> dict:
    """Generate a context-aware fallback decision using the top candidate."""
    top = candidates[0]
    context_confidence = _compute_context_confidence(req, top, candidates)
    confidence = max(0.3, context_confidence * 0.7)

    return {
        "venue_name": top.name,
        "venue_id": "venue_1",
        "rationale": "Best nearby match based on your current context.",
        "why_now": "Open now and close to you.",
        "situation_summary": "",
        "confidence": round(confidence, 2),
        "llm_failure_reason": failure_reason,
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

    # Limit to top 3 candidates to reduce prompt size and LLM latency
    candidates = venues[:3]
    user_prompt = _build_user_prompt(req, candidates, situation_summary)

    # Get provider and call LLM
    try:
        provider = get_llm_provider()
        logger.info("Calling LLM for decision (%d candidates)", len(candidates))

        raw_response = await provider.generate(HADE_SYSTEM_PROMPT, user_prompt)
        logger.debug("LLM raw response: %s", raw_response[:200])

        decision = _parse_llm_response(raw_response, candidates)
        logger.info(
            "LLM decision: venue='%s' confidence=%.2f",
            decision["venue_name"],
            decision["confidence"],
        )
        return decision

    except asyncio.TimeoutError:
        logger.warning(
            "LLM decision failed — timeout (HADE_LLM_TIMEOUT exceeded)",
            exc_info=True,
        )
        return _fallback_decision(candidates, req, failure_reason="timeout")

    except json.JSONDecodeError as exc:
        logger.warning(
            "LLM decision failed — parse_error: %s", exc,
            exc_info=True,
        )
        return _fallback_decision(candidates, req, failure_reason="parse_error")

    except ValueError as exc:
        logger.warning(
            "LLM decision failed — validation_error: %s", exc,
            exc_info=True,
        )
        return _fallback_decision(candidates, req, failure_reason="validation_error")

    except Exception as exc:
        logger.warning(
            "LLM decision failed — provider_error: %s", type(exc).__name__,
            exc_info=True,
        )
        return _fallback_decision(candidates, req, failure_reason="provider_error")

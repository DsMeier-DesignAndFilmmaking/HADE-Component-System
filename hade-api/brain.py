"""HADE Brain — LLM Orchestration Layer

Constructs context-aware prompts, calls the configured LLM provider,
and parses structured decisions. This module is the reasoning core of
the HADE decision pipeline.

Pipeline: Build Prompt → Call LLM → Parse Response → (Fallback if needed)
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import random
import re
from typing import TYPE_CHECKING

from providers import get_llm_provider
from providers.factory import resolve_model_target
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

# ─── Candidate Scoring & Ranking ─────────────────────────────────────────────

def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Haversine distance in metres between two lat/lng points."""
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# Which venue types match each energy level
_ENERGY_TYPES: dict[str, set[str]] = {
    "high":   {"bar", "night_club", "restaurant", "sports_bar"},
    "medium": {"restaurant", "cafe", "bakery", "bistro"},
    "low":    {"cafe", "park", "library", "bakery"},
}

# Which venue types match each intent
SUPPORTED_INTENTS: tuple[str, ...] = ("eat", "drink", "explore", "social")

INTENT_KEYWORDS: dict[str, list[str]] = {
    "eat": ["food", "restaurant", "dinner", "lunch", "chef", "table", "meal"],
    "drink": ["bar", "drink", "cocktail", "beer", "wine"],
    "explore": ["park", "museum", "walk", "outdoor", "landmark", "view"],
    "social": ["group", "friends", "party", "crowd", "music", "live"],
}


# ── Adaptive Weight Profiles ─────────────────────────────────────────────────
#
#   Intent clarity drives which dimension matters most:
#     LOW  clarity → proximity dominates (user browsing, no clear goal)
#     HIGH clarity → intent dominates  (user knows what they want)
#
#   Both profiles sum to 1.0.

_W_LOW:  tuple[float, float, float] = (0.50, 0.30, 0.20)   # prox, ctx, intent
_W_HIGH: tuple[float, float, float] = (0.25, 0.30, 0.45)


def infer_intent_probabilities(signals: list) -> dict[str, float]:
    """Deterministically infer intent probabilities from emitted signals."""
    intent_probs: dict[str, float] = {
        "eat": 0.25,
        "drink": 0.25,
        "explore": 0.25,
        "social": 0.25,
    }

    for signal in signals or []:
        text = (getattr(signal, "content", "") or "").lower()
        strength_raw = getattr(signal, "strength", 0.0)
        try:
            strength = float(strength_raw)
        except (TypeError, ValueError):
            strength = 0.0
        strength = max(0.0, min(1.0, strength))

        for intent, keywords in INTENT_KEYWORDS.items():
            if any(keyword in text for keyword in keywords):
                intent_probs[intent] += strength * 0.4

    total = sum(intent_probs.values())
    if total <= 0:
        intent_probs = {k: 1.0 / len(SUPPORTED_INTENTS) for k in SUPPORTED_INTENTS}
    else:
        intent_probs = {k: v / total for k, v in intent_probs.items()}

    # Clamp and re-normalize to preserve [0,1] and Σp = 1.0
    intent_probs = {k: max(0.0, min(1.0, v)) for k, v in intent_probs.items()}
    renorm_total = sum(intent_probs.values())
    if renorm_total <= 0:
        intent_probs = {k: 1.0 / len(SUPPORTED_INTENTS) for k in SUPPORTED_INTENTS}
    else:
        intent_probs = {k: v / renorm_total for k, v in intent_probs.items()}

    if abs(sum(intent_probs.values()) - 1.0) > 0.001:
        max_key = max(intent_probs, key=intent_probs.get)
        delta = 1.0 - sum(intent_probs.values())
        intent_probs[max_key] = max(0.0, min(1.0, intent_probs[max_key] + delta))
        final_total = sum(intent_probs.values())
        if final_total > 0:
            intent_probs = {k: v / final_total for k, v in intent_probs.items()}

    print("[HADE] intent_probabilities:", intent_probs)
    return intent_probs


def map_venue_to_intent(category: str) -> str:
    category_lower = (category or "").lower()
    if "restaurant" in category_lower:
        return "eat"
    if "bar" in category_lower:
        return "drink"
    if "park" in category_lower or "museum" in category_lower:
        return "explore"
    return "social"


def _resolve_weights(
    req: "DecideRequest",
    intent_probs: dict[str, float],
    intent_weight_override: float | None = None,
) -> tuple[float, float, float, str]:
    """Compute intent clarity from the request and select a weight profile.

    When intent_weight_override is provided, the intent dimension is pinned to
    that value and proximity + context are re-scaled proportionally so all three
    still sum to 1.0.  The relative ratio between proximity and context is
    preserved from the selected profile.

    Returns (w_proximity, w_context, w_intent, profile_label).
    """
    clarity = 0.0

    # Primary signal: explicit intent when present and supported
    intent = (req.situation.intent or "").lower()
    if intent in SUPPORTED_INTENTS:
        clarity += 0.35

    # Secondary: urgency above default implies clearer purpose
    if req.situation.urgency and req.situation.urgency.lower() != "low":
        clarity += 0.15

    # Tertiary: signal-derived intent distribution confidence
    top_prob = max(intent_probs.values()) if intent_probs else 0.25
    clarity += max(0.0, (top_prob - 0.25) / 0.75) * 0.35

    # Specificity signals
    if req.constraints.budget:
        clarity += 0.10
    if req.constraints.time_available_minutes:
        clarity += 0.05

    clarity = min(1.0, clarity)

    if clarity >= 0.5:
        w_prox, w_ctx, w_intent = _W_HIGH
        label = f"HIGH (clarity={clarity:.2f})"
    else:
        w_prox, w_ctx, w_intent = _W_LOW
        label = f"LOW (clarity={clarity:.2f})"

    # ── Settings override: intent_weight ──
    # Pin intent to the user-provided value, redistribute remaining budget
    # proportionally between proximity and context to preserve their ratio.
    #   w_prox_new = (1 − w_intent_new) × w_prox_default / (w_prox_default + w_ctx_default)
    #   w_ctx_new  = (1 − w_intent_new) × w_ctx_default  / (w_prox_default + w_ctx_default)
    if intent_weight_override is not None:
        w_intent = max(0.0, min(1.0, float(intent_weight_override)))
        remaining = 1.0 - w_intent
        old_sum = w_prox + w_ctx
        if old_sum > 0:
            w_prox = remaining * (w_prox / old_sum)
            w_ctx  = remaining * (w_ctx / old_sum)
        else:
            w_prox = remaining / 2.0
            w_ctx  = remaining / 2.0
        label += f" [intent_override={w_intent:.2f}]"

    return w_prox, w_ctx, w_intent, label


# ── Per-Venue Scoring ────────────────────────────────────────────────────────

def _score_venue(
    v: Venue,
    req: "DecideRequest",
    radius_m: float,
    weights: tuple[float, float, float],
    intent_probs: dict[str, float],
) -> dict:
    """Score a venue across three dimensions and return a structured breakdown."""
    w_prox, w_ctx, w_intent = weights

    # ── Proximity (0–1): closer is better ──
    dist = _distance_m(req.geo.lat, req.geo.lng, v.latitude, v.longitude)
    proximity = max(0.0, 1.0 - dist / max(radius_m, 1.0))

    # ── Context (0–1): energy match × 0.7 + rating quality × 0.3 ──
    vtypes = {t.lower() for t in (v.types or [])}
    energy_key = (req.state.energy or "medium").lower()
    energy_match = 1.0 if vtypes & _ENERGY_TYPES.get(energy_key, set()) else 0.3
    rating_bonus = ((v.rating - 3.0) / 2.0) if v.rating else 0.0
    rating_bonus = max(0.0, min(0.5, rating_bonus))
    context = min(1.0, energy_match * 0.7 + rating_bonus * 0.3)

    # ── Intent (0–1): deterministic alignment from signal-derived probabilities ──
    primary_category = (v.types[0] if v.types else "")
    mapped_intent = map_venue_to_intent(primary_category)
    intent_alignment = intent_probs.get(mapped_intent, 0.0)
    intent_score = max(0.0, min(1.0, intent_alignment))

    total = w_prox * proximity + w_ctx * context + w_intent * intent_score
    return {
        "venue_id": v.id,
        "venue_name": v.name,
        "category": primary_category or "venue",
        "proximity_score": proximity,
        "context_score": context,
        "intent_score": intent_score,
        "final_score": total,
    }


# ── Softmax Exploration ──────────────────────────────────────────────────────

_EXPLORE_THRESHOLD = 0.6   # top score below this → probabilistic selection

def _softmax_probs(scores: list[float], temperature: float) -> list[float]:
    """Convert raw scores to selection probabilities via softmax.

    Lower temperature  → sharper distribution (top score dominates).
    Higher temperature → flatter distribution (scores are ~equal chance).
    Temperature is clamped to [0.01, ∞) to avoid division by zero.
    """
    if not scores:
        return []
    t = max(temperature, 0.01)
    max_s = max(scores)
    exps = [math.exp((s - max_s) / t) for s in scores]
    total = sum(exps)
    return [e / total for e in exps]


# ── Ranking ──────────────────────────────────────────────────────────────────

def _rank_candidates(
    venues: list[Venue],
    req: "DecideRequest",
    exploration_temp: float | None = None,
    intent_weight: float | None = None,
) -> tuple[list[Venue], list[dict], dict]:
    """Score, rank, and apply explore/exploit selection to venue candidates.

    Returns:
        (ranked_venues, scored_dicts, debug_info)

    Exploitation (top_score ≥ threshold AND no explicit exploration_temp):
        Return venues in strict score order.

    Exploration (top_score < threshold OR explicit exploration_temp > 0):
        Use softmax sampling over top-5 candidates. When the user explicitly
        sets exploration_temp via the Settings UI, exploration is forced even
        if the top score exceeds the threshold — this makes the slider
        meaningful at all score levels.
    """
    intent_probs = infer_intent_probabilities(req.signals)
    w_prox, w_ctx, w_intent, profile = _resolve_weights(
        req, intent_probs, intent_weight_override=intent_weight,
    )
    weights = (w_prox, w_ctx, w_intent)

    print(f"[HADE] weight profile: {profile} "
          f"→ prox={w_prox:.2f} ctx={w_ctx:.2f} intent={w_intent:.2f}")

    venue_by_id = {v.id: v for v in venues}
    scored_candidates = [
        _score_venue(v, req, req.radius_meters, weights, intent_probs)
        for v in venues
    ]

    ranked = sorted(
        scored_candidates,
        key=lambda x: x["final_score"],
        reverse=True
    )

    top_score = ranked[0]["final_score"] if ranked else 0.0

    # ── Explore / Exploit decision ──
    # Force exploration when the user explicitly set a temperature > 0,
    # even if the top score exceeds the threshold.
    should_explore = (
        len(ranked) >= 2
        and (
            top_score < _EXPLORE_THRESHOLD
            or (exploration_temp is not None and exploration_temp > 0)
        )
    )

    if should_explore:
        # Dynamic temperature: wider gap from threshold → more exploration
        # exploration_temp (from settings) overrides the adaptive value when set
        _adaptive = max(0.20, min(0.50, _EXPLORE_THRESHOLD - top_score))
        temperature = float(exploration_temp) if exploration_temp is not None else _adaptive

        n_pool = min(len(ranked), 5)
        pool = ranked[:n_pool]
        rest = ranked[n_pool:]

        pool_scores = [item["final_score"] for item in pool]
        probs = _softmax_probs(pool_scores, temperature)

        # Sample one winner from the pool; keep the rest in sorted order
        idx = random.choices(range(len(pool)), weights=probs, k=1)[0]
        winner = pool.pop(idx)
        ranked = [winner] + pool + rest

        prob_str = " | ".join(
            f"{pool_scores[i]:.3f}→{probs[i]:.0%}"
            for i in range(len(probs))
        )
        print(f"[HADE] selection: EXPLORE (top_score={top_score:.3f}, T={temperature:.2f}, forced={exploration_temp is not None})")
        print(f"[HADE] softmax pool: {prob_str}")
        print(f"[HADE] selected: {winner['venue_name']}")
    else:
        print(f"[HADE] selection: EXPLOIT (top_score={top_score:.3f})")

    print("[HADE] TOP 5 CANDIDATES:")
    for c in ranked[:5]:
        print({
            "venue": c["venue_name"],
            "scores": {
                "proximity": round(c["proximity_score"], 3),
                "context": round(c["context_score"], 3),
                "intent": round(c["intent_score"], 3),
                "final": round(c["final_score"], 3),
            },
        })

    # ── Print final candidate order ──
    print(f"[HADE] candidate scores (prox×{w_prox:.2f} + ctx×{w_ctx:.2f} + intent×{w_intent:.2f}):")
    for c in ranked:
        print(
            f"  {c['venue_name'][:32]:<32} "
            f"prox={c['proximity_score']:.2f} ctx={c['context_score']:.2f} "
            f"intent={c['intent_score']:.2f} → {c['final_score']:.3f}"
        )

    ranked_venues = [venue_by_id[c["venue_id"]] for c in ranked if c["venue_id"] in venue_by_id]

    # Debug info for settings.debug response enrichment
    debug_info = {
        "intent_probabilities": {k: round(v, 4) for k, v in intent_probs.items()},
        "weight_profile": profile,
        "weights": {
            "proximity": round(w_prox, 4),
            "context": round(w_ctx, 4),
            "intent": round(w_intent, 4),
        },
    }

    return ranked_venues, ranked, debug_info


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
        skipped: list[str] = []
        for r in req.rejection_history:
            if isinstance(r, dict) and r.get("venue_name"):
                skipped.append(str(r["venue_name"]))
            elif not isinstance(r, dict):
                name = getattr(r, "venue_name", None)
                if name:
                    skipped.append(str(name))
        if skipped:
            lines.append(f"SKIP: {', '.join(skipped)}")

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


# ─── Strict Constraint Filtering ─────────────────────────────────────────────

def _apply_strict_constraints(
    venues: list[Venue],
    req: "DecideRequest",
) -> list[Venue]:
    """Hard-filter venues that violate explicit constraints.

    Only applied when settings.strict_constraints is True.
    Falls back to unfiltered list if filtering would leave zero candidates.
    """
    result = list(venues)
    before = len(result)

    # Distance tolerance
    tol = (req.constraints.distance_tolerance or "").lower()
    if tol == "walking":
        result = [v for v in result
                  if _distance_m(req.geo.lat, req.geo.lng, v.latitude, v.longitude) <= 1200]
    elif tol == "short_drive":
        result = [v for v in result
                  if _distance_m(req.geo.lat, req.geo.lng, v.latitude, v.longitude) <= 5000]

    # Budget (price_level from Google Places: 0–4)
    budget_map = {"free": 0, "low": 1, "medium": 2, "high": 3, "unlimited": 4}
    budget = (req.constraints.budget or "").lower()
    if budget in budget_map and budget != "unlimited":
        max_level = budget_map[budget]
        result = [v for v in result
                  if getattr(v, "price_level", None) is None
                  or v.price_level <= max_level]

    print(f"[HADE] strict_constraints: {before} → {len(result)} venues")
    return result if result else venues  # never return empty


# ─── Persona Prompt Augmentation ─────────────────────────────────────────────

def _build_system_prompt(persona: dict | None) -> str:
    """Build the HADE system prompt, optionally augmented with persona directives.

    Persona fields injected:
      - tone:       Communication style modifiers (e.g. "Concise, Technical")
      - role:       One-sentence agent identity
      - guardrails: Behavioral constraints added as RULE: lines
    """
    base = HADE_SYSTEM_PROMPT
    if not persona:
        return base

    parts: list[str] = []

    tone_tags = persona.get("tone", [])
    if tone_tags:
        parts.append(f"Communication style: {', '.join(tone_tags)}.")

    role = persona.get("role")
    if role:
        parts.append(f"Agent role: {role}")

    guardrails = persona.get("guardrails", [])
    for g in guardrails:
        parts.append(f"RULE: {g}")

    if not parts:
        return base

    return base + "\n\n" + "\n".join(parts)


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

    # ── Settings extraction ──
    _s = req.settings or {}
    effective_debug    = _s.get("debug", False)
    effective_temp     = _s.get("exploration_temp", None)
    effective_model    = _s.get("model_target", None)
    effective_mode     = _s.get("mode", "balanced")
    effective_intent_w = _s.get("intent_weight", None)
    strict             = _s.get("strict_constraints", False)
    print(
        f"[HADE] settings: debug={effective_debug}, temp={effective_temp}, "
        f"model={effective_model}, mode={effective_mode}, "
        f"intent_w={effective_intent_w}, strict={strict}"
    )

    # ── Mode → exploration floor ──
    # "explorative" mode sets a temperature floor of 0.30 when no explicit
    # exploration_temp is set, making decisions visibly more varied.
    if effective_mode == "explorative" and effective_temp is None:
        effective_temp = 0.30
        print("[HADE] mode=explorative → exploration floor T=0.30")

    # ── Strict constraint filtering ──
    if strict:
        venues = _apply_strict_constraints(venues, req)

    # ── Score, rank, slice top 3 for LLM ──
    ranked_venues, ranked_scores, ranking_debug = _rank_candidates(
        venues, req,
        exploration_temp=effective_temp,
        intent_weight=effective_intent_w,
    )
    candidates = ranked_venues[:3]
    top_candidates_debug = ranked_scores[:5]

    # ── Persona-augmented system prompt ──
    persona = getattr(req, "persona", None) or None
    system_prompt = _build_system_prompt(persona)
    if persona:
        print(f"[HADE] persona injected: id={persona.get('id')}, tone={persona.get('tone')}")

    user_prompt = _build_user_prompt(req, candidates, situation_summary)

    # ── Model target resolution ──
    provider_override, model_override = resolve_model_target(effective_model, effective_mode)

    # ── LLM call ──
    provider = get_llm_provider(provider_override)
    try:
        print(
            f"[HADE] entering LLM path "
            f"(provider={type(provider).__name__}, model_override={model_override}, "
            f"candidates={len(candidates)})"
        )
        logger.info("Calling LLM for decision (%d candidates)", len(candidates))

        raw_response = await provider.generate(
            system_prompt, user_prompt, model_override=model_override,
        )
        logger.debug("LLM raw response: %s", raw_response[:200])

        decision = _parse_llm_response(raw_response, candidates)
        decision["debug_top_candidates"] = top_candidates_debug
        print(f"[HADE] LLM success: venue='{decision['venue_name']}' confidence={decision['confidence']:.2f}")
        logger.info(
            "LLM decision: venue='%s' confidence=%.2f",
            decision["venue_name"],
            decision["confidence"],
        )

    except asyncio.TimeoutError:
        print("[HADE] entering fallback path (reason=timeout)")
        logger.warning("LLM timeout", exc_info=True)
        decision = _fallback_decision(candidates, req, failure_reason="timeout")
        decision["debug_top_candidates"] = top_candidates_debug

    except json.JSONDecodeError as exc:
        print(f"[HADE] entering fallback path (reason=parse_error): {exc}")
        logger.warning("LLM parse_error: %s", exc, exc_info=True)
        decision = _fallback_decision(candidates, req, failure_reason="parse_error")
        decision["debug_top_candidates"] = top_candidates_debug

    except ValueError as exc:
        print(f"[HADE] entering fallback path (reason=validation_error): {exc}")
        logger.warning("LLM validation_error: %s", exc, exc_info=True)
        decision = _fallback_decision(candidates, req, failure_reason="validation_error")
        decision["debug_top_candidates"] = top_candidates_debug

    except Exception as exc:
        print(f"[HADE] entering fallback path (reason=provider_error): {type(exc).__name__}: {exc}")
        logger.warning("LLM provider_error: %s", type(exc).__name__, exc_info=True)
        decision = _fallback_decision(candidates, req, failure_reason="provider_error")
        decision["debug_top_candidates"] = top_candidates_debug

    # ── Debug payload (enriched response when settings.debug is on) ──
    if effective_debug:
        decision["debug_payload"] = {
            **ranking_debug,
            "scoring_breakdown": ranked_scores[:10],
            "exploration_temp": effective_temp,
            "model_used": model_override or "server_default",
            "provider_used": type(provider).__name__,
            "strict_constraints_active": strict,
            "persona_id": persona.get("id") if persona else None,
        }

    return decision

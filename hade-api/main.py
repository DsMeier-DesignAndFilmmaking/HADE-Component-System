from __future__ import annotations
import logging
import math
import uuid
from datetime import datetime
from typing import Optional, List, Any

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from brain import run_hade_decision
from venues import get_nearby_venues, Venue

# ─── Environment & Logging ────────────────────────────────────────────────────

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("hade")

# ─── App Initialization ───────────────────────────────────────────────────────

app = FastAPI(title="HADE Decision Engine", version="0.1.0-prod")

# 1. PERMISSIVE CORS SETUP
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# 2. BYPASS MIDDLEWARE
@app.middleware("http")
async def hade_bridge_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        response = Response()
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response
    response = await call_next(request)
    response.headers["bypass-tunnel-reminder"] = "true"
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response

# ─── Data Models ──────────────────────────────────────────────────────────────

class GeoLocation(BaseModel):
    lat: float
    lng: float

class HadeSituation(BaseModel):
    intent: Optional[str] = None
    urgency: str = "low"

class HadeState(BaseModel):
    energy: str = "medium"
    openness: str = "open"

class HadeSocial(BaseModel):
    group_size: int = 1
    group_type: str = "solo"

class HadeConstraints(BaseModel):
    budget: Optional[str] = None
    time_available_minutes: Optional[int] = None
    distance_tolerance: Optional[str] = None

class Signal(BaseModel):
    id: str
    type: str
    content: Optional[str] = None
    strength: float = 0.5

class RejectionEntry(BaseModel):
    venue_id: str
    venue_name: str
    pivot_reason: str

class DecideRequest(BaseModel):
    geo: GeoLocation
    situation: HadeSituation = Field(default_factory=HadeSituation)
    state: HadeState = Field(default_factory=HadeState)
    social: HadeSocial = Field(default_factory=HadeSocial)
    constraints: HadeConstraints = Field(default_factory=HadeConstraints)
    time_of_day: Optional[str] = None
    day_type: Optional[str] = None
    radius_meters: float = 1500
    session_id: Optional[str] = None
    signals: List[Signal] = Field(default_factory=list)
    rejection_history: List[Any] = Field(default_factory=list)
    debug: bool = False
    persona: Optional[dict] = None     # AgentPersona from frontend (tone, guardrails, role)
    settings: Optional[dict] = None

# ─── Business Logic ──────────────────────────────────────────────────────────

def _get_time_of_day() -> str:
    h = datetime.now().hour
    if 5 <= h < 11: return "morning"
    if 11 <= h < 13: return "midday"
    if 13 <= h < 17: return "afternoon"
    if 17 <= h < 19: return "early_evening"
    if 19 <= h < 22: return "evening"
    return "late_night"

def _generate_summary(req: DecideRequest) -> str:
    t = req.time_of_day or _get_time_of_day()
    energy = req.state.energy
    group = req.social.group_type
    return f"{t.replace('_', ' ').capitalize()} in Denver, {group} context, {energy} energy."

def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance in meters between two lat/lng points."""
    R = 6_371_000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def _venue_synthetic_id(name: str) -> str:
    """Generate the deterministic venue ID from a venue name.

    Must match the format used in the /hade/decide response so that
    rejection_history entries can be matched back to venues.
    """
    return f"v_{name.strip().lower().replace(' ', '_')[:20]}"

def _find_venue_by_name(venues: list[Venue], name: str) -> Venue:
    """Find a venue by name (case-insensitive). Falls back to first venue."""
    name_lower = name.strip().lower()
    for v in venues:
        if v.name.strip().lower() == name_lower:
            return v
    return venues[0]

# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/hade/decide")
async def decide(req: DecideRequest):
    summary = _generate_summary(req)
    session_id = req.session_id or str(uuid.uuid4())

    # ── Geo fallback: prevent ocean queries when coordinates are unset ──
    lat = req.geo.lat
    lng = req.geo.lng
    if lat == 0.0 and lng == 0.0:
        logger.warning("geo=(0,0) detected — using San Francisco fallback")
        print("[main] geo fallback: using San Francisco (37.7749, -122.4194)")
        lat = 37.7749
        lng = -122.4194

    # ── Data Ingestion: fetch real-world venue candidates ──
    candidates = await get_nearby_venues(
        lat=lat,
        lng=lng,
        radius_meters=req.radius_meters,
    )
    logger.info("Decision pipeline: %d venues fetched (session=%s)", len(candidates), session_id)

    # ── Rejection filtering: HARD filter before any ranking/scoring/LLM ──
    rejection_history = req.rejection_history or []
    rejected_ids = set(
        r if isinstance(r, str) else r.get("venue_id")
        for r in rejection_history
        if r
    )
    rejected_ids = {rid for rid in rejected_ids if rid}

    print("[HADE] rejected_ids:", rejected_ids)
    print("[HADE] candidates_before:", len(candidates))
    filtered_candidates = [
        v for v in candidates
        if v.id not in rejected_ids
    ]
    print("[HADE] candidates_after_filter:", len(filtered_candidates))

    if not filtered_candidates:
        logger.warning("No candidates remain after rejection filter (session=%s)", session_id)
        response_payload = {
            "decision": None,
            "ux": {
                "ui_state": "low",
                "cta": "No more options nearby",
                "alternatives": [],
            },
            "context_snapshot": {
                "situation_summary": summary,
                "interpreted_intent": req.situation.intent or "inferred",
                "decision_basis": "exhausted_candidates",
                "candidates_evaluated": 0,
            },
            "session_id": session_id,
        }
        _should_debug = req.debug or bool((req.settings or {}).get("debug"))
        if _should_debug:
            response_payload["debug"] = {"top_candidates": []}
        return response_payload

    # ── Unified debug flag: top-level or settings.debug ──
    should_debug = req.debug or bool((req.settings or {}).get("debug"))

    # ── LLM Orchestration: context-aware venue selection ──
    decision = await run_hade_decision(req, filtered_candidates, summary)
    debug_top_candidates = decision.pop("debug_top_candidates", [])
    debug_payload = decision.pop("debug_payload", {})

    selected = _find_venue_by_name(filtered_candidates, decision["venue_name"])
    distance = _haversine(lat, lng, selected.latitude, selected.longitude)
    eta = round(distance / 80)  # ~80 m/min walking pace

    is_llm = "llm_failure_reason" not in decision

    context_snapshot = {
        "situation_summary": summary,
        "interpreted_intent": req.situation.intent or "inferred",
        "decision_basis": "llm" if is_llm else "fallback",
        "candidates_evaluated": len(filtered_candidates),
    }
    if not is_llm:
        context_snapshot["llm_failure_reason"] = decision.get("llm_failure_reason", "provider_error")

    response_payload = {
        "decision": {
            "id": selected.id,
            "venue_name": selected.name,
            "category": selected.types[0] if selected.types else "venue",
            "geo": {"lat": selected.latitude, "lng": selected.longitude},
            "distance_meters": round(distance),
            "eta_minutes": eta,
            "neighborhood": selected.address,
            "confidence": decision["confidence"],
            "rationale": decision["rationale"],
            "why_now": decision["why_now"],
            "situation_summary": decision.get("situation_summary") or summary,
        },
        "context_snapshot": context_snapshot,
        "session_id": session_id,
    }
    if should_debug:
        response_payload["debug"] = {
            "top_candidates": debug_top_candidates,
            **debug_payload,
        }
    return response_payload

@app.get("/health")
def health():
    return {"status": "ok", "bridge": "active"}

from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, List

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

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
    rejection_history: List[RejectionEntry] = Field(default_factory=list)

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

# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/hade/decide")
async def decide(req: DecideRequest):
    summary = _generate_summary(req)
    return {
        "decision": {
            "id": "v_cruise_room",
            "venue_name": "The Cruise Room",
            "category": "Art Deco cocktail bar",
            "neighborhood": "Downtown Denver",
            "confidence": 0.94,
            "rationale": f"The Cruise Room is the move tonight for a {req.social.group_type}—it matches your {req.state.energy} energy perfectly.",
            "why_now": f"Optimal signal density for the current window.",
            "situation_summary": summary,
        },
        "session_id": req.session_id or str(uuid.uuid4())
    }

@app.get("/health")
def health():
    return {"status": "ok", "bridge": "active"}
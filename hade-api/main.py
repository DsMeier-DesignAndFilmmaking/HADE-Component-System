"""
HADE Decision Engine — v0 Minimal
Validates the full frontend-to-backend contract with a mock decision.
No LLM dependency. No external API keys. Runs immediately.

Startup (from hade-api/):
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

What this does:
  1. Accepts the full HadeContext from the demo page
  2. Derives time + day if the client didn't send them
  3. Builds a situation_summary from the incoming context
  4. Returns a single mock decision — The Cruise Room, Denver
  5. Rationale and why_now reference actual context fields (energy, time, group)

Swap in the LLM layer later by replacing the bottom of the decide() function.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="HADE Decision Engine", version="0.1.0-mock")

app.add_middleware(
    CORSMiddleware,
    # Allow ALL origins for the demo to bypass Vercel/Localtunnel mismatch
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Crucial: Allow the browser to see these headers
    expose_headers=["*"],
)

@app.middleware("http")
async def add_localtunnel_header(request, call_next):
    response = await call_next(request)
    # This tells Localtunnel to skip the warning page
    response.headers["bypass-tunnel-reminder"] = "true"
    return response

# ─── Pydantic Models — mirrors src/types/hade.ts ──────────────────────────────

class GeoLocation(BaseModel):
    lat: float
    lng: float

class HadeSituation(BaseModel):
    intent: Optional[str] = None    # eat | drink | chill | scene | anything | null
    urgency: str = "low"

class HadeState(BaseModel):
    energy: str = "medium"          # low | medium | high
    openness: str = "open"          # comfort | open | adventurous

class HadeSocial(BaseModel):
    group_size: int = 1
    group_type: str = "solo"        # solo | couple | friends | family | work

class HadeConstraints(BaseModel):
    budget: Optional[str] = None
    time_available_minutes: Optional[int] = None
    distance_tolerance: Optional[str] = None    # walking | short_drive | any

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
    situation:  HadeSituation  = Field(default_factory=HadeSituation)
    state:      HadeState      = Field(default_factory=HadeState)
    social:     HadeSocial     = Field(default_factory=HadeSocial)
    constraints:HadeConstraints= Field(default_factory=HadeConstraints)
    time_of_day: Optional[str] = None   # if omitted, backend derives from clock
    day_type:    Optional[str] = None   # if omitted, backend derives from clock
    radius_meters: float = 1500
    session_id: Optional[str] = None
    signals: list[Signal] = Field(default_factory=list)
    rejection_history: list[RejectionEntry] = Field(default_factory=list)

# ─── Time Derivation — mirrors getTimeOfDay() / getDayType() in engine.ts ─────

def _time_of_day() -> str:
    h = datetime.now().hour
    if  5 <= h < 11: return "morning"
    if 11 <= h < 13: return "midday"
    if 13 <= h < 17: return "afternoon"
    if 17 <= h < 19: return "early_evening"
    if 19 <= h < 22: return "evening"
    return "late_night"

def _day_type() -> str:
    now = datetime.now()
    day, h = now.weekday(), now.hour    # 0=Mon … 4=Fri, 5=Sat, 6=Sun
    if day in (4, 5) and h >= 18: return "weekend_prime"
    if day in (5, 6):             return "weekend"
    if h >= 18:                   return "weekday_evening"
    return "weekday"

# ─── Situation Summary — mirrors generateSituationSummary() in engine.ts ──────

_TIME_LABELS: dict[str, str] = {
    "morning":       "Morning",
    "midday":        "Midday",
    "afternoon":     "Afternoon",
    "early_evening": "Early evening",
    "evening":       "Evening",
    "late_night":    "Late night",
}

_DAY_PHRASES: dict[str, str] = {
    "weekend_prime":   "{t} on a prime weekend",
    "weekend":         "{t} on a weekend",
    "weekday_evening": "{t} on a weekday",
    "weekday":         "{t} on a weekday",
    "holiday":         "{t} on a holiday",
}

_INFERRED_INTENT: dict[str, str] = {
    "morning":       "eat",
    "midday":        "eat",
    "afternoon":     "chill",
    "early_evening": "eat",
    "evening":       "eat",
    "late_night":    "drink",
}

_OPENNESS_PHRASES: dict[str, str] = {
    "comfort":     "wants familiar comfort",
    "open":        "open to anything",
    "adventurous": "adventurous",
}

_INTENT_PHRASES: dict[str, str] = {
    "eat":   "looking to eat",
    "drink": "wants a drink",
    "chill": "looking to chill",
    "scene": "wants a scene",
}

def generate_situation_summary(
    req: DecideRequest,
    time_of_day: str,
    day_type: str,
) -> str:
    """
    Collapses the incoming HadeContext into a single anchor sentence.
    This is the primary input for any downstream LLM reasoning.

    Format:
      "{Day+Time}, {social}, {energy}, {openness}[, {intent}][, {constraints}]."

    Examples:
      "Evening on a prime weekend, couple, high energy, adventurous, no specific intent (likely eat), 2-hour window."
      "Late night on a weekday, solo, low energy, wants familiar comfort, wants a drink."
    """
    parts: list[str] = []

    # 1 — Time + Day
    t = _TIME_LABELS.get(time_of_day, time_of_day.replace("_", " ").capitalize())
    template = _DAY_PHRASES.get(day_type, "{t}")
    parts.append(template.replace("{t}", t))

    # 2 — Social
    s = req.social
    if s.group_size == 1:
        parts.append("solo")
    elif s.group_type == "couple":
        parts.append("couple")
    else:
        parts.append(f"{s.group_type} ({s.group_size})")

    # 3 — Energy + Openness
    energy_label = "medium energy" if req.state.energy == "medium" else f"{req.state.energy} energy"
    openness_label = _OPENNESS_PHRASES.get(req.state.openness, req.state.openness)
    parts.append(f"{energy_label}, {openness_label}")

    # 4 — Intent (or inferred)
    intent = req.situation.intent
    if not intent or intent == "anything":
        inferred = _INFERRED_INTENT.get(time_of_day)
        parts.append(
            f"no specific intent (likely {inferred})" if inferred else "no specific intent"
        )
    else:
        parts.append(_INTENT_PHRASES.get(intent, intent))

    # 5 — Constraints (only non-trivial values)
    c = req.constraints
    if c.time_available_minutes:
        hrs, mins = divmod(c.time_available_minutes, 60)
        if hrs and mins:
            parts.append(f"{hrs}h {mins}min window")
        elif hrs:
            parts.append(f"{hrs}-hour window")
        else:
            parts.append(f"{mins}-minute window")

    if c.distance_tolerance and c.distance_tolerance != "any":
        dist_label = {"walking": "walking distance only", "short_drive": "short drive okay"}
        parts.append(dist_label.get(c.distance_tolerance, c.distance_tolerance))

    if c.budget and c.budget != "unlimited":
        parts.append(f"{c.budget} budget")

    return ", ".join(parts) + "."

# ─── Mock Venue — The Cruise Room ─────────────────────────────────────────────
# The Cruise Room is a real Art Deco cocktail bar in the Brown Palace Hotel,
# Denver. Opened 1933. One of the best bars in Colorado. Solid mock choice.

_CRUISE_ROOM = {
    "id":               "v_cruise_room",
    "venue_name":       "The Cruise Room",
    "category":         "Art Deco cocktail bar",
    "geo":              {"lat": 39.7443, "lng": -104.9875},
    "distance_meters":  610,
    "eta_minutes":      8,
    "neighborhood":     "Downtown",
}

# ─── Rationale Builder ────────────────────────────────────────────────────────

_TIME_TO_LABEL: dict[str, str] = {
    "morning":       "this morning",
    "midday":        "at lunch",
    "afternoon":     "this afternoon",
    "early_evening": "early this evening",
    "evening":       "tonight",
    "late_night":    "late tonight",
}

_ENERGY_TO_LABEL: dict[str, str] = {
    "low":    "low-key",
    "medium": "easy",
    "high":   "high",
}

def build_rationale(
    req: DecideRequest,
    time_of_day: str,
) -> tuple[str, str]:
    """
    Builds (rationale, why_now) for The Cruise Room.
    Both must reference at least one context factor — no generic copy.
    """
    group_label = "solo" if req.social.group_type == "solo" else f"the {req.social.group_type}"
    time_label  = _TIME_TO_LABEL.get(time_of_day, "right now")
    energy_label = _ENERGY_TO_LABEL.get(req.state.energy, req.state.energy)

    rationale = (
        f"The Cruise Room is the call {time_label} for {group_label} — "
        f"{energy_label} energy and one of Denver's most intentional rooms. "
        f"1933 Art Deco bar inside the Brown Palace. 8 minutes. No substitutes."
    )

    why_now = (
        f"The {time_of_day.replace('_', ' ')} window with "
        f"{req.state.energy} energy is exactly what this bar is built for."
    )

    return rationale, why_now

# ─── POST /hade/decide ────────────────────────────────────────────────────────

@app.post("/hade/decide")
async def decide(req: DecideRequest) -> dict:
    # Resolve time/day — use client values if sent, otherwise derive from clock
    time_of_day = req.time_of_day or _time_of_day()
    day_type    = req.day_type    or _day_type()

    # Build the situation anchor sentence
    summary = generate_situation_summary(req, time_of_day, day_type)

    # Build context-grounded rationale
    rationale, why_now = build_rationale(req, time_of_day)

    # ── Swap this block for real LLM + venue scoring when ready ──────────────
    decision = {
        **_CRUISE_ROOM,
        "rationale":        rationale,
        "why_now":          why_now,
        "confidence":       0.91,
        "situation_summary": summary,
    }
    # ─────────────────────────────────────────────────────────────────────────

    return {
        "decision": decision,
        "context_snapshot": {
            "situation_summary": summary,
            "interpreted_intent": req.situation.intent or _INFERRED_INTENT.get(time_of_day, "anything"),
            "decision_basis": (
                f"day_type={day_type}"
                f" + time_of_day={time_of_day}"
                f" + state.energy={req.state.energy}"
                f" + state.openness={req.state.openness}"
            ),
            "candidates_evaluated": 1,
        },
        "session_id": req.session_id or str(uuid.uuid4()),
    }

# ─── GET /health ──────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "mode":   "mock",
        "venue":  "The Cruise Room",
    }

// ─── Primitives ──────────────────────────────────────────────────────────────

export interface GeoLocation {
  lat: number;
  lng: number;
}

export type SignalType =
  | "PRESENCE"
  | "SOCIAL_RELAY"
  | "ENVIRONMENTAL"
  | "BEHAVIORAL"
  | "AMBIENT"
  | "EVENT"
  | "INTENT";

export type Intent = "eat" | "drink" | "chill" | "scene" | "anything";

// ─── Signal Source Layer ─────────────────────────────────────────────────────

/** Origin classification for trust scoring and display differentiation. */
export type SignalSource = "system" | "partner" | "user";

/** UGC signal categories — drives TTL, validation rules, and display. */
export type UserSignalCategory = "activity" | "food" | "event" | "vibe" | "alert";

/** Community signals configuration — controls UGC signal participation. */
export interface CommunitySignalsConfig {
  /** Whether the user has opted in to send/receive community signals. */
  enabled: boolean;
  /** Whether the current signal being composed should be shared. Default: true when enabled. */
  shareCurrentSignal: boolean;
}

export type EnergyLevel = "low" | "medium" | "high";

export type ComponentVariant = "primary" | "secondary" | "ghost";

export type ComponentSize = "default" | "sm" | "lg";

// ─── Situation-First Primitives ───────────────────────────────────────────────

/**
 * Expanded time-of-day with higher resolution than the legacy 4-value enum.
 * Drives intent inference and rationale tone.
 */
export type TimeOfDay =
  | "morning"        // 05:00–11:00 — breakfast window
  | "midday"         // 11:00–13:00 — lunch window
  | "afternoon"      // 13:00–17:00 — post-lunch, pre-evening
  | "early_evening"  // 17:00–19:00 — post-work, pre-dinner
  | "evening"        // 19:00–22:00 — prime dinner/social window
  | "late_night";    // 22:00–05:00 — reduced options, comfort or scene

/**
 * Expanded day classification. weekend_prime is Friday/Saturday evening —
 * the highest social energy window of any week.
 */
export type DayType =
  | "weekday"          // Mon–Thu (any hour)
  | "weekday_evening"  // Mon–Thu after 18:00
  | "weekend"          // Sat–Sun daytime
  | "weekend_prime"    // Fri–Sat evening (18:00+) — max social energy
  | "holiday";         // Explicit public holiday override

/**
 * How adventurous the user is in this moment.
 * comfort = familiar, low-risk. open = flexible. adventurous = wants discovery.
 */
export type Openness = "comfort" | "open" | "adventurous";

/**
 * Social configuration of the group.
 */
export type GroupType = "solo" | "couple" | "friends" | "family" | "work";

/**
 * Spending tolerance. Informs venue category filtering before the LLM call.
 */
export type Budget = "free" | "low" | "medium" | "high" | "unlimited";

// ─── Human State Groups ───────────────────────────────────────────────────────

/**
 * What the user wants to do and how urgently.
 * intent: null means the engine should infer from time_of_day + day_type.
 */
export interface HadeSituation {
  intent: Intent | null;
  urgency: "low" | "medium" | "high";
}

/**
 * The user's current physical and mental state.
 * These directly influence venue type, distance tolerance, and noise preference.
 */
export interface HadeState {
  energy: EnergyLevel;
  openness: Openness;
}

/**
 * Who is in the group and how many.
 */
export interface HadeSocial {
  group_size: number;
  group_type: GroupType;
}

/**
 * Real-world blockers. Optional — no constraints means maximum flexibility.
 */
export interface HadeConstraints {
  budget?: Budget;
  time_available_minutes?: number;  // how long they have; undefined = no limit
  distance_tolerance?: "walking" | "short_drive" | "any";
}

// ─── Rejection History ────────────────────────────────────────────────────────

export interface RejectionEntry {
  venue_id: string;
  venue_name: string;
  pivot_reason: string;
}

// ─── HADE Context (v0 Contract) ───────────────────────────────────────────────

/**
 * The canonical context object for HADE v0.
 * Situation-First: human state is organized into semantic groups,
 * not flattened into a raw data bag.
 *
 * This is what gets assembled client-side (via buildContext) and
 * serialized into the POST /hade/decide request.
 */
export interface HadeContext {
  // Where
  geo: GeoLocation | null;

  // When (auto-derived by buildContext unless provided)
  time_of_day: TimeOfDay;
  day_type: DayType;

  // Human state — the "Situation-First" groups
  situation: HadeSituation;
  state: HadeState;
  social: HadeSocial;
  constraints: HadeConstraints;

  // System fields
  radius_meters: number;
  session_id: string | null;
  signals: Signal[];
  rejection_history: RejectionEntry[];
}

export interface HadeConfig {
  api_url?: string;
  default_radius?: number;
  auto_emit_presence?: boolean;
  trust_threshold?: number; // min edge_weight to display attribution
}

// ─── Decide API ───────────────────────────────────────────────────────────────

/**
 * What the frontend sends to POST /hade/decide.
 * Mirrors HadeContext but all groups are optional — backend applies defaults.
 */
export interface DecideRequest {
  persona?: AgentPersona; // The Notion-synced agent definition
  geo: GeoLocation;
  situation?: Partial<HadeSituation>;
  state?: Partial<HadeState>;
  social?: Partial<HadeSocial>;
  constraints?: HadeConstraints;
  time_of_day?: TimeOfDay;
  day_type?: DayType;
  radius_meters?: number;
  session_id?: string | null;
  signals?: Signal[];
  rejection_history?: RejectionEntry[];
  settings?: HadeSettings;
  /**
   * Venue IDs the client knows have recent LocationNode weight updates.
   * The decide handler uses these to fetch fresh weights before scoring.
   */
  node_hints?: string[];
}

/**
 * The single decision returned by the backend.
 * No fallbacks. No primary+secondary. One decision.
 *
 * situation_summary is the anchor sentence the LLM used as its
 * reasoning starting point — exposed here for transparency and debugging.
 */
export interface HadeDecision {
  id: string;
  venue_name: string;
  category: string;
  geo: GeoLocation;
  distance_meters: number;
  eta_minutes: number;
  neighborhood?: string;

  // LLM output — contextually grounded, non-generic
  rationale: string;            // 1–2 sentences, references a context factor
  why_now: string;              // what made this right specifically NOW
  confidence: number;           // 0–1 composite score

  // The anchor sentence that drove this decision
  situation_summary: string;
}

/**
 * What POST /hade/decide returns.
 * One decision. Context snapshot for observability. Session continuity.
 */
export interface DecideResponse {
  decision: HadeDecision;
  context_snapshot: {
    situation_summary: string;
    interpreted_intent: string;
    decision_basis: "llm" | "fallback";
    candidates_evaluated: number;
    llm_failure_reason?: "timeout" | "parse_error" | "validation_error" | "provider_error";
  };
  session_id: string;
  /**
   * Which tier produced this response.
   * - "llm"            — upstream engine responded successfully
   * - "synthetic"      — upstream failed; decision built from real Places API candidates
   * - "static_fallback"— Places API unavailable or returned nothing; hardcoded stub
   * Absent on upstream responses that predate this field.
   */
  source?: "llm" | "synthetic" | "static_fallback";
  /**
   * Real nearby venues fetched during Tier 2. Populated only when source === "synthetic".
   * Empty array for llm and static_fallback paths.
   */
  fallback_places?: PlaceOption[];
}

// ─── UX Layer ─────────────────────────────────────────────────────────────────

/**
 * Confidence tier mapped to UX presentation intensity.
 * Derived client-side from decision.confidence.
 */
export type UiState = "high" | "medium" | "low";

export interface HadeUX {
  ui_state: UiState;
  cta: string;
  badges: string[];
}

// ── External API Contract ─────────────────────────────────────────────

export interface HadeAPIDecision {
  id: string;
  title: string;
  category: string;
  neighborhood?: string;
  distance: string;
  eta?: string;
  geo: GeoLocation;
}

export interface HadeAPIMeta {
  contextType: string;
  timestamp: string;
}

export interface HadeAPIResponse {
  status: "idle" | "loading" | "ready" | "error";
  decision: HadeAPIDecision | null;
  reasoning: string[];
  confidence: number;
  error: string | null;
  meta: HadeAPIMeta | null;
}

/**
 * Full shaped response stored in AdaptiveState.
 * Mirrors DecideResponse. Some environments may also include a ux block.
 */
export interface HadeResponse {
  decision: HadeDecision;
  ux?: HadeUX;
  context_snapshot: DecideResponse["context_snapshot"];
  session_id: string;
  debug?: HadeDebugPayload;
}

// ─── Debug Payload ────────────────────────────────────────────────────────────

/**
 * A single candidate entry from the pre-LLM scoring stage.
 * Present in debug.top_candidates and debug.scoring_breakdown.
 */
export interface HadeDebugCandidate {
  venue_id: string;
  venue_name: string;
  category: string;
  proximity_score: number;
  context_score: number;
  intent_score: number;
  final_score: number;
}

/**
 * Debug payload returned by POST /hade/decide when settings.debug is true.
 * All fields are optional — never crash if a key is absent.
 */
export interface HadeDebugPayload {
  top_candidates?: HadeDebugCandidate[];
  scoring_breakdown?: HadeDebugCandidate[];
  intent_probabilities?: Record<string, number>;
  weight_profile?: string;
  weights?: { proximity: number; context: number; intent: number };
  exploration_temp?: number | null;
  model_used?: string;
  provider_used?: string;
  strict_constraints_active?: boolean;
  persona_id?: string | null;
}

// ─── Signals ──────────────────────────────────────────────────────────────────

export interface Signal {
  id: string;
  type: SignalType;
  venue_id: string | null;
  content: string | null;
  strength: number; // 0–1
  emitted_at: string; // ISO timestamp
  expires_at: string; // ISO timestamp
  geo: GeoLocation;
  event_id?: string | null;
  source_user_id?: string | null;

  // ── UGC signal fields (optional — present when source === "user") ──
  source?: SignalSource;
  category?: UserSignalCategory;
  shareable?: boolean;
  validation_status?: "pending" | "approved" | "flagged" | "expired";
}

export interface TrustAttribution {
  user_id: string;
  display_name: string;
  edge_weight: number; // 0–1 social proximity
  time_ago: string;    // human-readable, e.g. "2h ago"
  quote?: string;
}

// ─── Opportunity (legacy — kept for signal attribution display) ───────────────

export interface EventInfo {
  id: string;
  name: string;
  starts_at: string;
  venue_id: string;
}

export interface PrimarySignal {
  type: SignalType;
  strength: number;
  content: string | null;
}

/**
 * Opportunity is the backend's candidate venue before a decision is made.
 * Kept for trust attribution display and signal visualization components.
 * The primary decision output is HadeDecision, not Opportunity.
 */
export interface Opportunity {
  id: string;
  venue_name: string;
  category: string;
  distance_meters: number;
  eta_minutes: number;
  rationale: string;
  trust_attributions: TrustAttribution[];
  geo: GeoLocation;
  is_primary: boolean;
  event: EventInfo | null;
  primary_signal: PrimarySignal | null;
  neighborhood?: string;
  score?: number;
}

// ─── Adaptive State ───────────────────────────────────────────────────────────

export interface AdaptiveState {
  context: HadeContext;
  signals: Signal[];
  decision: HadeDecision | null;
  response: HadeResponse | null;
  isLoading: boolean;
  error: string | null;
  setGeo: (geo: { lat: number; lng: number }) => void;
  setRadius: (radius_meters: number | ((prev: number) => number)) => void;
  emit: (type: SignalType, payload?: Partial<Signal>) => Signal;
  decide: (req?: Partial<DecideRequest>) => Promise<void>;
  pivot: (reason: string) => void;

  // ── Community Signals (UGC) ──
  communitySignals: CommunitySignalsConfig;
  setCommunitySignals: (enabled: boolean) => void;

  // ── Vibe Signal (UGC feedback loop) ──
  /**
   * Emit a VibeSignal for a specific venue. Non-blocking — enqueues immediately
   * and flushes to POST /api/hade/signal on the next idle frame.
   */
  emitVibeSignal: (
    venueId: string,
    tags: VibeTag[],
    sentiment: VibeSignal["sentiment"],
    strength?: number,
  ) => VibeSignal;
}

// ─── Component Props ──────────────────────────────────────────────────────────

export interface HadeButtonProps {
  variant?: ComponentVariant;
  size?: ComponentSize;
  href?: string;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export interface HadeCardProps {
  glow?: boolean | "blue" | "lime";
  className?: string;
  children: React.ReactNode;
}

export interface HadePanelProps {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export interface SignalBadgeProps {
  type: SignalType;
  strength?: number;
  label?: string;
  animated?: boolean;
  className?: string;
}

export interface DecisionDiagramProps {
  interactive?: boolean;
  compact?: boolean;
  className?: string;
}

export type SignalNodeState = "idle" | "active" | "stale";

export type EngineNodeState = "idle" | "running" | "complete";

export type ExperienceNodeState = "queued" | "ready" | "delivered";

export interface DecisionFlowSignalNode {
  id: string;
  type: SignalType;
  state: SignalNodeState;
  strength?: number;
  label?: string;
}

export interface DecisionFlowEngineNode {
  id: string;
  label: string;
  detail: string;
  state: EngineNodeState;
  latencyMs?: number;
}

export interface DecisionFlowExperienceNode {
  id: string;
  label: string;
  detail: string;
  mode: UserSignalMode;
  state: ExperienceNodeState;
}

export interface DecisionFlowDiagramProps {
  animated?: boolean;
  className?: string;
}

// ─── User Signal (adaptive component presentation context) ────────────────────

export type UserSignalMode = "explore" | "book" | "compare";

export type Urgency = "low" | "medium" | "high";

export interface UserSignal {
  intent: Intent;
  urgency: Urgency;
  mode: UserSignalMode;
  context?: string;
}

// ─── Adaptive Component Props ─────────────────────────────────────────────────

export interface AdaptiveCardProps {
  signal: UserSignal;
  title: string;
  image?: string;
  metrics?: Array<{ label: string; value: string }>;
  ctaLabel?: string;
  ctaHref?: string;
  onCtaClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export interface ContextSignalBadgeProps {
  signal: UserSignal;
  showContext?: boolean;
  animated?: boolean;
  className?: string;
}

export interface AdaptiveButtonProps {
  signal: UserSignal;
  label?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  size?: ComponentSize;
  className?: string;
  children?: React.ReactNode;
}

// ─── Agent Persona (synced from Notion L2) ──────────────────────────────────

/**
 * Valid tone modifiers for agent personas.
 * Each tag maps to a system prompt behavioral modifier.
 * Sourced from the Notion "Tone" multi_select column.
 */
export type AgentTone =
  | "Concise"
  | "Technical"
  | "Editorial"
  | "Warm"
  | "Minimalist"
  | "Adventurous"
  | "Grounded";

/**
 * Valid LLM model targets. Null means inherit from HADE_LLM_PROVIDER env var.
 * ollama-* targets are for local deployment on the 2013 iMac.
 */
export type ModelTarget =
  | "claude-sonnet"
  | "claude-haiku"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gemini-flash"
  | "ollama-mistral"
  | "ollama-llama3"
  | "ollama-phi3";

/**
 * An agent persona synced from the Notion Strategic Command Center.
 * This defines WHO the LLM is when making decisions — its identity,
 * constraints, and communication style.
 *
 * The sync pipeline (scripts/sync-notion.js) validates every field
 * before writing to src/config/agent_definitions.json.
 */
export interface AgentPersona {
  /** Unique identifier. Regex: ^[A-Z][A-Za-z0-9_]{2,39}$ */
  id: string;

  /** One-sentence role description. 10-200 characters. */
  role: string;

  /** 1-3 tone tags from the AgentTone enum. */
  tone: AgentTone[];

  /** Behavioral constraints. Array of rule strings (parsed from pipe-delimited Notion field). */
  guardrails: string[];

  /** LLM target. Null = inherit from env. */
  model_target?: ModelTarget | null;

  /** ISO 8601 timestamp of last Notion edit. */
  last_updated: string;
}

/**
 * The root structure of agent_definitions.json.
 */
export interface AgentDefinitions {
  version: string;
  synced_at: string;
  source_database_id: string;
  agents: AgentPersona[];
  validation_warnings: string[];
}

// ─── Settings ─────────────────────────────────────────────────────────────────

/**
 * User-controlled runtime settings. Persisted to localStorage.
 * All fields optional — backend applies its own defaults for absent keys.
 */
export interface HadeSettings {
  /** LLM model override. Null = use server default (env var). */
  model_target?: ModelTarget | null;
  /** Decision mode preset. Stored for Phase 3 behavioral wiring. */
  mode?: "balanced" | "precise" | "explorative";
  /** Exploration temperature override (0.0–1.0). Null = adaptive. */
  exploration_temp?: number | null;
  /** Minimum confidence to show a decision card (0.0–1.0). Default 0.0. */
  confidence_threshold?: number;
  /** Intent weight override (0.0–1.0). Null = adaptive. Stored for Phase 3 scoring wiring. */
  intent_weight?: number | null;
  /** Hard-enforce constraints vs soft-suggest. Default false. */
  strict_constraints?: boolean;
  /** Active persona ID. Null = use first available. */
  persona_id?: string | null;
  /** Echo full debug payload in API response. Default false. */
  debug?: boolean;
  /**
   * Override composite scoring weights for this session.
   * Null = use server defaults (proximity 0.6 / rating 0.4).
   */
  scoring_weights?: ScoringWeights | null;
}

export const DEFAULT_HADE_SETTINGS: HadeSettings = {
  model_target: null,
  mode: "balanced",
  exploration_temp: null,
  confidence_threshold: 0.0,
  intent_weight: null,
  strict_constraints: false,
  persona_id: null,
  debug: false,
};

// ─── Places ───────────────────────────────────────────────────────────────────

/**
 * A single venue candidate returned by the GroundedPlacesService.
 * Used as the source material for Tier 2 (synthetic) decisions and
 * surfaced to the client via DecideResponse.fallback_places.
 */
export interface PlaceOption {
  /** Google Place ID — stable for deduplication and rejection history */
  id: string;
  name: string;
  /** Normalised HADE category token, e.g. "cafe" | "bar" | "restaurant" | "park" */
  category: string;
  /** 1-word evocative vibe, e.g. "cozy" | "lively" | "fresh" | "electric" */
  vibe: string;
  geo: GeoLocation;
  /** Straight-line haversine distance from the request origin */
  distance_meters: number;
  is_open: boolean;
  address?: string;
  /** Google star rating 1–5 */
  rating?: number;
  /** Normalised price level: 0 (free) – 4 (very expensive) */
  price_level?: number;
}

export interface FetchNearbyOptions {
  geo: GeoLocation;
  /** Search radius in metres. Default 800 m. Capped at 50 000 m by Google. */
  radius_meters?: number;
  /** Restricts to place types matching the intent. Omit for broadest search. */
  intent?: Intent;
  /** Explicit Google Places types to search against. Overrides legacy intent mapping when present. */
  target_categories?: string[];
  /** Only return currently open places. Default true. */
  open_now?: boolean;
  /** Max results. Default 20. Hard-capped at 20 per API page. */
  max_results?: number;
}

// ─── Scoring Weights ─────────────────────────────────────────────────────────

/**
 * Configurable composite scoring weights for synthetic venue scoring.
 * Values should sum to 1.0. Defaults: proximity 0.6, rating 0.4.
 */
export interface ScoringWeights {
  proximity?: number; // 0–1
  rating?: number; // 0–1
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  proximity: 0.6,
  rating: 0.4,
};

// ─── UGC Vibe Signal Layer ───────────────────────────────────────────────────

/**
 * Controlled vocabulary for qualitative vibe feedback.
 * Each tag maps to a positive or negative sentiment that adjusts
 * the LocationNode's probabilistic weight for that dimension.
 */
export type VibeTag =
  | "too_crowded"
  | "perfect_vibe"
  | "overpriced"
  | "hidden_gem"
  | "loud"
  | "quiet"
  | "good_energy"
  | "dead"
  | "worth_it"
  | "skip_it";

/** Sentiment polarity for a VibeTag — determines sign of the weight delta. */
export const VIBE_TAG_SENTIMENT: Record<VibeTag, "positive" | "negative"> = {
  too_crowded:  "negative",
  perfect_vibe: "positive",
  overpriced:   "negative",
  hidden_gem:   "positive",
  loud:         "negative",
  quiet:        "positive",
  good_energy:  "positive",
  dead:         "negative",
  worth_it:     "positive",
  skip_it:      "negative",
};

/**
 * A UGC feedback signal submitted by a user about a specific venue.
 * Extends Signal with vibe-specific fields. The weight_delta is
 * computed server-side by the /api/hade/signal handler.
 */
export interface VibeSignal extends Signal {
  /** One or more qualitative vibe tags for this venue. */
  vibe_tags: VibeTag[];
  /** The venue being rated — mirrors venue_id but required for VibeSignal. */
  location_node_id: string;
  /** Server-computed weight adjustment magnitude (0–1). Read-only from client. */
  weight_delta?: number;
  /** Aggregate sentiment direction for this signal. */
  sentiment: "positive" | "negative" | "neutral";
}

// ─── Location Node (Probabilistic Weight Registry) ───────────────────────────

/**
 * Persisted weight state for a single venue location.
 * weight_map accumulates UGC VibeSignal deltas over time.
 * Used by scoreOpportunity() as an overlay on top of base scoring.
 */
export interface LocationNode {
  venue_id:     string;
  /** Per-tag weight: 0 (strongly negative) → 1 (strongly positive). Default 0.5 (neutral). */
  weight_map:   Record<VibeTag, number>;
  /** Aggregate trust score across all contributing signals (0–1). */
  trust_score:  number;
  /** Total number of VibeSignals that have contributed to this node. */
  signal_count: number;
  /** ISO timestamp of the most recent weight update. */
  last_updated: string;
  /** Monotonically incrementing version for optimistic concurrency. */
  version:      number;
}

// ─── Signal Ingest API ────────────────────────────────────────────────────────

/**
 * Request body for POST /api/hade/signal.
 * Accepts a batch of VibeSignals from the client's idle-flush queue.
 */
export interface SignalIngestRequest {
  signals:          VibeSignal[];
  session_id?:      string;
  source_user_id?:  string;
}

/**
 * Response from POST /api/hade/signal.
 * Returns per-signal IDs and updated LocationNode versions for client-side reconciliation.
 */
export interface SignalIngestResponse {
  accepted:      number;
  rejected:      number;
  signal_ids:    string[];
  /** Maps venue_id → new LocationNode version number after update. */
  node_versions: Record<string, number>;
}

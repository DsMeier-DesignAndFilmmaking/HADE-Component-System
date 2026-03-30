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
  | "EVENT";

export type Intent = "eat" | "drink" | "chill" | "scene" | "anything";

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
    decision_basis: string;
    candidates_evaluated: number;
  };
  session_id: string;
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
  isLoading: boolean;
  error: string | null;
  setGeo: (geo: { lat: number; lng: number }) => void;
  emit: (type: SignalType, payload?: Partial<Signal>) => void;
  decide: (req?: Partial<DecideRequest>) => Promise<void>;
  pivot: (reason: string) => void;
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
  description?: string;
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

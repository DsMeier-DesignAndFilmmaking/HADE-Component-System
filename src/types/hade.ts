// ─── Primitives ─────────────────────────────────────────────────────────────

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

// ─── Signals ─────────────────────────────────────────────────────────────────

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
  time_ago: string; // human-readable, e.g. "2h ago"
  quote?: string; // optional direct quote
}

// ─── Opportunities ───────────────────────────────────────────────────────────

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

export interface Opportunity {
  id: string;
  venue_name: string;
  category: string;
  distance_meters: number;
  eta_minutes: number;
  rationale: string; // personalized, human-voiced copy
  trust_attributions: TrustAttribution[];
  geo: GeoLocation;
  is_primary: boolean;
  event: EventInfo | null;
  primary_signal: PrimarySignal | null;
  neighborhood?: string;
  score?: number; // composite ranking score
}

// ─── Decide API ──────────────────────────────────────────────────────────────

export interface DecideRequest {
  geo: GeoLocation;
  intent?: Intent | null;
  group_size?: number;
  session_id?: string | null;
  energy_level?: EnergyLevel;
  radius_meters?: number;
  rejection_history?: Array<{
    venue_id: string;
    venue_name: string;
    pivot_reason: string;
  }>;
}

export interface DecideResponse {
  primary: Opportunity;
  fallbacks: Opportunity[];
  context_state_id: string;
  provider?: "gemini" | "openai";
}

// ─── HADE Context ────────────────────────────────────────────────────────────

export interface HadeContext {
  geo: GeoLocation | null;
  intent: Intent;
  energy_level: EnergyLevel;
  group_size: number;
  radius_meters: number;
  session_id: string | null;
  time_of_day: "morning" | "afternoon" | "evening" | "night";
  day_type: "weekday" | "weekend";
  signals: Signal[];
  rejection_history: DecideRequest["rejection_history"];
}

export interface HadeConfig {
  api_url?: string;
  default_radius?: number;
  default_intent?: Intent;
  auto_emit_presence?: boolean;
  trust_threshold?: number; // min edge_weight to display attribution
}

// ─── Adaptive State ──────────────────────────────────────────────────────────

export interface AdaptiveState {
  context: HadeContext;
  signals: Signal[];
  opportunities: Opportunity[];
  primary: Opportunity | null;
  isLoading: boolean;
  error: string | null;
  emit: (type: SignalType, payload?: Partial<Signal>) => void;
  decide: (req?: Partial<DecideRequest>) => Promise<void>;
  pivot: (reason: string) => void;
}

// ─── Component Props ─────────────────────────────────────────────────────────

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

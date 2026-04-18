export type HadeSDKStatus = "loading" | "ready";

export interface HadeSDKDecision {
  title: string;
  distance: string;
  eta?: string;
}

export type HadeSDKReasoning = [string, string] | [string, string, string] | [];

export interface HadeSDKResponse {
  status: HadeSDKStatus;
  decision: HadeSDKDecision | null;
  reasoning: HadeSDKReasoning;
  confidence: number;
}

export interface HadeRefineInput {
  tone?: "closer" | "faster" | "quieter";
}

export interface HadeGeo {
  lat: number;
  lng: number;
}

export interface HadeTimeContext {
  timeOfDay: string;
  dayType: string;
}

export interface HadeSDKConfig {
  apiUrl?: string;
  fallbackGeo?: HadeGeo;
  fetcher?: typeof fetch;
  getGeo?: () => Promise<HadeGeo>;
  getTimeContext?: () => HadeTimeContext;
}

export interface HadeSDKClient {
  getDecision(): Promise<HadeSDKResponse>;
  regenerate(): Promise<HadeSDKResponse>;
  refine(input?: HadeRefineInput): Promise<HadeSDKResponse>;
  getAlternative(): Promise<HadeSDKResponse>;
}

export interface HadeDecisionRequestBody {
  geo: HadeGeo;
  time_of_day: string;
  day_type: string;
  rejection_history?: Array<{
    venue_name: string;
    pivot_reason: "user_requested_alternative";
  }>;
  situation?: {
    intent: null;
    urgency: "medium" | "high";
  };
  signals?: Array<{
    type: "INTENT";
    content: string;
    strength: number;
    geo: HadeGeo;
  }>;
}

export interface RawDecisionAPIResponse {
  decision: {
    venue_name: string;
    distance_meters: number;
    eta_minutes: number;
    confidence: number;
    why_now?: string;
    rationale?: string;
    situation_summary?: string;
  } | null;
  context_snapshot?: {
    situation_summary?: string;
  };
}

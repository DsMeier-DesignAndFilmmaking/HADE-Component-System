// ─── DecisionCandidate ────────────────────────────────────────────────────────
//
// Normalized representation of a ranked venue or opportunity, independent of
// the source domain (Google Places, UGC, custom). Downstream UI and logic
// should prefer this shape over SpontaneousObject for display and analytics.

export type DecisionCandidate = {
  id: string;
  title: string;
  description?: string;
  geo?: { lat: number; lng: number };

  metadata: {
    distance_meters?: number;
    time_relevance?: number;
    social_signal?: number;
    trust_score?: number;
    tags?: string[];
  };

  /** Original domain object — retained for backward compatibility during migration. */
  raw?: unknown;
};

"use client";

import type { HadeSDKDecision, HadeSDKStatus } from "../core";

interface DecisionCardProps {
  decision: HadeSDKDecision | null;
  status: HadeSDKStatus;
}

export function DecisionCard({ decision, status }: DecisionCardProps) {
  return (
    <article className="hade-web-card" aria-busy={status === "loading"}>
      <div className="hade-web-eyebrow">Your move</div>
      <h1 className="hade-web-title">
        {decision?.title ?? "Understanding your context..."}
      </h1>
      <div className="hade-web-metrics" aria-label="Decision details">
        <span className="hade-web-pill">{decision?.distance ?? "Locating..."}</span>
        {decision?.eta ? <span className="hade-web-pill">{decision.eta}</span> : null}
      </div>
    </article>
  );
}

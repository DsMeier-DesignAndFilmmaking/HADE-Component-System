"use client";

import type { HadeSDKDecision, HadeSDKStatus } from "../core";

interface DecisionCardProps {
  decision: HadeSDKDecision | null;
  status: HadeSDKStatus;
  pivotLabel?: string;
}

export function DecisionCard({ decision, status, pivotLabel }: DecisionCardProps) {
  const isReframing = status === "reframing";
  const isLoading   = status === "loading";

  return (
    <article
      className="hade-web-card"
      aria-busy={isLoading || isReframing}
      data-status={status}
    >
      <div className="hade-web-eyebrow">
        {isReframing ? "Reframing..." : "Your move"}
      </div>

      {isReframing && pivotLabel ? (
        <p className="hade-web-pivot-label" aria-live="polite">
          {pivotLabel}
        </p>
      ) : null}

      <h1 className="hade-web-title" data-reframing={isReframing || undefined}>
        {isReframing
          ? "Reframing based on your feedback..."
          : (decision?.title ?? "Understanding your context...")}
      </h1>

      <div className="hade-web-metrics" aria-label="Decision details">
        <span className="hade-web-pill">
          {isReframing ? "—" : (decision?.distance ?? "Locating...")}
        </span>
        {!isReframing && decision?.eta ? (
          <span className="hade-web-pill">{decision.eta}</span>
        ) : null}
      </div>
    </article>
  );
}

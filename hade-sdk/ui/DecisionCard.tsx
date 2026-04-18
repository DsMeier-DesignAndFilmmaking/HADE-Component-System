"use client";

import type { HadeSDKResponse } from "../core";
import { useHadeUISlot } from "./registry";

export function DecisionCard({ response }: { response: HadeSDKResponse }) {
  useHadeUISlot("decision-card");

  return (
    <article
      data-hade-decision-card
      style={{
        borderRadius: 28,
        padding: 24,
        color: "white",
        background: "linear-gradient(135deg, #19314f 0%, #1f6d66 100%)",
        boxShadow: "0 18px 48px rgba(0,0,0,0.16)",
        minHeight: 220,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.72, textTransform: "uppercase", letterSpacing: 0.8 }}>
          Your move
        </div>
        <h1 style={{ margin: "10px 0 0", fontSize: 32, lineHeight: 1.05 }}>
          {response.decision?.title ?? "Understanding your context..."}
        </h1>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <MetricPill value={response.decision?.distance ?? "Locating..."} />
        {response.decision?.eta ? <MetricPill value={response.decision.eta} /> : null}
      </div>
    </article>
  );
}

function MetricPill({ value }: { value: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 34,
        padding: "0 14px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.18)",
        fontWeight: 600,
      }}
    >
      {value}
    </span>
  );
}

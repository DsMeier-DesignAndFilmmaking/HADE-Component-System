"use client";

import { useHade } from "@hade/react";

const NYC = { lat: 40.7128, lng: -74.006 };

export default function HomePage() {
  const { output, error, isLoading, refine, decide } = useHade({
    geo: NYC,
    situation: { intent: "eat" },
  });

  return (
    <main style={{ maxWidth: 640, margin: "4rem auto", fontFamily: "system-ui" }}>
      <h1>HADE Demo (Next.js)</h1>
      <p>
        <strong>Status:</strong>{" "}
        {isLoading ? "Thinking…" : error ? `Error: ${error.message}` : "Ready"}
      </p>

      {output && (
        <article style={{ border: "1px solid #ddd", padding: "1.5rem", borderRadius: 8 }}>
          <h2 style={{ marginTop: 0 }}>{output.decision.venue_name}</h2>
          <p>
            <em>Confidence:</em> {output.confidence.band}{" "}
            ({(output.confidence.score * 100).toFixed(0)}%)
          </p>
          <p>{output.rationale.primary_text}</p>
          {output.is_fallback && (
            <p style={{ color: "#a55" }}>
              ⚠ Fallback ({output.fallback_meta?.reason}) — wire a real venue adapter
              in <code>app/Providers.tsx</code> to see real candidates.
            </p>
          )}

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
            <button onClick={() => refine("quieter")} disabled={isLoading}>
              Quieter
            </button>
            <button onClick={() => refine("closer")} disabled={isLoading}>
              Closer
            </button>
            <button onClick={() => decide({ geo: NYC, situation: { intent: "drink" } })}>
              Switch intent to drink
            </button>
          </div>
        </article>
      )}
    </main>
  );
}

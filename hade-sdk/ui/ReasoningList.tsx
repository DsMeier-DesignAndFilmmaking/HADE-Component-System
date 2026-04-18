"use client";

import type { HadeSDKResponse } from "../core";
import { useHadeUISlot } from "./registry";

export function ReasoningList({ response }: { response: HadeSDKResponse }) {
  useHadeUISlot("reasoning-list");
  const reasoning = response.reasoning.length > 0 ? response.reasoning : ["Understanding your context..."];

  return (
    <div data-hade-reasoning style={{ display: "grid", gap: 12, alignContent: "start" }}>
      {reasoning.slice(0, 3).map((item) => (
        <div key={item} style={{ display: "grid", gridTemplateColumns: "10px 1fr", gap: 10, alignItems: "start" }}>
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: "#1f6d66",
              marginTop: 7,
            }}
          />
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.4, color: "rgba(12,12,12,0.74)" }}>{item}</p>
        </div>
      ))}
    </div>
  );
}

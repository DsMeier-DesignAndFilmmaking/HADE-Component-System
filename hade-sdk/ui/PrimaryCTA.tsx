"use client";

import { useHadeUISlot } from "./registry";

export function PrimaryCTA({ onGo }: { onGo: () => void }) {
  useHadeUISlot("primary-cta");

  return (
    <button
      type="button"
      onClick={onGo}
      data-hade-primary-cta
      style={{
        width: "100%",
        height: 58,
        border: 0,
        borderRadius: 20,
        background: "#f66f37",
        color: "white",
        fontSize: 18,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      Go
    </button>
  );
}

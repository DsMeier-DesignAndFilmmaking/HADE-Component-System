"use client";

import type { PropsWithChildren } from "react";
import { HadeUIRegistryProvider } from "./registry";

export function SingleScreenFrame({ children }: PropsWithChildren) {
  return (
    <HadeUIRegistryProvider>
      <section
        data-hade-single-screen
        style={{
          minHeight: "100dvh",
          maxHeight: "100dvh",
          overflow: "hidden",
          display: "grid",
          gridTemplateRows: "1fr auto auto",
          gap: 16,
          padding: 20,
          background: "linear-gradient(180deg, #f5efe6 0%, #ffffff 100%)",
        }}
      >
        {children}
      </section>
    </HadeUIRegistryProvider>
  );
}

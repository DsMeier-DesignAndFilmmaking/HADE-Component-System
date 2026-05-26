"use client";

import type { HadeConfig } from "@hade/react";
import type { ReactNode } from "react";
import { HadeProvider } from "@hade/react";
import hadeConfig from "../hade.config.json" assert { type: "json" };

/**
 * Single source of HadeClient for the example app.
 *
 * In a real production app you'd wire real adapters here:
 *
 *   import { googlePlaces } from "@hade/adapters-google-places";
 *   import { openai } from "@hade/adapters-openai";
 *
 *   adapters={{
 *     venue: googlePlaces({ apiKey: process.env.NEXT_PUBLIC_GP_KEY! }),
 *     llm:   openai({ apiKey: process.env.OPENAI_API_KEY! }),
 *   }}
 *
 * Without adapters wired, @hade/core falls back gracefully to a static
 * decision — useful for proving the install path works before you commit
 * to a provider.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <HadeProvider config={hadeConfig as HadeConfig}>{children}</HadeProvider>;
}

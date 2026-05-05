"use client";

import { useEffect, useMemo, useState } from "react";
import { createHade } from "../core";
import type { HadeSDKClient, HadeSDKConfig, HadeSDKResponse, HadeRefineInput } from "../core";

const INITIAL_STATE: HadeSDKResponse = {
  status: "loading",
  decision: null,
  reasoning: [],
  confidence: 0,
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Returns a random delay in the 300–600ms range — feels deliberate, not instant. */
function reframeDelay(): number {
  return 300 + Math.random() * 300;
}

function toneLabel(tone?: HadeRefineInput["tone"]): string | undefined {
  switch (tone) {
    case "closer":  return "Adjusting for: Too far";
    case "quieter": return "Adjusting for: Too loud";
    case "faster":  return "Adjusting for: Too slow";
    default:        return undefined;
  }
}

export function useHade(config?: HadeSDKConfig): HadeSDKResponse & {
  hade: HadeSDKClient;
  regenerate: () => Promise<HadeSDKResponse>;
  refine: HadeSDKClient["refine"];
  getAlternative: HadeSDKClient["getAlternative"];
} {
  const hade = useMemo(() => createHade(config), [config]);
  const [state, setState] = useState<HadeSDKResponse>(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;

    void hade.getDecision().then((response) => {
      if (!cancelled) {
        setState(response);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hade]);

  return {
    ...state,
    hade,

    regenerate: async () => {
      // 1. Show reframing state immediately — keep current decision visible.
      setState((s) => ({ ...s, status: "reframing", pivotLabel: undefined }));
      // 2. Run the API call and minimum delay concurrently.
      const [response] = await Promise.all([hade.regenerate(), sleep(reframeDelay())]);
      setState(response);
      return response;
    },

    refine: async (input) => {
      // 1. Show domain-specific pivot label ("Adjusting for: Too far").
      setState((s) => ({ ...s, status: "reframing", pivotLabel: toneLabel(input?.tone) }));
      const [response] = await Promise.all([hade.refine(input), sleep(reframeDelay())]);
      setState(response);
      return response;
    },

    getAlternative: async () => {
      setState((s) => ({ ...s, status: "reframing", pivotLabel: undefined }));
      const [response] = await Promise.all([hade.getAlternative(), sleep(reframeDelay())]);
      setState(response);
      return response;
    },
  };
}

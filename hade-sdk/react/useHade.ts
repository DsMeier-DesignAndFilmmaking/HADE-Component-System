"use client";

import { useEffect, useMemo, useState } from "react";
import { createHade } from "../core";
import type { HadeSDKClient, HadeSDKConfig, HadeSDKResponse } from "../core";

const INITIAL_STATE: HadeSDKResponse = {
  status: "loading",
  decision: null,
  reasoning: [],
  confidence: 0,
};

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
      const response = await hade.regenerate();
      setState(response);
      return response;
    },
    refine: async (input) => {
      const response = await hade.refine(input);
      setState(response);
      return response;
    },
    getAlternative: async () => {
      const response = await hade.getAlternative();
      setState(response);
      return response;
    },
  };
}

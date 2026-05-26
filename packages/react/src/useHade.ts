"use client";

/**
 * useHade — primary headless React hook for HADE decisions.
 *
 * Two usage modes:
 *
 *   1. Auto-decide on mount + input change (`useHade(input)`)
 *      Returns { output, error, isLoading, refine }.
 *
 *   2. Lazy / event-driven (`useHade()`)
 *      Returns the same shape; you call `decide(input)` manually.
 *      Useful for "Find me a place" button flows where you don't want a
 *      decision until the user acts.
 *
 * Cancellation: when `input` changes (mode 1) or `decide` is called again
 * (mode 2), the in-flight request is aborted via AbortController. The stale
 * result is discarded — only the latest request's output is committed to
 * state. This is the standard React-Query / SWR cancellation pattern.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DecideInput,
  DecideOptions,
  DecisionEngineOutput,
  RefineInput,
} from "@hade/core";
import { useHadeClient } from "./HadeProvider.js";

export interface UseHadeResult {
  /** Latest decision output, or null before the first successful call. */
  output: DecisionEngineOutput | null;
  /** Error from the most recent call, or null if the latest call succeeded. */
  error: Error | null;
  /** True while a request is in flight. */
  isLoading: boolean;
  /**
   * Issue a fresh decision. Returns the resulting output (or throws on error).
   * Cancels any in-flight call from the same hook instance.
   */
  decide: (input: DecideInput, options?: DecideOptions) => Promise<DecisionEngineOutput>;
  /**
   * Refine the prior decision. If no prior decision exists yet, behaves like
   * `decide(input as DecideInput)`.
   */
  refine: (input: RefineInput, options?: DecideOptions) => Promise<DecisionEngineOutput>;
  /** Reset output + error + loading state to their initial values. */
  reset: () => void;
}

/**
 * Hook overload signatures: input is optional. When supplied, the hook
 * auto-runs on mount and whenever the JSON-stringified input changes.
 */
export function useHade(): UseHadeResult;
export function useHade(input: DecideInput): UseHadeResult;
export function useHade(input?: DecideInput): UseHadeResult {
  const client = useHadeClient();

  const [output, setOutput] = useState<DecisionEngineOutput | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Track the latest request so stale responses (from a superseded input
  // change) are discarded.
  const requestSeqRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef<DecisionEngineOutput | null>(null);

  // Keep outputRef in sync so `refine` can read the latest without re-renders.
  useEffect(() => {
    outputRef.current = output;
  }, [output]);

  const decide = useCallback(
    async (
      callInput: DecideInput,
      options?: DecideOptions,
    ): Promise<DecisionEngineOutput> => {
      const mySeq = ++requestSeqRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      try {
        const result = await client.decide(callInput, {
          ...options,
          signal: options?.signal ?? controller.signal,
        });
        if (mySeq === requestSeqRef.current) {
          setOutput(result);
          setError(null);
        }
        return result;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (mySeq === requestSeqRef.current) {
          setError(err);
        }
        throw err;
      } finally {
        if (mySeq === requestSeqRef.current) {
          setIsLoading(false);
        }
      }
    },
    [client],
  );

  const refine = useCallback(
    async (
      refineInput: RefineInput,
      options?: DecideOptions,
    ): Promise<DecisionEngineOutput> => {
      const mySeq = ++requestSeqRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      try {
        const result = await client.refine(refineInput, outputRef.current ?? undefined, {
          ...options,
          signal: options?.signal ?? controller.signal,
        });
        if (mySeq === requestSeqRef.current) {
          setOutput(result);
          setError(null);
        }
        return result;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (mySeq === requestSeqRef.current) {
          setError(err);
        }
        throw err;
      } finally {
        if (mySeq === requestSeqRef.current) {
          setIsLoading(false);
        }
      }
    },
    [client],
  );

  const reset = useCallback((): void => {
    requestSeqRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    setOutput(null);
    setError(null);
    setIsLoading(false);
  }, []);

  // Auto-decide effect — only when caller supplied `input`.
  // We stringify for cheap structural equality; consumers passing huge inputs
  // can wrap with useMemo themselves if this becomes a bottleneck.
  const inputKey = input ? JSON.stringify(input) : null;
  useEffect(() => {
    if (!inputKey || !input) return;
    decide(input).catch(() => {
      /* error state is already set inside decide() */
    });
    // `inputKey` is the structural hash of `input`; we intentionally exclude
    // `input` and `decide` to avoid re-running on every render.
  }, [inputKey]);

  // Clean up any in-flight request on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { output, error, isLoading, decide, refine, reset };
}

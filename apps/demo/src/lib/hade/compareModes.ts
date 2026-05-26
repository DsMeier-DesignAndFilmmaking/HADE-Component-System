"use client";

import type { AgentPersona, GeoLocation, HadeContext } from "@/types/hade";
import { HADE_ENDPOINTS } from "./api";
import type { DomainMode } from "./useHade";

const MODES: DomainMode[] = ["dining", "social", "travel"];

export interface CompareCardData {
  mode:     DomainMode;
  title:    string;
  category: string;
  label:    string;
  source?:  string;
}

export interface CompareResult {
  mode:    DomainMode;
  data:    CompareCardData | null;
  error?:  string;
}

interface CompareInput {
  geo:      GeoLocation;
  persona?: AgentPersona;
  context?: Partial<HadeContext>;
}

async function fetchOneMode(
  mode: DomainMode,
  input: CompareInput,
  signal?: AbortSignal,
): Promise<CompareResult> {
  const body = {
    ...input.context,
    geo:     input.geo,
    persona: input.persona,
    mode,
    settings: { debug: false },
  };

  try {
    const res = await fetch(HADE_ENDPOINTS.decide, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
      cache:   "no-store",
      signal,
    });

    if (!res.ok) {
      return { mode, data: null, error: `${res.status} ${res.statusText}` };
    }

    const json = await res.json();
    const dec  = json?.decision;
    if (!dec) return { mode, data: null, error: "no decision" };

    return {
      mode,
      data: {
        mode,
        title:    dec.venue_name ?? dec.title ?? "Unnamed",
        category: dec.category   ?? dec.type   ?? "venue",
        label:    dec.rationale  ?? dec.why_now ?? "",
        source:   json?.source,
      },
    };
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      return { mode, data: null, error: "aborted" };
    }
    return { mode, data: null, error: (err as Error).message };
  }
}

/**
 * Fires three parallel /decide calls with the same geo/context but different
 * `mode` values. Resolves once all three settle. Each result is independent —
 * one failure does not block the others.
 */
export async function compareModes(
  input:  CompareInput,
  signal?: AbortSignal,
): Promise<CompareResult[]> {
  return Promise.all(MODES.map((m) => fetchOneMode(m, input, signal)));
}

export const COMPARE_MODES: readonly DomainMode[] = MODES;

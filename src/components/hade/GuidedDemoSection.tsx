"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HADE_ENDPOINTS } from "@/lib/hade/api";
import type { DomainMode } from "@/lib/hade/useHade";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEMO_BUTTONS: { mode: DomainMode; icon: string; label: string }[] = [
  { mode: "dining", icon: "🍽", label: "Eat Easy" },
  { mode: "social", icon: "⚡", label: "Something Happening" },
  { mode: "travel", icon: "🌍", label: "Explore" },
];

const BASE_CONTEXT = {
  situation:   { intent: null, urgency: "medium" as const },
  state:       { energy: "medium" as const, openness: "open" as const },
  social:      { group_size: 1, group_type: "solo" as const },
  constraints: { time_available_minutes: 120 },
};

const DEFAULT_GEO = {
  lat: Number(process.env.NEXT_PUBLIC_FALLBACK_GEO_LAT ?? "37.7749"),
  lng: Number(process.env.NEXT_PUBLIC_FALLBACK_GEO_LNG ?? "-122.4194"),
};

// ─── Types ────────────────────────────────────────────────────────────────────

type DemoStatus = "idle" | "loading" | "ready" | "error";

interface DemoResult {
  title:     string;
  category:  string;
  rationale: string;
  why_now:   string;
  mode:      DomainMode;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GuidedDemoSection() {
  const [status, setStatus]       = useState<DemoStatus>("idle");
  const [activeMode, setActiveMode] = useState<DomainMode | null>(null);
  const [result, setResult]       = useState<DemoResult | null>(null);

  const resultRef  = useRef<HTMLDivElement>(null);
  const geoRef     = useRef<{ lat: number; lng: number }>(DEFAULT_GEO);
  const geoResolvedRef = useRef(false);

  const resolveGeo = useCallback((): Promise<{ lat: number; lng: number }> => {
    if (geoResolvedRef.current) return Promise.resolve(geoRef.current);
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(DEFAULT_GEO);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const geo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          geoRef.current = geo;
          geoResolvedRef.current = true;
          resolve(geo);
        },
        () => resolve(DEFAULT_GEO),
        { timeout: 4_000, maximumAge: 120_000 },
      );
    });
  }, []);

  const handleMode = useCallback(
    async (mode: DomainMode) => {
      setStatus("loading");
      setActiveMode(mode);
      setResult(null);

      const geo = await resolveGeo();

      try {
        const res = await fetch(HADE_ENDPOINTS.decide, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...BASE_CONTEXT,
            geo,
            mode,
            settings: { debug: false },
          }),
          cache: "no-store",
        });

        if (!res.ok) throw new Error(`${res.status}`);

        const json = await res.json();
        const dec  = json?.decision;

        if (!dec) throw new Error("no decision");

        setResult({
          mode,
          title:     dec.venue_name ?? dec.title ?? "Unnamed",
          category:  dec.category ?? "venue",
          rationale: dec.rationale ?? "",
          why_now:   dec.why_now   ?? "",
        });
        setStatus("ready");

        requestAnimationFrame(() => {
          resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } catch {
        setStatus("error");
      }
    },
    [resolveGeo],
  );

  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-accentPrimary">
          Try it live
        </p>
        <h2 className="text-3xl font-bold tracking-tight text-textPrimary md:text-4xl">
          You've got 2 hours and nothing planned.
        </h2>
        <p className="mt-4 text-base text-textMuted">
          Pick a lens. HADE decides the rest.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {DEMO_BUTTONS.map(({ mode, icon, label }) => {
            const isActive  = activeMode === mode;
            const isLoading = isActive && status === "loading";
            return (
              <button
                key={mode}
                type="button"
                disabled={status === "loading"}
                onClick={() => void handleMode(mode)}
                className={[
                  "inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition-all",
                  isActive && status !== "idle"
                    ? "border-accentPrimary bg-accentPrimary/10 text-accentPrimary"
                    : "border-border bg-surface text-textPrimary hover:border-accentPrimary/40 hover:bg-background",
                  status === "loading" ? "cursor-wait opacity-70" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span aria-hidden="true">{icon}</span>
                {isLoading ? (
                  <span className="animate-pulse">Finding…</span>
                ) : (
                  label
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Result area ────────────────────────────────────────────────────────── */}
      <div ref={resultRef} className="mt-10">
        <AnimatePresence mode="wait">
          {status === "loading" && (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-8"
            >
              <div className="mb-3 h-3 w-1/3 animate-pulse rounded bg-textMuted/20" />
              <div className="h-5 w-2/3 animate-pulse rounded bg-textMuted/20" />
              <div className="mt-3 h-3 w-full animate-pulse rounded bg-textMuted/10" />
              <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-textMuted/10" />
            </motion.div>
          )}

          {status === "ready" && result && (
            <motion.div
              key={`${result.mode}-${result.title}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-8 shadow-sm"
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-textMuted">
                  {DEMO_BUTTONS.find((b) => b.mode === result.mode)?.icon}{" "}
                  {DEMO_BUTTONS.find((b) => b.mode === result.mode)?.label}
                </span>
                <span className="rounded-full bg-accentPrimary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accentPrimary">
                  {result.category}
                </span>
              </div>

              <h3 className="text-xl font-bold leading-snug text-textPrimary">
                {result.title}
              </h3>

              {result.rationale && (
                <p className="mt-3 text-sm leading-relaxed text-textMuted">
                  {result.rationale}
                </p>
              )}
              {result.why_now && (
                <p className="mt-2 text-sm font-medium text-textPrimary/80">
                  {result.why_now}
                </p>
              )}
            </motion.div>
          )}

          {status === "error" && (
            <motion.p
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-sm text-red-500"
            >
              Couldn't reach the engine — try again.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

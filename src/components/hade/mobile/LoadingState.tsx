"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { GeoSource } from "@/types/hade";

interface LoadingStateProps {
  geoSource?: GeoSource;
  lensLabel?: string;
}

function getInitialDetail(geoSource?: GeoSource): string {
  switch (geoSource) {
    case "unknown":
      return "Location is unavailable, so HADE will avoid pretending it knows exactly what is nearby.";
    case "ip":
      return "Location is approximate, so HADE is keeping the pick conservative.";
    case "stored":
      return "Using your last known area while live location catches up.";
    case "browser":
    case "scenario":
      return "Checking live options around you.";
    default:
      return "First checking location, then nearby options.";
  }
}

function getStageCopy(stage: number, geoSource?: GeoSource, lensLabel?: string) {
  if (stage >= 2) {
    return {
      title: "Taking longer than usual",
      detail: "You are not stuck. If live results do not return, HADE will use a dependable backup.",
    };
  }

  if (stage === 1) {
    return {
      title: "Still checking the live layer",
      detail: "Nearby data can be slow. HADE is holding the decision until it has enough signal or a safe fallback.",
    };
  }

  return {
    title: lensLabel ? `Finding a ${lensLabel.toLowerCase()} pick` : "Finding a grounded pick",
    detail: getInitialDetail(geoSource),
  };
}

export function LoadingState({ geoSource, lensLabel }: LoadingStateProps) {
  const [stage, setStage] = useState(0);
  const copy = getStageCopy(stage, geoSource, lensLabel);

  useEffect(() => {
    setStage(0);
    const first = window.setTimeout(() => setStage(1), 4500);
    const second = window.setTimeout(() => setStage(2), 9000);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, [geoSource, lensLabel]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[calc(100dvh-220px)] w-full flex-col items-center justify-center bg-background px-5 py-12 text-center"
    >
      <motion.div
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        className="flex items-center gap-2"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="h-1.5 w-1.5 rounded-full bg-accent/70" />
        <span className="h-1.5 w-1.5 rounded-full bg-accent/40" />
      </motion.div>
      <p className="mt-4 text-sm font-semibold text-ink/68">{copy.title}</p>
      <p className="mt-2 max-w-[300px] text-[12.5px] leading-snug text-ink/45">
        {copy.detail}
      </p>
    </div>
  );
}

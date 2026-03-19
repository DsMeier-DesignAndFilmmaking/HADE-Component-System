"use client";

import { motion } from "framer-motion";
import type { DecisionDiagramProps } from "@/types/hade";

const LAYERS = [
  {
    id: "L1",
    label: "Environmental Signals",
    sublabel: "Geo · Weather · Telemetry · Time",
    color: "#316BFF",
    bg: "rgba(49, 107, 255, 0.06)",
    border: "rgba(49, 107, 255, 0.25)",
    badges: ["PRESENCE", "AMBIENT", "EVENT"],
  },
  {
    id: "L2",
    label: "Adaptive Decision Logic",
    sublabel: "Trust Calibration · Intent Matching · Scoring",
    color: "#8B5CF6",
    bg: "rgba(139, 92, 246, 0.06)",
    border: "rgba(139, 92, 246, 0.25)",
    badges: ["SOCIAL_RELAY", "BEHAVIORAL"],
  },
  {
    id: "L3",
    label: "Confident Discovery",
    sublabel: "Primary + Fallback Recommendations",
    color: "#10B981",
    bg: "rgba(16, 185, 129, 0.06)",
    border: "rgba(16, 185, 129, 0.25)",
    badges: ["Rationale", "Attribution"],
  },
  {
    id: "L4",
    label: "Action + Measurement",
    sublabel: "DDR · Friction Tracking · Iteration",
    color: "#F59E0B",
    bg: "rgba(245, 158, 11, 0.06)",
    border: "rgba(245, 158, 11, 0.25)",
    badges: ["Accept", "Dismiss", "Pivot"],
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
};

const layerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export function DecisionDiagram({
  interactive = false,
  compact = false,
  className = "",
}: DecisionDiagramProps) {
  return (
    <motion.div
      className={["w-full", className].filter(Boolean).join(" ")}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <div className={["flex flex-col", compact ? "gap-2" : "gap-3"].join(" ")}>
        {LAYERS.map((layer, i) => (
          <motion.div key={layer.id} variants={layerVariants}>
            <LayerRow layer={layer} compact={compact} interactive={interactive} index={i} />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function LayerRow({
  layer,
  compact,
  interactive,
  index,
}: {
  layer: (typeof LAYERS)[0];
  compact: boolean;
  interactive: boolean;
  index: number;
}) {
  return (
    <motion.div
      className={[
        "rounded-xl border px-4 transition-shadow duration-200",
        compact ? "py-3" : "py-4",
        interactive ? "cursor-default" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        background: layer.bg,
        borderColor: layer.border,
      }}
      whileHover={
        interactive ? { scale: 1.01, boxShadow: `0 0 18px ${layer.color}22` } : {}
      }
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-bold"
            style={{ color: layer.color, background: `${layer.color}18` }}
          >
            {layer.id}
          </span>
          <div>
            <p
              className={[
                "font-semibold leading-snug",
                compact ? "text-sm" : "text-sm",
              ].join(" ")}
              style={{ color: layer.color }}
            >
              {layer.label}
            </p>
            {!compact && (
              <p className="text-xs text-ink/50 mt-0.5">{layer.sublabel}</p>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
          {layer.badges.map((badge) => (
            <span
              key={badge}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                color: layer.color,
                background: `${layer.color}15`,
                border: `1px solid ${layer.color}30`,
              }}
            >
              {badge}
            </span>
          ))}
        </div>
      </div>

      {/* Connector arrow (all except last) */}
      {index < LAYERS.length - 1 && !compact && (
        <div className="flex justify-center mt-1 -mb-2 relative z-10">
          <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
            <path
              d="M7 0v9M2 5l5 5 5-5"
              stroke={layer.color}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.5"
            />
          </svg>
        </div>
      )}
    </motion.div>
  );
}

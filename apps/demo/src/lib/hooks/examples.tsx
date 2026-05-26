/**
 * Examples: Using useToken with Framer Motion
 *
 * These demonstrate how to resolve CSS variables into animatable hex values
 * so Framer Motion has concrete color codes instead of variable references.
 */

"use client";

import { motion, type Variants } from "framer-motion";
import { useToken, useTokens } from "./useToken";

// ─────────────────────────────────────────────────────────────────────────────
// Example 1: Simple color animation
// ─────────────────────────────────────────────────────────────────────────────

export function AnimatedBorderExample() {
  const borderColor = useToken("--color-border");

  return (
    <motion.div
      animate={{
        borderColor: borderColor || "#e5e7eb", // Fallback if not resolved
      }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      className="w-32 h-32 border-2"
    >
      Animated border
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Example 2: Background + text color animation
// ─────────────────────────────────────────────────────────────────────────────

export function AnimatedCardExample() {
  const surfaceColor = useToken("--color-surface");
  const textColor = useToken("--color-text-primary");
  const accentColor = useToken("--color-accent-primary");

  return (
    <motion.div
      initial={{ backgroundColor: accentColor ?? "#316bff", color: "#ffffff" }}
      animate={{
        backgroundColor: surfaceColor ?? "#ffffff",
        color: textColor ?? "#1f2937",
      }}
      transition={{ duration: 0.8 }}
      className="p-6 rounded-lg"
    >
      Hover to animate
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Example 3: Batch resolve multiple tokens
// ─────────────────────────────────────────────────────────────────────────────

export function AnimatedGradientExample() {
  const tokens = useTokens([
    "--color-accent-primary",
    "--color-accent-secondary",
    "--color-background",
  ]);

  const primary = tokens["--color-accent-primary"] || "#316bff";
  const secondary = tokens["--color-accent-secondary"] || "#f59e0b";

  return (
    <motion.div
      animate={{
        // Interpolate between two colors using inline styles
        background: [
          `linear-gradient(135deg, ${primary}, ${secondary})`,
          `linear-gradient(135deg, ${secondary}, ${primary})`,
        ],
      }}
      transition={{
        duration: 3,
        repeat: Infinity,
        repeatType: "reverse",
      }}
      className="w-full h-32 rounded-lg"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Example 4: Conditional animation based on token value
// ─────────────────────────────────────────────────────────────────────────────

interface AnimatedButtonProps {
  onClick?: () => void;
}

export function AnimatedButton({ onClick }: AnimatedButtonProps) {
  const accentColor = useToken("--color-accent-primary");
  const backgroundColor = useToken("--color-background");
  const isReady = accentColor !== null && backgroundColor !== null;

  return (
    <motion.button
      onClick={onClick}
      disabled={!isReady}
      whileHover={
        accentColor && backgroundColor
          ? {
              backgroundColor: accentColor,
              color: backgroundColor,
              scale: 1.05,
            }
          : {}
      }
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      className="px-4 py-2 rounded-lg bg-background border border-border transition-colors"
    >
      {isReady ? "Click me" : "Loading colors..."}
    </motion.button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Example 5: Advanced – Staggered animations with multiple tokens
// ─────────────────────────────────────────────────────────────────────────────

export function StaggeredBoxesExample() {
  const tokens = useTokens([
    "--color-accent-primary",
    "--color-accent-secondary",
    "--color-border",
  ]);

  const colors = [
    tokens["--color-accent-primary"] || "#316bff",
    tokens["--color-accent-secondary"] || "#f59e0b",
    tokens["--color-border"] || "#e5e7eb",
  ];

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring", stiffness: 100 },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex gap-4"
    >
      {colors.map((color, i) => (
        <motion.div
          key={i}
          variants={itemVariants}
          animate={{
            backgroundColor: color,
          }}
          className="w-12 h-12 rounded-lg shadow-md"
        />
      ))}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Example 6: Using CSS variables WITHOUT hooks (alternative approach)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * If you want to skip the hook and use CSS variables directly in your
 * Tailwind classes, add this to tailwind.config.ts:
 *
 * theme: {
 *   extend: {
 *     colors: {
 *       "token-border": "rgb(var(--color-border))",
 *       "token-surface": "rgb(var(--color-surface))",
 *     },
 *   },
 * }
 *
 * Then use Framer Motion with Tailwind animate helper:
 *   <motion.div
 *     initial={{ className: "bg-token-surface" }}
 *     animate={{ className: "bg-token-border" }}
 *     transition={{ duration: 0.6 }}
 *   />
 *
 * However, this approach still triggers the "value not animatable" warning
 * because Framer Motion sees the CSS variable syntax. The useToken hook
 * (Examples 1-5 above) solves this cleanly by resolving to hex values.
 */

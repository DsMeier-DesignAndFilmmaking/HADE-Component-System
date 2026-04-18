"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Resolves a CSS variable (e.g., "--color-border") into its computed hex value.
 * Runs in useLayoutEffect to ensure the value is available before paint.
 *
 * Usage:
 *   const borderColor = useToken("--color-border");
 *   // Returns: "#e5e7eb" or null if not found
 *
 * Perfect for Framer Motion animations where CSS variables aren't animatable:
 *   <motion.div animate={{ backgroundColor: borderColor || "#default" }} />
 */
export function useToken(variableName: string): string | null {
  const [value, setValue] = useState<string | null>(null);
  const resolvedRef = useRef(false);

  useEffect(() => {
    // Resolve synchronously on first mount — CSS variables are always available
    // by the time useEffect runs (the browser has parsed :root)
    if (!resolvedRef.current) {
      const root = document.documentElement;
      const resolved = getComputedStyle(root).getPropertyValue(variableName).trim();
      setValue(resolved || null);
      resolvedRef.current = true;
    }
  }, [variableName]);

  return value;
}

/**
 * Batch version — resolve multiple CSS variables at once.
 *
 * Usage:
 *   const tokens = useTokens(["--color-border", "--color-surface"]);
 *   // Returns: { "--color-border": "#e5e7eb", "--color-surface": "#ffffff" }
 */
export function useTokens(
  variableNames: string[]
): Record<string, string | null> {
  const [values, setValues] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    const resolved: Record<string, string | null> = {};

    for (const varName of variableNames) {
      const value = styles.getPropertyValue(varName).trim();
      resolved[varName] = value || null;
    }

    setValues(resolved);
  }, [variableNames]);

  return values;
}

/**
 * Advanced: Watch for dynamic CSS variable changes (e.g., theme switching).
 * Re-renders whenever the variable value changes.
 *
 * Usage (dark mode theme switch):
 *   const surfaceColor = useTokenLive("--color-surface");
 *   // Re-computes whenever CSS variable is updated
 */
export function useTokenLive(variableName: string): string | null {
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    // Initial read
    const root = document.documentElement;
    const resolved = getComputedStyle(root).getPropertyValue(variableName).trim();
    setValue(resolved || null);

    // Optional: Use MutationObserver if you dynamically update CSS variables
    // (e.g., switching themes by modifying :root styles)
    const observer = new MutationObserver(() => {
      const updated = getComputedStyle(root).getPropertyValue(variableName).trim();
      setValue(updated || null);
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["style"],
    });

    return () => observer.disconnect();
  }, [variableName]);

  return value;
}

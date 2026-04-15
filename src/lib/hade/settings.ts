"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { HadeSettings } from "@/types/hade";
import { DEFAULT_HADE_SETTINGS } from "@/types/hade";

const STORAGE_KEY = "hade_settings_v1";

// ─── Context Shape ────────────────────────────────────────────────────────────

interface HadeSettingsContextValue {
  settings: HadeSettings;
  updateSettings: (patch: Partial<HadeSettings>) => void;
  resetSettings: () => void;
}

const HadeSettingsContext = createContext<HadeSettingsContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function HadeSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<HadeSettings>(() => {
    if (typeof window === "undefined") return { ...DEFAULT_HADE_SETTINGS };
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored
        ? { ...DEFAULT_HADE_SETTINGS, ...JSON.parse(stored) }
        : { ...DEFAULT_HADE_SETTINGS };
    } catch {
      return { ...DEFAULT_HADE_SETTINGS };
    }
  });

  // Persist on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // localStorage unavailable (SSR, private browsing) — fail silently
    }
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<HadeSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_HADE_SETTINGS });
  }, []);

  return (
    <HadeSettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </HadeSettingsContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useHadeSettings(): HadeSettingsContextValue {
  const ctx = useContext(HadeSettingsContext);
  if (!ctx) {
    throw new Error("useHadeSettings must be used within HadeSettingsProvider");
  }
  return ctx;
}

"use client";

import { useRef, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useHadeSettings } from "@/lib/hade/settings";
import { HADE_PRESETS, matchPreset } from "@/lib/hade/presets";
import type { ModelTarget, HadeSettings } from "@/types/hade";
import agentData from "@/config/agent_definitions.json";
import type { AgentDefinitions } from "@/types/hade";

const definitions = agentData as AgentDefinitions;
const agents = definitions.agents;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

// ─── Local Primitive Controls ─────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-mono uppercase tracking-widest text-ink/40 mb-2.5">
      {children}
    </p>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-5 py-4">
      <SectionLabel>{label}</SectionLabel>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="mx-5 border-t border-line/60" />;
}

interface RowProps {
  label: string;
  description?: string;
  children: ReactNode;
}

function SettingRow({ label, description, children }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium text-ink/80 leading-snug">{label}</span>
        {description && (
          <span className="text-[11px] text-ink/40 leading-tight mt-0.5">{description}</span>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ─── Slider ───────────────────────────────────────────────────────────────────

interface SliderProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

function SettingSlider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  disabled = false,
}: SliderProps) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[11px] font-mono text-accent w-8 text-right tabular-nums select-none">
        {value.toFixed(2)}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="hade-slider w-28 sm:w-32"
      />
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

interface ToggleProps {
  enabled: boolean;
  onChange: (v: boolean) => void;
}

function SettingToggle({ enabled, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={[
        "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2",
        enabled ? "bg-accent" : "bg-ink/15",
      ].join(" ")}
    >
      <motion.div
        className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm"
        animate={{ left: enabled ? 18 : 2 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </button>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────

interface SelectOption<T extends string> {
  value: T | null;
  label: string;
}

interface SelectProps<T extends string> {
  value: T | null | undefined;
  onChange: (v: T | null) => void;
  options: SelectOption<T>[];
}

function SettingSelect<T extends string>({
  value,
  onChange,
  options,
}: SelectProps<T>) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? null : (v as T));
      }}
      className={[
        "h-8 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-ink/80",
        "focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40",
        "transition-colors cursor-pointer min-w-[128px]",
      ].join(" ")}
    >
      {options.map((opt) => (
        <option key={opt.value ?? "__null__"} value={opt.value ?? ""}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { settings, updateSettings, resetSettings } = useHadeSettings();

  // ── Active preset detection ──
  const activePreset = useMemo(() => matchPreset(settings), [settings]);

  // ── Apply preset ──
  const applyPreset = useCallback(
    (preset: (typeof HADE_PRESETS)[number]) => {
      updateSettings(preset.settings);
    },
    [updateSettings]
  );

  // ── Local slider state — smooth immediate feedback before debounce commits ──
  const [localExploration, setLocalExploration] = useState<number>(
    settings.exploration_temp ?? 0.35
  );
  const [localConfidence, setLocalConfidence] = useState<number>(
    settings.confidence_threshold ?? 0.0
  );
  const [localIntentWeight, setLocalIntentWeight] = useState<number>(
    settings.intent_weight ?? 0.5
  );

  // Keep local display values in sync when settings change externally (e.g. Reset)
  useEffect(() => {
    setLocalExploration(settings.exploration_temp ?? 0.35);
    setLocalConfidence(settings.confidence_threshold ?? 0.0);
    setLocalIntentWeight(settings.intent_weight ?? 0.5);
  }, [settings.exploration_temp, settings.confidence_threshold, settings.intent_weight]);

  // ── Debounced slider commits (300ms) ──
  const explorationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confidenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleExploration = useCallback(
    (v: number) => {
      setLocalExploration(v);
      if (explorationTimer.current) clearTimeout(explorationTimer.current);
      explorationTimer.current = setTimeout(() => {
        updateSettings({ exploration_temp: v });
      }, 300);
    },
    [updateSettings]
  );

  const handleConfidence = useCallback(
    (v: number) => {
      setLocalConfidence(v);
      if (confidenceTimer.current) clearTimeout(confidenceTimer.current);
      confidenceTimer.current = setTimeout(() => {
        updateSettings({ confidence_threshold: v });
      }, 300);
    },
    [updateSettings]
  );

  const handleIntentWeight = useCallback(
    (v: number) => {
      setLocalIntentWeight(v);
      if (intentTimer.current) clearTimeout(intentTimer.current);
      intentTimer.current = setTimeout(() => {
        updateSettings({ intent_weight: v });
      }, 300);
    },
    [updateSettings]
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (explorationTimer.current) clearTimeout(explorationTimer.current);
      if (confidenceTimer.current) clearTimeout(confidenceTimer.current);
      if (intentTimer.current) clearTimeout(intentTimer.current);
    };
  }, []);

  // ── Escape key closes panel ──
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // ── Lock body scroll while open ──
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // ── Option data ──
  const modelOptions: SelectOption<ModelTarget>[] = [
    { value: null, label: "Server default" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o mini" },
    { value: "claude-sonnet", label: "Claude Sonnet" },
    { value: "claude-haiku", label: "Claude Haiku" },
    { value: "gemini-flash", label: "Gemini Flash" },
    { value: "ollama-mistral", label: "Mistral (local)" },
    { value: "ollama-llama3", label: "LLaMA 3 (local)" },
    { value: "ollama-phi3", label: "Phi-3 (local)" },
  ];

  type ModeValue = NonNullable<HadeSettings["mode"]>;
  const modeOptions: SelectOption<ModeValue>[] = [
    { value: "balanced", label: "Balanced" },
    { value: "precise", label: "Precise" },
    { value: "explorative", label: "Explorative" },
  ];

  const personaOptions: SelectOption<string>[] = [
    { value: null, label: "Auto (first available)" },
    ...agents.map((a) => ({ value: a.id, label: a.id })),
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* ── Backdrop ── */}
          <motion.div
            key="settings-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* ── Panel ── */}
          <motion.aside
            key="settings-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="fixed right-0 top-0 z-50 h-full w-full sm:w-[360px] flex flex-col bg-surface border-l border-line"
            style={{ boxShadow: "-12px 0 48px rgba(11, 13, 18, 0.12)" }}
            role="dialog"
            aria-modal="true"
            aria-label="HADE Settings"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-widest text-accent mb-0.5">
                  Configuration
                </p>
                <h2 className="text-[15px] font-semibold text-ink tracking-tight">
                  Settings
                </h2>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    resetSettings();
                  }}
                  className="text-[11px] font-medium text-ink/40 hover:text-ink/70 transition-colors px-2.5 py-1 rounded-lg hover:bg-ink/5"
                >
                  Reset all
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close settings"
                  className="h-7 w-7 flex items-center justify-center rounded-lg text-ink/40 hover:text-ink/80 hover:bg-ink/5 transition-colors"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 13 13"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M1 1l11 11M12 1L1 12"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* ── Scrollable body ── */}
            <div className="flex-1 overflow-y-auto overscroll-contain">

              {/* ── Presets ── */}
              <div className="px-5 pt-4 pb-3">
                <p className="text-[10px] font-mono uppercase tracking-widest text-ink/40 mb-3">
                  Presets
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {HADE_PRESETS.map((preset) => {
                    const isActive = activePreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset)}
                        title={preset.description}
                        className={[
                          "flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-center transition-all duration-150",
                          "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                          isActive
                            ? "bg-accent/10 border-accent/40 text-accent"
                            : "bg-ink/[0.02] border-line/50 text-ink/50 hover:bg-ink/[0.05] hover:border-line",
                        ].join(" ")}
                      >
                        <span className="text-base leading-none">{preset.emoji}</span>
                        <span className="text-[10px] font-medium leading-tight">{preset.label}</span>
                      </button>
                    );
                  })}
                  {/* Custom pill — non-clickable indicator shown when no preset matches */}
                  {activePreset === "custom" && (
                    <div className="flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-center border bg-ink/[0.02] border-line/50">
                      <span className="text-base leading-none">✦</span>
                      <span className="text-[10px] font-medium text-ink/40 leading-tight">Custom</span>
                    </div>
                  )}
                </div>
              </div>
              <Divider />

              {/* Intelligence */}
              <Section label="Intelligence">
                <SettingRow label="Model" description="LLM provider override">
                  <SettingSelect<ModelTarget>
                    value={settings.model_target}
                    onChange={(v) => updateSettings({ model_target: v })}
                    options={modelOptions}
                  />
                </SettingRow>
                <SettingRow
                  label="Mode"
                  description="Decision personality preset"
                >
                  <SettingSelect<ModeValue>
                    value={settings.mode ?? "balanced"}
                    onChange={(v) =>
                      updateSettings({ mode: v ?? "balanced" })
                    }
                    options={modeOptions}
                  />
                </SettingRow>
              </Section>

              <Divider />

              {/* Decision Behavior */}
              <Section label="Decision Behavior">
                <SettingRow
                  label="Exploration"
                  description={
                    settings.exploration_temp === null
                      ? "Adaptive (auto)"
                      : "Temperature override"
                  }
                >
                  <SettingSlider
                    value={localExploration}
                    onChange={handleExploration}
                  />
                </SettingRow>
                <SettingRow
                  label="Confidence Threshold"
                  description="Minimum score to accept"
                >
                  <SettingSlider
                    value={localConfidence}
                    onChange={handleConfidence}
                  />
                </SettingRow>
              </Section>

              <Divider />

              {/* Context */}
              <Section label="Context">
                <SettingRow
                  label="Intent Weight"
                  description={
                    settings.intent_weight === null
                      ? "Adaptive (auto)"
                      : "Influence of explicit intent"
                  }
                >
                  <SettingSlider
                    value={localIntentWeight}
                    onChange={handleIntentWeight}
                  />
                </SettingRow>
              </Section>

              <Divider />

              {/* Constraints */}
              <Section label="Constraints">
                <SettingRow
                  label="Strict Constraints"
                  description="Hard-enforce budget and time limits"
                >
                  <SettingToggle
                    enabled={settings.strict_constraints ?? false}
                    onChange={(v) => updateSettings({ strict_constraints: v })}
                  />
                </SettingRow>
              </Section>

              <Divider />

              {/* Persona */}
              <Section label="Persona">
                <SettingRow
                  label="Active Persona"
                  description="Agent identity for decisions"
                >
                  <SettingSelect<string>
                    value={settings.persona_id ?? null}
                    onChange={(v) => updateSettings({ persona_id: v })}
                    options={personaOptions}
                  />
                </SettingRow>
                {settings.persona_id && (() => {
                  const persona = agents.find(
                    (a) => a.id === settings.persona_id
                  );
                  return persona ? (
                    <div className="mt-2 rounded-lg border border-line/60 bg-ink/[0.02] px-3 py-2.5">
                      <p className="text-[11px] italic text-ink/50 leading-snug line-clamp-2">
                        "{persona.role}"
                      </p>
                      <div className="flex gap-1 flex-wrap mt-1.5">
                        {persona.tone.map((t) => (
                          <span
                            key={t}
                            className="text-[9px] bg-ink/5 px-1.5 py-0.5 rounded text-ink/50 border border-line/50"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
              </Section>

              <Divider />

              {/* Debug */}
              <Section label="Debug">
                <SettingRow
                  label="Debug Mode"
                  description="Verbose payload in API response"
                >
                  <SettingToggle
                    enabled={settings.debug ?? false}
                    onChange={(v) => updateSettings({ debug: v })}
                  />
                </SettingRow>
                {settings.debug && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-1.5 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2"
                  >
                    <p className="text-[10px] font-mono text-accent/70 leading-relaxed">
                      Debug payloads will appear in browser console
                      and API responses. Disable before production.
                    </p>
                  </motion.div>
                )}
              </Section>

              {/* Bottom padding for scroll clearance */}
              <div className="h-4" />
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-line shrink-0">
              <p className="text-[10px] font-mono text-ink/25 text-center tracking-wide">
                Persisted via localStorage · HADE v0
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

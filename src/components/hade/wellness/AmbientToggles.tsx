"use client";

/**
 * AmbientToggles — demo control surface.
 *
 * - Three preset combo buttons (Rainy+Fatigued, Sunny+Morning, High Stress
 *   Workday) per spec, for instant matrix demonstration.
 * - Four per-signal chip rows letting reviewers tweak weather, timeOfDay,
 *   dayOfWeek, userStressSignal independently.
 *
 * Stateless: all changes call `onChange(nextSignals)`.
 */

import type {
  AmbientSignals,
  DayOfWeek,
  TimeOfDay,
  UserStressSignal,
  Weather,
} from "@/lib/hade/wellness/types";

interface AmbientTogglesProps {
  signals: AmbientSignals;
  onChange: (signals: AmbientSignals) => void;
}

interface Preset {
  id: string;
  label: string;
  emoji: string;
  signals: AmbientSignals;
}

const PRESETS: readonly Preset[] = [
  {
    id: "rainy-fatigued",
    label: "Rainy + Fatigued",
    emoji: "🌧",
    signals: {
      weather: "rainy",
      timeOfDay: "afternoon",
      dayOfWeek: "weekday",
      userStressSignal: "fatigued",
    },
  },
  {
    id: "sunny-morning",
    label: "Sunny + Morning",
    emoji: "🌅",
    signals: {
      weather: "sunny",
      timeOfDay: "morning",
      dayOfWeek: "weekday",
      userStressSignal: "baseline",
    },
  },
  {
    id: "high-stress",
    label: "High Stress Workday",
    emoji: "⚡",
    signals: {
      weather: "overcast",
      timeOfDay: "midday",
      dayOfWeek: "weekday",
      userStressSignal: "high",
    },
  },
];

const WEATHER_OPTIONS: readonly Weather[] = [
  "sunny",
  "rainy",
  "cold",
  "overcast",
  "heatwave",
];
const TIME_OPTIONS: readonly TimeOfDay[] = [
  "morning",
  "midday",
  "afternoon",
  "evening",
  "night",
];
const DAY_OPTIONS: readonly DayOfWeek[] = ["weekday", "weekend"];
const STRESS_OPTIONS: readonly UserStressSignal[] = [
  "baseline",
  "high",
  "fatigued",
];

function signalsEqual(a: AmbientSignals, b: AmbientSignals) {
  return (
    a.weather === b.weather &&
    a.timeOfDay === b.timeOfDay &&
    a.dayOfWeek === b.dayOfWeek &&
    a.userStressSignal === b.userStressSignal
  );
}

interface ChipRowProps<T extends string> {
  legend: string;
  options: readonly T[];
  value: T;
  onSelect: (next: T) => void;
}

function ChipRow<T extends string>({
  legend,
  options,
  value,
  onSelect,
}: ChipRowProps<T>) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/65">
        {legend}
      </legend>
      <div role="radiogroup" className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(opt)}
              className={[
                "rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                active
                  ? "bg-ink text-background"
                  : "border border-line bg-surface text-ink/70 hover:bg-accent/5 hover:text-ink",
              ].join(" ")}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function AmbientToggles({ signals, onChange }: AmbientTogglesProps) {
  return (
    <div className="flex flex-col gap-4 rounded-[24px] border border-line bg-surface p-4 shadow-soft">
      <div className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/65">
          Preset Ambient Combos
        </h3>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => {
            const active = signalsEqual(signals, preset.signals);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onChange(preset.signals)}
                aria-pressed={active}
                aria-label={`Apply ${preset.label} preset`}
                className={[
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  active
                    ? "bg-accent text-white shadow-soft"
                    : "border border-line bg-surface text-ink/80 hover:bg-accent/10 hover:text-ink",
                ].join(" ")}
              >
                <span aria-hidden="true">{preset.emoji}</span>
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ChipRow
          legend="Weather"
          options={WEATHER_OPTIONS}
          value={signals.weather}
          onSelect={(w) => onChange({ ...signals, weather: w })}
        />
        <ChipRow
          legend="Time of Day"
          options={TIME_OPTIONS}
          value={signals.timeOfDay}
          onSelect={(t) => onChange({ ...signals, timeOfDay: t })}
        />
        <ChipRow
          legend="Day of Week"
          options={DAY_OPTIONS}
          value={signals.dayOfWeek}
          onSelect={(d) => onChange({ ...signals, dayOfWeek: d })}
        />
        <ChipRow
          legend="Stress Signal"
          options={STRESS_OPTIONS}
          value={signals.userStressSignal}
          onSelect={(u) => onChange({ ...signals, userStressSignal: u })}
        />
      </div>
    </div>
  );
}

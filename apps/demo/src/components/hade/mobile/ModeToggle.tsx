"use client";

import type { DomainMode } from "@/lib/hade/useHade";

const MODES: { id: DomainMode; label: string; icon: string }[] = [
  { id: "dining", label: "Dining", icon: "🍽️" },
  { id: "social", label: "Social", icon: "⚡" },
  { id: "travel", label: "Travel", icon: "🌍" },
];

interface ModeToggleProps {
  mode: DomainMode;
  onChange: (mode: DomainMode) => void;
  disabled?: boolean;
}

export function ModeToggle({ mode, onChange, disabled = false }: ModeToggleProps) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-line/40 bg-white/50 p-1 backdrop-blur-sm">
      {MODES.map((m) => {
        const isActive = mode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m.id)}
            className={[
              "flex flex-1 items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
              isActive
                ? "bg-ink text-white shadow-sm"
                : "text-ink/50 hover:text-ink/80 active:text-ink/80",
              disabled ? "pointer-events-none opacity-40" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span role="img" aria-label={m.label}>{m.icon}</span>
            <span className="hidden sm:inline">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}

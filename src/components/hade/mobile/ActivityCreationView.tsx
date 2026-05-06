"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SpontaneousObject, VibeTag } from "@/types/hade";
import { RADIUS } from "@/core/constants/radius";
import { getDeviceId } from "@/lib/hade/deviceId";
import { useHadeAdaptiveContext } from "@/lib/hade/hooks";

// ─── Meetup types ─────────────────────────────────────────────────────────────

type MeetupType = {
  id:       string;
  title:    string;
  icon:     string;
  vibe_tag: string;
  category: string;
};

const MEETUP_TYPES: MeetupType[] = [
  { id: "coffee",  title: "Coffee Hangout", icon: "☕", vibe_tag: "social",  category: "coffee_meetup"  },
  { id: "cowork",  title: "Coworking",      icon: "💻", vibe_tag: "focused", category: "coworking"      },
  { id: "catchup", title: "Quick Catchup",  icon: "👋", vibe_tag: "social",  category: "social_meetup"  },
];

// ─── Duration config ──────────────────────────────────────────────────────────

const DURATION_MIN     = 15;
const DURATION_MAX     = 120;
const DURATION_STEP    = 15;
const DURATION_DEFAULT = 60;

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Step   = "type" | "duration" | "confirm";
type Status = "idle" | "submitting" | "success" | "error";

interface ActivityCreationViewProps {
  onCreate?: (object: SpontaneousObject) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ActivityCreationView({ onCreate }: ActivityCreationViewProps) {
  const { emitVibeSignal } = useHadeAdaptiveContext();

  const [step,            setStep]            = useState<Step>("type");
  const [selectedType,    setSelectedType]    = useState<MeetupType | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(DURATION_DEFAULT);
  const [location,        setLocation]        = useState<{ lat: number; lng: number } | null>(null);
  const [status,          setStatus]          = useState<Status>("idle");
  const [errorMsg,        setErrorMsg]        = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 5_000 },
    );
  }, []);

  const stepNumber = step === "type" ? 1 : step === "duration" ? 2 : 3;

  async function handleCreate() {
    if (!selectedType || status !== "idle") return;
    setStatus("submitting");
    setErrorMsg(null);

    const now      = Date.now();
    const end      = now + durationMinutes * 60_000;
    const geo      = location ?? { lat: 0, lng: 0 };
    const entityId = crypto.randomUUID();

    const spontaneous: SpontaneousObject = {
      id:          entityId,
      type:        "ugc_event",
      title:       selectedType.title,
      time_window: { start: now, end },
      location:    geo,
      radius:      RADIUS.ACTIVITY_CREATION,
      going_count: 0,
      maybe_count: 0,
      user_state:  null,
      created_at:  now,
      expires_at:  end,
      trust_score: 0.7,
      vibe_tag:    selectedType.vibe_tag,
      source:      "user",
    };

    try {
      const res = await fetch("/api/hade/ugc", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id:         entityId,
          venue_name: selectedType.title,
          category:   selectedType.category,
          geo,
          created_at: new Date(now).toISOString(),
          expires_at: new Date(end).toISOString(),
          created_by: getDeviceId(),
        }),
      });

      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "persist_failed");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create meetup");
      setStatus("error");
      return;
    }

    emitVibeSignal(entityId, ["worth_it"] as VibeTag[], "positive", 0.9);
    onCreate?.(spontaneous);
    setStatus("success");

    setTimeout(() => {
      setStatus("idle");
      setSelectedType(null);
      setDurationMinutes(DURATION_DEFAULT);
      setStep("type");
    }, 1500);
  }

  return (
    <section className="rounded-3xl bg-surface p-5 shadow-soft">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="mb-5">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">New Meetup</p>
        <h2 className="mt-0.5 text-xl font-semibold text-ink">
          {step === "type"     ? "What kind?" :
           step === "duration" ? "How long?"  : "Confirm"}
        </h2>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-ink/40">
          Step {stepNumber} of 3
        </p>
      </div>

      <AnimatePresence mode="wait" initial={false}>

        {/* ── Step 1: Meetup type ─────────────────────────────────────────── */}
        {step === "type" && (
          <motion.div
            key="type"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="space-y-2"
          >
            {MEETUP_TYPES.map((type) => (
              <motion.button
                key={type.id}
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => { setSelectedType(type); setStep("duration"); }}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-line bg-white/70 px-4 text-left transition-colors active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="text-xl" aria-hidden="true">{type.icon}</span>
                <span className="text-sm font-semibold text-ink">{type.title}</span>
              </motion.button>
            ))}
          </motion.div>
        )}

        {/* ── Step 2: Duration slider ─────────────────────────────────────── */}
        {step === "duration" && (
          <motion.div
            key="duration"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="mb-6 text-center">
              <span className="text-4xl font-bold tabular-nums text-ink">
                {formatDuration(durationMinutes)}
              </span>
            </div>

            <input
              type="range"
              min={DURATION_MIN}
              max={DURATION_MAX}
              step={DURATION_STEP}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="w-full accent-accent"
              aria-label="Duration"
            />

            <div className="mt-1 flex justify-between font-mono text-[10px] text-ink/40">
              <span>{DURATION_MIN} min</span>
              <span>{formatDuration(DURATION_MAX)}</span>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setStep("type")}
                className="min-h-[44px] rounded-xl border border-line bg-white/70 px-4 text-sm font-semibold text-ink"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep("confirm")}
                className="min-h-[44px] flex-1 rounded-xl bg-ink px-4 text-sm font-semibold text-white"
              >
                Continue
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Step 3: Confirm ─────────────────────────────────────────────── */}
        {step === "confirm" && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="rounded-2xl bg-ink/5 p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl" aria-hidden="true">
                  {selectedType?.icon}
                </span>
                <div>
                  <p className="text-base font-semibold text-ink">
                    {selectedType?.title}
                  </p>
                  <p className="mt-0.5 text-sm text-ink/55">
                    {formatDuration(durationMinutes)} · Starting now
                  </p>
                </div>
              </div>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-accent/60">
                {location ? "📍 Location attached" : "No location data"}
              </p>
            </div>

            {errorMsg && (
              <p className="mt-3 text-xs text-red-500" role="alert">{errorMsg}</p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setStep("duration")}
                disabled={status === "submitting"}
                className="min-h-[42px] rounded-xl border border-line bg-white/70 px-4 text-sm font-semibold text-ink disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={status !== "idle"}
                className="min-h-[42px] flex-1 rounded-xl bg-ink px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
              >
                {status === "submitting" ? "Creating…" :
                 status === "success"    ? "✓ Created"  : "Create"}
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </section>
  );
}

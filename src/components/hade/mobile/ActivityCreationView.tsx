"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { SpontaneousObject } from "@/types/hade";
import { RADIUS } from "@/core/constants/radius";
import { getDeviceId } from "@/lib/hade/deviceId";
import { useHadeAdaptiveContext } from "@/lib/hade/hooks";

// ─── Vibe options ─────────────────────────────────────────────────────────────

const VIBES = [
  { id: "chill",       label: "Chill",       vibe_tag: "chill",       signal: "worth_it"    },
  { id: "social",      label: "Social",      vibe_tag: "social",      signal: "good_energy" },
  { id: "productive",  label: "Productive",  vibe_tag: "focused",     signal: "worth_it"    },
  { id: "spontaneous", label: "Spontaneous", vibe_tag: "spontaneous", signal: "perfect_vibe"},
] as const;

type VibeId = (typeof VIBES)[number]["id"];

// ─── Confetti ─────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = [
  "#6366f1", "#f59e0b", "#10b981",
  "#ef4444", "#8b5cf6", "#f97316",
  "#06b6d4", "#84cc16",
];

type Particle = {
  id:    number;
  x:     number;
  color: string;
  size:  number;
  delay: number;
  shape: "square" | "circle";
};

function makeParticles(count = 28): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id:    i,
    x:     (Math.random() - 0.5) * 220,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size:  5 + Math.random() * 7,
    delay: Math.random() * 0.2,
    shape: Math.random() > 0.5 ? "square" : "circle",
  }));
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Step   = "what" | "vibe" | "details";
type Status = "idle" | "submitting" | "success" | "error";

interface ActivityCreationViewProps {
  onCreate?: (object: SpontaneousObject) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ActivityCreationView({ onCreate }: ActivityCreationViewProps) {
  const { emitVibeSignal } = useHadeAdaptiveContext();

  const [step,      setStep]      = useState<Step>("what");
  const [title,     setTitle]     = useState("");
  const [vibeId,    setVibeId]    = useState<VibeId | null>(null);
  const [notes,     setNotes]     = useState("");
  const [timeText,  setTimeText]  = useState("");
  const [listening, setListening] = useState(false);
  const [location,  setLocation]  = useState<{ lat: number; lng: number } | null>(null);
  const [status,    setStatus]    = useState<Status>("idle");
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef = useRef<any>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 5_000 },
    );
  }, []);

  useEffect(() => () => { recogRef.current?.abort(); }, []);

  function startListening() {
    if (recogRef.current) {
      recogRef.current.abort();
      recogRef.current = null;
      setListening(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const W = window as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR: (new () => any) | undefined = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!SR) return;

    const recog = new SR();
    recog.continuous     = false;
    recog.interimResults = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recog.onresult = (e: any) => {
      setTitle(e.results[0][0].transcript);
      setListening(false);
      recogRef.current = null;
    };
    recog.onerror = () => { setListening(false); recogRef.current = null; };
    recog.onend   = () => { setListening(false); recogRef.current = null; };
    recogRef.current = recog;
    recog.start();
    setListening(true);
  }

  const stepNumber = step === "what" ? 1 : step === "vibe" ? 2 : 3;
  const selectedVibe = VIBES.find((v) => v.id === vibeId) ?? null;

  async function handleCreate() {
    if (!title.trim() || status !== "idle") return;
    setStatus("submitting");
    setErrorMsg(null);

    const now      = Date.now();
    const end      = now + 60 * 60_000; // default 1 hr
    const geo      = location ?? { lat: 0, lng: 0 };
    const entityId = crypto.randomUUID();
    const deviceId = getDeviceId();
    const expiresAt = new Date(end).toISOString();
    const resolvedTitle = title.trim();
    const category = selectedVibe?.vibe_tag ?? "social";
    const signalTag = selectedVibe?.signal ?? "good_energy";

    const spontaneous: SpontaneousObject = {
      id:          entityId,
      type:        "ugc_event",
      title:       resolvedTitle,
      time_window: { start: now, end },
      location:    geo,
      radius:      RADIUS.ACTIVITY_CREATION,
      going_count: 0,
      maybe_count: 0,
      user_state:  null,
      created_at:  now,
      expires_at:  end,
      trust_score: 0.7,
      vibe_tag:    category,
      source:      "user",
    };

    console.log("[HADE UGC CREATED]", spontaneous);

    try {
      const res  = await fetch("/api/hade/ugc", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          id:         entityId,
          venue_name: resolvedTitle,
          category,
          geo,
          created_at: new Date(now).toISOString(),
          expires_at: expiresAt,
          created_by: deviceId,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "persist_failed");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create");
      setStatus("error");
      return;
    }

    try {
      await fetch("/api/hade/signal", {
        method:  "POST",
        headers: {
          "Content-Type":     "application/json",
          "x-hade-device-id": deviceId,
        },
        body: JSON.stringify({
          signals: [{
            id:               `vsig_${entityId}`,
            location_node_id: entityId,
            venue_id:         entityId,
            vibe_tags:        [signalTag],
            strength:         0.9,
            sentiment:        "positive",
            emitted_at:       new Date(now).toISOString(),
            expires_at:       expiresAt,
            geo,
            source_user_id:   deviceId,
            type:             "ugc_event",
            vibe_tag:         category,
            metadata:         { expires_at: expiresAt, is_meetup: true, notes, timeText },
          }],
        }),
      });
    } catch {
      // Non-blocking
    }

    emitVibeSignal(entityId, [signalTag], "positive", 0.9);

    setParticles(makeParticles());
    setStatus("success");
    onCreate?.(spontaneous);

    setTimeout(() => {
      setStatus("idle");
      setStep("what");
      setTitle("");
      setVibeId(null);
      setNotes("");
      setTimeText("");
      setParticles([]);
    }, 2200);
  }

  return (
    <section className="relative overflow-hidden rounded-3xl bg-surface p-5 shadow-soft">

      {/* ── Confetti burst ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 1, y: 0, x: 0, scale: 1, rotate: 0 }}
            animate={{ opacity: 0, y: -180, x: p.x, scale: 0.3, rotate: 480 }}
            transition={{ duration: 0.85 + p.delay, ease: "easeOut", delay: p.delay }}
            style={{
              position:      "absolute",
              bottom:        "50%",
              left:          "50%",
              width:         p.size,
              height:        p.size,
              borderRadius:  p.shape === "circle" ? "50%" : 2,
              background:    p.color,
              pointerEvents: "none",
              zIndex:        20,
            }}
          />
        ))}
      </AnimatePresence>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="mb-5">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">New Meetup</p>
        <h2 className="mt-0.5 text-xl font-semibold text-ink">
          {step === "what"    ? "What's happening?" :
           step === "vibe"    ? "What's the vibe?"  : "Any details?"}
        </h2>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-ink/40">
          Step {stepNumber} of 3
        </p>
      </div>

      <AnimatePresence mode="wait" initial={false}>

        {/* ── Step 1: Title input + mic ───────────────────────────────────── */}
        {step === "what" && (
          <motion.div
            key="what"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="relative mb-6 flex items-center">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What's happening?"
                autoFocus
                className="w-full rounded-xl border border-line bg-white/70 px-4 py-3.5 pr-12 text-sm text-ink placeholder:text-ink/30 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
              <button
                type="button"
                onClick={startListening}
                aria-label={listening ? "Stop listening" : "Speak to describe your event"}
                className={`absolute right-3 flex h-8 w-8 items-center justify-center rounded-full text-base transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  listening
                    ? "animate-pulse bg-accent/20 ring-1 ring-accent/40"
                    : "text-ink/35 hover:text-ink/60"
                }`}
              >
                🎤
              </button>
            </div>

            <button
              type="button"
              disabled={!title.trim()}
              onClick={() => setStep("vibe")}
              className="w-full h-13 rounded-2xl bg-black py-3.5 text-sm font-semibold text-white transition-opacity disabled:opacity-35 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent active:opacity-80"
            >
              Continue
            </button>
          </motion.div>
        )}

        {/* ── Step 2: Vibe selection ──────────────────────────────────────── */}
        {step === "vibe" && (
          <motion.div
            key="vibe"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="flex flex-wrap gap-2.5 mb-6">
              {VIBES.map((v) => {
                const active = vibeId === v.id;
                return (
                  <motion.button
                    key={v.id}
                    type="button"
                    whileTap={{ scale: 0.93 }}
                    onClick={() => setVibeId(active ? null : v.id)}
                    className={`rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent min-h-[44px] ${
                      active
                        ? "border-accent bg-accent text-white"
                        : "border-line bg-white/70 text-ink/70"
                    }`}
                  >
                    {v.label}
                  </motion.button>
                );
              })}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep("what")}
                className="min-h-[44px] rounded-xl border border-line bg-white/70 px-4 text-sm font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep("details")}
                className="min-h-[44px] flex-1 rounded-xl bg-black text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent active:opacity-80"
              >
                Continue
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Step 3: Details + submit ────────────────────────────────────── */}
        {step === "details" && (
          <motion.div
            key="details"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {/* Summary row */}
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-ink/5 px-3 py-2.5">
              <p className="text-sm font-semibold text-ink truncate flex-1">{title}</p>
              {selectedVibe && (
                <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-semibold text-accent">
                  {selectedVibe.label}
                </span>
              )}
            </div>

            <input
              type="text"
              value={timeText}
              onChange={(e) => setTimeText(e.target.value)}
              placeholder="Time (optional) — e.g. 3pm"
              className="mb-3 w-full rounded-xl border border-line bg-white/70 px-4 py-2.5 text-sm text-ink placeholder:text-ink/30 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="mb-5 w-full resize-none rounded-xl border border-line bg-white/70 px-4 py-2.5 text-sm text-ink placeholder:text-ink/30 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />

            {errorMsg && (
              <p className="mb-3 text-xs text-red-500" role="alert">{errorMsg}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep("vibe")}
                disabled={status === "submitting"}
                className="min-h-[44px] rounded-xl border border-line bg-white/70 px-4 text-sm font-semibold text-ink disabled:opacity-50 focus:outline-none"
              >
                Back
              </button>
              <motion.button
                type="button"
                onClick={handleCreate}
                disabled={status !== "idle"}
                whileTap={status === "idle" ? { scale: 0.97 } : undefined}
                className="min-h-[44px] flex-1 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {status === "submitting" ? "Creating…"  :
                 status === "success"    ? "🎉 Done!"    : "Start Something"}
              </motion.button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </section>
  );
}

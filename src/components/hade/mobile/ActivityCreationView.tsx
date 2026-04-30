"use client";

import { useEffect, useMemo, useState } from "react";
import type { SpontaneousObject } from "@/types/hade";

type Step = "chips" | "time" | "confirm";

interface ActivityChip {
  id: string;
  title: string;
  vibe_tag: string;
}

interface TimeOption {
  id: string;
  label: string;
  offsetMinutes: number;
  durationMinutes: number;
}

const CHIPS: ActivityChip[] = [
  { id: "volleyball", title: "Play volleyball", vibe_tag: "active" },
  { id: "sketch", title: "Sketch outside", vibe_tag: "chill" },
  { id: "coffee_walk", title: "Grab coffee and walk", vibe_tag: "social" },
  { id: "study", title: "Co-work nearby", vibe_tag: "focused" },
];

const TIME_OPTIONS: TimeOption[] = [
  { id: "now", label: "Now", offsetMinutes: 0, durationMinutes: 60 },
  { id: "soon", label: "In 30 min", offsetMinutes: 30, durationMinutes: 90 },
  { id: "later", label: "In 1 hour", offsetMinutes: 60, durationMinutes: 120 },
];

interface ActivityCreationViewProps {
  onCreate?: (object: SpontaneousObject) => void;
}

export function ActivityCreationView({ onCreate }: ActivityCreationViewProps) {
  const [step, setStep] = useState<Step>("chips");
  const [selectedChip, setSelectedChip] = useState<ActivityChip | null>(null);
  const [selectedTime, setSelectedTime] = useState<TimeOption | null>(null);
  const [feed, setFeed] = useState<SpontaneousObject[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      console.log("[HADE GEO SOURCE]", { lat: null, lng: null, source: "unknown" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const geo = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        console.log("[HADE GEO SOURCE]", { lat: geo.lat, lng: geo.lng, source: "browser" });
        setLocation(geo);
      },
      () => {
        console.log("[HADE GEO SOURCE]", { lat: null, lng: null, source: "unknown" });
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 5_000 },
    );
  }, []);

  const stepNumber = useMemo(() => {
    if (step === "chips") return 1;
    if (step === "time") return 2;
    return 3;
  }, [step]);

  function createObject() {
    const chip = selectedChip ?? CHIPS[0];
    const time = selectedTime ?? TIME_OPTIONS[0];
    const now = Date.now();
    const start = now + time.offsetMinutes * 60_000;
    const end = start + time.durationMinutes * 60_000;

    const object: SpontaneousObject = {
      id: crypto.randomUUID(),
      type: "ugc_event",
      title: chip.title,
      time_window: { start, end },
      location: location ?? { lat: 0, lng: 0 },
      radius: 150,
      going_count: 0,
      maybe_count: 0,
      user_state: null,
      created_at: now,
      expires_at: end,
      trust_score: 0.7,
      vibe_tag: chip.vibe_tag,
      source: "user",
    };

    setFeed((current) => [object, ...current]);
    onCreate?.(object);
    setSelectedChip(null);
    setSelectedTime(null);
    setStep("chips");
  }

  return (
    <section className="rounded-3xl bg-surface p-5 shadow-soft">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-ink">Create activity</h2>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-ink/40">
          Step {stepNumber} of 3
        </p>
      </div>

      {step === "chips" && (
        <div>
          <p className="text-sm font-semibold text-ink">What do you want to do?</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  setSelectedChip(chip);
                  setStep("time");
                }}
                className="min-h-[44px] rounded-xl border border-line bg-white/70 px-3 text-sm font-semibold text-ink transition-colors active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
              >
                {chip.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "time" && (
        <div>
          <p className="text-sm font-semibold text-ink">When should it start?</p>
          <div className="mt-3 space-y-2">
            {TIME_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setSelectedTime(option);
                  setStep("confirm");
                }}
                className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-line bg-white/70 px-3 text-sm font-semibold text-ink transition-colors active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
              >
                <span>{option.label}</span>
                <span className="text-xs text-ink/45">{option.durationMinutes} min</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setStep("chips")}
            className="mt-3 text-sm font-semibold text-ink/55"
          >
            Back
          </button>
        </div>
      )}

      {step === "confirm" && (
        <div>
          <p className="text-sm font-semibold text-ink">Confirm</p>
          <div className="mt-3 rounded-2xl bg-ink/5 p-4">
            <p className="text-base font-semibold text-ink">
              {selectedChip?.title ?? "Untitled activity"}
            </p>
            <p className="mt-1 text-sm text-ink/55">{selectedTime?.label ?? "Now"}</p>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setStep("time")}
              className="min-h-[42px] rounded-xl border border-line bg-white/70 px-4 text-sm font-semibold text-ink"
            >
              Back
            </button>
            <button
              type="button"
              onClick={createObject}
              className="min-h-[42px] rounded-xl bg-ink px-4 text-sm font-semibold text-white"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {feed.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="text-sm font-semibold text-ink">Local feed</p>
          <div className="mt-3 space-y-2">
            {feed.map((object) => (
              <div key={object.id} className="rounded-xl border border-line bg-white/60 p-3">
                <p className="text-sm font-semibold text-ink">{object.title}</p>
                <p className="mt-0.5 text-xs text-ink/50">
                  {object.going_count === 1
                    ? "1 person going"
                    : `${object.going_count} people going`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

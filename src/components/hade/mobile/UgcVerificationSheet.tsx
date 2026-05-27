"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useHadeAdaptiveContext } from "@/lib/hade/hooks";

const COPY = {
  ugc: {
    label:     "Was it there?",
    yes:       "Yes, it was there",
    no:        "No, it wasn't",
    confirmed: "Got it — we'll flag this.",
    detail:    "Thanks for letting us know.",
  },
  standard: {
    label:     "Worth it?",
    yes:       "Worth it",
    no:        "Not really",
    confirmed: "Good to know.",
    detail:    "We'll factor that in.",
  },
} as const;

interface Props {
  open:        boolean;
  venueId:     string;
  venueName:   string;
  variant?:    "ugc" | "standard";
  onClose:     () => void;
  onConfirmed: () => void;
}

type Phase = "prompt" | "flagged";

export function UgcVerificationSheet({
  open,
  venueId,
  venueName,
  variant = "ugc",
  onClose,
  onConfirmed,
}: Props) {
  const { emitVibeSignal } = useHadeAdaptiveContext();
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("prompt");
  const [busy, setBusy] = useState(false);
  const dismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy = COPY[variant];

  useEffect(() => {
    if (!open) {
      setPhase("prompt");
      setBusy(false);
    }
    return () => {
      if (dismissRef.current) clearTimeout(dismissRef.current);
    };
  }, [open]);

  const handleYes = () => {
    if (busy) return;
    setBusy(true);
    emitVibeSignal(venueId, ["worth_it"], "positive", 0.9);
    dismissRef.current = setTimeout(() => onConfirmed(), 1500);
  };

  const handleNo = () => {
    if (busy) return;
    setBusy(true);
    emitVibeSignal(venueId, ["skip_it"], "negative", 0.9);
    setPhase("flagged");
    dismissRef.current = setTimeout(() => onClose(), 1500);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            className="fixed inset-0 z-40 bg-ink/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            onClick={phase === "prompt" ? onClose : undefined}
            aria-hidden="true"
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={copy.label}
            drag={reduceMotion ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 && phase === "prompt") onClose();
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", damping: 32, stiffness: 320 }
            }
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[430px] flex-col rounded-t-[24px] border border-b-0 border-line bg-surface shadow-panel"
          >
            <div className="flex justify-center pb-0.5 pt-2.5">
              <span className="h-1 w-9 rounded-full bg-ink/15" aria-hidden="true" />
            </div>

            {phase === "prompt" ? (
              <div className="flex flex-col gap-4 px-4 pb-[max(12px,env(safe-area-inset-bottom,12px))] pt-3 min-[390px]:px-5">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-ink/60">
                    {copy.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-snug text-ink">{venueName}</p>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleYes}
                    disabled={busy}
                    className="h-11 w-full rounded-2xl bg-accent text-sm font-semibold text-white shadow-glowBlue transition-all hover:bg-accent/90 active:scale-[0.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40"
                  >
                    {copy.yes}
                  </button>
                  <button
                    type="button"
                    onClick={handleNo}
                    disabled={busy}
                    className="h-11 w-full rounded-xl border border-line bg-background/70 text-sm font-medium text-ink/70 transition-colors hover:bg-surface active:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
                  >
                    {copy.no}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={busy}
                    className="py-1.5 text-[13px] font-medium text-ink/65 transition-opacity active:opacity-80 disabled:opacity-30"
                  >
                    Skip
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 px-4 pb-[max(12px,env(safe-area-inset-bottom,12px))] pt-5">
                <p className="text-sm font-semibold text-ink">{copy.confirmed}</p>
                <p className="text-[13px] text-ink/65">{copy.detail}</p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

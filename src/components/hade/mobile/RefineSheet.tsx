"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Intent } from "@/types/hade";

type Urgency = "low" | "medium" | "high";

interface RefineSheetProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: { intent: Intent | null; urgency: Urgency }) => void;
}

const INTENTS: Intent[] = ["eat", "drink", "chill", "scene", "anything"];
const URGENCIES: Urgency[] = ["low", "medium", "high"];

export function RefineSheet({ open, onClose, onConfirm }: RefineSheetProps) {
  const [intent, setIntent] = useState<Intent | null>(null);
  const [urgency, setUrgency] = useState<Urgency>("medium");
  const reduceMotion = useReducedMotion();

  const handleConfirm = () => {
    onConfirm({ intent, urgency });
  };

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="refine-sheet-title"
            drag={reduceMotion ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100) onClose();
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", damping: 32, stiffness: 320 }
            }
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[min(86dvh,560px)] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[24px] border border-b-0 border-line bg-surface shadow-panel"
          >
            <div className="flex justify-center pb-0.5 pt-2.5">
              <span className="h-1 w-9 rounded-full bg-ink/15" aria-hidden="true" />
            </div>

            <div className="flex items-start justify-between gap-3 border-b border-line/50 px-4 pb-3 pt-2 min-[390px]:px-5">
              <div className="min-w-0">
                <h2 id="refine-sheet-title" className="text-[15px] font-semibold leading-tight text-ink">
                  Refine this decision
                </h2>
                <p className="mt-1 text-[11px] leading-snug text-ink/65">
                  Adjust intent and urgency without leaving the current flow.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="min-h-8 shrink-0 rounded-full border border-line/60 bg-surface/80 px-3 text-[11px] font-semibold text-ink/65 transition-colors hover:bg-background active:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
              >
                Close
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-5 pt-4 min-[390px]:px-5">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-ink/60">
                  What are you after?
                </p>
                <div className="mt-2 grid grid-cols-2 gap-1.5 min-[390px]:flex min-[390px]:flex-wrap">
                  {INTENTS.map((opt) => {
                    const selected = intent === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setIntent(selected ? null : opt)}
                        className={`min-h-10 rounded-xl border px-3 text-sm font-medium transition-colors min-[390px]:rounded-full ${
                          selected
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-line bg-background/45 text-ink/70 hover:bg-surface"
                        }`}
                        aria-pressed={selected}
                      >
                        {opt.charAt(0).toUpperCase() + opt.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-ink/60">
                  How urgent?
                </p>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {URGENCIES.map((u) => {
                    const selected = urgency === u;
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setUrgency(u)}
                        className={`min-h-10 flex-1 rounded-xl border text-sm font-medium transition-colors ${
                          selected
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-line bg-background/45 text-ink/70 hover:bg-surface"
                        }`}
                        aria-pressed={selected}
                      >
                        {u.charAt(0).toUpperCase() + u.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="border-t border-line/70 bg-surface px-4 pb-[max(14px,env(safe-area-inset-bottom,14px))] pt-3 min-[390px]:px-5">
              <button
                type="button"
                onClick={handleConfirm}
                className="min-h-12 w-full rounded-2xl bg-accent text-sm font-semibold text-white shadow-glowBlue transition-all hover:bg-accent/90 active:scale-[0.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Apply refinement
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

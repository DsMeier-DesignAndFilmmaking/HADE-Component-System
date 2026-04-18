"use client";

import { useState } from "react";
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

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            className="fixed inset-0 z-40 bg-ink/40"
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
            aria-label="Refine your search"
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
            className="fixed inset-x-0 bottom-0 z-50 flex h-[62dvh] flex-col rounded-t-3xl border-t border-line bg-surface shadow-panel"
          >
            <div className="flex justify-center pt-3 pb-1">
              <span className="h-1 w-10 rounded-full bg-ink/15" aria-hidden="true" />
            </div>

            <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6 pt-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-widest text-ink/50">
                  What are you after?
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {INTENTS.map((opt) => {
                    const selected = intent === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setIntent(selected ? null : opt)}
                        className={`min-h-[44px] rounded-full border px-4 text-base font-medium transition-colors ${
                          selected
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-line bg-transparent text-ink/70"
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
                <p className="text-[11px] font-medium uppercase tracking-widest text-ink/50">
                  How urgent?
                </p>
                <div className="mt-3 flex gap-2">
                  {URGENCIES.map((u) => {
                    const selected = urgency === u;
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setUrgency(u)}
                        className={`min-h-[44px] flex-1 rounded-2xl border text-base font-medium transition-colors ${
                          selected
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-line bg-transparent text-ink/70"
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

            <div className="border-t border-line bg-surface px-6 pb-safe-floor pt-4">
              <button
                type="button"
                onClick={handleConfirm}
                className="h-14 w-full rounded-2xl bg-accent text-[17px] font-semibold text-white shadow-soft transition-transform active:scale-[0.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

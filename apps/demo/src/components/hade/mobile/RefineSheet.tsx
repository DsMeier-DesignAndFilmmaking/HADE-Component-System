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
            className="fixed inset-0 z-40 bg-ink/30"
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
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[72dvh] flex-col rounded-t-[22px] border-t border-line bg-surface shadow-panel"
          >
            <div className="flex justify-center pb-0.5 pt-2.5">
              <span className="h-1 w-9 rounded-full bg-ink/15" aria-hidden="true" />
            </div>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-3 min-[390px]:px-5">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-ink/50">
                  What are you after?
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {INTENTS.map((opt) => {
                    const selected = intent === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setIntent(selected ? null : opt)}
                        className={`min-h-9 rounded-full border px-3 text-sm font-medium transition-colors ${
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
                <p className="text-[10px] font-medium uppercase tracking-widest text-ink/50">
                  How urgent?
                </p>
                <div className="mt-2 flex gap-1.5">
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

            <div className="border-t border-line/70 bg-surface px-4 pb-[max(12px,env(safe-area-inset-bottom,12px))] pt-3 min-[390px]:px-5">
              <button
                type="button"
                onClick={handleConfirm}
                className="h-11 w-full rounded-xl bg-accent text-sm font-semibold text-white shadow-soft transition-transform active:scale-[0.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
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

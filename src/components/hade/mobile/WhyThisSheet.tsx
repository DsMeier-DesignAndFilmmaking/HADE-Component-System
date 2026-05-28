"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

interface WhyThisSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function WhyThisSheet({ open, onClose, children }: WhyThisSheetProps) {
  const reduceMotion = useReducedMotion();

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
        <motion.div
          className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 px-3 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="why-this-sheet-title"
            drag={reduceMotion ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100) onClose();
            }}
            className="mx-auto flex max-h-[min(82dvh,520px)] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[24px] border border-b-0 border-line/70 bg-surface shadow-panel"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", damping: 30, stiffness: 300 }
            }
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-center pb-0.5 pt-2.5">
              <span className="h-1 w-9 rounded-full bg-ink/15" aria-hidden="true" />
            </div>

            <div className="flex items-start justify-between gap-3 border-b border-line/50 px-4 pb-3 pt-2 min-[390px]:px-5">
              <div className="min-w-0">
                <h2 id="why-this-sheet-title" className="text-[15px] font-semibold leading-tight text-ink">
                  Why this?
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close why this explanation"
                className="min-h-8 shrink-0 rounded-full border border-line/60 bg-surface/80 px-3 text-[11px] font-semibold text-ink/65 transition-colors hover:bg-background active:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 pt-4 min-[390px]:px-5">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

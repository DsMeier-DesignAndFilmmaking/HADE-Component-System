"use client";

import { motion } from "framer-motion";

export function LoadingState() {
  return (
    <div className="flex h-[100dvh] w-full flex-col items-center justify-center bg-background px-5">
      <motion.div
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        className="flex items-center gap-2"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="h-1.5 w-1.5 rounded-full bg-accent/70" />
        <span className="h-1.5 w-1.5 rounded-full bg-accent/40" />
      </motion.div>
      <p className="mt-5 text-base text-ink/60">Understanding your context…</p>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { parseVoiceIntent, type VoiceIntent } from "@/lib/hade/voiceIntentParser";

type VoiceState = "idle" | "listening" | "transcript" | "processing" | "applied" | "error";

interface VoiceSheetProps {
  open: boolean;
  onClose: () => void;
  onApply: (parsed: VoiceIntent) => void;
}

export function VoiceSheet({ open, onClose, onApply }: VoiceSheetProps) {
  const reduceMotion = useReducedMotion();
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [parsed, setParsed] = useState<VoiceIntent | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState("");
  const [errorType, setErrorType] = useState<string>("");
  const recogRef = useRef<any>(null);
  const voiceStateRef = useRef<VoiceState>("idle");
  const fallbackInputRef = useRef<HTMLTextAreaElement>(null);

  const hasSpeechAPI =
    typeof window !== "undefined" &&
    !!(
      (window as any).SpeechRecognition ??
      (window as any).webkitSpeechRecognition
    );

  // Keep voiceStateRef in sync for use inside event handlers
  useEffect(() => { voiceStateRef.current = voiceState; }, [voiceState]);

  // Abort recognition and release mic on close
  useEffect(() => {
    if (!open) {
      recogRef.current?.abort();
      recogRef.current = null;
      setVoiceState("idle");
      setTranscript("");
      setParsed(null);
      setEditMode(false);
      setErrorType("");
    }
  }, [open]);

  // Auto-close after "applied"
  useEffect(() => {
    if (voiceState !== "applied") return;
    const id = setTimeout(onClose, 800);
    return () => clearTimeout(id);
  }, [voiceState, onClose]);

  const startListening = useCallback(() => {
    if (!hasSpeechAPI) return;
    recogRef.current?.abort();

    const W = window as any;
    const SR: (new () => any) | undefined = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!SR) return;

    const recog = new SR();
    recog.continuous = false;
    recog.interimResults = false;
    recog.lang = navigator.language ?? "en-US";

    recog.onresult = (e: any) => {
      const t: string = e.results[0][0].transcript;
      setTranscript(t);
      setEditText(t);
      setParsed(parseVoiceIntent(t));
      setVoiceState("transcript");
      recogRef.current = null;
    };
    recog.onerror = (e: any) => {
      setErrorType((e as any).error ?? "unknown");
      setVoiceState("error");
      recogRef.current = null;
    };
    recog.onend = () => {
      if (voiceStateRef.current === "listening") {
        setVoiceState("error");
        setErrorType("no-speech");
      }
      recogRef.current = null;
    };

    recogRef.current = recog;
    recog.start();
    setVoiceState("listening");
  }, [hasSpeechAPI]);

  const stopListening = useCallback(() => {
    recogRef.current?.abort();
    recogRef.current = null;
    setVoiceState("idle");
  }, []);

  const handleEditChange = useCallback((text: string) => {
    setEditText(text);
    setParsed(parseVoiceIntent(text));
  }, []);

  const handleApply = useCallback(() => {
    const target = parsed ?? parseVoiceIntent(editText);
    setVoiceState("processing");
    onApply(target);
    // Parent closes the sheet; we set applied so auto-close fires as fallback
    setVoiceState("applied");
  }, [parsed, editText, onApply]);

  const handleFallbackSubmit = useCallback(() => {
    const text = editText.trim();
    if (!text) return;
    const p = parseVoiceIntent(text);
    setParsed(p);
    setTranscript(text);
    setVoiceState("transcript");
  }, [editText]);

  // ── Chip helpers ───────────────────────────────────────────────────────────
  const chips: string[] = [];
  if (parsed) {
    if (parsed.intent)                               chips.push(`Mood: ${parsed.intent.charAt(0).toUpperCase() + parsed.intent.slice(1)}`);
    if (parsed.urgency === "high")                   chips.push("Urgency: High");
    if (parsed.urgency === "low")                    chips.push("Urgency: Low");
    if (parsed.state?.energy === "low")              chips.push("Low energy");
    if (parsed.state?.energy === "high")             chips.push("High energy");
    if (parsed.constraints?.distance_tolerance === "walking")     chips.push("Walking distance");
    if (parsed.constraints?.distance_tolerance === "short_drive") chips.push("Short drive");
    if (parsed.constraints?.time_available_minutes)  chips.push(`${parsed.constraints.time_available_minutes} min`);
    if (parsed.candidate_categories_exclude?.length) chips.push("No restaurants");
  }

  const permissionDenied = errorType === "not-allowed" || errorType === "service-not-allowed";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="voice-scrim"
            className="fixed inset-0 z-40 bg-ink/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="voice-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Voice input"
            drag={reduceMotion ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => { if (info.offset.y > 100) onClose(); }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", damping: 32, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[60dvh] flex-col rounded-t-[22px] border-t border-line bg-surface shadow-panel"
          >
            {/* Drag handle */}
            <div className="flex justify-center pb-0.5 pt-2.5">
              <span className="h-1 w-9 rounded-full bg-ink/15" aria-hidden="true" />
            </div>

            {/* ── idle ─────────────────────────────────────────────────────── */}
            {voiceState === "idle" && (
              <div className="flex flex-1 flex-col items-center gap-4 overflow-y-auto px-4 pb-4 pt-4 min-[390px]:px-5">
                <p className="text-[10px] font-medium uppercase tracking-widest text-ink/50">
                  Say what would help right now
                </p>

                {hasSpeechAPI ? (
                  <button
                    type="button"
                    onClick={startListening}
                    aria-label="Start speaking"
                    className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-accent/30 bg-accent/10 text-2xl transition-colors active:bg-accent/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    🎤
                  </button>
                ) : (
                  <>
                    <textarea
                      ref={fallbackInputRef}
                      value={editText}
                      onChange={(e) => { setEditText(e.target.value); }}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleFallbackSubmit(); } }}
                      placeholder="e.g. I want something quiet nearby"
                      rows={2}
                      className="w-full resize-none rounded-xl border border-line bg-white/70 px-3 py-2.5 text-sm text-ink placeholder:text-ink/40 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <button
                      type="button"
                      onClick={handleFallbackSubmit}
                      disabled={!editText.trim()}
                      className="h-11 w-full rounded-xl bg-accent text-sm font-semibold text-white shadow-soft transition-transform active:scale-[0.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
                    >
                      Parse intent
                    </button>
                  </>
                )}

                {hasSpeechAPI && (
                  <p className="text-xs text-ink/40">Tap the mic to start</p>
                )}
              </div>
            )}

            {/* ── listening ────────────────────────────────────────────────── */}
            {voiceState === "listening" && (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 pb-6 pt-2">
                <button
                  type="button"
                  onClick={stopListening}
                  aria-label="Stop listening"
                  className="relative flex h-16 w-16 items-center justify-center rounded-full text-2xl focus:outline-none"
                >
                  <span className="absolute inset-0 animate-ping rounded-full bg-accent/25" aria-hidden="true" />
                  <span className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-accent/40 bg-accent/15 ring-1 ring-accent/30">
                    🎤
                  </span>
                </button>
                <p className="text-sm font-medium text-ink/60">Listening…</p>
                <button
                  type="button"
                  onClick={stopListening}
                  className="text-xs text-ink/40 underline underline-offset-2"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* ── transcript ───────────────────────────────────────────────── */}
            {voiceState === "transcript" && parsed && (
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-2 pt-3 min-[390px]:px-5">
                {editMode ? (
                  <textarea
                    value={editText}
                    onChange={(e) => handleEditChange(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-xl border border-accent bg-white/70 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                    autoFocus
                  />
                ) : (
                  <div className="rounded-xl border border-line bg-ink/[0.035] px-3 py-2.5">
                    <p className="text-sm text-ink/70">&ldquo;{transcript}&rdquo;</p>
                  </div>
                )}

                {chips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-accent/30 bg-accent/8 px-2.5 py-0.5 text-[11px] font-medium text-accent/80"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                )}

                {chips.length === 0 && (
                  <p className="text-xs text-ink/40">I couldn&apos;t read a clear preference yet — try one more detail.</p>
                )}
              </div>
            )}

            {/* ── processing ───────────────────────────────────────────────── */}
            {voiceState === "processing" && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 pb-6">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent/30 border-t-accent" aria-hidden="true" />
                <p className="text-sm text-ink/50">Updating decision…</p>
              </div>
            )}

            {/* ── applied ──────────────────────────────────────────────────── */}
            {voiceState === "applied" && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 pb-6">
                <span className="text-2xl" aria-hidden="true">✓</span>
                <p className="text-sm font-medium text-ink/60">Applied</p>
              </div>
            )}

            {/* ── error ────────────────────────────────────────────────────── */}
            {voiceState === "error" && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 pb-6 pt-2">
                <p className="text-sm font-medium text-ink/60">
                  {permissionDenied ? "Microphone access denied" : "Couldn't hear that"}
                </p>
                {permissionDenied ? (
                  <p className="text-center text-xs text-ink/40">
                    Allow microphone access in your browser settings, then try again.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={startListening}
                    className="min-h-[40px] rounded-xl border border-line bg-white/60 px-4 text-sm font-medium text-ink/70 transition-colors active:bg-white focus:outline-none"
                  >
                    Try again
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setVoiceState("idle"); setErrorType(""); }}
                  className="text-xs text-ink/40 underline underline-offset-2"
                >
                  {permissionDenied ? "Dismiss" : "Type instead"}
                </button>
              </div>
            )}

            {/* ── Footer actions (transcript state only) ────────────────────── */}
            {voiceState === "transcript" && (
              <div className="border-t border-line/70 bg-surface px-4 pb-[max(12px,env(safe-area-inset-bottom,12px))] pt-3 min-[390px]:px-5">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setEditMode((v) => !v); }}
                    className="min-h-11 flex-1 rounded-xl border border-line bg-white/60 text-sm font-medium text-ink/60 transition-colors active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
                  >
                    {editMode ? "Done" : "Edit"}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-11 flex-1 rounded-xl border border-line bg-white/60 text-sm font-medium text-ink/60 transition-colors active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApply}
                    className="min-h-11 flex-[2] rounded-xl bg-accent text-sm font-semibold text-white shadow-soft transition-transform active:scale-[0.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}

            {/* ── Footer close for non-transcript states ─────────────────────── */}
            {(voiceState === "idle" || voiceState === "error") && (
              <div className="border-t border-line/70 bg-surface px-4 pb-[max(12px,env(safe-area-inset-bottom,12px))] pt-3 min-[390px]:px-5">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-11 w-full rounded-xl border border-line bg-white/60 text-sm font-medium text-ink/60 transition-colors active:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
                >
                  Cancel
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

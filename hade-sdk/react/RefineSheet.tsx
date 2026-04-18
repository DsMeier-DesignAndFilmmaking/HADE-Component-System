"use client";

import type { HadeRefineInput } from "../core";

interface RefineSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (input: HadeRefineInput) => void;
}

const OPTIONS: Array<{ label: string; tone: NonNullable<HadeRefineInput["tone"]> }> = [
  { label: "Closer", tone: "closer" },
  { label: "Faster", tone: "faster" },
  { label: "Quieter", tone: "quieter" },
];

export function RefineSheet({ open, onClose, onSelect }: RefineSheetProps) {
  if (!open) return null;

  return (
    <div className="hade-web-sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="hade-web-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Refine decision"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="hade-web-sheet-handle" aria-hidden="true" />
        <h2 className="hade-web-sheet-title">Refine this decision</h2>
        <p className="hade-web-sheet-copy">Keep one suggestion on screen and nudge it slightly.</p>
        <div className="hade-web-sheet-actions">
          {OPTIONS.map((option) => (
            <button
              key={option.tone}
              type="button"
              className="hade-web-sheet-button"
              onClick={() => onSelect({ tone: option.tone })}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button type="button" className="hade-web-secondary-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

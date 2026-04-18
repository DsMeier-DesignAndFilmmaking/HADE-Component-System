"use client";

interface SecondaryActionsProps {
  onRegenerate: () => void;
  onRefine: () => void;
}

export function SecondaryActions({ onRegenerate, onRefine }: SecondaryActionsProps) {
  return (
    <div className="hade-web-secondary-actions" aria-label="Secondary actions">
      <button type="button" className="hade-web-secondary-button" onClick={onRefine}>
        Refine
      </button>
      <button type="button" className="hade-web-secondary-button" onClick={onRegenerate}>
        New suggestion
      </button>
    </div>
  );
}

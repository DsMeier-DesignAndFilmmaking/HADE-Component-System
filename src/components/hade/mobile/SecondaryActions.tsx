"use client";

interface SecondaryActionsProps {
  onAlternatives: () => void;
  onRefine: () => void;
  disabled?: boolean;
}

export function SecondaryActions({
  onAlternatives,
  onRefine,
  disabled = false,
}: SecondaryActionsProps) {
  const baseClass =
    "min-h-[44px] flex-1 whitespace-nowrap rounded-xl text-sm text-ink/60 transition-colors active:text-ink disabled:opacity-50 focus:outline-none focus-visible:text-ink focus-visible:underline underline-offset-4";

  return (
    <div className="flex w-full items-center justify-center gap-6">
      <button type="button" onClick={onAlternatives} disabled={disabled} className={baseClass}>
        Not this
      </button>
      <span aria-hidden="true" className="h-4 w-px bg-line" />
      <button type="button" onClick={onRefine} disabled={disabled} className={baseClass}>
        Refine
      </button>
    </div>
  );
}

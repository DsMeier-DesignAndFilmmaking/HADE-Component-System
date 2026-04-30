"use client";

interface SecondaryActionsProps {
  onPrevious: () => void;
  onRefine: () => void;
  hasPrevious?: boolean;
  disabled?: boolean;
}

export function SecondaryActions({
  onPrevious,
  onRefine,
  hasPrevious = false,
  disabled = false,
}: SecondaryActionsProps) {
  const baseClass =
    "min-h-[44px] flex-1 whitespace-nowrap rounded-xl text-sm text-ink/60 transition-colors active:text-ink disabled:opacity-50 focus:outline-none focus-visible:text-ink focus-visible:underline underline-offset-4";

  return (
    <div className="flex w-full items-center justify-center gap-6">
      <button
        type="button"
        onClick={onPrevious}
        disabled={disabled || !hasPrevious}
        className={baseClass}
      >
        Previous
      </button>
      <span aria-hidden="true" className="h-4 w-px bg-line" />
      <button type="button" onClick={onRefine} disabled={disabled} className={baseClass}>
        Refine
      </button>
    </div>
  );
}

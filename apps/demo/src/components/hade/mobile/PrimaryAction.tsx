"use client";

interface PrimaryActionProps {
  label?: string;
  onPress: () => void;
  disabled?: boolean;
}

export function PrimaryAction({
  label = "Take me there",
  onPress,
  disabled = false,
}: PrimaryActionProps) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      className="h-14 w-full rounded-2xl bg-accent text-[17px] font-semibold text-white shadow-soft transition-transform active:scale-[0.985] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {label}
    </button>
  );
}

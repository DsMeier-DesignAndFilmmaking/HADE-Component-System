"use client";

interface PrimaryCTAButtonProps {
  onGo: () => void;
}

export function PrimaryCTAButton({ onGo }: PrimaryCTAButtonProps) {
  return (
    <button type="button" className="hade-web-primary-cta" onClick={onGo}>
      Go
    </button>
  );
}

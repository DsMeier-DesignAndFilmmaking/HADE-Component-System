import type { HadeCardProps } from "@/types/hade";

const glowClasses = {
  true: "shadow-glowBlue border-accent/30",
  blue: "shadow-glowBlue border-accent/30",
  lime: "shadow-glow border-cyberLime/30",
  false: "shadow-panel border-line",
};

export function HadeCard({ glow = false, className = "", children }: HadeCardProps) {
  const glowKey = glow === true ? "true" : glow === false ? "false" : glow;
  const glowClass = glowClasses[glowKey as keyof typeof glowClasses] ?? glowClasses.false;

  return (
    <div
      className={[
        "rounded-2xl border bg-white p-6 transition-shadow duration-300",
        glowClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

import React from "react";

type HeadingLevel = 1 | 2 | 3 | 4;
type HeadingColor = "ink" | "surface" | "accent" | "muted";

interface HadeHeadingProps {
  level?: HeadingLevel;
  color?: HeadingColor;
  className?: string;
  children: React.ReactNode;
}

const sizeClasses: Record<HeadingLevel, string> = {
  1: "text-4xl sm:text-5xl font-bold tracking-tight leading-tight",
  2: "text-3xl sm:text-4xl font-bold tracking-tight leading-tight",
  3: "text-2xl font-semibold tracking-tight leading-snug",
  4: "text-xl font-semibold tracking-tight leading-snug",
};

const colorClasses: Record<HeadingColor, string> = {
  ink: "text-ink",
  surface: "text-surface",
  accent: "text-accent",
  muted: "text-ink/60",
};

export function HadeHeading({
  level = 2,
  color = "ink",
  className = "",
  children,
}: HadeHeadingProps) {
  const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
  const classes = [sizeClasses[level], colorClasses[color], className]
    .filter(Boolean)
    .join(" ");

  return <Tag className={classes}>{children}</Tag>;
}

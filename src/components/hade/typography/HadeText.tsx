import React from "react";

type TextVariant = "body" | "caption" | "label" | "mono";
type TextColor = "ink" | "muted" | "accent" | "surface";

interface HadeTextProps {
  variant?: TextVariant;
  color?: TextColor;
  className?: string;
  children: React.ReactNode;
  as?: "p" | "span" | "div" | "li";
}

const variantClasses: Record<TextVariant, string> = {
  body: "text-base leading-relaxed",
  caption: "text-sm leading-relaxed",
  label: "text-xs font-medium uppercase tracking-widest",
  mono: "text-sm font-mono",
};

const colorClasses: Record<TextColor, string> = {
  ink: "text-ink",
  muted: "text-ink/60",
  accent: "text-accent",
  surface: "text-surface",
};

export function HadeText({
  variant = "body",
  color = "ink",
  className = "",
  children,
  as: Tag = "p",
}: HadeTextProps) {
  const classes = [variantClasses[variant], colorClasses[color], className]
    .filter(Boolean)
    .join(" ");

  return <Tag className={classes}>{children}</Tag>;
}

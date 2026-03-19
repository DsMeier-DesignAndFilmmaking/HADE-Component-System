"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { ComponentVariant, ComponentSize } from "@/types/hade";

interface HadeButtonProps {
  variant?: ComponentVariant;
  size?: ComponentSize;
  href?: string;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit" | "reset";
}

const variantClasses: Record<ComponentVariant, string> = {
  primary:
    "bg-accent text-white border border-accent hover:bg-accent/90 shadow-glowBlue/30",
  secondary:
    "bg-transparent text-accent border border-accent hover:bg-accentSoft",
  ghost:
    "bg-transparent text-ink border border-transparent hover:bg-surface hover:border-line",
};

const sizeClasses: Record<ComponentSize, string> = {
  sm: "px-4 py-2 text-sm",
  default: "px-6 py-3 text-sm",
  lg: "px-8 py-4 text-base",
};

export function HadeButton({
  variant = "primary",
  size = "default",
  href,
  disabled = false,
  loading = false,
  children,
  onClick,
  className = "",
  type = "button",
}: HadeButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium tracking-tight transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 select-none";

  const classes = [
    base,
    variantClasses[variant],
    sizeClasses[size],
    disabled || loading ? "opacity-50 cursor-not-allowed pointer-events-none" : "cursor-pointer",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const motionProps = {
    whileHover: { scale: disabled || loading ? 1 : 1.02 },
    whileTap: { scale: disabled || loading ? 1 : 0.97 },
    transition: { type: "spring", stiffness: 400, damping: 20 },
  };

  const content = loading ? (
    <>
      <svg
        className="h-4 w-4 animate-spin"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      {children}
    </>
  ) : (
    children
  );

  if (href) {
    return (
      <motion.div {...motionProps} className="inline-flex">
        <Link href={href} className={classes} aria-disabled={disabled}>
          {content}
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.button
      {...motionProps}
      type={type}
      className={classes}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {content}
    </motion.button>
  );
}

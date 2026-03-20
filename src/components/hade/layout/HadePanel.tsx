import type { HadePanelProps } from "@/types/hade";

export function HadePanel({ header, footer, className = "", children }: HadePanelProps) {
  return (
    <div
      className={[
        "rounded-2xl border border-border bg-surface shadow-panel overflow-hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {header && (
        <div className="border-b border-border px-6 py-4 bg-background">
          {header}
        </div>
      )}
      <div className="px-6 py-5">{children}</div>
      {footer && (
        <div className="border-t border-border px-6 py-4 bg-background">
          {footer}
        </div>
      )}
    </div>
  );
}

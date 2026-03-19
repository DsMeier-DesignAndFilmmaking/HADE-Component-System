import type { HadePanelProps } from "@/types/hade";

export function HadePanel({ header, footer, className = "", children }: HadePanelProps) {
  return (
    <div
      className={[
        "rounded-2xl border border-line bg-white shadow-panel overflow-hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {header && (
        <div className="border-b border-line px-6 py-4 bg-surface/60">
          {header}
        </div>
      )}
      <div className="px-6 py-5">{children}</div>
      {footer && (
        <div className="border-t border-line px-6 py-4 bg-surface/40">
          {footer}
        </div>
      )}
    </div>
  );
}

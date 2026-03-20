"use client";

import Link from "next/link";
import { useState } from "react";

const NAV_LINKS = [
  { href: "/demo", label: "Demo" },
  { href: "/components", label: "Components" },
  { href: "/docs", label: "Docs" },
];

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6"
      >
        <Link
          href="/"
          className="rounded-md px-1 py-0.5 font-mono text-sm font-bold tracking-widest text-textPrimary uppercase transition-colors hover:text-accentPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accentPrimary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          onClick={() => setIsOpen(false)}
        >
          HADE System <span className="text-textMuted">v1</span>
        </Link>

        <button
          type="button"
          className="inline-flex items-center rounded-md border border-border px-2.5 py-1.5 text-sm text-textPrimary transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accentPrimary focus-visible:ring-offset-2 focus-visible:ring-offset-surface md:hidden"
          aria-expanded={isOpen}
          aria-controls="site-nav-links"
          aria-label="Toggle navigation"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <span className="font-medium">{isOpen ? "Close" : "Menu"}</span>
        </button>

        <div className="hidden items-center gap-5 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-2 py-1 text-sm font-medium text-textMuted transition-colors hover:text-accentPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accentPrimary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>

      <div
        id="site-nav-links"
        className={[
          "border-t border-border md:hidden",
          isOpen ? "block" : "hidden",
        ].join(" ")}
      >
        <div className="mx-auto flex max-w-6xl flex-col px-4 py-2 sm:px-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-2 py-2 text-sm font-medium text-textMuted transition-colors hover:bg-background hover:text-accentPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accentPrimary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              onClick={() => setIsOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}

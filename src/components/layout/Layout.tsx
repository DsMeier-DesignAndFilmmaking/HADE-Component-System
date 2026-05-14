"use client";

import type { ReactNode } from "react";
import { Navbar } from "./Navbar";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background text-textPrimary">
      <Navbar />
      <div className="pt-[53px]">{children}</div>
    </div>
  );
}

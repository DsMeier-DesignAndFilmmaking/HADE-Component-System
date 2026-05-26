import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./Providers";

export const metadata: Metadata = {
  title: "HADE Demo (Next.js)",
  description: "Minimal external-consumer example using @hade/core + @hade/react.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

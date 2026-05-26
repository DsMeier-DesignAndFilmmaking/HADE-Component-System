import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { PwaServiceWorker } from "@/components/hade/PwaServiceWorker";
import Script from "next/script";


const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "HADE System v1",
    template: "%s | HADE System",
  },
  description:
    "Human-Aware Decision Engine — adaptive UX component system and interactive demo.",
  keywords: ["HADE", "adaptive UX", "decision engine", "component system"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen antialiased">
        <Script
          id="hade-script-error-guard"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.__NEXT_DATA__ && console.log("[HADE] build id:", window.__NEXT_DATA__.buildId);
              window.addEventListener("error", function(e) {
                if (e.target && (e.target.tagName === "SCRIPT" || e.target.tagName === "LINK")) {
                  console.error("[NEXT SCRIPT LOAD ERROR]", e.target.src || e.target.href);
                }
              }, true);
            `,
          }}
        />
        <PwaServiceWorker />
        {children}
      </body>
    </html>
  );
}

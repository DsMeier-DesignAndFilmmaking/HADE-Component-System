import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Serwist handles service worker generation externally
  // No PWA plugin or SW bundler should be configured here

  // Optional: keep if you're using App Router + SW fetch behavior
  experimental: {
    // only include if already using these features elsewhere
  },
};

export default nextConfig;
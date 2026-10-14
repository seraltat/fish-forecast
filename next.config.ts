import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Disable Next.js dev tools indicator (the "N" logo at bottom-left in dev mode).
  // It's only visible in development, not production, but it can be visually distracting.
  devIndicators: false,
};

export default nextConfig;

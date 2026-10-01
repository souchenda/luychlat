import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone (used by the Dockerfile and PM2 setups).
  output: "standalone",
  // The floating Next.js dev badge overlaps the workspace switcher in previews (never shown in production).
  devIndicators: false,
  // Lets phones on the same Wi-Fi load dev assets when running `npm run dev:lan`.
  // Add your PC's LAN IP here if it changes (e.g. after reconnecting to Wi-Fi).
  allowedDevOrigins: ["192.168.100.202", "*.local"],
};

export default nextConfig;

import type { NextConfig } from "next";

/**
 * Security headers on every response (production). They are sent by the app
 * itself so they also apply where Nginx locations set their own add_header
 * (which would otherwise drop server-level headers).
 *
 * CSP: scripts and styles only from this origin (Next inlines its bootstrap,
 * hence 'unsafe-inline'); network calls only to this origin and Supabase, so
 * injected code couldn't send data anywhere else; no framing; no plugins.
 */
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();
const supabaseWs = supabaseOrigin.replace(/^https:/, "wss:");

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
  "font-src 'self' data:",
  // The Adhan sound the user picks is played from an on-device blob.
  "media-src 'self' blob:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs}`.trim(),
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The camera is opened through the file picker (receipts), which needs no permission.
  // Geolocation is allowed for this site only (prayer times / Qibla "My location"); with
  // geolocation=() the browser refused every request, even with GPS on.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone (used by the Dockerfile and PM2 setups).
  output: "standalone",
  // The floating Next.js dev badge overlaps the workspace switcher in previews (never shown in production).
  devIndicators: false,
  // Don't advertise the framework.
  poweredByHeader: false,
  // Lets phones on the same Wi-Fi load dev assets when running `npm run dev:lan`.
  // Add your PC's LAN IP here if it changes (e.g. after reconnecting to Wi-Fi).
  allowedDevOrigins: ["192.168.100.202", "*.local"],
  async headers() {
    // Dev needs eval for fast refresh; the full policy applies to production builds.
    if (process.env.NODE_ENV !== "production") return [];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

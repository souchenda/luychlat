import type { MetadataRoute } from "next"

/** Installable PWA ("Add to Home Screen") on Android and iOS. Icons: scripts/generate-icons.mjs */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "លុយឆ្លាត · LuyChlat",
    short_name: "លុយឆ្លាត",
    description: "គ្រប់គ្រងលុយ និងបំណុល ផ្ទាល់ខ្លួន និងអាជីវកម្ម",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f9f6e",
    theme_color: "#0f9f6e",
    lang: "km",
    categories: ["finance", "business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "ប្រតិបត្តិការ · Transactions", url: "/transactions", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "បំណុល · Debts", url: "/debts", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "របាយការណ៍ · Reports", url: "/reports", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  }
}

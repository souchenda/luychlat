import type { CapacitorConfig } from "@capacitor/cli"

/**
 * Android app (APK for testers): a native shell that loads the live site, so
 * every web deploy reaches installed apps at once — no reinstall needed. Only
 * changes to this file, the android/ project or native plugins need a new APK.
 * Build steps: docs/android-apk.md.
 */
const config: CapacitorConfig = {
  appId: "com.luychlat.app",
  // The brand, the same as the PWA's home-screen name (src/app/manifest.ts short_name).
  appName: "អេប លុយឆ្លាត",
  // Shown only when the live site can't be reached at launch (offline).
  webDir: "capacitor-www",
  server: {
    url: "https://app.luychlat.com",
    // Pages of the live site stay inside the app; any other link (Telegram, bank sites, OAuth) opens in the browser.
    allowNavigation: ["app.luychlat.com", "luychlat.com", "www.luychlat.com", "luy.ibmserp.com"],
    errorPath: "index.html",
  },
  android: {
    // The installed build, for the in-app update (Task #468 — lib/apk-version.ts LATEST_APK.code): raise with versionCode.
    appendUserAgent: "LuyChlatApp/8",
    // HTTPS only; no mixed content.
    allowMixedContent: false,
    backgroundColor: "#ffffff",
  },
}

export default config

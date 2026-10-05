import type { CapacitorConfig } from "@capacitor/cli"

/**
 * Android app (APK for testers): a native shell that loads the live site, so
 * every web deploy reaches installed apps at once — no reinstall needed. Only
 * changes to this file, the android/ project or native plugins need a new APK.
 * Build steps: docs/android-apk.md.
 */
const config: CapacitorConfig = {
  appId: "com.luychlat.app",
  appName: "លុយឆ្លាត",
  // Shown only when the live site can't be reached at launch (offline).
  webDir: "capacitor-www",
  server: {
    url: "https://luy.ibmserp.com",
    // Pages of the live site stay inside the app; any other link (Telegram, bank sites, OAuth) opens in the browser.
    allowNavigation: ["luy.ibmserp.com"],
    errorPath: "index.html",
  },
  android: {
    // HTTPS only; no mixed content.
    allowMixedContent: false,
    backgroundColor: "#ffffff",
  },
}

export default config

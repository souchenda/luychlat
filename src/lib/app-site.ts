/**
 * The app's identity defaults — a plain module (no "use client"), so server code (the Telegram bot,
 * API routes) reads the real values. A "use client" module imported on the server turns into a
 * client reference: DEFAULT_ABOUT.website was `undefined` there, and every bot button built from it
 * ("undefined/transactions") made Telegram refuse the whole message (11/10/2026).
 */

/** The public address of the app (bot buttons and links). */
export const SITE_URL = "https://luy.ibmserp.com"

export type AboutInfo = {
  /** "Powered by: …" */
  developer: string
  /** Founders & developers, one per line, e.g. "Sou Chenda — Founder". */
  credits: string
  mission_km: string
  mission_en: string
  website: string
  email: string
  facebook: string
}

export const DEFAULT_ABOUT: AboutInfo = {
  developer: "iBMS",
  credits: "",
  mission_km: "កម្មវិធីគ្រប់គ្រងហិរញ្ញវត្ថុ និងបំណុលឆ្លាតវៃ សម្រាប់ប្រជាជនកម្ពុជា។",
  mission_en: "A smart money and debt manager made for the people of Cambodia.",
  website: SITE_URL,
  email: "",
  facebook: "",
}

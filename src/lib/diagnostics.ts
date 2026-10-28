// Seeing what the person sees (founder, 28/10/2026 — «I stand in front and read 6, they stand behind and read 9»): the
// app records each person's version and phone (public.client_reports) and the errors their phone meets
// (public.client_errors), and gives them a support code to read out — so a problem is never discussed blind. Never a
// balance, an amount or a name: only the version, the device and the app's settings. Pure (diagnostics.test.ts).

import { describeDevice, type DeviceKind } from "@/lib/sessions"

export type DeviceInfo = {
  os: string
  browser: string
  kind: DeviceKind
  /** CSS pixels, «393×852». */
  screen: string
  dpr: number
  /** The root font size in px: 16 is the default; a bigger phone font setting raises it. */
  font: number
  dark: boolean
  /** Installed (APK or home-screen app) rather than a browser tab. */
  app: boolean
  lang: string
  workspace: "PERSONAL" | "BUSINESS" | "FAMILY" | null
  islamic: boolean
}

export type DeviceEnv = {
  ua: string
  width: number
  height: number
  dpr: number
  rootFontPx: number
  dark: boolean
  standalone: boolean
  lang: string
  workspace: DeviceInfo["workspace"]
  islamic: boolean
}

export function deviceInfo(env: DeviceEnv): DeviceInfo {
  const d = describeDevice(env.ua)
  return {
    os: d.os,
    browser: d.browser,
    kind: d.kind,
    screen: `${Math.round(env.width)}×${Math.round(env.height)}`,
    dpr: Math.round(env.dpr * 100) / 100,
    font: Math.round(env.rootFontPx * 10) / 10,
    dark: env.dark,
    app: env.standalone,
    lang: env.lang,
    workspace: env.workspace,
    islamic: env.islamic,
  }
}

/** «LC-7F3K2A»: the first 6 characters of the account id — read out on the phone, found in Admin › Customers. */
export function supportCode(userId: string | null | undefined): string | null {
  const hex = (userId ?? "").replace(/-/g, "").slice(0, 6)
  return /^[0-9a-f]{6}$/i.test(hex) ? `LC-${hex.toUpperCase()}` : null
}

/** «LC-7F3K2A», «lc7f3k2a», «7F3K2A» → «7f3k2a» (the id prefix to search), else null. */
export function parseSupportCode(input: string): string | null {
  const m = /^\s*(?:lc-?)?([0-9a-f]{6})\s*$/i.exec(input)
  return m ? m[1].toLowerCase() : null
}

/** The build id is the build's time (next.config.ts): «28/10 08:40» in Cambodia time; anything else as it is. */
export function buildLabel(build: string | null | undefined): string {
  if (!build) return "?"
  if (!/^\d{13}$/.test(build)) return build.slice(0, 16)
  const d = new Date(Number(build) + 7 * 3_600_000)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

/** Running an older build than the live one (both known). */
export function isOutdated(build: string | null | undefined, live: string | null | undefined): boolean {
  if (!build || !live || !/^\d{13}$/.test(build) || !/^\d{13}$/.test(live)) return false
  return Number(build) < Number(live)
}

/** One line for a person's setup: «SM-S921B · Chrome · 384×832 @3x · font 18 · dark · app · km · BUSINESS · Islamic». */
export function deviceLine(d: Partial<DeviceInfo> | null | undefined): string {
  if (!d) return "?"
  return [
    d.os,
    d.browser,
    d.screen && `${d.screen}${d.dpr ? ` @${d.dpr}x` : ""}`,
    d.font && d.font !== 16 ? `font ${d.font}` : null,
    d.dark ? "dark" : null,
    d.app ? "app" : "browser",
    d.lang,
    d.workspace,
    d.islamic ? "Islamic" : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

/** The text a person copies for support: the code, the version and the setup — nothing about their money. */
export function supportText(o: { code: string | null; build: string | null; apk: string | null; device: DeviceInfo }): string {
  return [`${o.code ?? "LC-?"}`, `Build ${buildLabel(o.build)}${o.apk ? ` · APK ${o.apk}` : ""}`, deviceLine(o.device)].join("\n")
}

// ── Errors met on a phone ──────────────────────────────────────────────────────────────────────────────────────────

/** Noise every web app sees (a lost connection, browser extensions, a resize warning): never recorded. */
export function ignoredError(message: string | null | undefined): boolean {
  const m = (message ?? "").trim()
  if (!m) return true
  return /ResizeObserver loop|^Script error\.?$|Non-Error promise rejection|extension:\/\/|AbortError|The user aborted|aborted a request|^(TypeError: )?(Failed to fetch|Load failed|NetworkError[^\n]*)$|Network request failed/i.test(m)
}

/** No personal data in an error: long numbers (amounts, phones, accounts) and e-mail addresses masked, at most 300 characters. */
export function cleanErrorMessage(message: string): string {
  return message
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<email>")
    .replace(/\d[\d,.\s]{3,}\d/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300)
}

/** The page without its query and with ids collapsed: «/wallets/:id» (the same error on any wallet groups together). */
export function cleanPage(pathname: string): string {
  return pathname
    .split("?")[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/\d{3,}(?=\/|$)/g, "/:n")
    .slice(0, 120)
}

/** Per page session: each message once, at most this many in all — a loop never floods the table. */
export const ERRORS_PER_SESSION = 10

export function shouldReportError(message: string, sent: Set<string>): boolean {
  if (ignoredError(message)) return false
  if (sent.size >= ERRORS_PER_SESSION) return false
  return !sent.has(cleanErrorMessage(message))
}

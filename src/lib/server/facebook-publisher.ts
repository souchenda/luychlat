/**
 * Facebook Page mirror of the 07:00 community post (founder, 12/10/2026): the same poster as a photo
 * post, through Meta's official Graph API with the Page's own access token only.
 *
 * Off until both FB_PAGE_ID and FB_PAGE_ACCESS_TOKEN are set (server-only, never NEXT_PUBLIC_, never
 * in chat or git — the founder enters them on the Droplet console). Telegram never waits on it: every
 * failure is caught and logged. The token travels in the POST body (never in a URL, so never in a
 * log), and every message we log is scrubbed of it.
 */
import type { FounderApproval } from "@/lib/server/channel"
import { morningQuote } from "@/lib/morning"

export const GRAPH_VERSION = "v21.0"
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`

export type FacebookConfig = { pageId: string; token: string }
export type FacebookResult =
  | { ok: true; postId: string; attempts: number }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; error: string; attempts: number; retryable: boolean }

type Deps = {
  fetch: typeof fetch
  sleep: (ms: number) => Promise<void>
  env: Record<string, string | undefined>
}
const defaultDeps = (): Deps => ({ fetch: globalThis.fetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), env: process.env })

/** The Page's id and token from the environment, or null (the feature stays off). */
export function facebookConfig(env: Record<string, string | undefined> = process.env): FacebookConfig | null {
  const pageId = env.FB_PAGE_ID?.trim()
  const token = env.FB_PAGE_ACCESS_TOKEN?.trim()
  if (!pageId || !token || !/^\d{5,25}$/.test(pageId)) return null
  return { pageId, token }
}

/** The morning caption — plain text (Facebook has no HTML), the day's quote, a link and the hashtags. */
export function facebookMorningCaption(day: string): string {
  return [
    "☀️ អរុណសួស្តីថ្ងៃថ្មី · ថាមពលហិរញ្ញវត្ថុ",
    "",
    `«${morningQuote(day)}»`,
    "",
    "📱 កត់ត្រាចំណូល-ចំណាយជាមួយ អេប លុយឆ្លាត · https://app.luychlat.com",
    "",
    "#អេបលុយឆ្លាត #AppLuyChlat #លុយឆ្លាត #ហិរញ្ញវត្ថុផ្ទាល់ខ្លួន #Cambodia",
  ].join("\n")
}

/** Never let the token reach a log line. */
export const redact = (text: string, token: string) => (token ? text.split(token).join("[token]") : text).replace(/access_token=[^&\s"]+/g, "access_token=[token]")

// Graph error codes worth another try: temporary / throttling (1, 2, 4, 17, 32, 341, 368 is a block — not retried).
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341])
const BACKOFF_MS = [2_000, 6_000]

type GraphError = { message?: string; code?: number; error_subcode?: number; type?: string }

/**
 * Which posts reach the public Page (founder, 12/10/2026): curated, never a blind mirror of Telegram.
 * The 07:00 poster, the holiday notes and the Saturday spotlight yes; the 20:00 nightly reminder never; a new fuel notice only
 * when EA92 or diesel actually changed against the previous period (unknown previous = no post).
 */
export type FuelPair = { regular: number; diesel: number }
export type ChannelPostKind =
  | { kind: "morning" }
  | { kind: "holiday" }
  | { kind: "spotlight" }
  | { kind: "evening" }
  /** The Tuesday / Friday money dilemma: a conversation starter — Page and channel. */
  | { kind: "dilemma" }
  /** The Buddhist Sil day poster (07:00 on the day, founder 19/10/2026): the community channel and the Page. */
  | { kind: "silday" }
  | { kind: "fuel"; now: FuelPair; previous: FuelPair | null }

export function shouldPublishToFacebook(post: ChannelPostKind): boolean {
  switch (post.kind) {
    case "morning":
    case "holiday":
    case "spotlight":
    case "dilemma":
    case "silday":
      return true
    case "evening":
      return false
    case "fuel":
      return post.previous !== null && (post.now.regular !== post.previous.regular || post.now.diesel !== post.previous.diesel)
  }
}

const signedRiel = (delta: number) => `${delta > 0 ? "+" : "-"}${new Intl.NumberFormat("en-US").format(Math.abs(delta))}៛`
const move = (label: string, now: number, before: number) =>
  now === before ? `${label}នៅដដែល` : `${label}${now > before ? "ឡើង" : "ចុះ"} ${signedRiel(now - before)} ${now > before ? "▲" : "▼"}`

/** «⛽ តម្លៃប្រេងសាំងថ្មី៖ សាំងធម្មតាចុះ -100៛ ▼ | ម៉ាស៊ូតឡើង +50៛ ▲» — the change first, then the new prices. */
export function facebookFuelCaption(o: { now: FuelPair & { super?: number | null }; previous: FuelPair; period: string; sourceUrl: string }): string {
  const price = (n: number) => `${new Intl.NumberFormat("en-US").format(n)}៛/លីត្រ`
  return [
    `⛽ តម្លៃប្រេងសាំងថ្មី៖ ${move("សាំងធម្មតា", o.now.regular, o.previous.regular)} | ${move("ម៉ាស៊ូត", o.now.diesel, o.previous.diesel)}`,
    "",
    `📅 ${o.period} (អនុវត្តចាប់ពីម៉ោង ១ រសៀល)`,
    `• សាំងធម្មតា (EA92) ៖ ${price(o.now.regular)}`,
    ...(o.now.super ? [`• សាំងស៊ុបពែរ (EA95) ៖ ${price(o.now.super)}`] : []),
    `• ប្រេងម៉ាស៊ូត (Diesel) ៖ ${price(o.now.diesel)}`,
    "",
    `ℹ️ ប្រភព៖ សេចក្តីជូនដំណឹងក្រសួងពាណិជ្ជកម្ម · ${o.sourceUrl}`,
    "📱 តាមដានចំណាយធ្វើដំណើរជាមួយ អេប លុយឆ្លាត · https://app.luychlat.com",
    "",
    "#តម្លៃប្រេង #អេបលុយឆ្លាត #AppLuyChlat #Cambodia",
  ].join("\n")
}

/** A holiday note as a Page post (plain text). */
export function facebookHolidayMessage(title: string, body: string): string {
  return [title, "", body, "", "— អេប លុយឆ្លាត · https://app.luychlat.com", "", "#អេបលុយឆ្លាត #AppLuyChlat #ថ្ងៃឈប់សម្រាក"].join("\n")
}

/** A photo post (the 07:00 poster). */
/** A photo post on the Page — only with the founder's approval (lib/server/channel.ts). */
export function publishPhotoToFacebook(_approval: FounderApproval, png: Buffer, caption: string, deps: Partial<Deps> = {}): Promise<FacebookResult> {
  return postToPage(
    "photos",
    (form) => {
      form.set("source", new Blob([new Uint8Array(png)], { type: "image/png" }), "luychlat-morning.png")
      form.set("caption", caption)
      form.set("published", "true")
    },
    deps,
  )
}

/** A text post (a holiday note, a fuel price change). */
/** A text post on the Page — only with the founder's approval (lib/server/channel.ts). */
export function publishTextToFacebook(_approval: FounderApproval, message: string, deps: Partial<Deps> = {}): Promise<FacebookResult> {
  return postToPage("feed", (form) => form.set("message", message), deps)
}

/**
 * Removes a Page post — only with the founder's approval: the old version of a replaced post (REPLACE OLD WITH NEW,
 * founder 20/10/2026). True when Facebook confirms it.
 */
export async function deleteFacebookPost(_approval: FounderApproval, postId: string, deps: Partial<Deps> = {}): Promise<boolean> {
  const d = { ...defaultDeps(), ...deps }
  const cfg = facebookConfig(d.env)
  if (!cfg || !/^[0-9_]+$/.test(postId)) return false
  try {
    const res = await d.fetch(`${GRAPH}/${postId}`, { method: "DELETE", headers: { Authorization: `Bearer ${cfg.token}` }, signal: AbortSignal.timeout(20_000) })
    const body = (await res.json().catch(() => ({}))) as { success?: boolean }
    return res.ok && body.success === true
  } catch {
    return false
  }
}

/** Run a Page post and log its outcome; never throws. */
export async function publishLogged(label: string, send: () => Promise<FacebookResult>, log: (level: "info" | "error", message: string, fold?: boolean) => void) {
  try {
    const res = await send()
    if (res.ok) log("info", `Facebook ${label} published (${res.postId}${res.attempts > 1 ? `, attempt ${res.attempts}` : ""})`)
    else if (res.skipped) log("info", `Facebook ${label} skipped: ${res.reason}`, true)
    else log("error", `Facebook ${label} failed after ${res.attempts} attempt(s): ${res.error}`)
    return res
  } catch (e) {
    log("error", `Facebook ${label} crashed: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

/** One Graph POST to the Page, with up to 3 attempts on network errors, 5xx, 429 and Graph's temporary codes. */
async function postToPage(edge: "photos" | "feed", fill: (form: FormData) => void, deps: Partial<Deps>): Promise<FacebookResult> {
  const d = { ...defaultDeps(), ...deps }
  const cfg = facebookConfig(d.env)
  if (!cfg) return { ok: false, skipped: true, reason: "FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN not set" }

  let last: { error: string; retryable: boolean } = { error: "not sent", retryable: false }
  for (let attempt = 1; attempt <= BACKOFF_MS.length + 1; attempt++) {
    const form = new FormData()
    fill(form)
    form.set("access_token", cfg.token)
    try {
      const res = await d.fetch(`${GRAPH}/${cfg.pageId}/${edge}`, { method: "POST", body: form, signal: AbortSignal.timeout(30_000) })
      const body = (await res.json().catch(() => ({}))) as { id?: string; post_id?: string; error?: GraphError }
      if (res.ok && (body.post_id || body.id)) return { ok: true, postId: String(body.post_id ?? body.id), attempts: attempt }
      const code = body.error?.code
      const retryable = res.status >= 500 || res.status === 429 || (code !== undefined && TRANSIENT_CODES.has(code))
      last = { error: redact(`HTTP ${res.status}${code !== undefined ? ` · code ${code}` : ""}: ${body.error?.message ?? "no post id"}`, cfg.token), retryable }
    } catch (e) {
      last = { error: redact(`network: ${e instanceof Error ? e.message : String(e)}`, cfg.token), retryable: true }
    }
    if (!last.retryable || attempt > BACKOFF_MS.length) return { ok: false, ...last, attempts: attempt }
    await d.sleep(BACKOFF_MS[attempt - 1])
  }
  return { ok: false, ...last, attempts: BACKOFF_MS.length + 1 }
}

/** Read-only token check for the admin script: the Page's name, or why it failed. Posts nothing. */
export async function checkFacebookPage(deps: Partial<Deps> = {}): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const d = { ...defaultDeps(), ...deps }
  const cfg = facebookConfig(d.env)
  if (!cfg) return { ok: false, error: "FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN not set (FB_PAGE_ID must be the numeric Page id)" }
  try {
    const res = await d.fetch(`${GRAPH}/${cfg.pageId}?fields=name`, { headers: { Authorization: `Bearer ${cfg.token}` }, signal: AbortSignal.timeout(15_000) })
    const body = (await res.json().catch(() => ({}))) as { name?: string; error?: GraphError }
    return res.ok && body.name ? { ok: true, name: body.name } : { ok: false, error: redact(`HTTP ${res.status}: ${body.error?.message ?? "no name"}`, cfg.token) }
  } catch (e) {
    return { ok: false, error: redact(`network: ${e instanceof Error ? e.message : String(e)}`, cfg.token) }
  }
}

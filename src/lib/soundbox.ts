/**
 * SoundBox: a customer's KHQR payment announced on the cashier screen (/soundbox) — what is spoken
 * (Khmer, English, Chinese, or Khmer followed by English / Chinese), the amount as shown, which
 * payments are announced at all, and the screen kept awake. Pure (soundbox.test.ts); the audio is
 * src/lib/soundbox-audio.ts, the live events public.soundbox_events.
 */

export type VoiceLang = "km" | "en" | "zh"
/** What the SoundBox speaks: one language, or Khmer then English / Chinese. */
export type SoundboxMode = VoiceLang | "km+en" | "km+zh"
export const SOUNDBOX_MODES: SoundboxMode[] = ["km", "en", "zh", "km+en", "km+zh"]

export type SoundboxEvent = {
  id: string
  amount: number
  currency: "KHR" | "USD"
  account_name: string
  payer: string | null
  payer_bank?: string | null
  transaction_time: string
  workspace_id?: string
  created_at?: string
}

/**
 * Which /api/khqr/ingest results are announced: a recorded customer payment only ("ok") — never an
 * own-account transfer ("transfer"), a duplicate, or anything refused. (The database checks again:
 * INCOME, a bank reference, the Sales category.)
 */
export const shouldEmit = (status: string | undefined) => status === "ok"

const DIGITS = ["សូន្យ", "មួយ", "ពីរ", "បី", "បួន", "ប្រាំ", "ប្រាំមួយ", "ប្រាំពីរ", "ប្រាំបី", "ប្រាំបួន"]
const TENS = ["", "ដប់", "ម្ភៃ", "សាមសិប", "សែសិប", "ហាសិប", "ហុកសិប", "ចិតសិប", "ប៉ែតសិប", "កៅសិប"]
// Spoken Khmer counts in ten-thousands (ម៉ឺន) and hundred-thousands (សែន): 50,000 is ប្រាំម៉ឺន.
const UNITS: [number, string][] = [
  [100_000, "សែន"],
  [10_000, "ម៉ឺន"],
  [1_000, "ពាន់"],
  [100, "រយ"],
]

/** A whole number in Khmer words: 20,000 → ពីរម៉ឺន, 125,000 → មួយសែនពីរម៉ឺនប្រាំពាន់, 1,500,000 → មួយលានប្រាំសែន. */
export function khmerNumber(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return DIGITS[0]
  if (n >= 1_000_000) {
    const rest = n % 1_000_000
    return `${khmerNumber(Math.floor(n / 1_000_000))}លាន${rest ? khmerNumber(rest) : ""}`
  }
  for (const [size, word] of UNITS) {
    if (n >= size) {
      const rest = n % size
      return `${DIGITS[Math.floor(n / size)]}${word}${rest ? khmerNumber(rest) : ""}`
    }
  }
  if (n >= 10) return `${TENS[Math.floor(n / 10)]}${n % 10 ? DIGITS[n % 10] : ""}`
  return DIGITS[n]
}

const cents = (amount: number) => Math.round((amount - Math.floor(amount)) * 100)

/**
 * The pre-recorded Khmer clips (public/audio/soundbox/khmer/<name>.mp3) — iPhones ship no Khmer
 * voice, so Khmer is spoken by joining these instead of speech synthesis.
 */
export const KHMER_CLIPS = [
  "received",
  ..."123456789".split(""),
  ...["10", "20", "30", "40", "50", "60", "70", "80", "90"],
  "roy",
  "poan",
  "meun",
  "saen",
  "lean",
  "riel",
  "dollar",
  "cent",
] as const
export type KhmerClip = (typeof KHMER_CLIPS)[number]

const CLIP_UNITS: [number, KhmerClip][] = [
  [100_000, "saen"],
  [10_000, "meun"],
  [1_000, "poan"],
  [100, "roy"],
]

/** A whole number as clips, the same counting as khmerNumber: 20,000 → [2, meun], 125 → [1, roy, 20, 5]. */
export function khmerNumberClips(n: number): KhmerClip[] {
  n = Math.floor(Math.abs(n))
  if (n === 0) return []
  if (n >= 1_000_000) return [...khmerNumberClips(Math.floor(n / 1_000_000)), "lean", ...khmerNumberClips(n % 1_000_000)]
  for (const [size, clip] of CLIP_UNITS) if (n >= size) return [String(Math.floor(n / size)) as KhmerClip, clip, ...khmerNumberClips(n % size)]
  if (n >= 10) return [String(Math.floor(n / 10) * 10) as KhmerClip, ...(n % 10 ? [String(n % 10) as KhmerClip] : [])]
  return [String(n) as KhmerClip]
}

/**
 * «ទទួលបានប្រាក់ … រៀល / ដុល្លារ … សេន» as the clips to play in order:
 * 20,000 ៛ → [received, 2, meun, riel]; $5.50 → [received, 5, dollar, 50, cent].
 */
export function khmerClipSequence(amount: number, currency: "KHR" | "USD"): KhmerClip[] {
  if (currency === "KHR") return ["received", ...khmerNumberClips(Math.round(amount)), "riel"]
  const dollars = Math.floor(amount)
  const c = cents(amount)
  return ["received", ...(dollars ? [...khmerNumberClips(dollars), "dollar" as const] : []), ...(c ? [...khmerNumberClips(c), "cent" as const] : [])]
}

const ZH_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"]
const ZH_PLACES = ["千", "百", "十", ""]

/** 0–9999 in Chinese (no leading 零): 5500 → 五千五百, 1005 → 一千零五, 2000 → 两千. */
function zhSection(n: number): string {
  const digits = String(n).padStart(4, "0").split("").map(Number)
  let out = ""
  let gap = false
  digits.forEach((d, i) => {
    if (d === 0) {
      gap = out !== ""
      return
    }
    if (gap) out += "零"
    gap = false
    // 两 before 千 / 百 when it leads (两千, 两百), as spoken.
    out += (d === 2 && out === "" && i < 2 ? "两" : ZH_DIGITS[d]) + ZH_PLACES[i]
  })
  return out
}

/**
 * A whole number in Chinese, grouped in 万 / 亿 as spoken: 50,000 → 五万, 125,500 → 十二万五千五百,
 * 1,500,000 → 一百五十万, 20,000 → 两万, 10,050 → 一万零五十, 15 → 十五.
 */
export function chineseNumber(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return ZH_DIGITS[0]
  const groups: [number, string][] = [
    [Math.floor(n / 100_000_000), "亿"],
    [Math.floor((n % 100_000_000) / 10_000), "万"],
    [n % 10_000, ""],
  ]
  let out = ""
  let pendingZero = false
  for (const [value, unit] of groups) {
    if (value === 0) {
      pendingZero = out !== ""
      continue
    }
    // A gap inside the number (一万零五十), or a group below a thousand after a higher one.
    if (out !== "" && (pendingZero || value < 1000)) out += "零"
    pendingZero = false
    out += (value === 2 && unit ? "两" : zhSection(value)) + unit
  }
  // 一十… is said 十… (十五, 十二万).
  return out.startsWith("一十") ? out.slice(1) : out
}

/** Dollars in Chinese as a decimal: 5.5 → 五点五, 5.05 → 五点零五, 12 → 十二, 0.75 → 零点七五. */
function chineseDecimal(amount: number): string {
  const [whole, frac = ""] = amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").split(".")
  return frac ? `${chineseNumber(Number(whole))}点${frac.split("").map((d) => ZH_DIGITS[Number(d)]).join("")}` : chineseNumber(Number(whole))
}

/**
 * The amount as spoken: «ប្រាំម៉ឺនរៀល» / «ប្រាំដុល្លារ ហាសិបសេន»; «50,000 riel» / «5 dollars and 50 cents»;
 * «五万瑞尔» / «五点五美元» (Chinese numerals, as Chinese payment speakers say them).
 */
export function spokenAmount(amount: number, currency: "KHR" | "USD", lang: VoiceLang): string {
  if (currency === "KHR") {
    const riel = Math.round(amount)
    if (lang === "km") return `${khmerNumber(riel)}រៀល`
    return lang === "zh" ? `${chineseNumber(riel)}瑞尔` : `${riel.toLocaleString("en-US")} riel`
  }
  const dollars = Math.floor(amount)
  const c = cents(amount)
  if (lang === "km") return [dollars ? `${khmerNumber(dollars)}ដុល្លារ` : null, c ? `${khmerNumber(c)}សេន` : null].filter(Boolean).join(" ") || "សូន្យដុល្លារ"
  if (lang === "zh") return `${chineseDecimal(amount)}美元`
  const d = dollars ? `${dollars.toLocaleString("en-US")} dollar${dollars === 1 ? "" : "s"}` : null
  const s = c ? `${c} cent${c === 1 ? "" : "s"}` : null
  return [d, s].filter(Boolean).join(" and ") || "0 dollars"
}

/** What is said in one language: «ទទួលបានប្រាក់ ប្រាំម៉ឺនរៀល» / «Received 50,000 riel» / «收款五万瑞尔». */
export function announcementText(e: Pick<SoundboxEvent, "amount" | "currency">, lang: VoiceLang): string {
  const amount = spokenAmount(e.amount, e.currency, lang)
  return lang === "km" ? `ទទួលបានប្រាក់ ${amount}` : lang === "zh" ? `收款${amount}` : `Received ${amount}`
}

/** The voice language codes asked of the device. */
export const VOICE_TAGS: Record<VoiceLang, string> = { km: "km-KH", en: "en-US", zh: "zh-CN" }

/** The amount on screen: «+50,000 ៛», «+$12.50». */
export const shownAmount = (amount: number, currency: "KHR" | "USD") =>
  currency === "KHR" ? `+${Math.round(amount).toLocaleString("en-US")} ៛` : `+$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export type AudioStep = "chime" | "melody" | `speech:${VoiceLang}`

/**
 * What plays for a payment: nothing while the sound is off or not yet unlocked by a tap (browsers
 * block audio until then). Otherwise the payment chime, then each language of the mode the device
 * has a voice for, in order. A missing Khmer voice is replaced by English (once); when nothing can
 * be spoken, a short melody instead of silence.
 */
export function audioPlan(o: { soundOn: boolean; unlocked: boolean; mode: SoundboxMode; voices: Partial<Record<VoiceLang, boolean>> }): AudioStep[] {
  if (!o.soundOn || !o.unlocked) return []
  const wanted = o.mode.split("+") as VoiceLang[]
  const spoken: VoiceLang[] = []
  for (const lang of wanted) {
    const use = o.voices[lang] ? lang : lang === "km" && o.voices.en ? "en" : null
    if (use && !spoken.includes(use)) spoken.push(use)
  }
  return ["chime", ...(spoken.length ? spoken.map((l) => `speech:${l}` as AudioStep) : (["melody"] as AudioStep[]))]
}

/** Today's receipts (Cambodia day), per currency. */
export function todayTotals(events: Pick<SoundboxEvent, "amount" | "currency" | "transaction_time">[], today: string) {
  const day = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10)
  const mine = events.filter((e) => day(e.transaction_time) === today)
  const sum = (c: "KHR" | "USD") => mine.filter((e) => e.currency === c).reduce((a, e) => a + Number(e.amount), 0)
  return { count: mine.length, khr: Math.round(sum("KHR")), usd: Math.round(sum("USD") * 100) / 100 }
}

/**
 * A Realtime row → the event (Postgres numerics arrive as strings), added newest first; the same
 * payment twice (a reconnect replays it) is kept once.
 */
export function receiveEvent(list: SoundboxEvent[], row: Record<string, unknown>): { list: SoundboxEvent[]; added: SoundboxEvent | null } {
  const amount = Number(row.amount)
  const currency = row.currency === "USD" ? "USD" : row.currency === "KHR" ? "KHR" : null
  if (typeof row.id !== "string" || !(amount > 0) || !currency || typeof row.transaction_time !== "string") return { list, added: null }
  if (list.some((e) => e.id === row.id)) return { list, added: null }
  const e: SoundboxEvent = {
    id: row.id,
    amount,
    currency,
    account_name: typeof row.account_name === "string" ? row.account_name : "",
    payer: typeof row.payer === "string" ? row.payer : null,
    payer_bank: typeof row.payer_bank === "string" ? row.payer_bank : null,
    transaction_time: row.transaction_time,
    ...(typeof row.workspace_id === "string" ? { workspace_id: row.workspace_id } : {}),
    ...(typeof row.created_at === "string" ? { created_at: row.created_at } : {}),
  }
  return { list: [e, ...list], added: e }
}

type Sentinel = { release: () => Promise<void> }
type WakeNavigator = { wakeLock?: { request: (type: "screen") => Promise<Sentinel> } }
type WakeDocument = { visibilityState: string; addEventListener: (t: "visibilitychange", f: () => void) => void; removeEventListener: (t: "visibilitychange", f: () => void) => void }

/**
 * Keeps the counter screen on: a screen wake lock now, taken again whenever the page becomes visible
 * (the browser drops it when the tab is hidden). Returns the stop function; a browser without the
 * API (or one that refuses) simply doesn't lock.
 */
export function keepScreenAwake(nav: WakeNavigator, doc: WakeDocument): () => void {
  let lock: Sentinel | null = null
  let stopped = false
  const take = () => {
    if (stopped || !nav.wakeLock) return
    void nav.wakeLock
      .request("screen")
      .then((l) => {
        if (stopped) void l.release().catch(() => null)
        else lock = l
      })
      .catch(() => null)
  }
  const onShow = () => {
    if (doc.visibilityState === "visible") take()
  }
  take()
  doc.addEventListener("visibilitychange", onShow)
  return () => {
    stopped = true
    doc.removeEventListener("visibilitychange", onShow)
    void lock?.release().catch(() => null)
    lock = null
  }
}

/** A payment found by the backup check (the live connection dropped): announced only if it is fresh. */
export const LATE_WINDOW_MS = 5 * 60_000
export const announceLate = (createdAt: string | undefined, now: number) => Boolean(createdAt) && now - Date.parse(createdAt!) <= LATE_WINDOW_MS

/** Where the backup check resumes: the newest event seen (by when it was recorded), else now. */
export function pollSince(events: Pick<SoundboxEvent, "created_at">[], now: number): string {
  const newest = events.map((e) => e.created_at).filter((c): c is string => Boolean(c)).sort().at(-1)
  return newest ?? new Date(now).toISOString()
}

/** The workspace whose KHQR codes the counter shows: the one open if it is a business, else the first business. */
export function soundboxWorkspace<T extends { id: string; type: string }>(active: T | undefined, all: T[] | undefined): T | undefined {
  if (active?.type === "BUSINESS") return active
  return all?.find((w) => w.type === "BUSINESS") ?? active
}

/** An MP3 without its ID3 tags (ID3v2 header in front, ID3v1 "TAG" block at the end) — just the audio frames. */
export function mp3Frames(bytes: Uint8Array): Uint8Array {
  let start = 0
  let end = bytes.length
  if (bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    // Syncsafe size (4 × 7 bits), plus a 10-byte footer when flag bit 4 is set.
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f)
    start = Math.min(bytes.length, 10 + size + (bytes[5] & 0x10 ? 10 : 0))
  }
  if (end - start >= 128 && bytes[end - 128] === 0x54 && bytes[end - 127] === 0x41 && bytes[end - 126] === 0x47) end -= 128
  return bytes.subarray(start, end)
}

/**
 * The Khmer clips joined into one MP3 (frames back to back — the clips share one encoding, so the
 * result plays as a single file): the Telegram voice note «ទទួលបានប្រាក់ ប្រាំបីពាន់រៀល».
 */
export function joinMp3(clips: Uint8Array[]): Uint8Array {
  const frames = clips.map(mp3Frames)
  const out = new Uint8Array(frames.reduce((a, f) => a + f.length, 0))
  let at = 0
  for (const f of frames) {
    out.set(f, at)
    at += f.length
  }
  return out
}

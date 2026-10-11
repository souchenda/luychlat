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
 * The amount as spoken: «ប្រាំម៉ឺនរៀល» / «ប្រាំដុល្លារ ហាសិបសេន»; «50,000 riel» / «5 dollars and 50 cents»;
 * «50,000 瑞尔» / «5 美元 50 美分» (English and Chinese voices read the digits themselves).
 */
export function spokenAmount(amount: number, currency: "KHR" | "USD", lang: VoiceLang): string {
  if (currency === "KHR") {
    const riel = Math.round(amount)
    if (lang === "km") return `${khmerNumber(riel)}រៀល`
    return lang === "zh" ? `${riel.toLocaleString("en-US")} 瑞尔` : `${riel.toLocaleString("en-US")} riel`
  }
  const dollars = Math.floor(amount)
  const c = cents(amount)
  if (lang === "km") return [dollars ? `${khmerNumber(dollars)}ដុល្លារ` : null, c ? `${khmerNumber(c)}សេន` : null].filter(Boolean).join(" ") || "សូន្យដុល្លារ"
  if (lang === "zh") return [dollars ? `${dollars.toLocaleString("en-US")} 美元` : null, c ? `${c} 美分` : null].filter(Boolean).join(" ") || "0 美元"
  const d = dollars ? `${dollars.toLocaleString("en-US")} dollar${dollars === 1 ? "" : "s"}` : null
  const s = c ? `${c} cent${c === 1 ? "" : "s"}` : null
  return [d, s].filter(Boolean).join(" and ") || "0 dollars"
}

/** What is said in one language: «ទទួលបានប្រាក់ ប្រាំម៉ឺនរៀល» / «Received 50,000 riel» / «收款 50,000 瑞尔». */
export function announcementText(e: Pick<SoundboxEvent, "amount" | "currency">, lang: VoiceLang): string {
  const amount = spokenAmount(e.amount, e.currency, lang)
  return lang === "km" ? `ទទួលបានប្រាក់ ${amount}` : lang === "zh" ? `收款 ${amount}` : `Received ${amount}`
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

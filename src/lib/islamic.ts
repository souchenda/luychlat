/**
 * Islamic finance helpers: Hijri dates, festival greetings, Zakat al-Mal and
 * the hawl (lunar year). Pure functions, covered by tests. The figures follow
 * common guidelines; scholars differ on details (which assets count, gold vs
 * silver Nisab), so the UI always shows a "consult a local scholar" note.
 */

export const NISAB_GOLD_GRAMS = 85
export const NISAB_SILVER_GRAMS = 595
export const ZAKAT_RATE = 0.025
/** A lunar (hawl) year. */
export const HAWL_DAYS = 354

/** Preset keys created when the tools are turned on (see set_islamic_tools). */
export const ISLAMIC_CATEGORY_KEYS = ["zakat", "sadaqah", "waqf", "riba_purification", "bank_interest"] as const
export type IslamicCategoryKey = (typeof ISLAMIC_CATEGORY_KEYS)[number]

// --- Hijri calendar ----------------------------------------------------------------

export const HIJRI_MONTHS = [
  "Muharram",
  "Safar",
  "Rabiʻ al-Awwal",
  "Rabiʻ al-Thani",
  "Jumada al-Ula",
  "Jumada al-Akhirah",
  "Rajab",
  "Shaʻban",
  "Ramadan",
  "Shawwal",
  "Dhu al-Qaʻdah",
  "Dhu al-Hijjah",
]

export type HijriDate = { day: number; month: number; year: number }

let formatter: Intl.DateTimeFormat | null | undefined
function hijriFormatter(): Intl.DateTimeFormat | null {
  if (formatter !== undefined) return formatter
  try {
    const f = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric" })
    formatter = f.resolvedOptions().calendar.startsWith("islamic") ? f : null
  } catch {
    formatter = null
  }
  return formatter
}

/**
 * Umm al-Qura date, shifted by `offsetDays` (−2…+2) so the admin can follow
 * the local moon-sighting announcement. Null if the browser lacks the calendar.
 */
export function toHijri(date: Date, offsetDays = 0): HijriDate | null {
  const f = hijriFormatter()
  if (!f) return null
  const shifted = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offsetDays, 12)
  const parts = Object.fromEntries(f.formatToParts(shifted).map((p) => [p.type, p.value]))
  const day = Number(parts.day)
  const month = Number(parts.month)
  const year = Number(parts.year)
  return Number.isFinite(day) && Number.isFinite(month) && Number.isFinite(year) ? { day, month, year } : null
}

const khmerDigits = (value: string) => value.replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)])

/** Hijri month names in Khmer script, as written by Cambodian Muslims (month 4 = រ៉ាប៊ីអ៊ុលអាឃីរ). */
export const HIJRI_MONTHS_KM = [
  "ម៉ូហារ៉ម",
  "សាហ្វារ",
  "រ៉ាប៊ីអ៊ុលអាវ៉ាល់",
  "រ៉ាប៊ីអ៊ុលអាឃីរ",
  "ជូម៉ាដាល់អ៊ូឡា",
  "ជូម៉ាដាល់អាឃីរ",
  "រ៉ាជាប់",
  "សាអ្បាន",
  "រ៉ាម៉ាឌន",
  "សាវ៉ាល់",
  "ហ្ស៊ុលកាអ៊ីដះ",
  "ហ្ស៊ុលហ៊ីជ្ជះ",
]

/**
 * Khmer: "ថ្ងៃទី២១ ខែរ៉ាប៊ីអ៊ុលអាឃីរ ឆ្នាំ១៤៤៨ មហាម៉ាត់សករាជ (ម.ស.)" (short: "២១ រ៉ាប៊ីអ៊ុលអាឃីរ ១៤៤៨ ម.ស.").
 * English: "21 Rabiʻ al-Thani 1448 AH".
 */
export function formatHijri(h: HijriDate, locale: "km" | "en", opts?: { short?: boolean }): string {
  if (locale === "en") return `${h.day} ${HIJRI_MONTHS[h.month - 1]} ${h.year} AH`
  const day = khmerDigits(String(h.day).padStart(2, "0"))
  const month = HIJRI_MONTHS_KM[h.month - 1]
  const year = khmerDigits(String(h.year))
  return opts?.short ? `${khmerDigits(String(h.day))} ${month} ${year} ម.ស.` : `ថ្ងៃទី${day} ខែ${month} ឆ្នាំ${year} មហាម៉ាត់សករាជ (ម.ស.)`
}

export type IslamicGreeting = "islamic.ramadan" | "islamic.eidFitr" | "islamic.eidAdha" | null

/** Ramadan (month 9), Eid al-Fitr (1–3 Shawwal), Eid al-Adha (10–13 Dhu al-Hijjah). */
export function islamicGreeting(h: HijriDate | null): IslamicGreeting {
  if (!h) return null
  if (h.month === 9) return "islamic.ramadan"
  if (h.month === 10 && h.day <= 3) return "islamic.eidFitr"
  if (h.month === 12 && h.day >= 10 && h.day <= 13) return "islamic.eidAdha"
  return null
}

// --- Zakat al-Mal --------------------------------------------------------------------

export type ZakatInput = {
  /** Cash and bank balances, in USD. */
  cash: number
  goldGrams: number
  /** USD per gram. */
  goldPrice: number | null
  silverPrice: number | null
  basis: "GOLD" | "SILVER"
  /** Money owed to the user that they expect back (optional), in USD. */
  receivables: number
  /** Debts due within 12 months, in USD. */
  shortTermDebts: number
  /** Stocks and crypto at market value (USD), counted like cash. */
  investments?: number
}

export type ZakatResult = {
  goldValue: number
  /** cash + gold + receivables − short-term debts */
  netWealth: number
  /** null when the price needed for the chosen basis is missing. */
  nisab: number | null
  meetsNisab: boolean
  /** 2.5 % of net wealth when it meets Nisab, else 0. */
  zakat: number
}

const cents = (n: number) => Math.round(n * 100) / 100

export function calculateZakat(i: ZakatInput): ZakatResult {
  const goldValue = i.goldPrice ? i.goldGrams * i.goldPrice : 0
  const netWealth = cents(i.cash + goldValue + (i.investments ?? 0) + i.receivables - i.shortTermDebts)
  const price = i.basis === "GOLD" ? i.goldPrice : i.silverPrice
  const nisab = price ? cents((i.basis === "GOLD" ? NISAB_GOLD_GRAMS : NISAB_SILVER_GRAMS) * price) : null
  const meetsNisab = nisab !== null && netWealth > 0 && netWealth >= nisab
  return { goldValue: cents(goldValue), netWealth, nisab, meetsNisab, zakat: meetsNisab ? cents(netWealth * ZAKAT_RATE) : 0 }
}

// --- Hawl -------------------------------------------------------------------------------

const DAY = 86_400_000
const atNoon = (ymd: string) => new Date(`${ymd}T12:00:00`)
const toYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export type HawlStatus = { start: string; due: string; daysLeft: number; progress: number; isDue: boolean }

/** The current hawl from its start date: due 354 days later. */
export function hawlStatus(start: string, today: Date = new Date()): HawlStatus {
  const s = atNoon(start)
  const due = new Date(s.getTime() + HAWL_DAYS * DAY)
  const now = atNoon(toYmd(today))
  const daysLeft = Math.round((due.getTime() - now.getTime()) / DAY)
  const elapsed = HAWL_DAYS - daysLeft
  return {
    start,
    due: toYmd(due),
    daysLeft,
    progress: Math.min(1, Math.max(0, elapsed / HAWL_DAYS)),
    isDue: daysLeft <= 0,
  }
}

/** Purification balance: interest received minus what was already given away. */
export function purificationBalance(interestReceived: number, purified: number): number {
  return Math.max(0, cents(interestReceived - purified))
}

/**
 * The home header's right badge (founder, 18/10/2026). Islamic Mode never shows the Buddhist lunar day or
 * «ថ្ងៃសីល»: its season greeting (Ramadan, the two Eids), else today's Hijri date («🌙 ៧ ជូម៉ាដាល់អ៊ូឡា ១៤៤៨
 * ម.ស.»), else nothing — a browser without the Islamic calendar shows no badge rather than the lunar one.
 * Islamic Mode off: the traditional lunar pill.
 */
export type HeaderBadge = { kind: "lunar" } | { kind: "greeting"; key: Exclude<IslamicGreeting, null> } | { kind: "hijri"; text: string } | { kind: "none" }

export function headerBadge(o: { islamic: boolean; hijri: HijriDate | null; locale: string }): HeaderBadge {
  if (!o.islamic) return { kind: "lunar" }
  const greeting = islamicGreeting(o.hijri)
  if (greeting) return { kind: "greeting", key: greeting }
  if (!o.hijri) return { kind: "none" }
  return { kind: "hijri", text: `🌙 ${formatHijri(o.hijri, o.locale === "km" ? "km" : "en", { short: true })}` }
}

/** The Arabic name shown beside the Khmer one in the Islamic hub (founder, 18/10/2026). */
export const ISLAMIC_ARABIC = {
  prayer: "الصلاة",
  /** The Fajr Adhan's Tathweeb, said twice after «حي على الفلاح» — at Fajr only. */
  tathweeb: "الصَّلَاةُ خَيْرٌ مِنَ النَّوْمِ",
  tasbih: "التسبيح",
  duas: "الدعاء",
  quran: "القرآن",
  nasheed: "قصائد وأناشيد",
  finance: "الزكاة",
  qibla: "القبلة",
  fajr: "الفجر",
  sunrise: "الشروق",
  dhuhr: "الظهر",
  asr: "العصر",
  maghrib: "المغرب",
  isha: "العشاء",
  imsak: "الإمساك",
  iftar: "الإفطار",
} as const

/**
 * The fasting evidence sheet: the two verses are fetched from the Quran reader (/api/quran/2 — the Uthmani
 * text and the official Khmer translation, unmodified); the hadiths are the meaning in Khmer / English with
 * their sunnah.com reference (Bukhari: Fath al-Bari numbering), to be checked with a local Imam.
 */
export const FASTING_VERSES = [
  { aya: 183, topic: "why" as const },
  { aya: 187, topic: "imsakIftar" as const },
]

export const FASTING_HADITHS = [
  {
    source: "Sahih al-Bukhari 1894",
    url: "https://sunnah.com/bukhari:1894",
    title: { km: "ផលបុណ្យគ្មានដែនកំណត់ ដែលអល់ឡោះប្រទានផ្ទាល់", en: "A reward without limit, given by Allah Himself" },
    km: "អល់ឡោះមានបន្ទូលថា៖ «ការតមបួសគឺសម្រាប់យើង ហើយយើងផ្ទាល់ជាអ្នកតបស្នងផលបុណ្យរបស់វា» — អ្នកតមបួសបានលះបង់អាហារ ភេសជ្ជៈ និងតណ្ហារបស់ខ្លួន ដើម្បីអល់ឡោះ។",
    en: "Allah says: «Fasting is for Me, and I Myself will reward it» — the one fasting leaves food, drink and desire for My sake.",
  },
  {
    source: "Sahih al-Bukhari 38",
    url: "https://sunnah.com/bukhari:38",
    title: { km: "អភ័យទោសបាបកម្មពីអតីតកាល", en: "Past sins forgiven" },
    km: "អ្នកណាតមបួសក្នុងខែរ៉ាម៉ាឌន ដោយសេចក្តីជំនឿ និងសង្ឃឹមផលបុណ្យពីអល់ឡោះ បាបកម្មពីអតីតកាលរបស់គេនឹងត្រូវបានអភ័យទោស។",
    en: "Whoever fasts Ramadan out of faith and hoping for Allah's reward will have their past sins forgiven.",
  },
  {
    source: "Sahih al-Bukhari 1896",
    url: "https://sunnah.com/bukhari:1896",
    title: { km: "ទ្វារឋានសួគ៌ពិសេស «អ័ររ៉ាយយ៉ាន (Bab Ar-Rayyan)»", en: "The special gate of Paradise, «Ar-Rayyan»" },
    km: "នៅក្នុងឋានសួគ៌ មានទ្វារមួយឈ្មោះថា អ័ររ៉ាយយ៉ាន សម្រាប់អ្នកតមបួស — នៅថ្ងៃបរលោក ពួកគេចូលតាមទ្វារនោះ ហើយគ្មាននរណាផ្សេងចូលតាមទ្វារនោះឡើយ។",
    en: "In Paradise there is a gate called Ar-Rayyan: on the Day of Resurrection those who fasted enter through it, and no one else enters through it.",
  },
] as const

/**
 * The fasting card's ruling for today (founder, 18/10/2026): Ramadan (month 9) is WAJIB — an obligation;
 * every other month's fasting is SUNNAH — voluntary. Unknown date → null (no badge rather than a guess).
 */
export function fastingRuling(h: HijriDate | null): "wajib" | "sunnah" | null {
  if (!h) return null
  return h.month === 9 ? "wajib" : "sunnah"
}

/** The Sunnah fast's extra reward (founder, 18/10/2026). */
export const SUNNAH_FAST_HADITH = { source: "Sahih al-Bukhari 2840", url: "https://sunnah.com/bukhari:2840" } as const

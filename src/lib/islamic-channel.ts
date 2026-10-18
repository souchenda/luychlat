/**
 * The Islamic community channel (@LuyChlatIslamic, founder, 18/10/2026) — kept 100 % apart from the general
 * channel (@LuyChlatCommunity):
 *   general  market news, fuel prices, Buddhist holy days (ថ្ងៃសីល), the 07:00 poster…
 *   Islamic  the Hijri date with one of the 14 halal-finance lessons (08:00 daily), the Monday / Thursday sunnah
 *            fast reminder (19:00 the evening before) and Jumu'ah (Friday 09:00). Never a holy-day note.
 * Every post is preview-first with the founder's ✅ — the same gate as the general channel (lib/scheduled-posts.ts).
 * Pure (islamic-channel.test.ts).
 */
import { khmerDigits } from "@/lib/dates"
import { formatHijri, type HijriDate } from "@/lib/islamic"
import { ISLAMIC_TIPS, islamicTipOfTheDay } from "@/lib/islamic-tips"
import { formatMinutes, imsakTime, prayerTimes, PROVINCES } from "@/lib/prayer"

export const ISLAMIC_KINDS = ["ISLAMIC_DAILY", "ISLAMIC_FAST", "ISLAMIC_JUMUAH"] as const
export type IslamicKind = (typeof ISLAMIC_KINDS)[number]

export const isIslamicKind = (kind: string): kind is IslamicKind => (ISLAMIC_KINDS as readonly string[]).includes(kind)

/** Which channel a post kind goes to — the only routing rule (a Buddhist holy-day note is never Islamic). */
export const channelFor = (kind: string): "islamic" | "community" => (isIslamicKind(kind) ? "islamic" : "community")

export const ISLAMIC_DAILY_MINUTE = 8 * 60
export const ISLAMIC_FAST_MINUTE = 19 * 60
export const ISLAMIC_JUMUAH_MINUTE = 9 * 60

export const ISLAMIC_COMMUNITY_URL = "https://t.me/LuyChlatIslamic"

/** Weekday (0 = Sunday) of a Cambodian calendar day "YYYY-MM-DD". */
export const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay()

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** The calendar date for the Hijri conversion (noon, so no time zone can move it). */
export const dateOf = (day: string) => {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y, m - 1, d, 12)
}

/**
 * A voluntary fast tomorrow is worth a reminder — unless tomorrow is in Ramadan (already obligatory) or a day
 * on which fasting is forbidden: Eid al-Fitr (1 Shawwal) and Eid al-Adha with the Tashreeq days (10–13 Dhul-Hijjah).
 */
export function sunnahFastTomorrow(tomorrow: HijriDate | null): boolean {
  if (!tomorrow) return false
  if (tomorrow.month === 9) return false
  if (tomorrow.month === 10 && tomorrow.day === 1) return false
  if (tomorrow.month === 12 && tomorrow.day >= 10 && tomorrow.day <= 13) return false
  return true
}

export type IslamicPlan = { kind: IslamicKind; postKey: string; publishMinute: number; payload: Record<string, string> }

/**
 * The Islamic posts whose preview window is open at this Cambodian minute (the same window as the general
 * posts: from 45 min before until 90 min after). `hijriOf` converts a day with the admin's Hijri offset.
 */
export function islamicPlannedPosts(day: string, hijriOf: (day: string) => HijriDate | null, open: (at: number) => boolean): IslamicPlan[] {
  const out: IslamicPlan[] = []
  if (open(ISLAMIC_DAILY_MINUTE)) out.push({ kind: "ISLAMIC_DAILY", postKey: day, publishMinute: ISLAMIC_DAILY_MINUTE, payload: { day } })
  const weekday = weekdayOf(day)
  // Sunday → Monday's fast, Wednesday → Thursday's.
  if ((weekday === 0 || weekday === 3) && open(ISLAMIC_FAST_MINUTE) && sunnahFastTomorrow(hijriOf(addDays(day, 1))))
    out.push({ kind: "ISLAMIC_FAST", postKey: day, publishMinute: ISLAMIC_FAST_MINUTE, payload: { day } })
  if (weekday === 5 && open(ISLAMIC_JUMUAH_MINUTE)) out.push({ kind: "ISLAMIC_JUMUAH", postKey: day, publishMinute: ISLAMIC_JUMUAH_MINUTE, payload: { day } })
  return out
}

// ─── The posts (Telegram HTML; Khmer never in italics) ───────────────────────────────────────────

const SIGN = "— អេប លុយឆ្លាត · សហគមន៍ឥស្លាម"
const KM_WEEKDAY = ["អាទិត្យ", "ច័ន្ទ", "អង្គារ", "ពុធ", "ព្រហស្បតិ៍", "សុក្រ", "សៅរ៍"]
const KM_MONTH = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"]
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** «ថ្ងៃសុក្រ ២៣ តុលា ២០២៦» */
export function kmDay(day: string) {
  const [y, m, d] = day.split("-").map(Number)
  return `ថ្ងៃ${KM_WEEKDAY[weekdayOf(day)]} ${khmerDigits(String(d))} ${KM_MONTH[m - 1]} ${khmerDigits(String(y))}`
}

/** The day number the in-app Islamic tip uses (lib/tips.ts), so the channel and the app show the same lesson. */
export const tipDayNumber = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000)

/**
 * One post's content — the poster (lib/server/islamic-poster.ts) and its caption are drawn from this, so they
 * can never disagree. `fast`: tomorrow's Imsak / Iftar in Phnom Penh (the place is always named).
 */
export type IslamicPostContent = {
  kind: IslamicKind
  /** The gold pill at the top of the poster. */
  pill: string
  /** The Hijri date in full for the caption (the day of the post; for the fast reminder, tomorrow). */
  hijri: string | null
  /** The same, short («៨ ជូម៉ាដាល់អ៊ូឡា ១៤៤៨ ហ.ស.») — one line on the poster. */
  hijriShort: string | null
  /** The Gregorian day, «ថ្ងៃសុក្រ ២៣ តុលា ២០២៦». */
  date: string
  title: string
  paragraphs: string[]
  /** Shorter text for the poster when the caption's would not fit (the caption always has it all). */
  posterParagraphs?: string[]
  source: { label: string; url: string }
  fast?: { imsak: string; iftar: string; place: string }
}

const FAST_PLACE = PROVINCES[0] // ភ្នំពេញ
const kmClockOf = (minutes: number) => khmerDigits(formatMinutes(minutes))

/** Tomorrow's Imsak and Iftar in Phnom Penh, «០៤:២៣» / «១៧:៥៨». */
export function fastTimes(day: string): { imsak: string; iftar: string; place: string } {
  const [y, m, d] = addDays(day, 1).split("-").map(Number)
  const t = prayerTimes({ year: y, month: m, day: d }, FAST_PLACE.lat, FAST_PLACE.lng)
  return { imsak: kmClockOf(imsakTime(t)), iftar: kmClockOf(t.maghrib), place: FAST_PLACE.km }
}

export function islamicPostContent(kind: IslamicKind, day: string, hijri: HijriDate | null, hijriTomorrow: HijriDate | null = null): IslamicPostContent {
  if (kind === "ISLAMIC_FAST") {
    const tomorrow = weekdayOf(day) === 0 ? "ថ្ងៃច័ន្ទ" : "ថ្ងៃព្រហស្បតិ៍"
    return {
      kind,
      pill: "រំលឹកបួសស៊ុណ្ណះ",
      hijri: hijriTomorrow ? formatHijri(hijriTomorrow, "km") : null,
      hijriShort: hijriTomorrow ? formatHijri(hijriTomorrow, "km", { short: true }) : null,
      date: kmDay(addDays(day, 1)),
      title: `ស្អែក${tomorrow} ជាថ្ងៃបួសស៊ុណ្ណះ`,
      paragraphs: [
        "ព្យាការី មូហាំម៉ាត់ ﷺ តែងបួសរៀងរាល់ថ្ងៃច័ន្ទ និងថ្ងៃព្រហស្បតិ៍ ហើយមានប្រសាសន៍ថា អំពើរបស់មនុស្សត្រូវបានបង្ហាញនៅថ្ងៃទាំងពីរនេះ ហើយលោកចង់ឱ្យអំពើរបស់លោកត្រូវបានបង្ហាញ ខណៈលោកកំពុងបួស។",
        "កុំភ្លេចអាហារសាហួរ (Sahur / السَّحُور) មុនពេលអ៊ឹមសាក់ ហើយដាក់នីយ៉ាត់ (Niyyah / النِّيَّة) តាំងពីយប់នេះ។ ការបួសនេះជាស៊ូណាត់ — តាមលទ្ធភាពសុខភាពរបស់អ្នក។",
      ],
      posterParagraphs: [
        "ព្យាការី មូហាំម៉ាត់ ﷺ តែងបួសរៀងរាល់ថ្ងៃច័ន្ទ និងថ្ងៃព្រហស្បតិ៍ ហើយមានប្រសាសន៍ថា អំពើរបស់មនុស្សត្រូវបានបង្ហាញនៅថ្ងៃទាំងពីរនេះ ហើយលោកចង់ឱ្យអំពើរបស់លោកត្រូវបានបង្ហាញ ខណៈលោកកំពុងបួស។",
        "កុំភ្លេចអាហារសាហួរ (السَّحُور) និងនីយ៉ាត់ (النِّيَّة) តាំងពីយប់នេះ។",
      ],
      source: { label: "Jami' at-Tirmidhi 747", url: "https://sunnah.com/tirmidhi:747" },
      fast: fastTimes(day),
    }
  }
  if (kind === "ISLAMIC_JUMUAH") {
    return {
      kind,
      pill: "ជូម៉ាអះ មូបារ៉ក់ (الجُمُعَة)",
      hijri: hijri ? formatHijri(hijri, "km") : null,
      hijriShort: hijri ? formatHijri(hijri, "km", { short: true }) : null,
      date: kmDay(day),
      title: "ជូម៉ាអះ មូបារ៉ក់ — ថ្ងៃសុក្រដ៏មានបារ៉ាកាត់",
      paragraphs: [
        "អល់ឡោះមានបន្ទូលថា ពេលគេអំពាវនាវឱ្យថ្វាយបង្គំជូម៉ាអះ (Jumu'ah / الجُمُعَة) នៅថ្ងៃសុក្រ ចូរប្រញាប់ទៅរំលឹកអល់ឡោះ ហើយទុកការលក់ដូរមួយឡែកសិន។ ក្រោយការថ្វាយបង្គំចប់ ចូរបែកខ្ញែកគ្នាលើផែនដី ហើយស្វែងរកការប្រទានពរពីអល់ឡោះ។",
        "ម្ចាស់ហាង៖ ចូររៀបចំឱ្យមានអ្នកមើលហាង ឬបិទហាងមួយភ្លែតពេលថ្វាយបង្គំជូម៉ាអះ — ប្រាក់ចំណេញក្រោយពេលនោះ ប្រកបដោយបារ៉ាកាត់ (Barakah / بَرَكَة)។",
      ],
      source: { label: "Al-Jumu'ah 62:9–10", url: "https://quran.com/62/9-10" },
    }
  }
  const tip = islamicTipOfTheDay(tipDayNumber(day))
  const lesson = ISLAMIC_TIPS.indexOf(tip) + 1
  return {
    kind,
    pill: `មេរៀនហិរញ្ញវត្ថុហាឡាល់ ${khmerDigits(String(lesson))}/${khmerDigits(String(ISLAMIC_TIPS.length))}`,
    hijri: hijri ? formatHijri(hijri, "km") : null,
    hijriShort: hijri ? formatHijri(hijri, "km", { short: true }) : null,
    date: kmDay(day),
    title: tip.title.km,
    paragraphs: [tip.body.km],
    source: tip.ref,
  }
}

/** The caption under the poster (Telegram HTML, ≤ 1024 characters as a photo caption). */
export function islamicCaptionHtml(c: IslamicPostContent): string {
  const head = c.kind === "ISLAMIC_FAST" ? `🌙 <b>រំលឹក៖ ${esc(c.title)}</b>` : c.kind === "ISLAMIC_JUMUAH" ? `🕌 <b>${esc(c.title)}</b>` : `📗 <b>${esc(c.pill)}៖ ${esc(c.title)}</b>`
  return [
    `🌙 <b>${c.hijri ? esc(c.hijri) : ""}</b>${c.hijri ? " · " : ""}${c.date}`,
    "",
    head,
    ...c.paragraphs.map(esc),
    ...(c.fast ? ["", `⏰ ម៉ោងនៅ${c.fast.place}៖ អ៊ឹមសាក់ (Imsak / الإمساك) ${c.fast.imsak} · ស្រាយបួស (Iftar / الإفطار) ${c.fast.iftar}`] : []),
    "",
    `📖 ប្រភព៖ <a href="${c.source.url}">${esc(c.source.label)}</a>`,
    "",
    SIGN,
  ].join("\n")
}

/** 08:00 — the Hijri date and today's halal-finance lesson (one of the 14), with its exact source. */
export const islamicDailyHtml = (day: string, hijri: HijriDate | null) => islamicCaptionHtml(islamicPostContent("ISLAMIC_DAILY", day, hijri))

/** Sunday / Wednesday 19:00 — tomorrow's sunnah fast (Monday / Thursday), with Imsak and Iftar. */
export const sunnahFastHtml = (day: string, hijriTomorrow: HijriDate | null) => islamicCaptionHtml(islamicPostContent("ISLAMIC_FAST", day, null, hijriTomorrow))

/** Friday 09:00 — Jumu'ah. */
export const jumuahHtml = (day: string, hijri: HijriDate | null) => islamicCaptionHtml(islamicPostContent("ISLAMIC_JUMUAH", day, hijri))

// ─── In-app community link ─────────────────────────────────────────────────────────────────────

/** The «join the community» link: the Islamic channel while Islamic Mode is on, else the configured general one. */
export function communityLink(islamic: boolean, configured: string | null | undefined): { url: string; label: "support.communityIslamic" | "support.community"; hint: "support.communityIslamicHint" | "support.communityHint" } | null {
  if (islamic) return { url: ISLAMIC_COMMUNITY_URL, label: "support.communityIslamic", hint: "support.communityIslamicHint" }
  return configured ? { url: configured, label: "support.community", hint: "support.communityHint" } : null
}

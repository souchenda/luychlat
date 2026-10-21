/**
 * The Islamic community channel (@LuyChlatIslamic, founder, 18/10/2026) — kept 100 % apart from the general
 * channel (@LuyChlatCommunity):
 *   general  market news, fuel prices, Buddhist holy days (ថ្ងៃសីល), the 07:00 poster…
 *   Islamic  the 24-hour lifecycle (founder, 18/10/2026 — ISLAMIC_SCHEDULE below): 05:30 the waking du'a and
 *            the day's prayer times · 08:00 the Hijri date and a halal-finance lesson · Friday 11:30 Jumu'ah
 *            and Surah Al-Kahf · 17:30 the iftar du'a (Monday / Thursday, all of
 *            Ramadan) · Sunday / Wednesday 19:00 tomorrow's sunnah fast · 21:00 the bedtime du'a. Never a
 *            holy-day note.
 * No quiz in the channel (founder, 20/10/2026 — a text teaser without choices read as clickbait): the Islamic Quiz
 * Challenge lives only in the app (/islamic?tab=quiz). The channel carries the market bulletin, the halal-finance
 * lessons and du'as, and official community announcements.
 * Every post is preview-first with the founder's ✅ — the same gate as the general channel (lib/scheduled-posts.ts).
 * Pure (islamic-channel.test.ts).
 */
import { khmerDigits } from "@/lib/dates"
import { formatHijri, type HijriDate } from "@/lib/islamic"
import * as G from "@/lib/islamic/glossary"
import { DUAS, posterMeaning, type Dua } from "@/lib/duas"
import { ISLAMIC_TIPS, islamicTipOfTheDay } from "@/lib/islamic-tips"
import { formatMinutes, imsakTime, prayerTimes, PROVINCES } from "@/lib/prayer"

export const ISLAMIC_KINDS = ["ISLAMIC_MORNING", "ISLAMIC_DAILY", "ISLAMIC_JUMUAH", "ISLAMIC_IFTAR", "ISLAMIC_FAST", "ISLAMIC_NIGHT"] as const
export type IslamicKind = (typeof ISLAMIC_KINDS)[number]

export const isIslamicKind = (kind: string): kind is IslamicKind => (ISLAMIC_KINDS as readonly string[]).includes(kind)

/** Which channel a post kind goes to — the only routing rule (a Buddhist holy-day note is never Islamic). */
export const channelFor = (kind: string): "islamic" | "community" => (isIslamicKind(kind) || kind === "ISLAMIC_BULLETIN" ? "islamic" : "community")

/**
 * The 24-hour schedule (founder, 18/10/2026), minutes after midnight, Cambodia time — locked by
 * tests/golden/islamic-schedule.test.ts. Every slot is previewed to the founder and published only on ✅ / 🚀.
 */
export const ISLAMIC_SCHEDULE = {
  ISLAMIC_MORNING: 5 * 60 + 30, // the waking du'a + the five prayer times (daily)
  ISLAMIC_DAILY: 8 * 60, // the Hijri date + a halal-finance lesson (daily)
  ISLAMIC_JUMUAH: 11 * 60 + 30, // Jumu'ah + Surah Al-Kahf (Friday)
  ISLAMIC_IFTAR: 17 * 60 + 30, // the iftar du'a (fast days: Monday / Thursday, every day of Ramadan)
  ISLAMIC_FAST: 19 * 60, // tomorrow's sunnah fast (Sunday / Wednesday)
  ISLAMIC_NIGHT: 21 * 60, // the bedtime du'a (daily)
} as const satisfies Record<IslamicKindName, number>
type IslamicKindName = "ISLAMIC_MORNING" | "ISLAMIC_DAILY" | "ISLAMIC_JUMUAH" | "ISLAMIC_IFTAR" | "ISLAMIC_FAST" | "ISLAMIC_NIGHT"
/** 05:30 is too early for a 04:45 preview: it is previewed the evening before, from 21:30. */
export const MORNING_PREVIEW_EVENING_MINUTE = 21 * 60 + 30
export const ISLAMIC_DAILY_MINUTE = ISLAMIC_SCHEDULE.ISLAMIC_DAILY
export const ISLAMIC_FAST_MINUTE = ISLAMIC_SCHEDULE.ISLAMIC_FAST
export const ISLAMIC_JUMUAH_MINUTE = ISLAMIC_SCHEDULE.ISLAMIC_JUMUAH

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

/** A day someone fasts: every day of Ramadan, or Monday / Thursday when fasting is allowed (not Eid / Tashreeq). */
export function isFastDay(day: string, hijri: HijriDate | null): boolean {
  if (!hijri) return false
  if (hijri.month === 9) return true
  const weekday = weekdayOf(day)
  return (weekday === 1 || weekday === 4) && sunnahFastTomorrow(hijri)
}

export type IslamicPlan = { kind: IslamicKind; postKey: string; publishMinute: number; payload: Record<string, string> }

/**
 * The Islamic posts whose preview window is open at this Cambodian minute (the same window as the general
 * posts: from 45 min before until 90 min after). `hijriOf` converts a day with the admin's Hijri offset.
 */
export function islamicPlannedPosts(day: string, hijriOf: (day: string) => HijriDate | null, open: (at: number) => boolean, minutes = -1): IslamicPlan[] {
  const out: IslamicPlan[] = []
  const S = ISLAMIC_SCHEDULE
  const plan = (kind: IslamicKind) => out.push({ kind, postKey: day, publishMinute: S[kind], payload: { day } })
  const weekday = weekdayOf(day)
  if (open(S.ISLAMIC_MORNING)) plan("ISLAMIC_MORNING")
  // Tomorrow's 05:30 post, previewed tonight (the founder approves before bed).
  if (minutes >= MORNING_PREVIEW_EVENING_MINUTE) {
    const tomorrow = addDays(day, 1)
    out.push({ kind: "ISLAMIC_MORNING", postKey: tomorrow, publishMinute: 24 * 60 + S.ISLAMIC_MORNING, payload: { day: tomorrow } })
  }
  if (open(S.ISLAMIC_DAILY)) plan("ISLAMIC_DAILY")
  if (weekday === 5 && open(S.ISLAMIC_JUMUAH)) plan("ISLAMIC_JUMUAH")
  if (open(S.ISLAMIC_IFTAR) && isFastDay(day, hijriOf(day))) plan("ISLAMIC_IFTAR")
  // Sunday → Monday's fast, Wednesday → Thursday's.
  if ((weekday === 0 || weekday === 3) && open(S.ISLAMIC_FAST) && sunnahFastTomorrow(hijriOf(addDays(day, 1)))) plan("ISLAMIC_FAST")
  if (open(S.ISLAMIC_NIGHT)) plan("ISLAMIC_NIGHT")
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
  /** The same, short («៨ ជុម៉ាដាល់អូឡា ១៤៤៨ + the Hijri era») — one line on the poster. */
  hijriShort: string | null
  /** The Gregorian day, «ថ្ងៃសុក្រ ២៣ តុលា ២០២៦». */
  date: string
  title: string
  /** The caption's first line when it differs from the poster's title (the fast reminder: «…ស្អែកនេះ…»). */
  lead?: string
  /** The Arabic under the hero title, where the Khmer transliteration is hard to read (Jumu'ah, the fasts, the morning). */
  titleArabic?: string
  paragraphs: string[]
  /** Shorter text for the poster when the caption's would not fit (the caption always has it all). */
  posterParagraphs?: string[]
  /**
   * The poster's hook: one or two short lines, centred and large, instead of paragraphs (founder, 18/10/2026 — a poster
   * is a 3-second hook; the readings, explanations and hadith commentary are in the caption).
   */
  posterLines?: string[]
  /** A hook may take three lines (the Iftar du'a's full meaning, founder 19/10/2026); otherwise two at most. */
  posterHookLines?: 2 | 3
  /** The poster's source when it quotes less than the caption (Al-Jumu'ah 62:9 of 62:9–10). */
  posterSource?: string
  source: { label: string; url: string }
  /** Tomorrow's Imsak / Iftar (`day`: the fast day's name, «ថ្ងៃច័ន្ទ»). */
  fast?: { imsak: string; iftar: string; place: string; day?: string }
  /** A du'a in Arabic, drawn large on the poster. */
  arabic?: string
  /** The day's five prayer times (Phnom Penh), on the poster and in the caption. */
  prayers?: { label: string; time: string }[]
}

/**
 * The poster's dateline: the Gregorian day, then the Hijri day it corresponds to (founder, 18/10/2026):
 * «ថ្ងៃច័ន្ទ ១៩ តុលា ២០២៦ · ត្រូវនឹង ៨ ជុម៉ាដាល់អូឡា ១៤៤៨ ហ.ស.».
 */
export const posterDateline = (c: Pick<IslamicPostContent, "date" | "hijriShort">) =>
  // No parentheses on a graphic (founder, 19/10/2026): «ថ្ងៃច័ន្ទ ១៩ តុលា ២០២៦ · ត្រូវនឹង …».
  c.hijriShort ? `${c.date} · ${G.HIJRI_CORRESPONDS} ${c.hijriShort}` : c.date

/**
 * The call to action above the poster's links (founder, 18/10/2026): the du'a posters of the morning and the night
 * invite to listen to the Quran; the others to the Islamic features and money management.
 */
export const POSTER_CTA = {
  audio: "ចូលស្ដាប់គួរអាន និងគណនាហ្សាកាត់ដោយឥតគិតថ្លៃ",
  general: "ប្រើប្រាស់មុខងារឥស្លាម និងគ្រប់គ្រងលុយកាក់ដោយឥតគិតថ្លៃ",
} as const
export const posterCta = (kind: IslamicKind) => (kind === "ISLAMIC_MORNING" || kind === "ISLAMIC_NIGHT" ? POSTER_CTA.audio : POSTER_CTA.general)

/** A text's first sentence, up to and with its «។» (the whole text when it has one sentence). */
export const firstSentence = (text: string) => {
  const end = text.indexOf("។")
  return end === -1 ? text.trim() : text.slice(0, end + 1).trim()
}

/** The posters' hooks (founder, 18/10/2026) — short; everything else is in the caption. */
export const POSTER_HOOKS = {
  morning: ["អរគុណអល់ឡោះ ដែលបានផ្ដល់ដង្ហើមជីវិតឱ្យយើងជាថ្មី"],
  jumuah: [`ផ្អាកការលក់ដូរមួយភ្លែត ដើម្បីទៅថ្វាយបង្គំ${G.JUMUAH}`, `ប្រាក់ចំណេញក្រោយពេលនោះ ទើបប្រកបដោយ${G.BARAKAH}ពិតប្រាកដ`],
  fast: [`ស្អែកជាថ្ងៃ${G.SUNNAH_FAST} · ថ្ងៃដែលអំពើរបស់មនុស្សត្រូវបានបង្ហាញ`, `កុំភ្លេច${G.SAHUR} និងតាំងចិត្ត${G.NIYYAH}យប់នេះ`],
} as const

const FAST_PLACE = PROVINCES[0] // ភ្នំពេញ
const kmClockOf = (minutes: number) => khmerDigits(formatMinutes(minutes))

/** Tomorrow's Imsak and Iftar in Phnom Penh, «០៤:២៣» / «១៧:៥៨». */
export function fastTimes(day: string): { imsak: string; iftar: string; place: string } {
  const [y, m, d] = addDays(day, 1).split("-").map(Number)
  const t = prayerTimes({ year: y, month: m, day: d }, FAST_PLACE.lat, FAST_PLACE.lng)
  return { imsak: kmClockOf(imsakTime(t)), iftar: kmClockOf(t.maghrib), place: FAST_PLACE.km }
}

/** The day's five prayer times in Phnom Penh, «០៤:៣៣». */
export function dayPrayers(day: string): { label: string; time: string }[] {
  const [y, m, d] = day.split("-").map(Number)
  const t = prayerTimes({ year: y, month: m, day: d }, FAST_PLACE.lat, FAST_PLACE.lng)
  return (["fajr", "dhuhr", "asr", "maghrib", "isha"] as const).map((k) => ({ label: G.PRAYER_NAMES[k], time: kmClockOf(t[k]) }))
}

/** The app's own du'a (lib/duas.ts) — the channel and the app show the same Arabic, reading and meaning. */
const dua = (id: string): Dua => DUAS.find((x) => x.id === id)!
/** «Sahih al-Bukhari 6312» → sunnah.com. */
export function duaSource(label: string): { label: string; url: string } {
  const bukhari = /Sahih al-Bukhari (\d+)/.exec(label)
  if (bukhari) return { label, url: `https://sunnah.com/bukhari:${bukhari[1]}` }
  const abuDawud = /Sunan Abi Dawud (\d+)/.exec(label)
  if (abuDawud) return { label, url: `https://sunnah.com/abudawud:${abuDawud[1]}` }
  return { label, url: "https://sunnah.com" }
}
/** The caption's reading, full meaning and (caption only) background note — the poster takes posterMeaning. */
const duaLines = (x: Dua) => [`អានថា៖ ${x.phonetic}`, `អត្ថន័យ៖ ${x.km}`, ...(x.note ? [`ℹ️ បញ្ជាក់៖ ${x.note}`] : [])]

export function islamicPostContent(kind: IslamicKind, day: string, hijri: HijriDate | null, tomorrowHijri: HijriDate | null = null): IslamicPostContent {
  const dated = { hijri: hijri ? formatHijri(hijri, "km", { khmerDigits: true }) : null, hijriShort: hijri ? formatHijri(hijri, "km", { short: true, khmerDigits: true }) : null, date: kmDay(day) }
  if (kind === "ISLAMIC_MORNING") {
    const wake = dua("wake")
    return {
      kind,
      ...dated,
      pill: "ឌុអាពេលភ្ញាក់ពីដំណេក",
      title: "អរុណសួស្តីថ្ងៃថ្មី",
      titleArabic: G.MORNING_ARABIC,
      lead: "🌅 <b>អរុណសួស្តីថ្ងៃថ្មី — ឌុអាពេលភ្ញាក់ពីដំណេក</b>",
      arabic: wake.arabic,
      paragraphs: [...duaLines(wake), `សូមឱ្យថ្ងៃថ្មីនេះពោរពេញដោយ${G.BARAKAH} និងការរកស៊ីសុចរិត។`],
      posterLines: [...POSTER_HOOKS.morning],
      source: duaSource(wake.source),
      prayers: dayPrayers(day),
    }
  }
  if (kind === "ISLAMIC_IFTAR") {
    const iftar = dua("iftar")
    const ramadan = hijri?.month === 9
    const [y, m, d] = day.split("-").map(Number)
    const maghrib = kmClockOf(prayerTimes({ year: y, month: m, day: d }, FAST_PLACE.lat, FAST_PLACE.lng).maghrib)
    return {
      kind,
      ...dated,
      pill: ramadan ? "ខែរ៉ាម៉ាឌន" : G.SUNNAH_FAST,
      title: `ឌុអា${G.IFTAR}`,
      lead: `🌇 <b>ឌុអា${G.IFTAR_LABEL}</b>`,
      arabic: iftar.arabic,
      paragraphs: [...duaLines(iftar), `ម៉ោង${G.IFTAR}ថ្ងៃនេះ ${maghrib} (${FAST_PLACE.km}) — សូមអល់ឡោះទទួលយកការបួសរបស់បងប្អូន។`],
      posterLines: [posterMeaning(iftar), `ម៉ោង${G.IFTAR}ថ្ងៃនេះ ${maghrib} · ${FAST_PLACE.km}`],
      posterHookLines: 3,
      source: duaSource(iftar.source),
    }
  }
  if (kind === "ISLAMIC_NIGHT") {
    const sleep = dua("sleep")
    const tomorrow = addDays(day, 1)
    const fastTomorrow = isFastDay(tomorrow, tomorrowHijri)
    return {
      kind,
      ...dated,
      pill: "ឌុអាមុនចូលគេង",
      title: "រំលឹកមុនចូលនិទ្រា",
      lead: "🌙 <b>រំលឹកមុនចូលនិទ្រា — ឌុអាមុនចូលគេង</b>",
      arabic: sleep.arabic,
      paragraphs: [
        ...duaLines(sleep),
        `ស្ដាប់ ${G.SURAH_AL_MULK} ឬកសាដះក្នុង «អេប លុយឆ្លាត» ជាមួយ Sleep Timer (១៥ ឬ ៣០ នាទី) ហើយកុំភ្លេចអាន ${G.AYAT_AL_KURSI} មុនចូលគេង។`,
        ...(fastTomorrow ? [G.sahurReminder(fastTimes(day).imsak)] : []),
      ],
      posterLines: [posterMeaning(sleep)],
      source: duaSource(sleep.source),
    }
  }
  if (kind === "ISLAMIC_FAST") {
    // Dated the day it is POSTED (Sunday / Wednesday) and titled for tomorrow's fast (founder, 18/10/2026
    // evening); the Imsak / Iftar boxes are tomorrow's, and say so.
    const monday = weekdayOf(day) === 0
    const times = fastTimes(day)
    return {
      kind,
      pill: "រំលឹកត្រៀមបួសស្អែក",
      hijri: hijri ? formatHijri(hijri, "km", { khmerDigits: true }) : null,
      hijriShort: hijri ? formatHijri(hijri, "km", { short: true, khmerDigits: true }) : null,
      date: kmDay(day),
      // The hero is short (one line, the largest text); the Arabic below it, centred (founder, 18/10/2026).
      title: monday ? G.FAST_HERO_TITLES.monday : G.FAST_HERO_TITLES.thursday,
      titleArabic: monday ? G.FAST_ARABIC.monday : G.FAST_ARABIC.thursday,
      lead: `🌙 <b>${G.fastReminderLead(monday ? "monday" : "thursday")}</b>`,
      paragraphs: [
        G.sahurReminder(times.imsak),
        `ការបួសនេះជាស៊ុណ្ណា — តាមលទ្ធភាពសុខភាពរបស់អ្នក។ ${G.PROPHET_FULL} តែងបួសរៀងរាល់ថ្ងៃច័ន្ទ និងថ្ងៃព្រហស្បតិ៍ ហើយមានប្រសាសន៍ថា អំពើរបស់មនុស្សត្រូវបានបង្ហាញនៅថ្ងៃទាំងពីរនេះ ហើយលោកចង់ឱ្យអំពើរបស់លោកត្រូវបានបង្ហាញ ខណៈលោកកំពុងបួស។`,
      ],
      posterLines: [...POSTER_HOOKS.fast],
      source: { label: "Jami' at-Tirmidhi 747", url: "https://sunnah.com/tirmidhi:747" },
      fast: { ...times, day: monday ? "ថ្ងៃច័ន្ទ" : "ថ្ងៃព្រហស្បតិ៍" },
    }
  }
  if (kind === "ISLAMIC_JUMUAH") {
    return {
      kind,
      pill: `រំលឹកសឡាត${G.JUMUAH} (${G.JUMUAH_ARABIC})`,
      hijri: hijri ? formatHijri(hijri, "km", { khmerDigits: true }) : null,
      hijriShort: hijri ? formatHijri(hijri, "km", { short: true, khmerDigits: true }) : null,
      date: kmDay(day),
      title: `${G.JUMUAH} មូបារ៉ក់`,
      titleArabic: G.JUMUAH_MUBARAK_ARABIC,
      paragraphs: [
        `ថ្ងៃសុក្រដ៏មាន${G.BARAKAH}! អល់ឡោះមានបន្ទូលថា ពេលគេអំពាវនាវឱ្យថ្វាយបង្គំ${G.JUMUAH_LABEL} នៅថ្ងៃសុក្រ ចូរប្រញាប់ទៅរំលឹកអល់ឡោះ ហើយទុកការលក់ដូរមួយឡែកសិន។ ក្រោយការថ្វាយបង្គំចប់ ចូរបែកខ្ញែកគ្នាលើផែនដី ហើយស្វែងរកការប្រទានពរពីអល់ឡោះ។`,
        `ម្ចាស់ហាង៖ ចូររៀបចំឱ្យមានអ្នកមើលហាង ឬបិទហាងមួយភ្លែតពេលថ្វាយបង្គំ${G.JUMUAH} — ប្រាក់ចំណេញក្រោយពេលនោះ ប្រកបដោយ${G.BARAKAH_LABEL}។`,
        `កុំភ្លេចអាន ${G.SURAH_AL_KAHF} ថ្ងៃនេះ — អ្នកណាអាន ${G.SURAH_AL_KAHF} នៅថ្ងៃសុក្រ ពន្លឺនឹងភ្លឺសម្រាប់គាត់ រហូតដល់ថ្ងៃសុក្រក្រោយ (al-Hakim · Sahih al-Jami' 6470)។`,
      ],
      posterLines: [...POSTER_HOOKS.jumuah],
      posterSource: "Al-Jumu'ah 62:9",
      source: { label: "Al-Jumu'ah 62:9–10", url: "https://quran.com/62/9-10" },
    }
  }
  const tip = islamicTipOfTheDay(tipDayNumber(day))
  const lesson = ISLAMIC_TIPS.indexOf(tip) + 1
  return {
    kind,
    pill: `មេរៀនហិរញ្ញវត្ថុហាឡាល់ ${khmerDigits(String(lesson))}/${khmerDigits(String(ISLAMIC_TIPS.length))}`,
    hijri: hijri ? formatHijri(hijri, "km", { khmerDigits: true }) : null,
    hijriShort: hijri ? formatHijri(hijri, "km", { short: true, khmerDigits: true }) : null,
    date: kmDay(day),
    title: tip.title.km,
    // A lesson in the Prophet's own words carries the reviewer's full translation (founder, 21/10/2026); else its text.
    paragraphs: tip.hadith ? tip.hadith.caption : [tip.body.km],
    // The poster: the principle and its money takeaway (founder, 20/10/2026 — the first sentence alone repeated the
    // title and lost the advice); the whole lesson is in the caption. At most three lines in all (islamic-tips.test.ts).
    // A hadith lesson quotes him instead: the intro, his words and the du'a, each up to three lines.
    posterLines: tip.hadith ? [tip.hadith.intro, tip.hadith.quote, tip.hadith.dua] : [tip.poster.principle, tip.poster.takeaway],
    ...(tip.hadith ? { posterHookLines: 3 } : {}),
    source: tip.ref,
  }
}

/** The caption under the poster (Telegram HTML, ≤ 1024 characters as a photo caption). */
export function islamicCaptionHtml(c: IslamicPostContent): string {
  const head = c.lead ?? (c.kind === "ISLAMIC_JUMUAH" ? `🕌 <b>${esc(c.title)}</b>` : `📗 <b>${esc(c.pill)}៖ ${esc(c.title)}</b>`)
  return [
    `🌙 <b>${c.hijri ? esc(c.hijri) : ""}</b>${c.hijri ? " · " : ""}${c.date}`,
    "",
    head,
    ...(c.arabic ? [`«${c.arabic}»`] : []),
    ...c.paragraphs.map(esc),
    ...(c.prayers ? ["", `🕌 ម៉ោងថ្វាយបង្គំថ្ងៃនេះ (${FAST_PLACE.km})៖`, c.prayers.map((p) => `${p.label} ${p.time}`).join(" · ")] : []),
    ...(c.fast ? ["", `⏰ ម៉ោងនៅ${c.fast.place}៖ ${G.IMSAK_LABEL} ${c.fast.imsak} · ${G.IFTAR_LABEL} ${c.fast.iftar}`] : []),
    "",
    `📖 ប្រភព៖ <a href="${c.source.url}">${esc(c.source.label)}</a>`,
    "",
    SIGN,
  ].join("\n")
}

/** 08:00 — the Hijri date and today's halal-finance lesson (one of the 14), with its exact source. */
export const islamicDailyHtml = (day: string, hijri: HijriDate | null) => islamicCaptionHtml(islamicPostContent("ISLAMIC_DAILY", day, hijri))

/** Sunday / Wednesday 19:00 (dated that day) — tomorrow's sunnah fast (Monday / Thursday), with Imsak and Iftar. */
export const sunnahFastHtml = (day: string, hijri: HijriDate | null) => islamicCaptionHtml(islamicPostContent("ISLAMIC_FAST", day, hijri))

/** Friday 11:30 — Jumu'ah and Surah Al-Kahf. */
export const jumuahHtml = (day: string, hijri: HijriDate | null) => islamicCaptionHtml(islamicPostContent("ISLAMIC_JUMUAH", day, hijri))

// ─── In-app community link ─────────────────────────────────────────────────────────────────────

/** The «join the community» link: the Islamic channel while Islamic Mode is on, else the configured general one. */
export function communityLink(islamic: boolean, configured: string | null | undefined): { url: string; label: "support.communityIslamic" | "support.community"; hint: "support.communityIslamicHint" | "support.communityHint" } | null {
  if (islamic) return { url: ISLAMIC_COMMUNITY_URL, label: "support.communityIslamic", hint: "support.communityIslamicHint" }
  return configured ? { url: configured, label: "support.community", hint: "support.communityHint" } : null
}

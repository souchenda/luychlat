/**
 * Holiday lifecycle (founder, 12/10/2026): a thoughtful note the day before a stretch of days off, and a dry
 * «welcome back to reality» on the first working day after it — both at 05:00 (founder, 20/10/2026: every holiday
 * notification at 05:00; the 18:00 and 07:30 slots retired) — in the
 * community channel and the in-app bell. A stretch is a run of public holidays (lib/holidays) joined
 * with the weekends next to them, so a Monday holiday starts on Saturday and the note comes Friday.
 * Pchum Ben keeps the reverent «សូមអនុមោទនា» tone. Pure (holiday-lifecycle.test.ts).
 */
import { khmerDigits } from "@/lib/dates"
import { publicHolidays } from "@/lib/holidays"
import type { MessageKey } from "@/lib/i18n/dictionaries"

export type HolidayKind = "PCHUM_BEN" | "KHMER_NEW_YEAR" | "WATER_FESTIVAL" | "GENERAL"
export type HolidayBlock = { start: string; end: string; days: number; kind: HolidayKind }
export type HolidayMoment = { stage: "pre" | "post"; block: HolidayBlock }

/** 05:00 the day before; 05:00 the first working day after (Cambodia time — founder, 20/10/2026). */
export const HOLIDAY_PRE_MINUTE = 5 * 60
export const HOLIDAY_POST_MINUTE = 5 * 60

const KIND_OF: Partial<Record<MessageKey, HolidayKind>> = {
  "holiday.pchum_ben": "PCHUM_BEN",
  "holiday.khmer_new_year": "KHMER_NEW_YEAR",
  "holiday.water_festival": "WATER_FESTIVAL",
}
const RANK: HolidayKind[] = ["PCHUM_BEN", "KHMER_NEW_YEAR", "WATER_FESTIVAL", "GENERAL"]

const toUtc = (day: string) => Date.parse(`${day}T00:00:00Z`)
const addDays = (day: string, n: number) => new Date(toUtc(day) + n * 86_400_000).toISOString().slice(0, 10)
const isWeekend = (day: string) => [0, 6].includes(new Date(toUtc(day)).getUTCDay())

function holidaysAround(day: string): Map<string, MessageKey> {
  const y = Number(day.slice(0, 4))
  return new Map([...publicHolidays(y - 1), ...publicHolidays(y), ...publicHolidays(y + 1)])
}

/** The stretch of days off (holidays + adjoining weekends) that contains `day`, if it holds a holiday. */
export function holidayBlockAt(day: string, holidays = holidaysAround(day)): HolidayBlock | null {
  const off = (d: string) => holidays.has(d) || isWeekend(d)
  if (!off(day)) return null
  let start = day
  let end = day
  while (off(addDays(start, -1))) start = addDays(start, -1)
  while (off(addDays(end, 1))) end = addDays(end, 1)
  const kinds: HolidayKind[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const key = holidays.get(d)
    if (key) kinds.push(KIND_OF[key] ?? "GENERAL")
  }
  if (!kinds.length) return null // an ordinary weekend
  const kind = RANK.find((k) => kinds.includes(k))!
  return { start, end, days: Math.round((toUtc(end) - toUtc(start)) / 86_400_000) + 1, kind }
}

/** `day` is the eve of a stretch of days off (pre) or the first working day after one (post). */
export function holidayMoment(day: string): HolidayMoment | null {
  const holidays = holidaysAround(day)
  if (holidays.has(day) || isWeekend(day)) return null
  const next = holidayBlockAt(addDays(day, 1), holidays)
  if (next) return { stage: "pre", block: next }
  const prev = holidayBlockAt(addDays(day, -1), holidays)
  if (prev) return { stage: "post", block: prev }
  return null
}

const KM_MONTHS = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"]
const kmNum = (day: string) => khmerDigits(String(Number(day.slice(8, 10))))
const kmDay = (day: string) => `${kmNum(day)} ${KM_MONTHS[Number(day.slice(5, 7)) - 1]}`

/** «១០–១២ តុលា» / «៣០ មេសា–៣ ឧសភា» / «២៩ តុលា» */
export function kmRange(b: Pick<HolidayBlock, "start" | "end">): string {
  if (b.start === b.end) return kmDay(b.start)
  return b.start.slice(5, 7) === b.end.slice(5, 7) ? `${kmNum(b.start)}–${kmDay(b.end)}` : `${kmDay(b.start)}–${kmDay(b.end)}`
}

/** The note's title and body (Khmer — the channel and the bell). */
export function holidayMessage({ stage, block }: HolidayMoment): { title: string; body: string } {
  const when = `📅 ${kmRange(block)} · ឈប់សម្រាក ${khmerDigits(String(block.days))} ថ្ងៃ`
  if (stage === "pre") {
    switch (block.kind) {
      case "PCHUM_BEN":
        return {
          title: "🪷 ស្អែកចាប់ផ្តើមបុណ្យភ្ជុំបិណ្ឌ",
          body: `${when}\nសូមឱ្យដំណើរទៅស្រុកកំណើតប្រកបដោយសុវត្ថិភាព។ មុនចេញដំណើរ សូមទុកថវិកាធ្វើដំណើរ និងបច្ច័យធ្វើបុណ្យដាច់ដោយឡែក ហើយបិទបញ្ជីហាងថ្ងៃនេះ ទើបសម្រាកបានស្ងប់ចិត្ត។ 🙏`,
        }
      case "KHMER_NEW_YEAR":
        return {
          title: "🎉 ស្អែកចាប់ផ្តើមឈប់ចូលឆ្នាំខ្មែរ",
          body: `${when}\nមុនចេញលេង កំណត់ថវិកាចូលឆ្នាំមួយចំនួន — ធ្វើដំណើរ ម្ហូប និងលុយឱ្យកូនក្មួយ — ហើយកាន់តាមវា។ ម្ចាស់អាជីវកម្ម សូមបិទបញ្ជីលក់ថ្ងៃនេះ ឱ្យឆ្នាំថ្មីចាប់ផ្តើមស្អាត។`,
        }
      case "WATER_FESTIVAL":
        return {
          title: "🚣 ស្អែកចាប់ផ្តើមបុណ្យអុំទូក",
          body: `${when}\nទៅមើលទូកប្រណាំងបាន តែកុំឱ្យលុយប្រណាំងចេញមុន។ កំណត់ថវិកាធ្វើដំណើរ និងម្ហូបតាមផ្លូវ ហើយបិទបញ្ជីអាជីវកម្មថ្ងៃនេះ។`,
        }
      default:
        return {
          title: "🗓️ ស្អែកចាប់ផ្តើមថ្ងៃឈប់សម្រាក",
          body: `${when}\nកំណត់ថវិកាដើរលេងឱ្យច្បាស់មុនចេញ។ ម្ចាស់អាជីវកម្ម សូមបិទបញ្ជីថ្ងៃនេះ ទើបសម្រាកបានស្ងប់ចិត្ត។`,
        }
    }
  }
  switch (block.kind) {
    case "PCHUM_BEN":
      return {
        title: "🪷 សូមស្វាគមន៍ការត្រឡប់មកវិញ",
        body: "សូមអនុមោទនាកុសលបុណ្យ។ ដំណើរបានចប់ — ឥឡូវកាបូបលុយក៏ត្រូវការពេលសម្រាកដែរ។\n💡 ថ្ងៃនេះ ពិនិត្យសមតុល្យគណនី កត់ត្រាចំណាយក្នុងបុណ្យដែលនៅសល់ ហើយចាប់ផ្តើមរកចំណូលឡើងវិញ។",
      }
    case "KHMER_NEW_YEAR":
      return {
        title: "☀️ ឆ្នាំថ្មី ចាប់ផ្តើមកត់ត្រាថ្មី",
        body: "ឆ្នាំថ្មី សមតុល្យចាស់ — ប្រហែលជាតិចជាងមុនបន្តិច។\n💡 ពិនិត្យគណនីថ្ងៃនេះ កត់ត្រាចំណាយចូលឆ្នាំដែលភ្លេច ហើយចាប់ផ្តើមកត់ត្រាឡើងវិញ។",
      }
    case "WATER_FESTIVAL":
      return {
        title: "🚣 បុណ្យអុំទូកចប់ហើយ",
        body: "ទូកប្រណាំងបានចូលចតហើយ។ លុយយើងវិញ នៅតែកំពុងហូរតាមទឹក។\n💡 ពិនិត្យសមតុល្យថ្ងៃនេះ ហើយចាប់ផ្តើមកត់ត្រាចំណូល-ចំណាយឡើងវិញ។",
      }
    default:
      return {
        // Plain Khmer, never a translated idiom («welcome back to reality» read as one — founder, 29/10/2026), and it
        // follows royal and national days too.
        title: "☀️ ត្រឡប់មកធ្វើការវិញហើយ",
        body: "ថ្ងៃឈប់សម្រាកចប់ហើយ — តែវិក្កយបត្រមិនបានឈប់សម្រាកជាមួយយើងទេ។\n💡 ពិនិត្យសមតុល្យ មើលវិក្កយបត្រជិតដល់ថ្ងៃ ហើយចាប់ផ្តើមកត់ត្រាឡើងវិញ។",
      }
  }
}

/** The community channel post (Telegram HTML). */
export function holidayPostHtml(m: HolidayMoment): string {
  const { title, body } = holidayMessage(m)
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return `<b>${esc(title)}</b>\n\n${esc(body)}\n\n— អេប លុយឆ្លាត`
}

/** Holiday lifecycle: the eve's note and the day back's, each from 05:00 — a 90-minute window. */
export function holidayDue(day: string, minutes: number): "holiday-pre" | "holiday-post" | null {
  const m = holidayMoment(day)
  if (!m) return null
  const from = m.stage === "pre" ? HOLIDAY_PRE_MINUTE : HOLIDAY_POST_MINUTE
  return minutes >= from && minutes < from + 90 ? `holiday-${m.stage}` : null
}

/** The bell's card: from 05:00 on the eve and on the day back; null otherwise. */
export function holidayCard(now: number): (HolidayMoment & { title: string; body: string; at: string }) | null {
  const t = new Date(now + 7 * 3_600_000)
  const day = t.toISOString().slice(0, 10)
  const minute = t.getUTCHours() * 60 + t.getUTCMinutes()
  const m = holidayMoment(day)
  if (!m) return null
  const from = m.stage === "pre" ? HOLIDAY_PRE_MINUTE : HOLIDAY_POST_MINUTE
  if (minute < from) return null
  const at = new Date(Date.parse(`${day}T00:00:00+07:00`) + from * 60_000).toISOString()
  return { ...m, ...holidayMessage(m), at }
}

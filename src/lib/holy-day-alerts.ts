/**
 * Buddhist holy days (ថ្ងៃសីល: ៨ កើត, ១៥ កើត, ៨ រោច, ១៤ / ១៥ រោច) in two stages, both at 07:00
 * Cambodia time (founder, 10/10):
 *   eve — the day before: buy lotus, fruit and offerings ahead of time;
 *   day — on the holy day: a morning blessing («សូមអនុមោទនា», never «រីករាយ»).
 * Pure (holy-day-alerts.test.ts) — the sending is in src/lib/server/holy-days.ts.
 */

import { formatLunar, isSilDay, khmerLunarDate } from "@/lib/khmer-lunar"

/** 07:00 Cambodia time — the same morning slot as the channel's daily post. */
export const HOLY_DAY_MINUTE = 7 * 60

const nextDay = (iso: string) => new Date(Date.parse(`${iso}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

/** Which stage is due on this Cambodian day (both can be, e.g. ១៤ and ១៥ រោច in a row). */
export function holyDayStages(day: string): { eve: string | null; today: string | null } {
  const tomorrow = khmerLunarDate(nextDay(day))
  const today = khmerLunarDate(day)
  return {
    eve: isSilDay(tomorrow) ? formatLunar(tomorrow, "km") : null,
    today: isSilDay(today) ? formatLunar(today, "km") : null,
  }
}

export type HolyDayCard = { stage: "eve" | "day"; title: string; message: string; at: string }

/**
 * The bell's 🪷 card for this moment: from 07:00 Cambodia time, the blessing on a holy day, else
 * the eve reminder the day before. Null otherwise (or before 07:00). Its time is that day's 07:00.
 */
export function holyDayCard(now: number): HolyDayCard | null {
  const t = new Date(now + 7 * 3_600_000)
  const day = t.toISOString().slice(0, 10)
  if (t.getUTCHours() * 60 + t.getUTCMinutes() < HOLY_DAY_MINUTE) return null
  const stages = holyDayStages(day)
  const at = new Date(Date.parse(`${day}T07:00:00+07:00`)).toISOString()
  // The message is the reminder / blessing line under the title (the title already says which day).
  const body = (text: string) => text.split("\n").slice(1).join("\n")
  if (stages.today) return { stage: "day", title: "🪷 ថ្ងៃនេះជាថ្ងៃសីល!", message: `${body(silDayText(stages.today))} (${stages.today})`, at }
  if (stages.eve) return { stage: "eve", title: "🪷 ថ្ងៃស្អែកជាថ្ងៃសីល!", message: `${body(silEveText(stages.eve))} (${stages.eve})`, at }
  return null
}

export const silEveText = (lunar: string) =>
  `🪷 រំលឹក៖ ថ្ងៃស្អែកជាថ្ងៃសីល! (${lunar})\n🙏 សូមកុំភ្លេចរៀបចំទិញផ្កាឈូក ផ្លែឈើ និងគ្រឿងសែនព្រេនទុកជាមុន។`

export const silDayText = (lunar: string) =>
  `🪷 អរុណសួស្តី! ថ្ងៃនេះជាថ្ងៃសីល (${lunar})\n🙏 សូមអនុមោទនាកុសលបុណ្យ និងសូមឱ្យបង និងក្រុមគ្រួសារជួបតែសេចក្តីសុខ សុភមង្គល និងចម្រើនរុងរឿងគ្រប់ប្រការ។`

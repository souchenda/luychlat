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

export const silEveText = (lunar: string) =>
  `🪷 រំលឹក៖ ថ្ងៃស្អែកជាថ្ងៃសីល! (${lunar})\n🙏 សូមកុំភ្លេចរៀបចំទិញផ្កាឈូក ផ្លែឈើ និងគ្រឿងសែនព្រេនទុកជាមុន។`

export const silDayText = (lunar: string) =>
  `🪷 អរុណសួស្តី! ថ្ងៃនេះជាថ្ងៃសីល (${lunar})\n🙏 សូមអនុមោទនាកុសលបុណ្យ និងសូមឱ្យបង និងក្រុមគ្រួសារជួបតែសេចក្តីសុខ សុភមង្គល និងចម្រើនរុងរឿងគ្រប់ប្រការ។`

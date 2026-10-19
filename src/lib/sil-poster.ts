/**
 * The Buddhist Sil day (Uposatha) poster (founder, 19/10/2026): on each of the four Sil days of a lunar month — 8 កើត,
 * 15 កើត (ពេញបូណ៌មី), 8 រោច and the month's last day 14 / 15 រោច (ដាច់ខែ) — the day's own lunar and calendar dates, the
 * blessing «សូមអនុមោទនា» (merit days: never «រីករាយ»), and the call to the app. Posted to @LuyChlatCommunity and the
 * Facebook Page after the founder's approval — never to @LuyChlatIslamic (a Buddhist post). Pure (sil-poster.test.ts);
 * drawn by lib/server/sil-poster.ts.
 */
import { khmerDigits } from "@/lib/dates"
import { formatLunar, isSilDay, khmerLunarDate } from "@/lib/khmer-lunar"

const WEEKDAYS = ["អាទិត្យ", "ច័ន្ទ", "អង្គារ", "ពុធ", "ព្រហស្បតិ៍", "សុក្រ", "សៅរ៍"]
const MONTHS = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"]
/** «ថ្ងៃច័ន្ទ ១៩ តុលា ២០២៦». */
export function kmCalendarDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number)
  return `ថ្ងៃ${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${khmerDigits(String(d))} ${MONTHS[m - 1]} ${khmerDigits(String(y))}`
}

export type SilPosterContent = {
  /** «៨ កើត ខែអស្សុជ», «១៥ កើត ខែអស្សុជ (ពេញបូណ៌មី)», «១៤ រោច ខែអស្សុជ (ដាច់ខែ)». */
  lunar: string
  /** «ថ្ងៃសីល (៨ កើត ខែអស្សុជ) · ត្រូវនឹង ថ្ងៃច័ន្ទ ១៩ តុលា ២០២៦» (one line — the caption). */
  dateline: string
  /** The poster's top-right block (founder, 19/10/2026): «ថ្ងៃសីល (១៥ កើត ខែអស្សុជ · ពេញបូណ៌មី)» / «ត្រូវនឹង ថ្ងៃច័ន្ទ …». */
  dateLines: [string, string]
  /** The blessing in two balanced lines. */
  blessingLines: [string, string]
  headline: string
  title: string
  blessing: string
  cta: string
  links: [string, string]
}

export const SIL_BLESSING_LINES: [string, string] = ["សូមឱ្យសព្វសត្វទាំងឡាយ បានសុខចម្រើន", "រួចផុតចាកទុក្ខទាំងពួង និងជួបតែសេចក្ដីសុខសាន្ត"]
export const SIL_BLESSING = SIL_BLESSING_LINES.join(" ")
/** The call (founder, 19/10/2026), with the brand as the standard writes it: «អេប លុយឆ្លាត». */
export const SIL_CTA = "ចូលរួមសហគមន៍ អេប លុយឆ្លាត ដើម្បីទទួលបានដំណឹងសំខាន់ៗក្នុងអេប"

/** The poster for a Sil day; null on any other day. */
export function silPosterContent(day: string): SilPosterContent | null {
  const l = khmerLunarDate(day)
  if (!isSilDay(l)) return null
  const phase = l.phase === "kert" && l.day === 15 ? "ពេញបូណ៌មី" : l.phase === "roch" && l.day === l.monthLength - 15 ? "ដាច់ខែ" : null
  const base = formatLunar(l, "km")
  const sil = `ថ្ងៃសីល (${phase ? `${base} · ${phase}` : base})`
  return {
    lunar: phase ? `${base} (${phase})` : base,
    dateline: `${sil} · ត្រូវនឹង ${kmCalendarDay(day)}`,
    dateLines: [sil, `ត្រូវនឹង ${kmCalendarDay(day)}`],
    blessingLines: SIL_BLESSING_LINES,
    headline: "សូមអនុមោទនា",
    title: "ថ្ងៃនេះជាថ្ងៃសីល",
    blessing: SIL_BLESSING,
    cta: SIL_CTA,
    links: ["app.luychlat.com", "@LuyChlatCommunity"],
  }
}

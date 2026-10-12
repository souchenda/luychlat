/**
 * The weekly «Core value & feature spotlight» (founder, 12/10/2026): every Saturday at 17:00 Cambodia
 * time, a branded poster with the founder's own message — the hook, the three pillars and the
 * voluntary call — to the community channel and the Facebook Page. Fully automatic. Pure
 * (spotlight.test.ts); the poster is drawn in lib/server/spotlight-poster.ts.
 */

/** Saturday, 17:00–18:29 (a short window so a late server start still posts it, never hours late). */
export const SPOTLIGHT = { weekday: 6, from: 17 * 60, until: 18 * 60 + 30, job: "spotlight-weekly" } as const

export const SPOTLIGHT_BOT = "https://t.me/luychlat_bot"
export const SPOTLIGHT_SITE = "https://luychlat.com"

/** `day` (YYYY-MM-DD, Cambodia) at `minutes` past midnight is inside the weekly window. */
export function spotlightDue(day: string, minutes: number): boolean {
  return new Date(`${day}T00:00:00Z`).getUTCDay() === SPOTLIGHT.weekday && minutes >= SPOTLIGHT.from && minutes < SPOTLIGHT.until
}

export const SPOTLIGHT_HOOK = "តើអ្នកធ្លាប់ឆ្ងល់ទេ... ហេតុអ្វីបានជាយើងខំប្រឹងរកលុយសឹងស្លាប់រាល់ថ្ងៃ តែដល់ចុងខែ បែរជាមានអារម្មណ៍ថាគ្មានសល់អ្វីទាល់តែសោះ?"
export const SPOTLIGHT_CALL = "លុយដែលអ្នកខំរកដោយញើសឈាម ស័ក្តិសមនឹងទទួលបានការគ្រប់គ្រងយ៉ាងច្បាស់លាស់។"

/** The three pillars: the caption's full line, and the poster's short title and line. */
export const SPOTLIGHT_PILLARS = [
  {
    icon: "🎙️",
    line: "កត់ត្រាលឿនក្នុង ១ វិនាទីតាមសំឡេងក្នុង Telegram មិនបាច់វាយអក្សរ។",
    title: "កត់ត្រាក្នុង ១ វិនាទី",
    sub: "និយាយតាមសំឡេងក្នុង Telegram មិនបាច់វាយអក្សរ",
  },
  {
    icon: "💎",
    line: "ឃើញទ្រព្យពិត (Net Worth) កុងបញ្ញើ Fixed Deposit មាសឡើងថ្លៃ និងយានយន្ត។",
    title: "ឃើញទ្រព្យពិត",
    sub: "ទ្រព្យសុទ្ធ · កុងបញ្ញើ · មាស · យានយន្ត",
  },
  {
    icon: "🛡️",
    line: "ខែលការពារពិន្ទុ K-Score មិនឱ្យធ្លាក់ និងមានសៀវភៅកត់ម៉ូយជំពាក់ ទារតាម KHQR។",
    title: "ការពារពិន្ទុ K-Score",
    sub: "សៀវភៅកត់ម៉ូយជំពាក់ និងទារតាម KHQR",
  },
] as const

const HASHTAGS = "#អេបលុយឆ្លាត #AppLuyChlat #លុយឆ្លាត #ហិរញ្ញវត្ថុផ្ទាល់ខ្លួន #Cambodia"

function lines(): string[] {
  return [
    SPOTLIGHT_HOOK,
    "",
    "អេប លុយឆ្លាត ជួយអ្នក៖",
    ...SPOTLIGHT_PILLARS.map((p) => `${p.icon} ${p.line}`),
    "",
    SPOTLIGHT_CALL,
    "",
    `🤖 Telegram Bot៖ ${SPOTLIGHT_BOT}`,
    `🌐 គេហទំព័រ៖ ${SPOTLIGHT_SITE}`,
  ]
}

/** The Facebook caption (plain text, with hashtags). */
export const spotlightCaption = () => [...lines(), "", HASHTAGS].join("\n")

/** The Telegram caption (HTML; the hook in bold). Photo captions are capped at 1024 characters. */
export function spotlightHtml(): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const [hook, ...rest] = lines()
  return [`<b>${esc(hook)}</b>`, ...rest.map(esc)].join("\n")
}

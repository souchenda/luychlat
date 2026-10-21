/**
 * The 20:00 reminder (community channel + the bot's nudge): three short lines that change with the
 * day of the week, so it never reads the same two nights running (founder, 11/10/2026 — the old
 * one was a wall of text, every night the same). Pure (evening-reminder.test.ts).
 */

/**
 * The title names what the reminder is for — closing the day's books — and the day in full (founder, 21/10/2026 —
 * Task #439: «រំលឹកចុងថ្ងៃ · ពុធ» read like a machine translation, a day name left hanging): «🌙 រំលឹកបិទបញ្ជីចុងថ្ងៃ (ថ្ងៃពុធ)».
 */
const title = (day: string) => `🌙 រំលឹកបិទបញ្ជីចុងថ្ងៃ (ថ្ងៃ${day})`

/** Sunday = 0 … Saturday = 6 (Date#getUTCDay of the Cambodian date). */
const REMINDERS: readonly [string, string, string][] = [
  [title("អាទិត្យ"), "បិទបញ្ជីប្រចាំសប្ដាហ៍ ដើម្បីដឹងចំណេញ-ខាតច្បាស់លាស់!", "📊 ផ្ញើតួលេខថ្ងៃនេះមក Bot ជួយរៀបចំជូនភ្លាម។"],
  [title("ច័ន្ទ"), "តើថ្ងៃនេះបងបានកត់ចំណូល-ចំណាយអស់ហើយឬនៅ?", "🎙️ ផ្ញើសារសំឡេង ឬវាយលេខប្រាប់ Bot មក កត់ជូនភ្លាម!"],
  [title("អង្គារ"), "មានបង្កាន់ដៃ ឬវិក្កយបត្រថ្ងៃនេះសេសសល់ទេបង?", "📸 ថតផ្ញើមក Bot ជួយកត់ចូលបញ្ជីជូនក្នុង ១ វិនាទី!"],
  [title("ពុធ"), "ចាយថ្លៃបាយ កាហ្វេ ឬចាក់សាំងថ្ងៃនេះ កត់រួចហើយនៅបង?", "✍️ ប្រាប់មក (ឧ. «កាហ្វេ ៨០០០៛») កត់ភ្លាមៗ!"],
  [title("ព្រហស្បតិ៍"), "ថ្ងៃនេះលក់ដាច់ទេបង? បានបូកសរុបចំណូលហើយឬនៅ?", "🎙️ ចុចសង្កត់ផ្ញើសំឡេងប្រាប់ Bot មក ងាយស្រួលបំផុត!"],
  [title("សុក្រ"), "បិទបញ្ជីថ្ងៃសុក្រឱ្យស្រឡះដៃ មុនសម្រាកចុងសប្ដាហ៍!", "✨ កត់ចំណូល-ចំណាយថ្ងៃនេះជាមួយ Bot ត្រឹម ១ នាទី។"],
  [title("សៅរ៍"), "ចុងសប្ដាហ៍នេះដើរផ្សារ ឬទិញឥវ៉ាន់អស់ប៉ុន្មានដែរ?", "📝 កត់ទុកកុំឱ្យភ្លេច ផ្ញើប្រាប់ Bot មកឥឡូវនេះ!"],
]

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** The day's three lines for a Cambodian date (YYYY-MM-DD). */
export function eveningLines(day: string): readonly [string, string, string] {
  return REMINDERS[new Date(`${day}T12:00:00Z`).getUTCDay()]
}

/** Telegram HTML: the first line bold, the other two under it. */
export function eveningHtml(day: string): string {
  const [title, ask, how] = eveningLines(day)
  return [`<b>${esc(title)}</b>`, esc(ask), esc(how)].join("\n")
}

/** The bot the 20:00 post sends people to (the channel post's only button). */
export const EVENING_BOT_URL = "https://t.me/luychlat_bot"
export const EVENING_BUTTON_TEXT = "🤖 ចុចទីនេះដើម្បីបិទបញ្ជី"

/**
 * The 20:00 channel post's button (founder, 18/10/2026 — the text says «send today's figures to the Bot» but
 * readers had nothing to tap): one URL button to the bot, the post itself stays a light text message.
 */
export const eveningButtons = () => ({ inline_keyboard: [[{ text: EVENING_BUTTON_TEXT, url: EVENING_BOT_URL }]] })

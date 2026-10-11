/**
 * The 20:00 reminder (community channel + the bot's nudge): three short lines that change with the
 * day of the week, so it never reads the same two nights running (founder, 11/10/2026 — the old
 * one was a wall of text, every night the same). Pure (evening-reminder.test.ts).
 */

/** Sunday = 0 … Saturday = 6 (Date#getUTCDay of the Cambodian date). */
const REMINDERS: readonly [string, string, string][] = [
  ["🌙 រំលឹកចុងថ្ងៃ • អាទិត្យ", "បិទបញ្ជីប្រចាំសប្ដាហ៍ ដើម្បីដឹងចំណេញ-ខាតច្បាស់លាស់!", "📊 ផ្ញើតួលេខថ្ងៃនេះមក Bot ជួយរៀបចំជូនភ្លាម។"],
  ["🌙 រំលឹកចុងថ្ងៃ • ចន្ទ", "តើថ្ងៃនេះបងបានកត់ចំណូល-ចំណាយអស់ហើយឬនៅ?", "🎙️ ផ្ញើសារសំឡេង ឬវាយលេខប្រាប់ Bot មក កត់ជូនភ្លាម!"],
  ["🌙 រំលឹកចុងថ្ងៃ • អង្គារ", "មានបង្កាន់ដៃ ឬវិក្កយបត្រថ្ងៃនេះសេសសល់ទេបង?", "📸 ថតផ្ញើមក Bot ជួយកត់ចូលបញ្ជីជូនក្នុង ១ វិនាទី!"],
  ["🌙 រំលឹកចុងថ្ងៃ • ពុធ", "ចាយថ្លៃបាយ កាហ្វេ ឬចាក់សាំងថ្ងៃនេះ កត់រួចហើយនៅបង?", "✍️ ប្រាប់មក (ឧ. «កាហ្វេ ៨០០០៛») កត់ភ្លាមៗ!"],
  ["🌙 រំលឹកចុងថ្ងៃ • ព្រហស្បតិ៍", "ថ្ងៃនេះលក់ដាច់ទេបង? បានបូកសរុបចំណូលហើយឬនៅ?", "🎙️ ចុចសង្កត់ផ្ញើសំឡេងប្រាប់ Bot មក ងាយស្រួលបំផុត!"],
  ["🌙 រំលឹកចុងថ្ងៃ • សុក្រ", "បិទបញ្ជីថ្ងៃសុក្រឱ្យស្រឡះដៃ មុនសម្រាកចុងសប្ដាហ៍!", "✨ កត់ចំណូល-ចំណាយថ្ងៃនេះជាមួយ Bot ត្រឹម ១ នាទី។"],
  ["🌙 រំលឹកចុងថ្ងៃ • សៅរ៍", "ចុងសប្ដាហ៍នេះដើរផ្សារ ឬទិញឥវ៉ាន់អស់ប៉ុន្មានដែរ?", "📝 កត់ទុកកុំឱ្យភ្លេច ផ្ញើប្រាប់ Bot មកឥឡូវនេះ!"],
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

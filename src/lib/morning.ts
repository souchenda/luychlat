/**
 * The 07:00 morning message — one source for the community channel post, the
 * phone push notification and the card in the in-app bell, so they always say
 * the same thing. Pure (morning.test.ts).
 */

export const MORNING_QUOTE = "ស្រឡាញ់លុយ លុយនឹងស្រឡាញ់អ្នកវិញ! ចាប់ផ្តើមថ្ងៃថ្មីដោយភាពឆ្លាតវៃ និងកត់ត្រារាល់ចំណូល-ចំណាយឱ្យបានត្រឹមត្រូវ។"

/** 07:00 Cambodia time (UTC+7 all year). */
export const MORNING_MINUTE = 7 * 60

export const APP_URL = "https://luy.ibmserp.com"

/** The phone notification. */
export function morningPush(): { title: string; body: string; url: string; tag: string } {
  return {
    title: "☀️ អរុណសួស្តីពី លុយឆ្លាត",
    body: `${MORNING_QUOTE} — ចុចដើម្បីកត់ត្រាចំណូល-ចំណាយថ្ងៃថ្មី!`,
    url: APP_URL,
    // One per day on the phone: a second send replaces it instead of piling up.
    tag: "luychlat-morning",
  }
}

/** Cambodia's date and minute of the day for a moment (ms since epoch). */
export function phnomPenhClock(now: number): { day: string; minute: number } {
  const t = new Date(now + 7 * 3_600_000)
  return { day: t.toISOString().slice(0, 10), minute: t.getUTCHours() * 60 + t.getUTCMinutes() }
}

/** The bell's morning card: from 07:00 Cambodia time, for today; its time is today's 07:00. */
export function morningCard(now: number): { day: string; at: string } | null {
  const { day, minute } = phnomPenhClock(now)
  if (minute < MORNING_MINUTE) return null
  return { day, at: new Date(Date.parse(`${day}T07:00:00+07:00`)).toISOString() }
}

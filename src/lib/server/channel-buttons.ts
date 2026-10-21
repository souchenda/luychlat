// Server only: the buttons under every community channel post (market bulletin, evening NBC rates, morning / evening
// routine, daily tip, festival posters, fuel prices) — same wording, same order, everywhere. One button per row, full
// width (founder, 21/10/2026 — side by side they were cut to «… ↗» on a phone):
//
//   [ 📱 បើកប្រើ អេប លុយឆ្លាត ↗ ]
//   [ 🤖 កត់ត្រាតាម Telegram Bot ↗ ]
import { appUrl } from "./community-bulletin"
import { tg } from "./telegram-bot"

export const CHANNEL_APP_BUTTON = "📱 បើកប្រើ អេប លុយឆ្លាត ↗"
export const CHANNEL_BOT_BUTTON = "🤖 កត់ត្រាតាម Telegram Bot ↗"

type Button = { text: string; url: string }

/** The keyboard: the app on the first row, the bot on the second — each alone on its row; a link not known is left out. */
export function channelKeyboard(app: string | null, botUsername: string | null | undefined): Button[][] {
  return [...(app ? [[{ text: CHANNEL_APP_BUTTON, url: app }]] : []), ...(botUsername ? [[{ text: CHANNEL_BOT_BUTTON, url: `https://t.me/${botUsername}` }]] : [])]
}

/** `extra` for sendMessage / sendPhoto / editMessageText: the standard buttons. */
export async function getChannelPostButtons(): Promise<{ reply_markup?: { inline_keyboard: Button[][] } }> {
  const [url, me] = await Promise.all([appUrl(), tg<{ username?: string }>("getMe", {})])
  const rows = channelKeyboard(url, me.result?.username)
  return rows.length ? { reply_markup: { inline_keyboard: rows } } : {}
}

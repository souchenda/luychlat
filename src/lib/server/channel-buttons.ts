// Server only: the one button row under every community channel post (market
// bulletin, evening NBC rates, morning / evening routine, daily tip, festival
// posters, fuel prices) — same wording, same order, everywhere:
//
//   [ 🤖 កត់ត្រាជាមួយ Bot ]  [ 📱 បើកកម្មវិធី ]
import { appUrl } from "./community-bulletin"
import { tg } from "./telegram-bot"

export const CHANNEL_BOT_BUTTON = "🤖 កត់ត្រាជាមួយ Bot"
export const CHANNEL_APP_BUTTON = "📱 បើកកម្មវិធី"

/** The standard row as Telegram's inline_keyboard (empty when neither link is known). */
export async function channelButtonRow(): Promise<{ text: string; url: string }[]> {
  const [url, me] = await Promise.all([appUrl(), tg<{ username?: string }>("getMe", {})])
  return [
    ...(me.result?.username ? [{ text: CHANNEL_BOT_BUTTON, url: `https://t.me/${me.result.username}` }] : []),
    ...(url ? [{ text: CHANNEL_APP_BUTTON, url }] : []),
  ]
}

/** `extra` for sendMessage / sendPhoto / editMessageText: the standard buttons. */
export async function getChannelPostButtons(): Promise<{ reply_markup?: { inline_keyboard: { text: string; url: string }[][] } }> {
  const row = await channelButtonRow()
  return row.length ? { reply_markup: { inline_keyboard: [row] } } : {}
}

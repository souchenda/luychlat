// Server only: what goes under a public channel post (@LuyChlatCommunity, @LuyChlatIslamic — the market bulletin, the
// evening NBC rates, the morning / evening routine, the daily tip, festival posters, fuel prices, the Islamic posts).
//
// NOTHING (founder, 22/10/2026 — Task #454): the two URL buttons [ 📱 បើកប្រើ អេប លុយឆ្លាត ↗ ] [ 🤖 កត់ត្រាតាម Telegram
// Bot ↗ ] repeated the caption's own footer line («Android (APK) || iOS / Web || Telegram Bot», lib/post-footer.ts) —
// the feed stays clean, the links are in the text. Every channel publisher still asks here, so a post never grows its
// own keyboard again; the approval cards in «LCA Approval» keep their [ ✅ ] [ ✏️ ] [ ❌ ] (previewButtons) — another
// keyboard, untouched. The 20:00 reminder keeps its one «🤖 ចុចទីនេះដើម្បីបិទបញ្ជី» (eveningButtons — the founder's
// 18/10/2026 call to action, not a repeat of the footer).

type Button = { text: string; url: string }

/** `extra` for sendMessage / sendPhoto / editMessageText / editMessageMedia on a channel post: no keyboard. */
export async function getChannelPostButtons(): Promise<{ reply_markup?: { inline_keyboard: Button[][] } }> {
  return {}
}

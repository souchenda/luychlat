// Server only: a routine channel post goes out without a sound (founder, 28/10/2026 — «members must never feel
// disturbed»; lib/scheduled-posts.ts SILENT_KINDS). Inside `quietly`, every Telegram send (`tg` and the poster uploads in
// tip-bot.ts) carries disable_notification: the message is in the channel as usual, the phone stays quiet.
import { AsyncLocalStorage } from "node:async_hooks"

const quiet = new AsyncLocalStorage<true>()

/** Runs `fn` (and everything it awaits) with every Telegram send silent. */
export const quietly = <T>(fn: () => T): T => quiet.run(true, fn)
export const isQuiet = () => quiet.getStore() === true

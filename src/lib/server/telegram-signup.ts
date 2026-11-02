// Server only: the bot's «share my number» → an account and a one-tap link into the app (lib/telegram-signup.ts).
import { logEvent } from "@/lib/server/events"
import { createPhoneAccount, serviceKey } from "@/lib/server/magic-session"
import { botDb, botKey, sendText } from "@/lib/server/telegram-bot"
import { contactAccount, openAppKeyboard, signupReply, telegramName, type ContactAccount } from "@/lib/telegram-signup"

export type SharedContact = {
  chatId: number
  phone: string
  firstName?: string
  lastName?: string
  username?: string
  language?: string
}

const lookUp = async (c: SharedContact) => {
  const { data, error } = await botDb().rpc("bot_contact_account", {
    p_key: botKey(),
    p_chat_id: c.chatId,
    p_phone: c.phone,
    p_username: c.username ?? null,
    p_language: c.language ?? "km",
  })
  return error ? null : (data as ContactAccount | null)
}

/**
 * The person shared their own number (the caller checked contact.user_id = from.id). Sends the bot's answer and returns
 * what happened — logged with a count, never the number. Never throws.
 */
export async function signUpByContact(c: SharedContact): Promise<"created" | "signin" | "elsewhere" | "foreign" | "busy"> {
  const done = { reply_markup: { remove_keyboard: true } }
  try {
    if (!serviceKey()) {
      await sendText(c.chatId, signupReply("busy"), done)
      logEvent("error", "bot-signup", "Sign-up by Telegram needs SUPABASE_SERVICE_ROLE_KEY on the server", { fold: true })
      return "busy"
    }
    let r = await lookUp(c)
    let created = false
    if (r?.status === "new") {
      // The same address the app's phone sign-up uses — checked again here, never trusted from the database alone.
      const account = contactAccount(c.phone)
      if (!account || account.email !== r.email) r = null
      else {
        const made = await createPhoneAccount(account.email, telegramName(c.firstName, c.lastName))
        created = made === "created"
        r = made === "failed" ? null : await lookUp(c)
      }
    }
    if (r?.status === "ok" && r.token) {
      // The share button stays until now (is_persistent): taken away first, as the answer carries the inline «open» button.
      await sendText(c.chatId, "✅ បានទទួលលេខរបស់អ្នក", done)
      const sent = await sendText(c.chatId, signupReply(created ? "created" : "signin"), { reply_markup: openAppKeyboard(r.token) })
      logEvent("info", "bot-signup", created ? "A new account was created through the bot" : "A one-tap sign-in link was sent by the bot", { fold: true })
      return sent.ok ? (created ? "created" : "signin") : "busy"
    }
    const outcome = r?.status === "elsewhere" || r?.status === "foreign" ? r.status : "busy"
    await sendText(c.chatId, signupReply(outcome), done)
    if (outcome === "busy") logEvent("error", "bot-signup", "Sign-up by Telegram failed (lookup or account creation)", { fold: true })
    return outcome
  } catch (e) {
    logEvent("error", "bot-signup", `Sign-up by Telegram failed: ${(e as Error).message.slice(0, 80)}`, { fold: true })
    await sendText(c.chatId, signupReply("busy"), done).catch(() => null)
    return "busy"
  }
}

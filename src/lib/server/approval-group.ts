// Server only: /setapprovalgroup — a super admin makes the group they are in the content approval room
// («LCA Approval», founder 19/10/2026). Every preview then goes there with its [ ✅ ] [ 🚀 ] [ ❌ ] buttons; the
// bot never leaves it; a tap is still checked (only a super admin's counts — bot_post_take).
import type { Locale } from "@/lib/i18n/dictionaries"

import { forgetApprovalChat } from "./admin-routes"
import { logEvent } from "./events"
import { forgetApprovalGroupCache } from "./group-guard"
import { botDb, botKey, sendText, tr } from "./telegram-bot"

export const isSetApprovalGroupCommand = (command: string) => /^\/setapprovalgroup(@\w+)?$/i.test(command)

/** The command in a group: saved when the sender is a super admin; a short refusal otherwise. */
export async function handleSetApprovalGroup(chatId: number, fromId: number | undefined, title: string | undefined, lang: Locale): Promise<void> {
  if (!fromId) return
  const { error } = await botDb().rpc("bot_set_approval_chat", { p_key: botKey(), p_chat_id: chatId, p_actor: fromId })
  if (error) {
    await sendText(chatId, /super admin only/.test(error.message) ? tr(lang, "bot.approvalGroupSuperAdminOnly") : tr(lang, "bot.approvalGroupFailed"))
    return
  }
  forgetApprovalChat()
  forgetApprovalGroupCache()
  logEvent("info", "approval-group", `Content approval group set: ${chatId}${title ? ` (${title})` : ""}`)
  await sendText(chatId, tr("km", "bot.approvalGroupSet", { title: title || "LCA Approval" }))
}

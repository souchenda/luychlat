// Server only: co-approvers in «LCA Approval» (founder, 19/10/2026). A super admin replies to someone's message in the
// group with /addapprover [email or phone] (or /removeapprover): the bot takes their Telegram id from that message — it
// never adds anyone on its own. Their [ ✅ ] [ 🚀 ] [ ❌ ] then count (tip_chat_approver, audited by name).
import { approverReply, isApproverCommand, parseApproverCommand } from "@/lib/co-approvers"

import { logEvent } from "./events"
import { botDb, botKey, sendText } from "./telegram-bot"

export { isApproverCommand }

type ReplyFrom = { id?: number; is_bot?: boolean; first_name?: string; last_name?: string; username?: string }

export async function handleApproverCommand(chatId: number, fromId: number | undefined, text: string, replyFrom: ReplyFrom | undefined) {
  const cmd = parseApproverCommand(text)
  if (!cmd || !fromId) return
  if (!replyFrom?.id || replyFrom.is_bot) return void (await sendText(chatId, approverReply({ kind: "reply_needed" })))
  const name = [replyFrom.first_name, replyFrom.last_name].filter(Boolean).join(" ") || replyFrom.username || String(replyFrom.id)
  if (cmd.action === "add") {
    const { data, error } = await botDb().rpc("bot_add_approver", { p_key: botKey(), p_actor: fromId, p_tg: replyFrom.id, p_name: name, p_login: cmd.login })
    if (error) return void (await sendText(chatId, approverReply({ kind: /super admin only/.test(error.message) ? "forbidden" : "failed" })))
    const r = data as { status: "ok" | "no_account"; linked?: boolean }
    logEvent("info", "approval-group", `Co-approver ${r.status === "ok" ? "added" : "not added (no account)"}: ${name} (${replyFrom.id})`)
    return void (await sendText(chatId, approverReply(r.status === "ok" ? { kind: "added", name, linked: Boolean(r.linked) } : { kind: "no_account", login: cmd.login ?? "" })))
  }
  const { data, error } = await botDb().rpc("bot_remove_approver", { p_key: botKey(), p_actor: fromId, p_tg: replyFrom.id })
  if (error) return void (await sendText(chatId, approverReply({ kind: /super admin only/.test(error.message) ? "forbidden" : "failed" })))
  await sendText(chatId, approverReply(data === true ? { kind: "removed", name } : { kind: "not_approver", name }))
}

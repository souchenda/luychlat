// Server only: the channels' protection (founder, 21/10/2026 — lib/bot/channel-guard.ts). The discussion-group guard
// (delete outside links and abuse, mute a repeat sender for 24 h, remove a reaction outside the positive list) and the
// morning check of the channels' reactions, to the founder's private chat only when they differ.
import { floodTracker, guardVerdict, isCommentReaction, MUTE_MS, reactionDrift, reactionFixText, type GuardMessage, type ReactionType } from "@/lib/bot/channel-guard"

import { founderChats } from "./admin-routes"
import { logEvent } from "./events"
import { isDiscussionGroup, publicChannels } from "./group-guard"
import { phnomPenhToday } from "./market-sync"
import { botDb, botKey, sendText, tg } from "./telegram-bot"

const adminCache = new Map<string, { at: number; admin: boolean }>()

async function isGroupAdmin(chatId: number, userId: number | undefined, now = Date.now()): Promise<boolean> {
  if (!userId) return false
  const key = `${chatId}:${userId}`
  const hit = adminCache.get(key)
  if (hit && now - hit.at < 10 * 60_000) return hit.admin
  const r = await tg<{ status?: string }>("getChatMember", { chat_id: chatId, user_id: userId }).catch(() => null)
  const admin = r?.result?.status === "creator" || r?.result?.status === "administrator"
  adminCache.set(key, { at: now, admin })
  return admin
}

const flood = floodTracker()

/**
 * A message (new or edited) in a channel's discussion group: deleted when it carries an outside link or an abusive /
 * scam phrase; a second one within 10 minutes mutes the sender for 24 hours. True when the message was handled (it was
 * in a discussion group) — the caller then stops; false for every other group, untouched.
 */
export async function guardDiscussionMessage(m: GuardMessage & { chat: { id: number }; message_id?: number }): Promise<boolean> {
  if (!(await isDiscussionGroup(m.chat.id))) return false
  const verdict = guardVerdict(m, await isGroupAdmin(m.chat.id, m.from?.id))
  if (verdict.action === "allow" || !m.message_id) return true
  const del = await tg("deleteMessage", { chat_id: m.chat.id, message_id: m.message_id }).catch(() => null)
  let muted = false
  if (m.from?.id && flood.strike(m.chat.id, m.from.id, Date.now())) {
    const until = Math.floor((Date.now() + MUTE_MS) / 1000)
    const r = await tg("restrictChatMember", { chat_id: m.chat.id, user_id: m.from.id, permissions: { can_send_messages: false }, until_date: until }).catch(() => null)
    muted = Boolean(r?.ok)
  }
  logEvent(
    del?.ok ? "info" : "warn",
    "channel-guard",
    `Discussion group ${m.chat.id}: ${verdict.reason} message ${del?.ok ? "deleted" : `NOT deleted (${del?.description ?? "no reply"})`}${muted ? " · sender muted 24 h" : ""}`,
    { fold: true },
  )
  return true
}

export type ReactionUpdate = { chat: { id: number }; message_id: number; user?: { id: number }; actor_chat?: { id: number }; new_reaction: ReactionType[] }

/** A reaction in a discussion group outside the positive list: removed (deleteMessageReaction — groups only). */
export async function guardReaction(u: ReactionUpdate): Promise<void> {
  if (!(await isDiscussionGroup(u.chat.id))) return
  const bad = u.new_reaction.some((r) => r.type !== "emoji" || !r.emoji || !isCommentReaction(r.emoji))
  if (!bad) return
  const r = await tg("deleteMessageReaction", { chat_id: u.chat.id, message_id: u.message_id, ...(u.user ? { user_id: u.user.id } : u.actor_chat ? { actor_chat_id: u.actor_chat.id } : {}) }).catch(() => null)
  logEvent(r?.ok ? "info" : "warn", "channel-guard", `Discussion group ${u.chat.id}: a reaction outside the list ${r?.ok ? "removed" : `NOT removed (${r?.description ?? "no reply"})`}`, { fold: true })
}

/** 09:00 Cambodia time, once a day (claimed): each channel's reactions against the list; the founder told only on a difference. */
export async function reactionAuditTick() {
  const now = phnomPenhToday()
  if (now.hour < 9) return
  const { data: claimed } = await botDb().rpc("bot_claim_daily", { p_key: botKey(), p_job: "reaction-audit", p_day: now.day })
  if (claimed !== true) return
  const notes: string[] = []
  const channels = await publicChannels(true)
  for (const ch of channels) {
    const drift = reactionDrift(ch.reactions)
    if (!drift.ok) notes.push(reactionFixText(ch.name, drift))
  }
  if (!channels.length) logEvent("warn", "channel-guard", "Reaction check: no channel could be read", { fold: true })
  if (!notes.length) return logEvent("info", "channel-guard", `Reaction check ${now.day}: both channels on the positive list`, { fold: true })
  let sent = 0
  for (const chat of await founderChats()) if ((await sendText(chat, notes.join("\n\n")).catch(() => null))?.ok) sent++
  logEvent(sent ? "info" : "warn", "channel-guard", `Reaction check ${now.day}: ${notes.length} channel(s) differ — sent to ${sent} chat(s)`, { fold: true })
}

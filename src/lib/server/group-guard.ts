// Server only: the bot stays only in groups that have a shared pool linked.
// Added to a group → a short "link a pool within 10 minutes" note; no active
// pool linked for 10 minutes → a polite goodbye and leaveChat. The community
// chat (TELEGRAM_COMMUNITY_CHAT_ID / _CHANNEL_ID) and the content approval group
// («LCA Approval», /setapprovalgroup — founder, 19/10/2026) are never left.
import type { Locale } from "@/lib/i18n/dictionaries"

import { logEvent } from "./events"
import { botDb, botKey, sendText, tg, tr } from "./telegram-bot"
import { communityChannelRef, islamicChannelRef } from "@/lib/server/channel"
import { approvalFromEnv } from "@/lib/chat-route"

/** Groups seen recently (one database touch per group per hour, not per message). */
const seenAt = new Map<number, number>()

/** A message came from a group: make sure it is tracked (groups the bot joined before this existed). */
export async function noteGroupSeen(chatId: number) {
  if (await isApprovalChat(chatId)) return // the approval group is never on the watchdog's clock
  const now = Date.now()
  if (now - (seenAt.get(chatId) ?? 0) < 3_600_000) return
  seenAt.set(chatId, now)
  if (seenAt.size > 5_000) seenAt.delete(seenAt.keys().next().value!)
  await botDb().rpc("bot_group_seen", { p_key: botKey(), p_group: chatId, p_joined: false })
}

/** The bot was added to a group: start the 10-minute clock and say how to link a pool. */
export async function noteGroupJoined(chatId: number, lang: Locale) {
  seenAt.set(chatId, Date.now())
  await botDb().rpc("bot_group_seen", { p_key: botKey(), p_group: chatId, p_joined: true })
  if ((await isCommunityChat(chatId)) || (await isApprovalChat(chatId))) return
  await sendText(chatId, tr(lang, "bot.groupWelcome"))
}

/** The bot left or was removed. */
export async function noteGroupLeft(chatId: number) {
  seenAt.delete(chatId)
  await botDb().rpc("bot_group_forget", { p_key: botKey(), p_group: chatId })
}

let community: { ids: number[]; at: number } | null = null
/** The community channels' numeric ids — the general and the Islamic one (an id or an @username), cached for an hour. */
async function communityIds(): Promise<number[]> {
  if (community && Date.now() - community.at < 3_600_000) return community.ids
  const ids: number[] = []
  for (const raw of [communityChannelRef(), islamicChannelRef()]) {
    if (raw && /^-?\d+$/.test(raw)) ids.push(Number(raw))
    else if (raw) {
      const id = (await tg<{ id?: number }>("getChat", { chat_id: raw })).result?.id
      if (id) ids.push(id)
    }
  }
  community = { ids, at: Date.now() }
  return ids
}
const isCommunityChat = async (chatId: number) => (await communityIds()).includes(chatId)

/** Is this chat one of the public channels (the general or the Islamic one) — never a place for a preview. */
export const isPublicChannel = (chatId: number) => isCommunityChat(chatId)

let approval: { id: number | null; at: number } | null = null
/** The content approval group (the environment's, or the one set with /setapprovalgroup — read at most once a minute). */
async function isApprovalChat(chatId: number): Promise<boolean> {
  if (approvalFromEnv() === chatId) return true
  if (!approval || Date.now() - approval.at > 60_000) {
    const { data, error } = await botDb().rpc("bot_approval_chat", { p_key: botKey() })
    approval = { id: error || data === null || data === undefined ? null : Number(data), at: Date.now() }
  }
  return approval.id === chatId
}
/** After /setapprovalgroup: the new group is protected at once. */
export const forgetApprovalGroupCache = () => {
  approval = null
}

/**
 * Called every minute by the dispatcher: leaves groups with no active pool
 * linked for 10 minutes (a note first, in Khmer and English — the group's
 * language isn't known).
 */
export async function groupSweepTick() {
  const { data, error } = await botDb().rpc("bot_group_sweep", { p_key: botKey() })
  if (error || !Array.isArray(data) || data.length === 0) return
  let left = 0
  for (const row of data as { chat_id: number | string }[]) {
    const chatId = Number(row.chat_id)
    if ((await isCommunityChat(chatId)) || (await isApprovalChat(chatId))) {
      // Never leave the community chat or the approval group; stop tracking it.
      await noteGroupLeft(chatId)
      continue
    }
    await sendText(chatId, `${tr("km", "bot.groupLeaving")}\n\n${tr("en", "bot.groupLeaving")}`).catch(() => null)
    const res = await tg("leaveChat", { chat_id: chatId })
    // Left — or already gone (removed, group deleted): either way, stop tracking.
    if (res.ok || /not found|kicked|not a member|forbidden/i.test((res as { description?: string }).description ?? "")) {
      await noteGroupLeft(chatId)
      left += 1
    }
  }
  if (left) logEvent("info", "groups", `Left ${left} group${left === 1 ? "" : "s"} with no pool linked`, { fold: true })
}

// Server only: the chats each kind of admin message goes to (lib/chat-route.ts).
import { approvalFromEnv, reviewChats, routeOf } from "@/lib/chat-route"
import { isPublicChannel } from "@/lib/server/group-guard"
import { botDb, botKey } from "@/lib/server/telegram-bot"

async function superAdminChats(): Promise<number[]> {
  const { data } = await botDb().rpc("bot_super_admin_chats", { p_key: botKey() })
  return ((data as { chat_id: number }[] | null) ?? []).map((c) => Number(c.chat_id))
}

let approvalCache: { id: number | null; at: number } | null = null
/** The content approval group («LCA Approval»): the environment's, else the one set with /setapprovalgroup (cached 1 min). */
export async function approvalChat(): Promise<number | null> {
  const env = approvalFromEnv()
  if (env !== null) return env
  if (approvalCache && Date.now() - approvalCache.at < 60_000) return approvalCache.id
  const { data, error } = await botDb().rpc("bot_approval_chat", { p_key: botKey() })
  const id = error || data === null || data === undefined ? null : Number(data)
  approvalCache = { id: Number.isFinite(id) ? id : null, at: Date.now() }
  return approvalCache.id
}
/** After /setapprovalgroup: read the new group at once. */
export const forgetApprovalChat = () => {
  approvalCache = null
}

/**
 * Previews and posters (every content approval): the approval group when set, else the marketing chat, else the
 * super admins' private chats — never a public channel (lib/chat-route.ts reviewChats).
 */
export async function marketingChats(): Promise<number[]> {
  const approval = await approvalChat()
  const marketing = routeOf("marketing")?.chatId ?? null
  const publicIds = new Set<number>()
  for (const id of [approval, marketing]) if (id !== null && (await isPublicChannel(id))) publicIds.add(id)
  const group = reviewChats({ approval, marketing, superAdmins: [], isPublic: (id) => publicIds.has(id) })
  return group.length ? group : superAdminChats()
}

/**
 * Server and ops messages: the DevOps chat when set. Unset, they are not sent — the founder's chat is for
 * business — except a `critical` one (the app or the database down), which then goes to the super admins.
 */
export async function devopsChats(o: { critical?: boolean; founderFallback?: boolean } = {}): Promise<number[]> {
  const r = routeOf("devops")
  if (r) return [r.chatId]
  // A critical message, or one the founder asked to receive (the end-of-day report, 19/10/2026), reaches the super admins.
  return o.critical || o.founderFallback ? superAdminChats() : []
}

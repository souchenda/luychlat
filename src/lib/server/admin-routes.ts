// Server only: the chats each kind of admin message goes to (lib/chat-route.ts).
import { routeOf } from "@/lib/chat-route"
import { botDb, botKey } from "@/lib/server/telegram-bot"

async function superAdminChats(): Promise<number[]> {
  const { data } = await botDb().rpc("bot_super_admin_chats", { p_key: botKey() })
  return ((data as { chat_id: number }[] | null) ?? []).map((c) => Number(c.chat_id))
}

/** Previews and posters: the marketing chat when set, else the super admins' private chats. */
export async function marketingChats(): Promise<number[]> {
  const r = routeOf("marketing")
  return r ? [r.chatId] : superAdminChats()
}

/**
 * Server and ops messages: the DevOps chat when set. Unset, they are not sent — the founder's chat is for
 * business — except a `critical` one (the app or the database down), which then goes to the super admins.
 */
export async function devopsChats(o: { critical?: boolean } = {}): Promise<number[]> {
  const r = routeOf("devops")
  if (r) return [r.chatId]
  return o.critical ? superAdminChats() : []
}

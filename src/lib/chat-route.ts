// Where the bot's admin messages go (founder, 17/10/2026 — «the founder's chat is for business only»):
//   MARKETING_CHAT_ID — the 06:15 / 07:00 previews, holiday and fuel previews, festival posters, the 12:00 tip
//   DEVOPS_CHAT_ID    — server health, the daily dev summary, ATM reports, market-sync problems
// Each is a chat id, optionally with a forum topic: "-1001234567890" or "-1001234567890:42". Unset: marketing
// stays in the super admins' private chats; DevOps messages are not sent at all — except «the app is down»,
// which then goes to the super admins. Signups and sales are never routed: they stay in the owner's chat
// (a sale belongs to its own business — never a shared «sales» chat). Pure (chat-route.test.ts).

export type Route = { chatId: number; thread: number | null }
export type RouteKind = "marketing" | "devops"

/** "-1001234567890" / "-1001234567890:42" → the chat and its topic; anything else → null. */
export function parseRoute(value: string | null | undefined): Route | null {
  const m = /^\s*(-?\d{5,20})(?::(\d{1,10}))?\s*$/.exec(value ?? "")
  if (!m) return null
  return { chatId: Number(m[1]), thread: m[2] ? Number(m[2]) : null }
}

type Env = Record<string, string | undefined>
const VAR: Record<RouteKind, string> = { marketing: "MARKETING_CHAT_ID", devops: "DEVOPS_CHAT_ID" }

export const routeOf = (kind: RouteKind, env: Env = process.env): Route | null => parseRoute(env[VAR[kind]])

/** The topic to post in when `chatId` is a routed chat (a message sent there lands in its topic). */
export function threadFor(chatId: unknown, env: Env = process.env): number | null {
  const id = Number(chatId)
  if (!Number.isFinite(id)) return null
  for (const kind of ["marketing", "devops"] as const) {
    const r = routeOf(kind, env)
    if (r && r.chatId === id && r.thread) return r.thread
  }
  return null
}

/**
 * Where content previews go (founder, 19/10/2026 — «LCA Approval»): the approval group when set
 * (TELEGRAM_APPROVAL_CHAT_ID / APPROVAL_GROUP_ID in the environment, else the one a super admin set with
 * /setapprovalgroup), then the marketing chat, then the super admins' private chats. A preview never goes to a
 * public channel: an approval or marketing id that is one of the public channels is skipped.
 */
export function reviewChats(o: { approval: number | null; marketing: number | null; superAdmins: number[]; isPublic: (chatId: number) => boolean }): number[] {
  for (const id of [o.approval, o.marketing]) if (id !== null && !o.isPublic(id)) return [id]
  return o.superAdmins
}

/** The approval group's id from the environment (TELEGRAM_APPROVAL_CHAT_ID, or APPROVAL_GROUP_ID), else null. */
export const approvalFromEnv = (env: Env = process.env): number | null => parseRoute(env.TELEGRAM_APPROVAL_CHAT_ID ?? env.APPROVAL_GROUP_ID)?.chatId ?? null

import { categoryLabel } from "@/lib/categories/presets"
import { guestRepo } from "@/lib/data/guest-repo"
import type { AppNotification, Transaction, WorkspaceMember } from "@/lib/data/types"
import { uuid } from "@/lib/uuid"
import { useGuestDataStore } from "@/stores/guest-data-store"

import { activityText } from "./activity"

/**
 * Guest Mode stand-ins for the other phone: a simulated spouse can "join"
 * through an invite code and "record" an expense, so the attribution badge,
 * the activity alert and personal/shared wallets can be tried without an
 * account. Nothing here runs for signed-in users.
 */
const store = useGuestDataStore

export function simulateJoin(workspaceId: string, name: string, role: WorkspaceMember["role"] = "MEMBER"): WorkspaceMember {
  const at = new Date().toISOString()
  const member: WorkspaceMember = {
    id: uuid(),
    workspace_id: workspaceId,
    user_id: uuid(),
    role: role === "OWNER" ? "MEMBER" : role,
    joined_at: at,
    display_name: name.trim().slice(0, 40) || "Partner",
  }
  // Uses the newest open invite, like accepting the code on the other phone.
  const invite = store
    .getState()
    .invites.filter((i) => i.workspace_id === workspaceId && !i.used_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  store.setState((s) => ({
    members: [...s.members, { ...member, role: invite?.role ?? member.role }],
    invites: s.invites.map((i) => (i.id === invite?.id ? { ...i, used_at: at } : i)),
  }))
  return member
}

const SAMPLE_USD = [2.5, 4.25, 6.75, 12]
const SAMPLE_KHR = [8000, 15000, 24000, 40000]

/** The simulated member records a small expense on a shared wallet; the guest gets the activity alert. */
export async function simulateMemberExpense(
  workspaceId: string,
  member: WorkspaceMember,
  lang: "km" | "en",
): Promise<{ transaction: Transaction; notification: AppNotification } | null> {
  const state = store.getState()
  const wallet = state.wallets.find((w) => w.workspace_id === workspaceId && !w.archived_at && w.visibility !== "PERSONAL")
  if (!wallet) return null
  const categories = await guestRepo.listCategories(workspaceId)
  const category = categories.find((c) => c.preset_key === "food") ?? categories.find((c) => c.type === "EXPENSE")
  const samples = wallet.currency === "USD" ? SAMPLE_USD : SAMPLE_KHR
  const amount = samples[Math.floor(Math.random() * samples.length)]

  const created = await guestRepo.createEntry(workspaceId, {
    type: "EXPENSE",
    wallet_id: wallet.id,
    category_id: category?.id ?? null,
    amount,
    currency: wallet.currency,
    exchange_rate: null,
    note: null,
    transaction_date: new Date().toISOString(),
    receipt_url: null,
  })
  const transaction = { ...created, created_by: member.user_id, created_by_name: member.display_name }
  const text = activityText(
    {
      actor: member.display_name,
      type: "EXPENSE",
      amount,
      currency: wallet.currency,
      category: category ? categoryLabel(category, lang) : null,
      from: wallet.name,
    },
    lang,
  )
  const notification: AppNotification = {
    id: uuid(),
    workspace_id: workspaceId,
    debt_id: null,
    title: text.title,
    message: text.body,
    type: "ACTIVITY",
    is_read: false,
    scheduled_at: new Date().toISOString(),
    alert_key: null,
    user_id: state.profile.id,
    transaction_id: transaction.id,
    actor_name: member.display_name,
  }
  store.setState((s) => ({
    transactions: s.transactions.map((t) => (t.id === transaction.id ? transaction : t)),
    notifications: [...s.notifications, notification],
  }))
  return { transaction, notification }
}

import { create } from "zustand"
import { persist } from "zustand/middleware"

import type {
  AppNotification,
  Budget,
  Category,
  Debt,
  DebtRepayment,
  TelegramSettings,
  Tontine,
  TontinePayment,
  Transaction,
  Wallet,
  Workspace,
  WorkspaceInvite,
  WorkspaceMember,
} from "@/lib/data/types"
import { TONTINE_CATEGORY_PRESETS } from "@/lib/categories/presets"
import { uuid } from "@/lib/uuid"

/** Guest Mode database: lives only in this browser's localStorage (receipt images in IndexedDB). */
type GuestDataState = {
  workspaces: Workspace[]
  wallets: Wallet[]
  categories: Category[]
  transactions: Transaction[]
  debts: Debt[]
  repayments: DebtRepayment[]
  notifications: AppNotification[]
  telegram: TelegramSettings | null
  /** The guest's own identity on this device ("recorded by"). */
  profile: { id: string; display_name: string }
  /** Family workspace members; other people here are simulated. */
  members: WorkspaceMember[]
  /** Demo invite codes (nobody else can redeem them in Guest Mode). */
  invites: WorkspaceInvite[]
  budgets: Budget[]
  tontines: Tontine[]
  tontinePayments: TontinePayment[]
  /** Workspaces whose preset categories were already seeded (so deleting them all doesn't re-seed). */
  seededWorkspaceIds: string[]
  clear: () => void
}

const empty = {
  workspaces: [],
  wallets: [],
  categories: [],
  transactions: [],
  debts: [],
  repayments: [],
  notifications: [],
  telegram: null,
  members: [],
  invites: [],
  budgets: [],
  tontines: [],
  tontinePayments: [],
  seededWorkspaceIds: [],
}

const newProfile = () => ({ id: uuid(), display_name: "ខ្ញុំ" })

export const useGuestDataStore = create<GuestDataState>()(
  persist(
    (set) => ({
      ...empty,
      profile: newProfile(),
      // The device identity survives a data reset.
      clear: () => set(empty),
    }),
    {
      name: "luysmart-guest-data",
      version: 6,
      migrate: (persisted, version) => {
        let state = persisted as Partial<GuestDataState>
        if (version < 2) state = { ...state, categories: [], seededWorkspaceIds: [] }
        if (version < 3) {
          state = {
            ...state,
            debts: [],
            repayments: [],
            transactions: (state.transactions ?? []).map((t) => ({ ...t, debt_id: null })),
          }
        }
        if (version < 4) {
          state = {
            ...state,
            notifications: [],
            telegram: null,
            debts: (state.debts ?? []).map((d) => ({ ...d, disbursement_transaction_id: null })),
          }
        }
        if (version < 5) {
          const attribution = { created_by: null, created_by_name: null }
          state = {
            ...state,
            profile: newProfile(),
            members: [],
            invites: [],
            budgets: [],
            workspaces: (state.workspaces ?? []).map((w) => ({ ...w, user_id: "", role: "OWNER" as const, member_count: 1 })),
            wallets: (state.wallets ?? []).map((w) => ({ ...w, visibility: "SHARED" as const, owner_id: null })),
            transactions: (state.transactions ?? []).map((t) => ({ ...t, ...attribution })),
            debts: (state.debts ?? []).map((d) => ({ ...d, ...attribution })),
            repayments: (state.repayments ?? []).map((r) => ({ ...r, ...attribution })),
            notifications: (state.notifications ?? []).map((n) => ({ ...n, user_id: null, transaction_id: null, actor_name: null })),
          }
        }
        if (version < 6) {
          // Tontine, and its two default categories in workspaces already seeded.
          const categories = [...(state.categories ?? [])]
          for (const workspaceId of state.seededWorkspaceIds ?? []) {
            for (const p of Object.values(TONTINE_CATEGORY_PRESETS)) {
              if (categories.some((c) => c.workspace_id === workspaceId && c.preset_key === p.key)) continue
              categories.push({
                id: uuid(),
                workspace_id: workspaceId,
                name: p.name.km,
                type: p.type,
                icon: p.icon,
                color: p.color,
                preset_key: p.key,
                created_at: new Date().toISOString(),
              })
            }
          }
          state = { ...state, categories, tontines: [], tontinePayments: [] }
        }
        return state as GuestDataState
      },
    },
  ),
)

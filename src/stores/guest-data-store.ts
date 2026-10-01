import { create } from "zustand"
import { persist } from "zustand/middleware"

import type {
  AppNotification,
  Category,
  Debt,
  DebtRepayment,
  TelegramSettings,
  Transaction,
  Wallet,
  Workspace,
} from "@/lib/data/types"

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
  seededWorkspaceIds: [],
}

export const useGuestDataStore = create<GuestDataState>()(
  persist(
    (set) => ({
      ...empty,
      clear: () => set(empty),
    }),
    {
      name: "luysmart-guest-data",
      version: 4,
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
        return state as GuestDataState
      },
    },
  ),
)

import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { Category, Debt, DebtRepayment, Transaction, Wallet, Workspace } from "@/lib/data/types"

/** Guest Mode database: lives only in this browser's localStorage (receipt images in IndexedDB). */
type GuestDataState = {
  workspaces: Workspace[]
  wallets: Wallet[]
  categories: Category[]
  transactions: Transaction[]
  debts: Debt[]
  repayments: DebtRepayment[]
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
      version: 3,
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
        return state as GuestDataState
      },
    },
  ),
)

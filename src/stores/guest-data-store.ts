import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { Category, Transaction, Wallet, Workspace } from "@/lib/data/types"

/** Guest Mode database: lives only in this browser's localStorage (receipt images in IndexedDB). */
type GuestDataState = {
  workspaces: Workspace[]
  wallets: Wallet[]
  categories: Category[]
  transactions: Transaction[]
  /** Workspaces whose preset categories were already seeded (so deleting them all doesn't re-seed). */
  seededWorkspaceIds: string[]
  clear: () => void
}

const empty = { workspaces: [], wallets: [], categories: [], transactions: [], seededWorkspaceIds: [] }

export const useGuestDataStore = create<GuestDataState>()(
  persist(
    (set) => ({
      ...empty,
      clear: () => set(empty),
    }),
    {
      name: "luysmart-guest-data",
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as Partial<GuestDataState>
        if (version < 2) return { ...state, categories: [], seededWorkspaceIds: [] } as GuestDataState
        return state as GuestDataState
      },
    },
  ),
)

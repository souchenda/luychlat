import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { Transaction, Wallet, Workspace } from "@/lib/data/types"

/** Guest Mode database: lives only in this browser's localStorage. */
type GuestDataState = {
  workspaces: Workspace[]
  wallets: Wallet[]
  transactions: Transaction[]
  clear: () => void
}

export const useGuestDataStore = create<GuestDataState>()(
  persist(
    (set) => ({
      workspaces: [],
      wallets: [],
      transactions: [],
      clear: () => set({ workspaces: [], wallets: [], transactions: [] }),
    }),
    { name: "luysmart-guest-data", version: 1 },
  ),
)

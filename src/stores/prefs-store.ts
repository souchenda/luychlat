import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { WorkspaceType } from "@/lib/data/types"
import { DEFAULT_KHR_PER_USD } from "@/lib/money"

type PrefsState = {
  /** Active workspace, by type: unique per user, so it works for guest and cloud alike. */
  activeWorkspace: WorkspaceType
  hideBalances: boolean
  /** Configurable exchange rate used for conversions and net worth. */
  khrPerUsd: number
  setActiveWorkspace: (type: WorkspaceType) => void
  toggleHideBalances: () => void
  setKhrPerUsd: (rate: number) => void
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      activeWorkspace: "PERSONAL",
      hideBalances: false,
      khrPerUsd: DEFAULT_KHR_PER_USD,
      setActiveWorkspace: (activeWorkspace) => set({ activeWorkspace }),
      toggleHideBalances: () => set((s) => ({ hideBalances: !s.hideBalances })),
      setKhrPerUsd: (khrPerUsd) => set({ khrPerUsd }),
    }),
    { name: "luysmart-prefs" },
  ),
)

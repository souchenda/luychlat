import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { WorkspaceType } from "@/lib/data/types"
import { DEFAULT_KHR_PER_USD } from "@/lib/money"

type PrefsState = {
  /** Active workspace, by type: Personal/Business are unique per user, so it works for guest and cloud alike. */
  activeWorkspace: WorkspaceType
  /** Which family workspace, when the user belongs to more than one. */
  activeFamilyId: string | null
  hideBalances: boolean
  /** Configurable exchange rate used for conversions and net worth. */
  khrPerUsd: number
  setActiveWorkspace: (type: WorkspaceType, familyId?: string | null) => void
  toggleHideBalances: () => void
  setKhrPerUsd: (rate: number) => void
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      activeWorkspace: "PERSONAL",
      activeFamilyId: null,
      hideBalances: false,
      khrPerUsd: DEFAULT_KHR_PER_USD,
      setActiveWorkspace: (activeWorkspace, familyId) =>
        set((s) => ({ activeWorkspace, activeFamilyId: familyId === undefined ? s.activeFamilyId : familyId })),
      toggleHideBalances: () => set((s) => ({ hideBalances: !s.hideBalances })),
      setKhrPerUsd: (khrPerUsd) => set({ khrPerUsd }),
    }),
    { name: "luysmart-prefs" },
  ),
)

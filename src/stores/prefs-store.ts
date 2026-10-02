import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { WorkspaceType } from "@/lib/data/types"
import { DEFAULT_KHR_PER_USD, LEGACY_DEFAULT_KHR_PER_USD } from "@/lib/money"

type PrefsState = {
  /** Active workspace, by type: Personal/Business are unique per user, so it works for guest and cloud alike. */
  activeWorkspace: WorkspaceType
  /** Which family workspace, when the user belongs to more than one. */
  activeFamilyId: string | null
  hideBalances: boolean
  /**
   * Exchange rate used for conversions and net worth. The saved value is in
   * the database (workspaces.khr_per_usd); ExchangeRateSync keeps this equal
   * to it, so this local copy only makes the first paint instant.
   */
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
    {
      name: "luysmart-prefs",
      version: 1,
      // The old built-in default (4,100) must never show, even for a moment
      // before the saved rate loads: a device still holding it starts at 4,000.
      migrate: (persisted, version) => {
        const state = persisted as Partial<PrefsState>
        if (version < 1 && state.khrPerUsd === LEGACY_DEFAULT_KHR_PER_USD) return { ...state, khrPerUsd: DEFAULT_KHR_PER_USD }
        return state as PrefsState
      },
    },
  ),
)

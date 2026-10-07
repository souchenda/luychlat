import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { WorkspaceType } from "@/lib/data/types"
import { DEFAULT_KHR_PER_USD, LEGACY_DEFAULT_KHR_PER_USD } from "@/lib/money"

type PrefsState = {
  /** Active workspace, by type: Personal/Business are unique per user, so it works for guest and cloud alike. */
  activeWorkspace: WorkspaceType
  /** Which family workspace, when the user belongs to more than one. */
  activeFamilyId: string | null
  /** Which business workspace (Ultra users can have several). */
  activeBusinessId: string | null
  hideBalances: boolean
  /**
   * Exchange rate used for conversions and net worth. The saved value is in
   * the database (workspaces.khr_per_usd); ExchangeRateSync keeps this equal
   * to it, so this local copy only makes the first paint instant.
   */
  khrPerUsd: number
  /** Wallets page: list wallets under their bank (default) or as one list. */
  walletsGrouped: boolean
  /** Wallets page: bank groups the user folded away (provider keys). */
  collapsedBanks: string[]
  /** `id` picks a specific Family or Business workspace. */
  setActiveWorkspace: (type: WorkspaceType, id?: string | null) => void
  toggleHideBalances: () => void
  setKhrPerUsd: (rate: number) => void
  setWalletsGrouped: (grouped: boolean) => void
  toggleBankCollapsed: (key: string) => void
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      activeWorkspace: "PERSONAL",
      activeFamilyId: null,
      activeBusinessId: null,
      hideBalances: false,
      khrPerUsd: DEFAULT_KHR_PER_USD,
      walletsGrouped: true,
      collapsedBanks: [],
      setActiveWorkspace: (activeWorkspace, id) =>
        set((s) => ({
          activeWorkspace,
          activeFamilyId: activeWorkspace === "FAMILY" && id !== undefined ? id : s.activeFamilyId,
          activeBusinessId: activeWorkspace === "BUSINESS" && id !== undefined ? id : s.activeBusinessId,
        })),
      toggleHideBalances: () => set((s) => ({ hideBalances: !s.hideBalances })),
      setKhrPerUsd: (khrPerUsd) => set({ khrPerUsd }),
      setWalletsGrouped: (walletsGrouped) => set({ walletsGrouped }),
      toggleBankCollapsed: (key) =>
        set((s) => ({
          collapsedBanks: s.collapsedBanks.includes(key) ? s.collapsedBanks.filter((k) => k !== key) : [...s.collapsedBanks, key],
        })),
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

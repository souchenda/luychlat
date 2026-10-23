import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { WorkspaceType } from "@/lib/data/types"
import { DEFAULT_KHR_PER_USD, LEGACY_DEFAULT_KHR_PER_USD } from "@/lib/money"
import { eyeAction } from "@/lib/security/balance-reveal"
import { useLockStore } from "@/stores/lock-store"

type PrefsState = {
  /** Active workspace, by type: Personal/Business are unique per user, so it works for guest and cloud alike. */
  activeWorkspace: WorkspaceType
  /** Which family workspace, when the user belongs to more than one. */
  activeFamilyId: string | null
  /** Which business workspace (Ultra users can have several). */
  activeBusinessId: string | null
  /**
   * Privacy by default (founder, 13/10/2026): balances start hidden on every launch / reload — never
   * saved — and hide again whenever the app goes to the background (BalancePrivacyGuard).
   */
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
  /** 🪷 One soft temple bell with Home's holy-day reminder (Personal only, never with Islamic Mode). On by default. */
  holyDayChime: boolean
  /** 💰 «ទីង-ទីង» on this phone when a KHQR payment arrives (lib/payment-chime.ts — founder, 21/10/2026). On by default. */
  paymentChime: boolean
  /**
   * 🏪 Counter Soundbox Mode on this phone (Task #442): the screen kept on everywhere in the app, with the chime and the
   * spoken amount — a dedicated counter device. Off by default; Business workspaces only (lib/payment-chime.ts).
   */
  counterMode: boolean
  /** Flip to hide (Task #461): laid face down, the balances are masked (components/privacy/flip-to-hide.tsx). On by default. */
  flipToHide: boolean
  /**
   * «ចាក់សោរសមតុល្យដោយលេខកូដ 6 ខ្ទង់» (Task #477): revealing the balances asks for the App Lock PIN
   * (lib/security/balance-reveal.ts). Off by default; this phone only.
   */
  balancePinLock: boolean
  /** A reveal waiting for the PIN: raised by the eye, answered by BalanceRevealGate (never saved). */
  revealRequest: number
  /** `id` picks a specific Family or Business workspace. */
  setActiveWorkspace: (type: WorkspaceType, id?: string | null) => void
  /** The eye: masks at once; reveals at once — or asks for the PIN first when the balance lock is on (Task #477). */
  toggleHideBalances: () => void
  setHideBalances: (hidden: boolean) => void
  setBalancePinLock: (on: boolean) => void
  setKhrPerUsd: (rate: number) => void
  setWalletsGrouped: (grouped: boolean) => void
  toggleBankCollapsed: (key: string) => void
  setHolyDayChime: (on: boolean) => void
  setPaymentChime: (on: boolean) => void
  /** Turning the counter mode on also turns the chime on (a counter phone that stays silent is no soundbox). */
  setCounterMode: (on: boolean) => void
  setFlipToHide: (on: boolean) => void
}

/** Restoring saved preferences: all as saved, except balances — every launch starts hidden. */
export const restorePrefs = <T extends { hideBalances: boolean }>(persisted: unknown, current: T): T => ({ ...current, ...(persisted as Partial<T>), hideBalances: true })

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      activeWorkspace: "PERSONAL",
      activeFamilyId: null,
      activeBusinessId: null,
      hideBalances: true,
      khrPerUsd: DEFAULT_KHR_PER_USD,
      walletsGrouped: true,
      collapsedBanks: [],
      holyDayChime: true,
      paymentChime: true,
      counterMode: false,
      flipToHide: true,
      balancePinLock: false,
      revealRequest: 0,
      setActiveWorkspace: (activeWorkspace, id) =>
        set((s) => ({
          activeWorkspace,
          activeFamilyId: activeWorkspace === "FAMILY" && id !== undefined ? id : s.activeFamilyId,
          activeBusinessId: activeWorkspace === "BUSINESS" && id !== undefined ? id : s.activeBusinessId,
        })),
      toggleHideBalances: () =>
        set((s) => {
          const action = eyeAction({ hidden: s.hideBalances, lockOn: s.balancePinLock, hasPin: Boolean(useLockStore.getState().pinHash) })
          return action === "ask-pin" ? { revealRequest: s.revealRequest + 1 } : { hideBalances: action === "hide" }
        }),
      setBalancePinLock: (balancePinLock) => set({ balancePinLock }),
      setHideBalances: (hideBalances) => set({ hideBalances }),
      setKhrPerUsd: (khrPerUsd) => set({ khrPerUsd }),
      setWalletsGrouped: (walletsGrouped) => set({ walletsGrouped }),
      setHolyDayChime: (holyDayChime) => set({ holyDayChime }),
      setPaymentChime: (paymentChime) => set({ paymentChime }),
      setFlipToHide: (flipToHide) => set({ flipToHide }),
      setCounterMode: (counterMode) => set(counterMode ? { counterMode, paymentChime: true } : { counterMode }),
      toggleBankCollapsed: (key) =>
        set((s) => ({
          collapsedBanks: s.collapsedBanks.includes(key) ? s.collapsedBanks.filter((k) => k !== key) : [...s.collapsedBanks, key],
        })),
    }),
    {
      name: "luysmart-prefs",
      version: 1,
      merge: restorePrefs,
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

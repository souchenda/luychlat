import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { BiometricPreference } from "@/lib/security/biometric"
import { PIN_LENGTH } from "@/lib/security/pin"

export const AUTO_LOCK_OPTIONS = [0, 1, 5, 15] as const
export type AutoLockMinutes = (typeof AUTO_LOCK_OPTIONS)[number]

export const MAX_PIN_ATTEMPTS = 5
const BASE_LOCKOUT_MS = 30_000

type PersistedLockState = {
  pinHash: string | null
  pinSalt: string | null
  /** Digits in the saved PIN: 6, or 4 for a PIN made before 6-digit PINs. */
  pinLength: number
  biometricCredentialId: string | null
  /** Icon/wording on the lock screen; "auto" guesses from the device. */
  biometricPreference: BiometricPreference
  autoLockMinutes: AutoLockMinutes
  /** Failed attempts since the last successful unlock / lockout. */
  failedAttempts: number
  /** Number of lockouts so far; each one doubles the wait. */
  lockoutCount: number
  lockoutUntil: number | null
}

type LockState = PersistedLockState & {
  isLocked: boolean
  setPin: (hash: string, salt: string) => void
  clearSecurity: () => void
  setBiometricCredential: (id: string | null) => void
  setBiometricPreference: (preference: BiometricPreference) => void
  setAutoLock: (minutes: AutoLockMinutes) => void
  lock: () => void
  unlock: () => void
  registerFailure: () => void
}

export const useLockStore = create<LockState>()(
  persist(
    (set, get) => ({
      pinHash: null,
      pinSalt: null,
      pinLength: PIN_LENGTH,
      biometricCredentialId: null,
      biometricPreference: "auto",
      autoLockMinutes: 1,
      failedAttempts: 0,
      lockoutCount: 0,
      lockoutUntil: null,
      isLocked: false,

      setPin: (pinHash, pinSalt) => set({ pinHash, pinSalt, pinLength: PIN_LENGTH, failedAttempts: 0 }),
      clearSecurity: () =>
        set({
          pinHash: null,
          pinSalt: null,
          pinLength: PIN_LENGTH,
          biometricCredentialId: null,
          failedAttempts: 0,
          lockoutCount: 0,
          lockoutUntil: null,
          isLocked: false,
        }),
      setBiometricCredential: (biometricCredentialId) => set({ biometricCredentialId }),
      setBiometricPreference: (biometricPreference) => set({ biometricPreference }),
      setAutoLock: (autoLockMinutes) => set({ autoLockMinutes }),
      lock: () => {
        if (get().pinHash) set({ isLocked: true })
      },
      unlock: () => set({ isLocked: false, failedAttempts: 0, lockoutCount: 0, lockoutUntil: null }),
      registerFailure: () => {
        const failedAttempts = get().failedAttempts + 1
        if (failedAttempts < MAX_PIN_ATTEMPTS) return set({ failedAttempts })
        const lockoutCount = get().lockoutCount + 1
        set({
          failedAttempts: 0,
          lockoutCount,
          lockoutUntil: Date.now() + BASE_LOCKOUT_MS * 2 ** (lockoutCount - 1),
        })
      },
    }),
    {
      name: "luysmart-lock",
      partialize: (s): PersistedLockState => ({
        pinHash: s.pinHash,
        pinSalt: s.pinSalt,
        pinLength: s.pinLength,
        biometricCredentialId: s.biometricCredentialId,
        biometricPreference: s.biometricPreference,
        autoLockMinutes: s.autoLockMinutes,
        failedAttempts: s.failedAttempts,
        lockoutCount: s.lockoutCount,
        lockoutUntil: s.lockoutUntil,
      }),
      // A fresh page load always starts locked when a PIN exists.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PersistedLockState>
        // PINs saved before pinLength existed are the old 4-digit ones.
        const pinLength = p.pinHash ? (p.pinLength ?? 4) : PIN_LENGTH
        return { ...current, ...p, pinLength, isLocked: Boolean(p.pinHash) }
      },
    },
  ),
)

import { create } from "zustand"
import { persist } from "zustand/middleware"

export const AUTO_LOCK_OPTIONS = [0, 1, 5, 15] as const
export type AutoLockMinutes = (typeof AUTO_LOCK_OPTIONS)[number]

export const MAX_PIN_ATTEMPTS = 5
const BASE_LOCKOUT_MS = 30_000

type PersistedLockState = {
  pinHash: string | null
  pinSalt: string | null
  biometricCredentialId: string | null
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
      biometricCredentialId: null,
      autoLockMinutes: 1,
      failedAttempts: 0,
      lockoutCount: 0,
      lockoutUntil: null,
      isLocked: false,

      setPin: (pinHash, pinSalt) => set({ pinHash, pinSalt, failedAttempts: 0 }),
      clearSecurity: () =>
        set({
          pinHash: null,
          pinSalt: null,
          biometricCredentialId: null,
          failedAttempts: 0,
          lockoutCount: 0,
          lockoutUntil: null,
          isLocked: false,
        }),
      setBiometricCredential: (biometricCredentialId) => set({ biometricCredentialId }),
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
        biometricCredentialId: s.biometricCredentialId,
        autoLockMinutes: s.autoLockMinutes,
        failedAttempts: s.failedAttempts,
        lockoutCount: s.lockoutCount,
        lockoutUntil: s.lockoutUntil,
      }),
      // A fresh page load always starts locked when a PIN exists.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PersistedLockState>
        return { ...current, ...p, isLocked: Boolean(p.pinHash) }
      },
    },
  ),
)

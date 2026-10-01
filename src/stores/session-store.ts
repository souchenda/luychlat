import type { User } from "@supabase/supabase-js"
import { create } from "zustand"
import { persist } from "zustand/middleware"

type SessionState = {
  /** Guest Mode ("Try first"): data stays on this device until the user signs up. */
  isGuest: boolean
  /** Supabase user; never persisted here (Supabase owns the session cookie). */
  user: User | null
  /** True once the initial Supabase session lookup has finished. */
  authReady: boolean
  startGuest: () => void
  endGuest: () => void
  setUser: (user: User | null) => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      isGuest: false,
      user: null,
      authReady: false,
      startGuest: () => set({ isGuest: true }),
      endGuest: () => set({ isGuest: false }),
      setUser: (user) => set({ user, authReady: true, ...(user ? { isGuest: false } : {}) }),
    }),
    {
      name: "luysmart-session",
      partialize: (s) => ({ isGuest: s.isGuest }),
    },
  ),
)

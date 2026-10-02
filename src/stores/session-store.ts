import type { User } from "@supabase/supabase-js"
import { create } from "zustand"

type SessionState = {
  /** Supabase user; never persisted here (Supabase owns the session cookie). */
  user: User | null
  /** True once the initial Supabase session lookup has finished. */
  authReady: boolean
  setUser: (user: User | null) => void
}

/** Every user has an account (Guest Mode was retired): no user means the login screen. */
export const useSessionStore = create<SessionState>()((set) => ({
  user: null,
  authReady: false,
  setUser: (user) => set({ user, authReady: true }),
}))

// The retired Guest Mode flag lived here; drop it from devices that still have it.
if (typeof window !== "undefined") {
  try {
    localStorage.removeItem("luysmart-session")
  } catch {
    // storage blocked
  }
}

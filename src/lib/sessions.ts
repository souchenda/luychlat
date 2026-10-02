"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useSessionStore } from "@/stores/session-store"

/** One sign-in session of the current user (public.my_sessions()). */
export type ActiveSession = {
  id: string
  created_at: string
  last_active_at: string
  user_agent: string | null
  ip: string | null
  aal: string | null
  is_current: boolean
}

export type DeviceKind = "phone" | "tablet" | "desktop"
export type Device = { os: string; browser: string; kind: DeviceKind }

/** Rough device description from a browser user agent ("iPhone · Safari", "Windows · Chrome"). */
export function describeDevice(ua: string | null | undefined): Device {
  const s = ua ?? ""
  const os = /iPhone/.test(s)
    ? "iPhone"
    : /iPad/.test(s)
      ? "iPad"
      : /Android/.test(s)
        ? (s.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/)?.[1]?.trim() ?? "Android")
        : /Windows/.test(s)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(s)
            ? "Mac"
            : /CrOS/.test(s)
              ? "ChromeOS"
              : /Linux/.test(s)
                ? "Linux"
                : "Unknown"
  const browser = /Edg\//.test(s)
    ? "Edge"
    : /SamsungBrowser/.test(s)
      ? "Samsung Internet"
      : /OPR\/|Opera/.test(s)
        ? "Opera"
        : /Firefox|FxiOS/.test(s)
          ? "Firefox"
          : /CriOS|Chrome\//.test(s)
            ? "Chrome"
            : /Safari\//.test(s) || /iPhone|iPad/.test(s)
              ? "Safari"
              : ""
  const kind: DeviceKind = /iPad|Tablet/.test(s) || (/Android/.test(s) && !/Mobile/.test(s)) ? "tablet" : /iPhone|Mobile|Android/.test(s) ? "phone" : "desktop"
  return { os, browser, kind }
}

/** Active within the last few minutes (or this device). */
export const isActiveNow = (s: Pick<ActiveSession, "is_current" | "last_active_at">, now = Date.now()) =>
  s.is_current || now - new Date(s.last_active_at).getTime() < 5 * 60_000

export function useActiveSessions(enabled = true) {
  const userId = useSessionStore((s) => s.user?.id)
  return useQuery({
    queryKey: ["active-sessions", userId],
    enabled: enabled && Boolean(userId),
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()!.rpc("my_sessions")
      if (error) throw error
      return (data ?? []) as ActiveSession[]
    },
  })
}

export function useSessionMutations() {
  const queryClient = useQueryClient()
  const done = () => void queryClient.invalidateQueries({ queryKey: ["active-sessions"] })
  return {
    revoke: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await getSupabaseBrowserClient()!.rpc("revoke_session", { p_session_id: id })
        if (error) throw error
      },
      onSuccess: done,
    }),
    /** Supabase's own sign-out of the other sessions, then our cleanup of any left. */
    revokeOthers: useMutation({
      mutationFn: async () => {
        const supabase = getSupabaseBrowserClient()!
        await supabase.auth.signOut({ scope: "others" })
        const { error } = await supabase.rpc("revoke_other_sessions")
        if (error) throw error
      },
      onSuccess: done,
    }),
  }
}

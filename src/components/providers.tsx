"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { useEffect, useState } from "react"

import { Toaster } from "@/components/ui/sonner"
import { signOutEverywhere } from "@/lib/auth/sign-out"
import { installNativeBridge } from "@/lib/native-bridge"
import { getQueryClient } from "@/lib/query-client"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useLocaleStore } from "@/stores/locale-store"
import { useSessionStore } from "@/stores/session-store"

function AuthListener() {
  const setUser = useSessionStore((s) => s.setUser)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setUser(null)
      return
    }
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => data.subscription.unsubscribe()
  }, [setUser])

  return null
}

function HtmlLang() {
  const locale = useLocaleStore((s) => s.locale)
  useEffect(() => {
    // zh-Hans lets the phone pick a Simplified Chinese font.
    document.documentElement.lang = locale === "zh" ? "zh-Hans" : locale
  }, [locale])
  return null
}

function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {})
    }
  }, [])
  return null
}

/**
 * One device per account: once the account signs in on another device, this
 * one's session is gone. Checked every minute and whenever the app comes back
 * to the front; then this device signs out and says why on the login page.
 */
function SessionGuard() {
  const userId = useSessionStore((s) => s.user?.id)
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    if (!userId || !supabase) return
    let stopped = false
    const check = async () => {
      if (stopped || document.visibilityState === "hidden") return
      const { data, error } = await supabase.rpc("my_session_alive")
      // Offline or a server hiccup proves nothing: only an explicit "no" signs out.
      if (error || data !== false || stopped) return
      stopped = true
      // Only this device: the session that replaced it must stay signed in.
      await signOutEverywhere("local").catch(() => {})
      window.location.replace("/login?signed_out=elsewhere")
    }
    const onVisible = () => void check()
    const timer = setInterval(onVisible, 60_000)
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    void check()
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [userId])
  return null
}

/** Android app only: share sheet for shares and downloads (see lib/native-bridge.ts). */
function NativeBridge() {
  useEffect(() => installNativeBridge(), [])
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(getQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <AuthListener />
        <HtmlLang />
        <ServiceWorker />
        <NativeBridge />
        <SessionGuard />
        {children}
        <Toaster position="top-center" richColors />
      </ThemeProvider>
    </QueryClientProvider>
  )
}

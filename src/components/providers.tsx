"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { useEffect, useState } from "react"

import { Toaster } from "@/components/ui/sonner"
import { getQueryClient } from "@/lib/query-client"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { resolveSeason } from "@/lib/theme/seasons"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"
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

/** Keeps <html data-season> in step with the theme setting (the boot script sets it first). */
function SeasonTheme() {
  const choice = usePrefsStore((s) => s.colorTheme)
  useEffect(() => {
    document.documentElement.dataset.season = resolveSeason(choice)
  }, [choice])
  return null
}

function HtmlLang() {
  const locale = useLocaleStore((s) => s.locale)
  useEffect(() => {
    document.documentElement.lang = locale
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

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(getQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <AuthListener />
        <HtmlLang />
        <SeasonTheme />
        <ServiceWorker />
        {children}
        <Toaster position="top-center" richColors />
      </ThemeProvider>
    </QueryClientProvider>
  )
}

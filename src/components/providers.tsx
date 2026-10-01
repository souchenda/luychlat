"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { useEffect, useState } from "react"

import { Toaster } from "@/components/ui/sonner"
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
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <AuthListener />
        <HtmlLang />
        <ServiceWorker />
        {children}
        <Toaster position="top-center" richColors />
      </ThemeProvider>
    </QueryClientProvider>
  )
}

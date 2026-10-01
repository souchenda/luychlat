"use client"

import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { BottomNav } from "@/components/layout/bottom-nav"
import { AppLock } from "@/components/lock/app-lock"
import { useHydrated } from "@/hooks/use-hydrated"
import { WorkspaceSwitcher } from "@/components/workspace/workspace-switcher"
import { useLockStore } from "@/stores/lock-store"
import { usePrefsStore } from "@/stores/prefs-store"
import { useSessionStore } from "@/stores/session-store"

/**
 * Client-side gate for signed-in users and Guest Mode. This only controls what
 * the UI shows; cloud data is protected by Supabase RLS, not by this gate.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const hydrated = useHydrated()
  const { user, isGuest, authReady } = useSessionStore()
  const isLocked = useLockStore((s) => s.isLocked && Boolean(s.pinHash))
  const activeWorkspace = usePrefsStore((s) => s.activeWorkspace)
  const allowed = Boolean(user) || isGuest

  useEffect(() => {
    if (hydrated && authReady && !allowed) router.replace("/login")
  }, [hydrated, authReady, allowed, router])

  if (!hydrated || !allowed) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // While locked, keep pages mounted (drafts survive) but out of view and the accessibility tree.
  return (
    <>
      <AppLock />
      <div hidden={isLocked} inert={isLocked}>
        <header className="sticky top-0 z-30 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="mx-auto w-full max-w-md px-4 py-2.5">
            <WorkspaceSwitcher />
          </div>
        </header>
        {/* Re-keyed on switch so the new workspace's content fades in. */}
        <main
          key={activeWorkspace}
          className="mx-auto min-h-dvh w-full max-w-md px-4 pt-5 pb-24 animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
        >
          {children}
        </main>
        <BottomNav />
      </div>
    </>
  )
}

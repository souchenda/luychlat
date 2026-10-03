"use client"

import { Loader2Icon } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"

import { BillingSync } from "@/components/billing/billing-sync"
import { WorkspaceLockedBanner } from "@/components/billing/business-trial"
import { ExchangeRateSync } from "@/lib/exchange-rate"
import { PendingReferralRedeemer } from "@/components/billing/referral"
import { UpgradeSheet } from "@/components/billing/upgrade-sheet"
import { DesktopSidebar, MobileNavTrigger } from "@/components/layout/app-nav"
import { BottomNav } from "@/components/layout/bottom-nav"
import { HashScroller } from "@/components/layout/hash-scroller"
import { PrayerAlertScheduler } from "@/components/islamic/prayer-alerts"
import { AppLock } from "@/components/lock/app-lock"
import { MfaGate } from "@/components/security/mfa-gate"
import { StepUpDialog } from "@/components/security/step-up"
import { useHydrated } from "@/hooks/use-hydrated"
import { PendingInviteRedirect } from "@/components/family/pending-invite"
import { RealtimeSync } from "@/components/family/realtime-sync"
import { GuestImportPrompt } from "@/components/settings/guest-import"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { WorkspaceSwitcher } from "@/components/workspace/workspace-switcher"
import { useActiveWorkspace } from "@/lib/data/hooks"
import { cn } from "@/lib/utils"
import { useLockStore } from "@/stores/lock-store"
import { usePrefsStore } from "@/stores/prefs-store"
import { useSessionStore } from "@/stores/session-store"

/**
 * Client-side gate: signed-in users only. This only controls what the UI
 * shows; data is protected by Supabase RLS, not by this gate.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const hydrated = useHydrated()
  const { user, authReady } = useSessionStore()
  const isLocked = useLockStore((s) => s.isLocked && Boolean(s.pinHash))
  const activeWorkspace = usePrefsStore((s) => s.activeWorkspace)
  const { workspace } = useActiveWorkspace()
  // An account is required for every screen (Guest Mode was retired).
  const allowed = Boolean(user)
  // Sub-pages with their own "←" header don't need the workspace bar on top.
  const pathname = usePathname()
  const bare = pathname === "/profile"

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
  // 2FA accounts enter their code before anything (including data) loads.
  return (
    <MfaGate>
      <AppLock />
      <StepUpDialog />
      <PrayerAlertScheduler />
      <RealtimeSync />
      <PendingInviteRedirect />
      <GuestImportPrompt />
      <BillingSync />
      <ExchangeRateSync />
      <PendingReferralRedeemer />
      <UpgradeSheet />
      <div hidden={isLocked} inert={isLocked} className="md:pl-68 print:pl-0">
        <DesktopSidebar />
        <HashScroller />
        {/* Phones: full screen. Tablets and up: a centered card (see .app-frame). */}
        <div className="app-frame">
          <header className={cn("sticky top-0 z-30 border-b print:hidden bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur", bare && "hidden")}>
            <div className="mx-auto flex w-full max-w-md items-center gap-1 px-4 py-2.5">
              <MobileNavTrigger />
              <div className="min-w-0 flex-1">
                <WorkspaceSwitcher />
              </div>
              {/* Settings, Islamic tools and the rest live in the ☰ menu / sidebar. */}
              <NotificationBell />
            </div>
          </header>
          {/* Re-keyed on switch so the new workspace's content fades in. */}
          <main
            key={workspace?.id ?? activeWorkspace}
            className={cn(
              "mx-auto min-h-dvh w-full max-w-md px-4 pt-5 pb-24 md:min-h-0 print:max-w-none print:p-0 animate-in fade-in-0 slide-in-from-bottom-1 duration-300",
              bare && "pt-[calc(env(safe-area-inset-top)+0.75rem)]",
            )}
          >
            <WorkspaceLockedBanner workspace={workspace} />
            {children}
          </main>
        </div>
        <BottomNav />
      </div>
    </MfaGate>
  )
}

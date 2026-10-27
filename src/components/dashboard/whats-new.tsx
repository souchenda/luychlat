"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useWorkspaces } from "@/lib/data/hooks"
import { pick } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { readVoiceGender } from "@/lib/soundbox"
import { greetingClipUrl } from "@/lib/welcome-greeting"
import { markSeen, pendingAnnouncements, readSeen, type WhatsNewEntry } from "@/lib/whats-new"
import { useLocaleStore } from "@/stores/locale-store"
import { useLockStore } from "@/stores/lock-store"

/** After the unlock, once the welcome pill has gone (welcome-greeting.tsx, 5.2 s) — never on top of it. */
export const WHATS_NEW_DELAY_MS = 6_000

/**
 * «✨ មុខងារថ្មី» (founder, 27/10/2026): a new feature announced once on this phone, with [ សាកល្បងឥឡូវ ] to try it at
 * once and [ យល់ហើយ ]. Waits for the App Lock to open and for any other dialog (the birthday, a festival splash) to
 * close — one window at a time. One announcement per launch; the next one comes the next time the app opens.
 */
export function WhatsNewDialog({ islamic }: { islamic: boolean }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const workspaces = useWorkspaces().data
  const [entry, setEntry] = useState<WhatsNewEntry | null>(null)

  useEffect(() => {
    if (!workspaces) return
    let local: Storage | null = null
    try {
      local = window.localStorage
    } catch {}
    const next = pendingAnnouncements({ seen: readSeen(local), now: Date.now(), business: workspaces.some((w) => w.type === "BUSINESS") })[0]
    if (!next) return
    let wait = 0
    let since: number | null = null
    // Polled: the lock (read from the store itself — the hydration snapshot says «unlocked») and no other dialog open.
    const tick = () => {
      const s = useLockStore.getState()
      const free = !(s.isLocked && s.pinHash) && !document.querySelector('[role="dialog"], [role="alertdialog"]')
      if (!free) since = null
      else since ??= Date.now()
      if (since !== null && Date.now() - since >= WHATS_NEW_DELAY_MS) {
        markSeen(local, [next.id])
        setEntry(next)
        return
      }
      wait = window.setTimeout(tick, 500)
    }
    tick()
    return () => window.clearTimeout(wait)
    // Once per launch, when the workspaces are known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(workspaces)])

  if (!entry) return null
  const close = () => setEntry(null)
  const tryIt = () => {
    if (entry.action.kind === "greeting") {
      let local: Storage | null = null
      try {
        local = window.localStorage
      } catch {}
      // A tap: the browser lets it sound. The person's own volume decides; this is the preview they asked for.
      void new Audio(greetingClipUrl(islamic ? "islamic" : "khmer", readVoiceGender(local))).play().catch(() => null)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <p className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-300">{t("whatsNew.badge")}</p>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span aria-hidden>{entry.icon}</span>
            {pick(entry.title, locale)}
          </DialogTitle>
          <DialogDescription className="text-[15px] leading-7 text-foreground/80">{pick(entry.body, locale)}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="grid grid-cols-2 gap-2 sm:flex">
          {entry.action.kind === "link" ? (
            <Button asChild className="h-12 rounded-2xl">
              <Link href={entry.action.href} onClick={close}>
                {t("whatsNew.try")}
              </Link>
            </Button>
          ) : (
            <Button type="button" className="h-12 rounded-2xl" onClick={tryIt}>
              {t("whatsNew.try")}
            </Button>
          )}
          <Button type="button" variant="outline" className="h-12 rounded-2xl" onClick={close}>
            {t("whatsNew.gotIt")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

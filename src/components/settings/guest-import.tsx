"use client"

import { useQueryClient } from "@tanstack/react-query"
import { CloudUploadIcon, Loader2Icon, Trash2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { useHydrated } from "@/hooks/use-hydrated"
import { clearGuestData, hasGuestData, importGuestData, type GuestSummary } from "@/lib/data/guest-import"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useGuestDataStore } from "@/stores/guest-data-store"
import { useSessionStore } from "@/stores/session-store"

const DISMISSED_KEY = "luysmart-guest-import-dismissed"

/** Live counts of the Guest Mode data still on this device. */
export function useGuestSummary(): GuestSummary {
  const wallets = useGuestDataStore((s) => s.wallets.length)
  const transactions = useGuestDataStore((s) => s.transactions.length)
  const debts = useGuestDataStore((s) => s.debts.length)
  const budgets = useGuestDataStore((s) => s.budgets.length)
  return { wallets, transactions, debts, budgets }
}

/** Asks to move this device's Guest Mode data into the signed-in account. */
export function GuestImportSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT()
  const queryClient = useQueryClient()
  const userId = useSessionStore((s) => s.user?.id)
  const summary = useGuestSummary()
  const [busy, setBusy] = useState(false)

  const move = async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !userId) return
    setBusy(true)
    try {
      const result = await importGuestData(supabase, userId)
      await queryClient.invalidateQueries()
      toast.success(t("import.done", { wallets: result.wallets, transactions: result.transactions, debts: result.debts }))
      onOpenChange(false)
    } catch (error) {
      // Nothing is lost: guest data is only cleared after every workspace imported.
      toast.error(t("import.failed", { reason: error instanceof Error ? error.message : String(error) }))
    } finally {
      setBusy(false)
    }
  }

  const discard = async () => {
    if (!window.confirm(t("import.discardConfirm"))) return
    await clearGuestData()
    toast.success(t("import.discarded"))
    onOpenChange(false)
  }

  const rows: [string, number][] = [
    [t("import.wallets"), summary.wallets],
    [t("import.transactions"), summary.transactions],
    [t("import.debts"), summary.debts],
    [t("import.budgets"), summary.budgets],
  ]

  return (
    <BottomSheet open={open} onOpenChange={(v) => !busy && onOpenChange(v)} title={t("import.title")} description={t("import.subtitle")}>
      <div className="space-y-4">
        <ul className="grid grid-cols-2 gap-2">
          {rows.map(([label, count]) => (
            <li key={label} className="rounded-xl bg-muted/60 px-3 py-2">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold tabular-nums">{count}</p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{t("import.hint")}</p>
        <Button className="h-12 w-full text-base" onClick={move} disabled={busy}>
          {busy ? <Loader2Icon className="animate-spin" /> : <CloudUploadIcon />}
          {busy ? t("import.moving") : t("import.move")}
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)} disabled={busy}>
          {t("import.later")}
        </Button>
        <Button variant="ghost" size="sm" className="w-full text-destructive" onClick={discard} disabled={busy}>
          <Trash2Icon />
          {t("import.discard")}
        </Button>
      </div>
    </BottomSheet>
  )
}

/** Opens the sheet once per session after sign-in when guest data is waiting on this device. */
export function GuestImportPrompt() {
  const hydrated = useHydrated()
  const signedIn = useSessionStore((s) => Boolean(s.user))
  const summary = useGuestSummary()
  const pending = hydrated && signedIn && hasGuestData(summary)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!pending) return
    let dismissed = false
    try {
      dismissed = sessionStorage.getItem(DISMISSED_KEY) === "1"
    } catch {
      // Storage blocked: ask every time.
    }
    if (!dismissed) setOpen(true)
  }, [pending])

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      try {
        sessionStorage.setItem(DISMISSED_KEY, "1")
      } catch {
        // ignore
      }
    }
  }

  return pending ? <GuestImportSheet open={open} onOpenChange={onOpenChange} /> : null
}

/** Settings row, shown while guest data is still on this device. */
export function GuestImportRow() {
  const t = useT()
  const signedIn = useSessionStore((s) => Boolean(s.user))
  const summary = useGuestSummary()
  const [open, setOpen] = useState(false)
  if (!signedIn || !hasGuestData(summary)) return null
  return (
    <div className="space-y-2 px-4 py-3">
      <p className="text-sm font-medium">{t("import.settingsTitle")}</p>
      <p className="text-xs text-muted-foreground">
        {t("import.settingsHint", { wallets: summary.wallets, transactions: summary.transactions })}
      </p>
      <Button size="sm" onClick={() => setOpen(true)}>
        <CloudUploadIcon />
        {t("import.move")}
      </Button>
      <GuestImportSheet open={open} onOpenChange={setOpen} />
    </div>
  )
}

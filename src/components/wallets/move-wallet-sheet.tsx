"use client"

import { useQueryClient } from "@tanstack/react-query"
import { ArrowRightLeftIcon, Building2Icon, Loader2Icon, UserIcon, UsersIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { canWrite, useWorkspaces } from "@/lib/data/hooks"
import type { Wallet, WorkspaceType } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { usePrefsStore } from "@/stores/prefs-store"

const ICONS: Record<WorkspaceType, typeof UserIcon> = { PERSONAL: UserIcon, BUSINESS: Building2Icon, FAMILY: UsersIcon }

/**
 * Move a wallet to another of the user's workspaces (Personal ⇄ a business):
 * its entries, statement imports and balance go with it (move_wallet).
 */
export function MoveWalletSheet({ wallet, open, onOpenChange, onMoved }: { wallet: Wallet; open: boolean; onOpenChange: (v: boolean) => void; onMoved?: () => void }) {
  const t = useT()
  const queryClient = useQueryClient()
  const setActive = usePrefsStore((s) => s.setActiveWorkspace)
  const all = useWorkspaces().data ?? []
  const targets = all.filter((w) => w.id !== wallet.workspace_id && !w.archived_at && canWrite(w))
  const [target, setTarget] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const chosen = targets.find((w) => w.id === target)
  const label = (w: (typeof all)[number]) => (w.type === "PERSONAL" ? t("ws.PERSONAL") : w.name)

  const move = async () => {
    if (!chosen) return
    setBusy(true)
    const { data, error } = await getSupabaseBrowserClient()!.rpc("move_wallet", { p_wallet_id: wallet.id, p_target_workspace_id: chosen.id })
    setBusy(false)
    if (error) {
      const msg = error.message ?? ""
      return void toast.error(t(/move_blocked:debt/.test(msg) ? "walletMove.blockedDebt" : /move_blocked:pool/.test(msg) ? "walletMove.blockedPool" : "common.error"))
    }
    const r = data as { moved: number; converted: number }
    for (const key of ["wallets", "transactions", "categories", "budgets"]) void queryClient.invalidateQueries({ queryKey: [key] })
    toast.success(t("walletMove.done", { name: wallet.name, workspace: label(chosen), count: r.moved + r.converted }))
    onOpenChange(false)
    onMoved?.()
    // Follow the wallet to its new workspace.
    setActive(chosen.type, chosen.type === "PERSONAL" ? null : chosen.id)
  }

  return (
    <BottomSheet open={open} onOpenChange={(v) => !busy && onOpenChange(v)} title={t("walletMove.title")} description={wallet.name}>
      {targets.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("walletMove.noTargets")}</p>
      ) : (
        <div className="space-y-4">
          <div className="divide-y overflow-hidden rounded-2xl border">
            {targets.map((w) => {
              const Icon = ICONS[w.type]
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setTarget(w.id)}
                  aria-pressed={target === w.id}
                  className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors", target === w.id ? "bg-primary/10" : "hover:bg-muted/60")}
                >
                  <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{label(w)}</span>
                  <span className={cn("size-4 rounded-full border-2", target === w.id ? "border-primary bg-primary" : "border-muted-foreground/40")} aria-hidden />
                </button>
              )
            })}
          </div>
          {chosen && (
            <div className="space-y-1.5 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{t("walletMove.confirmTitle", { name: wallet.name, workspace: label(chosen) })}</p>
              <p>• {t("walletMove.point1")}</p>
              <p>• {t("walletMove.point2")}</p>
              <p>• {t("walletMove.point3")}</p>
            </div>
          )}
          <Button className="h-12 w-full text-base" onClick={() => void move()} disabled={!chosen || busy}>
            {busy ? <Loader2Icon className="animate-spin" /> : <ArrowRightLeftIcon />}
            {chosen ? t("walletMove.confirm", { workspace: label(chosen) }) : t("walletMove.pick")}
          </Button>
        </div>
      )}
    </BottomSheet>
  )
}

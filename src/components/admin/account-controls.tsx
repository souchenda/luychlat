"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { BanIcon, BuildingIcon, CheckCircle2Icon, IdCardIcon, ShieldCheckIcon, ShieldIcon, SmartphoneIcon } from "lucide-react"
import { toast } from "sonner"

import { stepUp } from "@/components/security/step-up"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

/** A row of public.admin_list_users: account and subscription metadata only — never finances. */
export type DirectoryUser = {
  user_id: string
  email: string | null
  display_name: string | null
  joined_at: string
  last_active_at: string | null
  plan_code: string | null
  tier: "PRO" | "ULTRA" | "FREE"
  status: string | null
  period_end: string | null
  pending_payments: number
  workspace_count: number
  telegram_linked: boolean
  phone_verified: boolean
  mfa_enabled: boolean
  suspended: boolean
  suspended_reason: string | null
  require_2fa: boolean
  business_verified: boolean
  business_note: string | null
  total: number
}

function Badge({ on, icon, children, tone = "good" }: { on: boolean; icon: React.ReactNode; children: React.ReactNode; tone?: "good" | "bad" | "muted" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium [&_svg]:size-3",
        !on || tone === "muted"
          ? "bg-muted text-muted-foreground"
          : tone === "bad"
            ? "bg-destructive/10 text-destructive"
            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      )}
    >
      {icon}
      {children}
    </span>
  )
}

/** Verification badges. KYC is a placeholder until an ID / CBC check exists — never shown as verified. */
export function UserBadges({ user, compact = false }: { user: DirectoryUser; compact?: boolean }) {
  const t = useT()
  return (
    <div className="flex flex-wrap gap-1">
      {user.suspended && (
        <Badge on tone="bad" icon={<BanIcon />}>
          {t("admin.badge.suspended")}
        </Badge>
      )}
      {(user.telegram_linked || !compact) && (
        <Badge on={user.telegram_linked} icon={<CheckCircle2Icon />}>
          Telegram
        </Badge>
      )}
      {(user.phone_verified || !compact) && (
        <Badge on={user.phone_verified} icon={<SmartphoneIcon />}>
          {t("admin.badge.phone")}
        </Badge>
      )}
      {(user.mfa_enabled || !compact) && (
        <Badge on={user.mfa_enabled} icon={<ShieldCheckIcon />}>
          2FA
        </Badge>
      )}
      {(user.business_verified || !compact) && (
        <Badge on={user.business_verified} icon={<BuildingIcon />}>
          {t("admin.badge.business")}
        </Badge>
      )}
      {!compact && (
        <Badge on={false} tone="muted" icon={<IdCardIcon />}>
          {t("admin.badge.kycNone")}
        </Badge>
      )}
    </div>
  )
}

const rpc = async (name: string, args: Record<string, unknown>) => {
  const { error } = await getSupabaseBrowserClient()!.rpc(name, args)
  if (error) throw error
}

/**
 * /admin › user: suspend / reactivate, require 2FA, business verified. Each
 * asks for a note (kept in the audit log) and the admin's own 2FA step-up.
 */
export function AccountControls({ user, onDone }: { user: DirectoryUser; onDone: () => void }) {
  const t = useT()
  const queryClient = useQueryClient()
  const label = user.display_name || user.email || user.user_id
  const act = useMutation({
    mutationFn: ({ name, args }: { name: string; args: Record<string, unknown> }) => rpc(name, args),
    onSuccess: () => {
      toast.success(t("admin.saved"))
      void queryClient.invalidateQueries({ queryKey: ["admin"] })
      onDone()
    },
    onError: (error) => toast.error(/admins cannot/.test(error.message) ? t("admin.cannotSuspendAdmin") : t("common.error")),
  })

  const run = async (name: string, flag: string, on: boolean, prompt: string) => {
    const note = window.prompt(prompt)
    if (note === null) return
    if (note.trim().length < 3) return void toast.error(t("mfa.adminResetNoteRequired"))
    if (!(await stepUp(prompt))) return
    act.mutate({ name, args: { p_user_id: user.user_id, [flag]: on, p_note: note.trim() } })
  }

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{t("admin.accountStatus")}</p>
        <span className={cn("text-sm font-semibold", user.suspended ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
          {user.suspended ? `🔴 ${t("admin.badge.suspended")}` : `🟢 ${t("admin.statusActive")}`}
        </span>
      </div>
      {user.suspended && user.suspended_reason && <p className="text-xs text-muted-foreground">{user.suspended_reason}</p>}
      <UserBadges user={user} />
      {user.business_verified && user.business_note && <p className="text-xs text-muted-foreground">🏢 {user.business_note}</p>}
      <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-3">
        <Button
          variant="outline"
          size="sm"
          className={user.suspended ? "" : "text-destructive"}
          disabled={act.isPending}
          onClick={() =>
            void run("admin_set_account_status", "p_suspend", !user.suspended, t(user.suspended ? "admin.reactivatePrompt" : "admin.suspendPrompt", { name: label }))
          }
        >
          <BanIcon />
          {t(user.suspended ? "admin.reactivate" : "admin.suspend")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={act.isPending}
          onClick={() => void run("admin_set_require_2fa", "p_on", !user.require_2fa, t(user.require_2fa ? "admin.require2faOffPrompt" : "admin.require2faPrompt", { name: label }))}
        >
          <ShieldIcon />
          {t(user.require_2fa ? "admin.require2faOff" : "admin.require2fa")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={act.isPending}
          onClick={() =>
            void run("admin_set_business_verified", "p_on", !user.business_verified, t(user.business_verified ? "admin.businessUnverifyPrompt" : "admin.businessVerifyPrompt", { name: label }))
          }
        >
          <BuildingIcon />
          {t(user.business_verified ? "admin.businessUnverify" : "admin.businessVerify")}
        </Button>
      </div>
      {user.require_2fa && !user.mfa_enabled && <p className="text-xs text-amber-600">{t("admin.require2faPending")}</p>}
    </div>
  )
}

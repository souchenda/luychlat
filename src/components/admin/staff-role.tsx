"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ShieldCheckIcon } from "lucide-react"
import { toast } from "sonner"

import { Segmented } from "@/components/common/segmented"
import { confirmChange, rpc } from "@/components/admin/ui"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { usePlan, type StaffRole } from "@/lib/plan"
import { useSessionStore } from "@/stores/session-store"

/**
 * A member's staff role, seen and changed from the user's own card in the admin directory (founder, 19/10/2026) — the
 * same admin_staff_set / admin_staff_remove as Admin › Staff (super admin only; the database checks again), with the
 * same audit note.
 */
type StaffMember = { user_id: string; role: StaffRole; is_owner: boolean }

/** Every staff member's role (super admin only; the cache Admin › Staff shares). */
export function useStaffRoles() {
  const superAdmin = usePlan().plan.staff_role === "super_admin"
  const { data } = useQuery({
    queryKey: ["admin", "staff"],
    enabled: superAdmin,
    staleTime: 60_000,
    queryFn: () => rpc<StaffMember[]>("admin_staff_list"),
  })
  return new Map((data ?? []).map((m) => [m.user_id, m]))
}

/** «🛡️ អេដមីន / Staff» on the user's badges — green and gold. */
export function StaffBadge({ userId }: { userId: string }) {
  const t = useT()
  const member = useStaffRoles().get(userId)
  if (!member) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/60 bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-amber-100 [&_svg]:size-3">
      <ShieldCheckIcon />
      {t(`admin.role.${member.role}` as MessageKey)} / Staff
    </span>
  )
}

const CHOICES = ["none", "content_admin", "support", "admin", "super_admin"] as const
type Choice = (typeof CHOICES)[number]

/** «តួនាទី៖ [ គ្មាន | ជំនួយ | អេដមីន | Super ]» — the founder manages the role from the user's card. */
export function StaffRoleRow({ userId, email, name }: { userId: string; email: string | null; name: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const me = useSessionStore((s) => s.user?.id)
  const superAdmin = usePlan().plan.staff_role === "super_admin"
  const member = useStaffRoles().get(userId)
  const act = useMutation({
    mutationFn: ({ fn, args }: { fn: string; args: Record<string, unknown> }) => rpc<{ ok: boolean; reason?: string } | boolean>(fn, args),
    onSuccess: (r) => {
      if (r && typeof r === "object" && !r.ok) return void toast.error(t(`super.staffError.${r.reason ?? "unknown"}` as MessageKey))
      toast.success(t("admin.saved"))
      void queryClient.invalidateQueries({ queryKey: ["admin"] })
    },
    onError: () => toast.error(t("common.error")),
  })
  if (!superAdmin || !email) return null
  const locked = member?.is_owner || userId === me
  const current: Choice = member?.role ?? "none"

  const change = async (next: Choice) => {
    if (next === current) return
    if (next === "none") {
      const note = await confirmChange(t("super.staffRemovePrompt", { email: name }), t)
      if (note) act.mutate({ fn: "admin_staff_remove", args: { p_user_id: userId, p_note: note } })
      return
    }
    const note = await confirmChange(t("super.staffPrompt", { email: name, role: t(`admin.role.${next}` as MessageKey) }), t)
    if (note) act.mutate({ fn: "admin_staff_set", args: { p_email: email, p_role: next, p_note: note } })
  }

  return (
    <div className="space-y-1.5 rounded-xl border border-amber-400/40 bg-emerald-500/5 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-sm font-medium [&_svg]:size-4">
        <ShieldCheckIcon className="text-emerald-600" />
        {t("staffRole.label")}
      </p>
      {locked ? (
        <p className="text-xs text-muted-foreground">
          {t(`admin.role.${current === "none" ? "admin" : current}` as MessageKey)} · {t(member?.is_owner ? "super.ownerLocked" : "super.selfLocked")}
        </p>
      ) : (
        <Segmented
          aria-label={t("staffRole.label")}
          value={current}
          onChange={(v) => void change(v)}
          options={CHOICES.map((c) => ({ value: c, label: c === "none" ? t("staffRole.none") : t(`admin.role.${c}` as MessageKey) }))}
        />
      )}
    </div>
  )
}

"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CrownIcon, HandshakeIcon, LockIcon, Loader2Icon, PlusIcon, ShieldCheckIcon, SlidersHorizontalIcon, TrendingUpIcon, UserCogIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { rpc, Section, Stat } from "@/components/admin/ui"
import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { stepUp } from "@/components/security/step-up"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { planKeys, type StaffRole } from "@/lib/plan"
import { cn } from "@/lib/utils"
import { useSessionStore } from "@/stores/session-store"

/** Asks for the reason (kept in the audit log) and the admin's own 2FA; null when cancelled. */
async function confirmChange(prompt: string, t: (k: MessageKey) => string): Promise<string | null> {
  const note = window.prompt(prompt)
  if (note === null) return null
  if (note.trim().length < 3) {
    toast.error(t("mfa.adminResetNoteRequired"))
    return null
  }
  return (await stepUp(prompt)) ? note.trim() : null
}

// ---------------------------------------------------------------------------
// G: privacy notice
// ---------------------------------------------------------------------------
export function PrivacyNotice() {
  const t = useT()
  return (
    <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
      <span className="font-semibold text-foreground">🛡️ {t("admin.privacyTitle")}</span> {t("super.privacyBody")}
    </p>
  )
}

// ---------------------------------------------------------------------------
// A: business metrics
// ---------------------------------------------------------------------------
type Metrics = {
  users: number
  dau: number
  mau: number
  new_30d: number
  paying_users: number
  paying_by_tier: Record<string, number>
  trial_or_referral: number
  mrr_usd: number
  mrr_khr: number
  revenue_total: Partial<Record<"USD" | "KHR", number>>
  revenue_30d: Partial<Record<"USD" | "KHR", number>>
  payments_30d: number
  conversion_pct: number | null
  churn_30d_pct: number | null
  churn_base: number
  pending_payments: number
  /** Staff accounts left out of every figure. */
  staff_excluded?: number
}

const revenue = (r: Metrics["revenue_total"]) =>
  [r.USD ? formatMoney(Number(r.USD), "USD") : null, r.KHR ? formatMoney(Number(r.KHR), "KHR") : null].filter(Boolean).join(" + ") || formatMoney(0, "USD")

export function BusinessMetrics() {
  const t = useT()
  const { data: m } = useQuery({ queryKey: ["admin", "exec-metrics"], queryFn: () => rpc<Metrics>("admin_exec_metrics"), refetchInterval: 60_000 })
  if (!m) return <Card className="h-64 animate-pulse" />
  return (
    <Section title={t("super.metrics")} icon={<TrendingUpIcon />}>
      <Card className="gap-2 px-4 py-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="MRR" value={<span className="text-lg">{formatMoney(Number(m.mrr_usd), "USD")}</span>} hint={t("super.mrrHint")} accent />
          <Stat label={t("super.revenue30d")} value={<span className="text-base">{revenue(m.revenue_30d)}</span>} hint={t("super.paymentsCount", { count: m.payments_30d })} />
          <Stat label={t("super.revenueTotal")} value={<span className="text-base">{revenue(m.revenue_total)}</span>} />
          <Stat
            label={t("super.payingUsers")}
            value={m.paying_users}
            hint={Object.entries(m.paying_by_tier)
              .map(([tier, n]) => `${tier} ${n}`)
              .join(" · ") || undefined}
          />
          <Stat label={t("super.conversion")} value={m.conversion_pct === null ? "—" : `${m.conversion_pct}%`} hint={t("super.conversionHint")} />
          <Stat label={t("super.churn")} value={m.churn_30d_pct === null ? "—" : `${m.churn_30d_pct}%`} hint={t("super.churnHint", { count: m.churn_base })} />
          <Stat label={t("admin.users")} value={m.users} hint={t("super.new30d", { count: m.new_30d })} />
          <Stat label="DAU / MAU" value={`${m.dau} / ${m.mau}`} hint={m.mau ? `${Math.round((m.dau / m.mau) * 100)}%` : undefined} />
          <Stat label={t("super.trialReferral")} value={m.trial_or_referral} hint={t("super.notPaying")} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t("super.metricsNote")} {t("super.staffExcluded", { count: m.staff_excluded ?? 0 })}
        </p>
      </Card>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// B: prices and plan limits
// ---------------------------------------------------------------------------
type Plan = {
  code: string
  tier: "FREE" | "PRO" | "ULTRA"
  price_usd: number
  price_khr: number
  period_days: number | null
  max_wallets: number | null
  max_family_members: number | null
  max_business_workspaces: number | null
  max_statement_imports: number | null
  ai_queries_per_month: number
  business_trial_days: number
  active: boolean
}
const LIMITS = ["max_wallets", "max_family_members", "max_business_workspaces", "max_statement_imports"] as const
type Draft = Record<"price_usd" | "price_khr" | "ai_queries_per_month" | "business_trial_days" | (typeof LIMITS)[number], string> & { active: boolean }

const toDraft = (p: Plan): Draft => ({
  price_usd: String(Number(p.price_usd)),
  price_khr: String(Number(p.price_khr)),
  ai_queries_per_month: String(p.ai_queries_per_month),
  business_trial_days: String(p.business_trial_days),
  max_wallets: p.max_wallets === null ? "" : String(p.max_wallets),
  max_family_members: p.max_family_members === null ? "" : String(p.max_family_members),
  max_business_workspaces: p.max_business_workspaces === null ? "" : String(p.max_business_workspaces),
  max_statement_imports: p.max_statement_imports === null ? "" : String(p.max_statement_imports),
  active: p.active,
})

function PlanEditor({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft>(() => toDraft(plan))
  const original = toDraft(plan)
  const save = useMutation({
    mutationFn: ({ changes, note }: { changes: Record<string, unknown>; note: string }) => rpc("admin_update_plan", { p_code: plan.code, p_changes: changes, p_note: note }),
    onSuccess: () => {
      toast.success(t("admin.saved"))
      void queryClient.invalidateQueries({ queryKey: ["admin", "plans"] })
      void queryClient.invalidateQueries({ queryKey: planKeys.options })
      onClose()
    },
    onError: () => toast.error(t("super.planInvalid")),
  })

  const submit = async () => {
    const changes: Record<string, unknown> = {}
    for (const key of ["price_usd", "price_khr", "ai_queries_per_month", "business_trial_days"] as const) {
      if (draft[key] !== original[key]) changes[key] = Number(draft[key])
    }
    for (const key of LIMITS) {
      if (draft[key] !== original[key]) changes[key] = draft[key].trim() === "" ? "unlimited" : Number(draft[key])
    }
    if (draft.active !== original.active) changes.active = draft.active
    if (!Object.keys(changes).length) return onClose()
    if (Object.values(changes).some((v) => typeof v === "number" && (!Number.isFinite(v) || v < 0))) return void toast.error(t("super.planInvalid"))
    const note = await confirmChange(t("super.planPrompt", { plan: plan.code }), t)
    if (note) save.mutate({ changes, note })
  }

  const field = (key: keyof Omit<Draft, "active">, label: string, hint?: string) => (
    <div className="space-y-1">
      <Label htmlFor={`plan-${key}`} className="text-xs">
        {label}
      </Label>
      <Input id={`plan-${key}`} inputMode="decimal" value={draft[key]} placeholder={hint} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} />
    </div>
  )

  return (
    <BottomSheet open onOpenChange={(v) => !v && onClose()} title={plan.code} description={t("super.planEditHint")}>
      <div className="space-y-3">
        {plan.code !== "FREE" && (
          <div className="grid grid-cols-2 gap-2">
            {field("price_usd", t("super.priceUsd"))}
            {field("price_khr", t("super.priceKhr"))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {field("max_wallets", t("super.limitWallets"), t("super.unlimited"))}
          {field("max_family_members", t("super.limitFamily"), t("super.unlimited"))}
          {field("max_business_workspaces", t("super.limitBusiness"), t("super.unlimited"))}
          {field("max_statement_imports", t("super.limitImports"), t("super.unlimited"))}
          {field("ai_queries_per_month", t("super.limitAi"))}
          {plan.code === "FREE" && field("business_trial_days", t("super.trialDays"))}
        </div>
        {plan.code !== "FREE" && (
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>{t("super.planActive")}</span>
            <Switch checked={draft.active} onCheckedChange={(v) => setDraft((d) => ({ ...d, active: v }))} />
          </label>
        )}
        <p className="text-[11px] text-muted-foreground">{t("super.fixedRules")}</p>
        <Button className="w-full" onClick={() => void submit()} disabled={save.isPending}>
          {save.isPending && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>
      </div>
    </BottomSheet>
  )
}

const limitText = (v: number | null) => (v === null ? "∞" : String(v))

export function PricingEngine() {
  const t = useT()
  const [editing, setEditing] = useState<Plan | null>(null)
  const { data } = useQuery({ queryKey: ["admin", "plans"], queryFn: () => rpc<Plan[]>("admin_plans") })
  return (
    <Section title={t("super.pricing")} icon={<SlidersHorizontalIcon />}>
      <Card className="gap-0 divide-y py-0">
        {(data ?? []).map((p) => (
          <button key={p.code} type="button" onClick={() => setEditing(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60">
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-semibold", !p.active && "text-muted-foreground line-through")}>{p.code}</p>
              <p className="truncate text-xs text-muted-foreground">
                {t("super.limitWallets")} {limitText(p.max_wallets)} · {t("super.limitFamily")} {limitText(p.max_family_members)} · {t("super.limitBusiness")}{" "}
                {limitText(p.max_business_workspaces)} · {t("super.limitImports")} {limitText(p.max_statement_imports)} · AI {p.ai_queries_per_month}
              </p>
            </div>
            <div className="shrink-0 text-right text-sm font-semibold tabular-nums">
              {p.code === "FREE" ? "—" : formatMoney(Number(p.price_usd), "USD")}
              {p.code !== "FREE" && <p className="text-[11px] font-normal text-muted-foreground">{formatMoney(Number(p.price_khr), "KHR")}</p>}
            </div>
          </button>
        ))}
      </Card>
      <p className="text-[11px] text-muted-foreground">{t("super.pricingNote")}</p>
      {editing && <PlanEditor plan={editing} onClose={() => setEditing(null)} />}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// D: partners (configuration only; secrets stay in the server environment)
// ---------------------------------------------------------------------------
type Partner = {
  id: string
  kind: "BANK" | "MFI" | "CBC" | "BAKONG" | "OTHER"
  name: string
  status: "NOT_CONNECTED" | "PLANNED" | "TESTING" | "LIVE" | "DISABLED"
  endpoint_url: string | null
  secret_env: string | null
  notes: string | null
  updated_at: string
}
const KINDS: Partner["kind"][] = ["BANK", "MFI", "CBC", "BAKONG", "OTHER"]
const STATUSES: Partner["status"][] = ["NOT_CONNECTED", "PLANNED", "TESTING", "LIVE", "DISABLED"]
const STATUS_TONE: Record<Partner["status"], string> = {
  NOT_CONNECTED: "bg-muted text-muted-foreground",
  PLANNED: "bg-muted text-muted-foreground",
  TESTING: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  LIVE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  DISABLED: "bg-destructive/10 text-destructive",
}

function PartnerSheet({ partner, onClose }: { partner: Partial<Partner>; onClose: () => void }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    kind: partner.kind ?? "BANK",
    name: partner.name ?? "",
    status: partner.status ?? "NOT_CONNECTED",
    endpoint_url: partner.endpoint_url ?? "",
    secret_env: partner.secret_env ?? "",
    notes: partner.notes ?? "",
  })
  const save = useMutation({
    mutationFn: (note: string) => rpc("admin_save_partner", { p_id: partner.id ?? null, p_value: form, p_note: note }),
    onSuccess: () => {
      toast.success(t("admin.saved"))
      void queryClient.invalidateQueries({ queryKey: ["admin", "partners"] })
      onClose()
    },
    onError: () => toast.error(t("super.partnerInvalid")),
  })
  const submit = async () => {
    if (form.name.trim().length < 2) return void toast.error(t("super.partnerInvalid"))
    const note = await confirmChange(t("super.partnerPrompt", { name: form.name.trim() }), t)
    if (note) save.mutate(note)
  }
  return (
    <BottomSheet open onOpenChange={(v) => !v && onClose()} title={partner.id ? form.name : t("super.partnerAdd")} description={t("super.secretsNote")}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as Partner["kind"] }))}>
            <SelectTrigger aria-label={t("super.partnerKind")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`super.kind.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as Partner["status"] }))}>
            <SelectTrigger aria-label={t("super.partnerStatus")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`super.status.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="partner-name">{t("super.partnerName")}</Label>
          <Input id="partner-name" value={form.name} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="partner-url">{t("super.partnerUrl")}</Label>
          <Input id="partner-url" inputMode="url" placeholder="https://" value={form.endpoint_url} maxLength={300} onChange={(e) => setForm((f) => ({ ...f, endpoint_url: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="partner-env">{t("super.partnerEnv")}</Label>
          <Input
            id="partner-env"
            className="font-mono"
            placeholder="CBC_API_KEY"
            value={form.secret_env}
            maxLength={64}
            onChange={(e) => setForm((f) => ({ ...f, secret_env: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") }))}
          />
          <p className="text-[11px] text-muted-foreground">{t("super.partnerEnvHint")}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="partner-notes">{t("super.partnerNotes")}</Label>
          <Textarea id="partner-notes" rows={3} maxLength={1000} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
        <Button className="w-full" onClick={() => void submit()} disabled={save.isPending}>
          {save.isPending && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>
      </div>
    </BottomSheet>
  )
}

export function PartnerHub() {
  const t = useT()
  const [editing, setEditing] = useState<Partial<Partner> | null>(null)
  const { data } = useQuery({ queryKey: ["admin", "partners"], queryFn: () => rpc<Partner[]>("admin_partners") })
  return (
    <Section
      title={t("super.partners")}
      icon={<HandshakeIcon />}
      action={
        <Button size="sm" variant="ghost" onClick={() => setEditing({})}>
          <PlusIcon />
          {t("super.partnerAdd")}
        </Button>
      }
    >
      <Card className="gap-0 divide-y py-0">
        {!data?.length ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t("super.partnersEmpty")}</p>
        ) : (
          data.map((p) => (
            <button key={p.id} type="button" onClick={() => setEditing(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {t(`super.kind.${p.kind}`)}
                  {p.secret_env && <span className="font-mono"> · {p.secret_env}</span>}
                </p>
              </div>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_TONE[p.status])}>{t(`super.status.${p.status}`)}</span>
            </button>
          ))
        )}
      </Card>
      <p className="text-[11px] text-muted-foreground">{t("super.readinessNote")}</p>
      {editing && <PartnerSheet partner={editing} onClose={() => setEditing(null)} />}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// E: staff
// ---------------------------------------------------------------------------
type StaffMember = {
  user_id: string
  email: string
  display_name: string | null
  role: StaffRole
  /** The founder account: can't be removed or demoted by anyone. */
  is_owner: boolean
  added_at: string
  mfa_enabled: boolean
  last_active_at: string | null
}
const ROLES: StaffRole[] = ["support", "admin", "super_admin"]

export function StaffManager() {
  const t = useT()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<StaffRole>("support")
  const myId = useSessionStore((s) => s.user?.id)
  const { data } = useQuery({ queryKey: ["admin", "staff"], queryFn: () => rpc<StaffMember[]>("admin_staff_list") })
  const act = useMutation({
    mutationFn: ({ name, args }: { name: string; args: Record<string, unknown> }) => rpc<{ ok: boolean; reason?: string }>(name, args),
    onSuccess: (r) => {
      if (!r.ok) return void toast.error(t(`super.staffError.${r.reason ?? "unknown"}` as MessageKey))
      toast.success(t("admin.saved"))
      setEmail("")
      void queryClient.invalidateQueries({ queryKey: ["admin", "staff"] })
    },
    onError: () => toast.error(t("common.error")),
  })

  const grant = async (target: string, newRole: StaffRole) => {
    const note = await confirmChange(t("super.staffPrompt", { email: target, role: t(`admin.role.${newRole}`) }), t)
    if (note) act.mutate({ name: "admin_staff_set", args: { p_email: target, p_role: newRole, p_note: note } })
  }
  const remove = async (m: StaffMember) => {
    const note = await confirmChange(t("super.staffRemovePrompt", { email: m.email }), t)
    if (note) act.mutate({ name: "admin_staff_remove", args: { p_user_id: m.user_id, p_note: note } })
  }

  return (
    <Section title={t("super.staff")} icon={<UserCogIcon />}>
      <Card className="gap-0 divide-y py-0">
        {(data ?? []).map((m) => (
          <div key={m.user_id} className="space-y-2 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.display_name || m.email}</p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium [&_svg]:size-3",
                  m.mfa_enabled ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                )}
              >
                <ShieldCheckIcon />
                {m.mfa_enabled ? "2FA" : t("super.no2fa")}
              </span>
            </div>
            {m.is_owner || m.user_id === myId ? (
              // The owner and your own account are locked (the database refuses these changes too).
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
                {m.is_owner ? <CrownIcon className="text-amber-500" /> : <LockIcon />}
                <span className="font-medium text-foreground">{t(`admin.role.${m.role}`)}</span>
                {" · "}
                {t(m.is_owner ? "super.ownerLocked" : "super.selfLocked")}
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Segmented
                    value={m.role}
                    onChange={(r) => r !== m.role && void grant(m.email, r)}
                    options={ROLES.map((r) => ({ value: r, label: t(`admin.role.${r}`) }))}
                  />
                </div>
                <Button size="sm" variant="ghost" className="text-destructive" disabled={act.isPending} onClick={() => void remove(m)}>
                  {t("super.staffRemove")}
                </Button>
              </div>
            )}
          </div>
        ))}
      </Card>
      <Card className="gap-2 px-4 py-3">
        <Label htmlFor="staff-email">{t("super.staffAdd")}</Label>
        <Input id="staff-email" type="email" inputMode="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Segmented value={role} onChange={setRole} options={ROLES.map((r) => ({ value: r, label: t(`admin.role.${r}`) }))} />
        <Button disabled={act.isPending || !/^\S+@\S+\.\S+$/.test(email.trim())} onClick={() => void grant(email.trim(), role)}>
          <PlusIcon />
          {t("super.staffAddButton")}
        </Button>
        <p className="text-[11px] text-muted-foreground">{t("super.staffNote")}</p>
      </Card>
    </Section>
  )
}

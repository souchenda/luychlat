"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { GiftIcon, Loader2Icon, PlusIcon, TicketIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { rpc, Section, Stat, who } from "@/components/admin/ui"
import { BottomSheet } from "@/components/common/bottom-sheet"
import { stepUp } from "@/components/security/step-up"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"

/** The reason (kept in the audit log) and the admin's own 2FA; null when cancelled. */
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
// Referral campaign: rules, results, and anti-fraud flags
// ---------------------------------------------------------------------------
type Campaign = { active: boolean; referee_days: number; referrer_days: number; monthly_cap: number; max_account_age_days: number; daily_flag: number }
type Referrer = {
  user_id: string
  email: string | null
  display_name: string | null
  invited: number
  days_earned: number
  last_24h: number
  inactive_friends: number
  blocked: boolean
  flags: ("burst" | "inactive")[]
}
type ReferralStats = { campaign: Campaign; total: number; last_30d: number; days_granted: number; top: Referrer[] }
const NUMBERS = ["referee_days", "referrer_days", "monthly_cap", "max_account_age_days", "daily_flag"] as const

function CampaignSheet({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<Record<string, string | boolean>>(() => ({ active: campaign.active, ...Object.fromEntries(NUMBERS.map((k) => [k, String(campaign[k])])) }))
  const save = useMutation({
    mutationFn: (note: string) =>
      rpc("admin_set_referral_campaign", {
        p_value: { active: form.active, ...Object.fromEntries(NUMBERS.map((k) => [k, Number(form[k])])) },
        p_note: note,
      }),
    onSuccess: () => {
      toast.success(t("admin.saved"))
      void queryClient.invalidateQueries({ queryKey: ["admin", "referrals"] })
      void queryClient.invalidateQueries({ queryKey: ["referral"] })
      onClose()
    },
    onError: () => toast.error(t("super.planInvalid")),
  })
  const submit = async () => {
    if (NUMBERS.some((k) => !Number.isInteger(Number(form[k])))) return void toast.error(t("super.planInvalid"))
    const note = await confirmChange(t("growth.campaignPrompt"), t)
    if (note) save.mutate(note)
  }
  return (
    <BottomSheet open onOpenChange={(v) => !v && onClose()} title={t("growth.campaign")} description={t("growth.campaignHint")}>
      <div className="space-y-3">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>{t("growth.active")}</span>
          <Switch checked={Boolean(form.active)} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          {NUMBERS.map((k) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`camp-${k}`} className="text-xs">
                {t(`growth.${k}` as MessageKey)}
              </Label>
              <Input id={`camp-${k}`} inputMode="numeric" value={String(form[k])} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value.replace(/\D/g, "") }))} />
            </div>
          ))}
        </div>
        <Button className="w-full" onClick={() => void submit()} disabled={save.isPending}>
          {save.isPending && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>
      </div>
    </BottomSheet>
  )
}

export function ReferralManager() {
  const t = useT()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const { data } = useQuery({ queryKey: ["admin", "referrals"], queryFn: () => rpc<ReferralStats>("admin_referral_stats") })
  const block = useMutation({
    mutationFn: (v: { user_id: string; block: boolean; note: string }) => rpc("admin_set_referrer_block", { p_user_id: v.user_id, p_block: v.block, p_note: v.note }),
    onSuccess: () => {
      toast.success(t("admin.saved"))
      void queryClient.invalidateQueries({ queryKey: ["admin", "referrals"] })
    },
    onError: () => toast.error(t("common.error")),
  })
  if (!data) return null
  const c = data.campaign

  return (
    <Section
      title={t("referral.title")}
      icon={<GiftIcon />}
      action={
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          {t("growth.edit")}
        </Button>
      }
    >
      <Card className="gap-3 px-4 py-4">
        <p className={cn("text-sm font-medium", !c.active && "text-muted-foreground")}>
          {c.active ? t("growth.summary", { referrer: c.referrer_days, referee: c.referee_days, age: c.max_account_age_days, cap: c.monthly_cap }) : t("growth.paused")}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <Stat label={t("admin.refTotal")} value={data.total} />
          <Stat label={t("admin.last30d")} value={data.last_30d} />
          <Stat label={t("admin.refDays")} value={data.days_granted} />
        </div>
        {data.top.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("admin.topReferrers")}</p>
            <ol className="divide-y text-sm">
              {data.top.map((r, i) => (
                <li key={r.user_id} className="space-y-1 py-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{who(r)}</span>
                    <span className="font-medium tabular-nums">{r.invited}</span>
                    <span className="w-14 text-right text-xs text-muted-foreground tabular-nums">+{r.days_earned}d</span>
                  </div>
                  {(r.flags.length > 0 || r.blocked) && (
                    <div className="flex flex-wrap items-center gap-1 pl-7">
                      {r.flags.map((f) => (
                        <span key={f} className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                          ⚠️ {t(`growth.flag.${f}`, { count: f === "burst" ? r.last_24h : r.inactive_friends })}
                        </span>
                      ))}
                      {r.blocked && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">{t("growth.rewardsPaused")}</span>}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        disabled={block.isPending}
                        onClick={async () => {
                          const note = await confirmChange(t(r.blocked ? "growth.unpausePrompt" : "growth.pausePrompt", { name: who(r) }), t)
                          if (note) block.mutate({ user_id: r.user_id, block: !r.blocked, note })
                        }}
                      >
                        {t(r.blocked ? "growth.unpause" : "growth.pause")}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">{t("growth.flagsNote", { count: c.daily_flag })}</p>
      </Card>
      {editing && <CampaignSheet campaign={c} onClose={() => setEditing(false)} />}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Promo codes
// ---------------------------------------------------------------------------
type Promo = {
  code: string
  plan_code: string
  days: number
  max_redemptions: number | null
  redeemed_count: number
  new_users_only: boolean
  expires_at: string | null
  active: boolean
  note: string | null
}

function PromoSheet({ promo, onClose }: { promo: Promo | null; onClose: () => void }) {
  const t = useT()
  const queryClient = useQueryClient()
  const used = (promo?.redeemed_count ?? 0) > 0
  const [form, setForm] = useState({
    code: promo?.code ?? "",
    plan_code: promo?.plan_code ?? "PRO_MONTHLY",
    days: String(promo?.days ?? 30),
    max_redemptions: promo?.max_redemptions === null || promo?.max_redemptions === undefined ? "" : String(promo.max_redemptions),
    expires_at: promo?.expires_at ? format(new Date(promo.expires_at), "yyyy-MM-dd") : "",
    new_users_only: promo?.new_users_only ?? false,
    active: promo?.active ?? true,
    note: promo?.note ?? "",
  })
  const save = useMutation({
    mutationFn: (note: string) =>
      rpc("admin_save_promo", {
        p_value: {
          ...form,
          days: Number(form.days),
          max_redemptions: form.max_redemptions,
          expires_at: form.expires_at ? new Date(`${form.expires_at}T23:59:59`).toISOString() : "",
        },
        p_note: note,
      }),
    onSuccess: () => {
      toast.success(t("admin.saved"))
      void queryClient.invalidateQueries({ queryKey: ["admin", "promos"] })
      onClose()
    },
    onError: () => toast.error(t("growth.promoInvalid")),
  })
  const submit = async () => {
    if (!/^[A-Z0-9]{4,20}$/.test(form.code) || !(Number(form.days) >= 1 && Number(form.days) <= 366)) return void toast.error(t("growth.promoInvalid"))
    const note = await confirmChange(t("growth.promoPrompt", { code: form.code }), t)
    if (note) save.mutate(note)
  }
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  return (
    <BottomSheet open onOpenChange={(v) => !v && onClose()} title={promo ? promo.code : t("growth.promoNew")} description={t("growth.promoHint")}>
      <div className="space-y-3">
        {!promo && (
          <div className="space-y-1">
            <Label htmlFor="promo-code">{t("growth.promoCode")}</Label>
            <Input id="promo-code" className="font-mono" maxLength={20} placeholder="LAUNCH2026" value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Select value={form.plan_code} onValueChange={(v) => set({ plan_code: v })} disabled={used}>
            <SelectTrigger aria-label={t("admin.plan")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PRO_MONTHLY">PRO</SelectItem>
              <SelectItem value="ULTRA_MONTHLY">ULTRA</SelectItem>
            </SelectContent>
          </Select>
          <div className="space-y-1">
            <Input inputMode="numeric" aria-label={t("growth.promoDays")} value={form.days} disabled={used} onChange={(e) => set({ days: e.target.value.replace(/\D/g, "") })} />
            <p className="text-[11px] text-muted-foreground">{t("growth.promoDays")}</p>
          </div>
          <div className="space-y-1">
            <Input inputMode="numeric" aria-label={t("growth.promoMax")} placeholder="∞" value={form.max_redemptions} onChange={(e) => set({ max_redemptions: e.target.value.replace(/\D/g, "") })} />
            <p className="text-[11px] text-muted-foreground">{t("growth.promoMax")}</p>
          </div>
          <div className="space-y-1">
            <Input type="date" aria-label={t("growth.promoExpires")} value={form.expires_at} onChange={(e) => set({ expires_at: e.target.value })} />
            <p className="text-[11px] text-muted-foreground">{t("growth.promoExpires")}</p>
          </div>
        </div>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>{t("growth.promoNewUsers")}</span>
          <Switch checked={form.new_users_only} onCheckedChange={(v) => set({ new_users_only: v })} />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>{t("growth.active")}</span>
          <Switch checked={form.active} onCheckedChange={(v) => set({ active: v })} />
        </label>
        <Input placeholder={t("growth.promoNote")} aria-label={t("growth.promoNote")} maxLength={300} value={form.note} onChange={(e) => set({ note: e.target.value })} />
        <Button className="w-full" onClick={() => void submit()} disabled={save.isPending}>
          {save.isPending && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>
      </div>
    </BottomSheet>
  )
}

export function PromoManager() {
  const t = useT()
  const [editing, setEditing] = useState<Promo | null | "new">(null)
  const { data } = useQuery({ queryKey: ["admin", "promos"], queryFn: () => rpc<Promo[]>("admin_promos") })
  return (
    <Section
      title={t("growth.promos")}
      icon={<TicketIcon />}
      action={
        <Button size="sm" variant="ghost" onClick={() => setEditing("new")}>
          <PlusIcon />
          {t("growth.promoNew")}
        </Button>
      }
    >
      <Card className="gap-0 divide-y py-0">
        {!data?.length ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t("growth.promosEmpty")}</p>
        ) : (
          data.map((p) => {
            const expired = p.expires_at !== null && new Date(p.expires_at) <= new Date()
            return (
              <button key={p.code} type="button" onClick={() => setEditing(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60">
                <div className="min-w-0 flex-1">
                  <p className={cn("font-mono text-sm font-semibold", (!p.active || expired) && "text-muted-foreground line-through")}>{p.code}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.plan_code.startsWith("ULTRA") ? "ULTRA" : "PRO"} · {t("growth.promoDaysShort", { count: p.days })}
                    {p.expires_at && ` · ${t("growth.until", { date: format(new Date(p.expires_at), "dd/MM/yy") })}`}
                    {p.new_users_only && ` · ${t("growth.promoNewUsersShort")}`}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {p.redeemed_count}
                  {p.max_redemptions !== null && <span className="text-muted-foreground">/{p.max_redemptions}</span>}
                </span>
              </button>
            )
          })
        )}
      </Card>
      <p className="text-[11px] text-muted-foreground">{t("growth.promosNote")}</p>
      {editing && <PromoSheet promo={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </Section>
  )
}

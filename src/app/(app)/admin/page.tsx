"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import {
  CheckIcon,
  ChevronRightIcon,
  CrownIcon,
  InfoIcon,
  LifeBuoyIcon,
  Loader2Icon,
  SearchIcon,
  ShieldAlertIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { paymentCode } from "@/components/billing/upgrade-sheet"
import { DEFAULT_ABOUT, type AboutInfo } from "@/lib/app-info"
import { AdminUserSecurity } from "@/components/security/admin-user-security"
import { AccountControls, UserBadges, type DirectoryUser } from "@/components/admin/account-controls"
import { ago, rpc, Section, Stat, useInvalidateAdmin, who } from "@/components/admin/ui"
import { LocalGoldAdmin } from "@/components/admin/local-gold-admin"
import { SystemHealthCard } from "@/components/admin/system-health-card"
import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Currency } from "@/lib/data/types"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { usePlan } from "@/lib/plan"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

/**
 * Owner/admin console. Every call is an admin_* RPC that re-checks
 * public.is_admin() in the database, so hiding this page is only cosmetic.
 */

type Subscriber = DirectoryUser
type AdminPayment = {
  id: string
  user_id: string
  email: string | null
  display_name: string | null
  plan_code: string
  amount: number
  currency: Currency
  method: string
  reference: string | null
  status: string
  note: string | null
  created_at: string
}
type SubEvent = { id: number; kind: string; plan_code: string | null; period_end: string | null; note: string | null; created_at: string }
const FILTERS = ["all", "pro", "free", "expiring", "expired", "pending", "suspended"] as const
type Filter = (typeof FILTERS)[number]

function PendingPayments() {
  const t = useT()
  const invalidate = useInvalidateAdmin()
  const { data } = useQuery({
    queryKey: ["admin", "payments", "PENDING"],
    queryFn: async () => (await rpc<AdminPayment[]>("admin_list_payments", { p_status: "PENDING", p_limit: 50 })).map((p) => ({ ...p, amount: Number(p.amount) })),
    refetchInterval: 30_000,
  })
  const review = useMutation({
    mutationFn: (v: { id: string; approve: boolean; note: string | null }) =>
      rpc("admin_review_payment", { p_payment_id: v.id, p_approve: v.approve, p_note: v.note }),
    onSuccess: (_, v) => {
      toast.success(t(v.approve ? "admin.approved" : "admin.rejected"))
      void invalidate()
    },
    onError: () => toast.error(t("common.error")),
  })

  const decide = (p: AdminPayment, approve: boolean) => {
    if (approve) {
      if (!window.confirm(t("admin.approveConfirm", { name: who(p), amount: formatMoney(p.amount, p.currency) }))) return
      review.mutate({ id: p.id, approve, note: null })
    } else {
      const note = window.prompt(t("admin.rejectReason"))
      if (note === null) return
      review.mutate({ id: p.id, approve, note: note.trim() || null })
    }
  }

  return (
    <Section title={t("admin.pendingPayments")} icon={<CrownIcon />}>
      <Card className="gap-0 divide-y py-0">
        {!data?.length ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t("admin.noPending")}</p>
        ) : (
          data.map((p) => (
            <div key={p.id} className="space-y-2 px-4 py-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{who(p)}</p>
                  {p.display_name && <p className="truncate text-xs text-muted-foreground">{p.email}</p>}
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{formatMoney(p.amount, p.currency)}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.plan_code.startsWith("ULTRA") ? "ULTRA" : "PRO"} · {t(p.plan_code.endsWith("YEARLY") ? "upgrade.yearly" : "upgrade.monthly")}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono font-semibold text-foreground">#{paymentCode(p.id)}</span> · {t(`upgrade.method.${p.method}` as MessageKey)}
                {p.reference && <span className="font-mono"> · {p.reference}</span>} · {ago(p.created_at)}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" className="text-destructive" onClick={() => decide(p, false)} disabled={review.isPending}>
                  <XIcon />
                  {t("admin.reject")}
                </Button>
                <Button size="sm" onClick={() => decide(p, true)} disabled={review.isPending}>
                  <CheckIcon />
                  {t("admin.approve")}
                </Button>
              </div>
            </div>
          ))
        )}
      </Card>
    </Section>
  )
}

function SubscriberSheet({ user, onClose }: { user: Subscriber | null; onClose: () => void }) {
  const t = useT()
  const invalidate = useInvalidateAdmin()
  const [endDate, setEndDate] = useState("")
  const [grantTier, setGrantTier] = useState<"PRO" | "ULTRA">("PRO")
  const events = useQuery({
    queryKey: ["admin", "events", user?.user_id],
    enabled: Boolean(user),
    queryFn: () => rpc<SubEvent[]>("admin_user_events", { p_user_id: user!.user_id }),
  })

  useEffect(() => {
    setEndDate(user?.period_end ? format(new Date(user.period_end), "yyyy-MM-dd") : "")
    setGrantTier(user?.tier === "ULTRA" ? "ULTRA" : "PRO")
  }, [user])

  const act = useMutation({
    mutationFn: ({ name, args }: { name: string; args: Record<string, unknown> }) => rpc(name, args),
    onSuccess: () => {
      toast.success(t("admin.saved"))
      void invalidate()
      onClose()
    },
    onError: () => toast.error(t("common.error")),
  })

  if (!user) return null
  const planCode = user.plan_code && user.plan_code !== "FREE" ? user.plan_code : "PRO_MONTHLY"
  const extend = (days: number, code: string) =>
    act.mutate({ name: "admin_extend_subscription", args: { p_user_id: user.user_id, p_plan_code: code, p_days: days, p_note: null } })

  return (
    <BottomSheet open onOpenChange={(v) => !v && onClose()} title={who(user)} description={user.email ?? undefined}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label={t("admin.plan")}
            value={<span className="text-base">{user.tier}</span>}
            hint={user.period_end ? format(new Date(user.period_end), "dd/MM/yyyy") : undefined}
            accent={user.tier !== "FREE"}
          />
          <Stat label={t("admin.lastActive")} value={<span className="text-base">{ago(user.last_active_at)}</span>} hint={t("admin.joined", { date: format(new Date(user.joined_at), "dd/MM/yyyy") })} />
          <Stat label={t("admin.workspaces")} value={<span className="text-base">{user.workspace_count}</span>} />
          <Stat label={t("admin.registered")} value={<span className="text-base">{format(new Date(user.joined_at), "dd/MM/yyyy")}</span>} />
        </div>

        <AccountControls user={user} onDone={onClose} />

        <AdminUserSecurity userId={user.user_id} label={who(user)} />

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label={t("admin.plan")}>
          {(["PRO", "ULTRA"] as const).map((tier) => (
            <button
              key={tier}
              type="button"
              role="radio"
              aria-checked={grantTier === tier}
              onClick={() => setGrantTier(tier)}
              className={cn("rounded-lg py-1.5 text-sm font-semibold", grantTier === tier ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {tier}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => extend(30, `${grantTier}_MONTHLY`)} disabled={act.isPending}>
            +30 {t("admin.days")} {grantTier}
          </Button>
          <Button variant="outline" onClick={() => extend(365, `${grantTier}_YEARLY`)} disabled={act.isPending}>
            +365 {t("admin.days")} {grantTier}
          </Button>
        </div>

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!endDate) return
            act.mutate({
              name: "admin_set_subscription_end",
              args: { p_user_id: user.user_id, p_plan_code: planCode, p_period_end: new Date(`${endDate}T23:59:59`).toISOString(), p_note: null },
            })
          }}
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="sub-end">{t("admin.setEnd")}</Label>
            <Input id="sub-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <Button type="submit" variant="secondary" disabled={act.isPending || !endDate}>
            {t("common.save")}
          </Button>
        </form>

        {user.tier !== "FREE" && (
          <Button
            variant="ghost"
            className="w-full text-destructive"
            disabled={act.isPending}
            onClick={() => {
              if (window.confirm(t("admin.cancelConfirm", { name: who(user) })))
                act.mutate({ name: "admin_cancel_subscription", args: { p_user_id: user.user_id, p_note: null } })
            }}
          >
            {t("admin.cancelSub")}
          </Button>
        )}

        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t("admin.history")}</p>
          {!events.data?.length ? (
            <p className="text-xs text-muted-foreground">—</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {events.data.map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="w-20 shrink-0 text-muted-foreground tabular-nums">{format(new Date(e.created_at), "dd/MM/yy")}</span>
                  <span className="flex-1">
                    <span className="font-medium">{e.kind}</span>
                    {e.period_end && <span className="text-muted-foreground"> → {format(new Date(e.period_end), "dd/MM/yyyy")}</span>}
                    {e.note && <span className="block text-muted-foreground">{e.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}

const PAGE_SIZE = 30

function Subscribers() {
  const t = useT()
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [selected, setSelected] = useState<Subscriber | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const { data, isFetching } = useQuery({
    queryKey: ["admin", "subscribers", debounced, filter, limit],
    queryFn: () => rpc<Subscriber[]>("admin_list_users", { p_search: debounced, p_filter: filter, p_limit: limit, p_offset: 0 }),
    placeholderData: (prev) => prev,
  })
  const total = data?.[0]?.total ?? 0

  return (
    <Section title={t("admin.subscribers")} icon={<UsersIcon />} action={isFetching ? <Loader2Icon className="size-4 animate-spin text-muted-foreground" /> : null}>
      <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">🛡️ {t("admin.privacyTitle")}</span> {t("admin.privacyBody")}
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("admin.search")} className="pl-8" aria-label={t("admin.search")} />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => (
              <SelectItem key={f} value={f}>
                {t(`admin.filter.${f}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Card className="gap-0 divide-y py-0">
        {!data?.length ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t("admin.noUsers")}</p>
        ) : (
          data.map((u) => (
            <button key={u.user_id} type="button" onClick={() => setSelected(u)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{who(u)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {t("admin.lastActive")}: {ago(u.last_active_at)} · {t("admin.workspacesCount", { count: u.workspace_count })}
                </p>
                <div className="mt-1">
                  <UserBadges user={u} compact />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    u.tier === "ULTRA" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : u.tier === "PRO" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {u.tier}
                </span>
                {u.period_end && <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{format(new Date(u.period_end), "dd/MM/yy")}</p>}
                {u.pending_payments > 0 && <p className="mt-0.5 text-[11px] font-medium text-amber-600">{t("admin.pendingCount", { count: u.pending_payments })}</p>}
              </div>
            </button>
          ))
        )}
      </Card>
      {data && total > data.length && (
        <Button variant="ghost" className="w-full" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
          {t("admin.more", { shown: data.length, total })}
        </Button>
      )}
      <SubscriberSheet user={selected} onClose={() => setSelected(null)} />
    </Section>
  )
}

type AdminTicket = {
  id: string
  user_id: string
  email: string | null
  display_name: string | null
  plan_code: string
  category: string
  message: string
  contact: string | null
  context: Record<string, unknown>
  status: string
  admin_reply: string | null
  created_at: string
}

function TicketRow({ ticket }: { ticket: AdminTicket }) {
  const t = useT()
  const invalidate = useInvalidateAdmin()
  const [reply, setReply] = useState("")
  const update = useMutation({
    mutationFn: (status: string) => rpc("admin_update_ticket", { p_ticket_id: ticket.id, p_status: status, p_reply: reply }),
    onSuccess: () => {
      setReply("")
      toast.success(t("admin.saved"))
      void invalidate()
    },
    onError: () => toast.error(t("common.error")),
  })
  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold">{t(`support.category.${ticket.category}` as MessageKey)}</span>
        <span className="text-muted-foreground">{ago(ticket.created_at)}</span>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5">{t(`support.status.${ticket.status}` as MessageKey)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {who(ticket)} · {ticket.plan_code}
        {ticket.contact && <span className="font-medium text-foreground"> · {ticket.contact}</span>}
        {typeof ticket.context?.from === "string" && <span> · {ticket.context.from}</span>}
      </p>
      <p className="text-sm whitespace-pre-line">{ticket.message}</p>
      {ticket.admin_reply && <p className="rounded-lg bg-primary/5 p-2 text-xs whitespace-pre-line">↳ {ticket.admin_reply}</p>}
      <Textarea rows={2} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("admin.replyPlaceholder")} aria-label={t("admin.replyPlaceholder")} />
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate("IN_PROGRESS")}>
          {t("admin.ticketWorking")}
        </Button>
        <Button size="sm" disabled={update.isPending} onClick={() => update.mutate("RESOLVED")}>
          <CheckIcon />
          {t("admin.ticketResolve")}
        </Button>
      </div>
    </div>
  )
}

function SupportTickets() {
  const t = useT()
  const [status, setStatus] = useState("active")
  const { data } = useQuery({
    queryKey: ["admin", "tickets", status],
    queryFn: () => rpc<AdminTicket[]>("admin_list_tickets", { p_status: status, p_limit: 50 }),
    refetchInterval: 60_000,
  })
  return (
    <Section
      title={t("admin.tickets")}
      icon={<LifeBuoyIcon />}
      action={
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["active", "RESOLVED", "CLOSED", "all"].map((s) => (
              <SelectItem key={s} value={s}>
                {t(`admin.ticketFilter.${s}` as MessageKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <Card className="gap-0 divide-y py-0">
        {!data?.length ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t("admin.noTickets")}</p>
        ) : (
          data.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)
        )}
      </Card>
    </Section>
  )
}

type Contacts = { telegram_url?: string; community_url?: string; phone?: string; hours?: string }

function SupportContactsForm() {
  const t = useT()
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ["support-contacts"], queryFn: () => rpc<Contacts>("support_contacts") })
  const [form, setForm] = useState<Contacts>({})
  useEffect(() => {
    if (data) setForm(data)
  }, [data])
  const save = useMutation({
    mutationFn: () => rpc("admin_set_support_contacts", { p_value: form }),
    onSuccess: () => {
      toast.success(t("admin.saved"))
      void queryClient.invalidateQueries({ queryKey: ["support-contacts"] })
    },
    onError: () => toast.error(t("admin.contactsInvalid")),
  })
  const field = (key: keyof Contacts) => ({
    value: form[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  })
  return (
    <Section title={t("admin.supportContacts")} icon={<LifeBuoyIcon />}>
      <Card className="px-4 py-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="sc-tg">{t("admin.supportTelegram")}</Label>
            <Input id="sc-tg" placeholder="https://t.me/luysmart_support" inputMode="url" {...field("telegram_url")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sc-community">{t("admin.supportCommunity")}</Label>
            <Input id="sc-community" placeholder="https://t.me/LuyChlatCommunity" inputMode="url" {...field("community_url")} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="sc-phone">{t("admin.supportPhone")}</Label>
              <Input id="sc-phone" placeholder="+855 12 345 678" inputMode="tel" {...field("phone")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sc-hours">{t("admin.supportHours")}</Label>
              <Input id="sc-hours" placeholder="8:00–20:00" maxLength={80} {...field("hours")} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("admin.supportNotifyHint")}</p>
          <Button type="submit" className="w-full" disabled={save.isPending}>
            {t("common.save")}
          </Button>
        </form>
      </Card>
    </Section>
  )
}


/** Settings › About LuyChlat and the Settings footer (empty fields use the defaults in src/lib/app-info.ts). */
function AboutInfoForm() {
  const t = useT()
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ["about-info-admin"],
    queryFn: async () => {
      const { data } = await getSupabaseBrowserClient()!.from("app_settings").select("value").eq("key", "about_info").maybeSingle()
      return (data?.value ?? {}) as Partial<AboutInfo>
    },
  })
  const [form, setForm] = useState<Partial<AboutInfo>>({})
  useEffect(() => {
    if (data) setForm(data)
  }, [data])
  const save = useMutation({
    mutationFn: () => rpc("admin_set_about_info", { p_value: form }),
    onSuccess: () => {
      toast.success(t("admin.saved"))
      void queryClient.invalidateQueries({ queryKey: ["about-info"] })
      void queryClient.invalidateQueries({ queryKey: ["about-info-admin"] })
    },
    onError: (error) => toast.error(/https|email/.test(String((error as Error).message)) ? t("admin.aboutInvalid") : t("common.error")),
  })
  const field = (key: keyof AboutInfo) => ({
    value: form[key] ?? "",
    placeholder: DEFAULT_ABOUT[key] || undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  })
  return (
    <Section title={t("about.title")} icon={<InfoIcon />}>
      <Card className="px-4 py-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ab-dev">{t("admin.aboutDeveloper")}</Label>
            <Input id="ab-dev" maxLength={80} {...field("developer")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ab-credits">{t("admin.aboutCredits")}</Label>
            <Textarea id="ab-credits" rows={3} maxLength={1000} {...field("credits")} placeholder={t("admin.aboutCreditsHint")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ab-mkm">{t("admin.aboutMissionKm")}</Label>
            <Textarea id="ab-mkm" rows={2} maxLength={500} {...field("mission_km")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ab-men">{t("admin.aboutMissionEn")}</Label>
            <Textarea id="ab-men" rows={2} maxLength={500} {...field("mission_en")} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="ab-web">{t("admin.aboutWebsite")}</Label>
              <Input id="ab-web" inputMode="url" maxLength={200} {...field("website")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ab-email">{t("admin.aboutEmail")}</Label>
              <Input id="ab-email" inputMode="email" maxLength={120} {...field("email")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ab-fb">Facebook</Label>
            <Input id="ab-fb" inputMode="url" maxLength={200} {...field("facebook")} placeholder="https://facebook.com/…" />
          </div>
          <Button type="submit" className="w-full" disabled={save.isPending}>
            {t("common.save")}
          </Button>
        </form>
      </Card>
    </Section>
  )
}

export default function AdminPage() {
  const t = useT()
  const { plan, loading } = usePlan()
  const role = plan.staff_role ?? (plan.is_admin ? "admin" : null)

  if (loading) return <Loader2Icon className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" />
  if (!role) {
    return (
      <Card className="items-center gap-2 px-6 py-10 text-center">
        <ShieldAlertIcon className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-semibold">{t("admin.forbidden")}</p>
      </Card>
    )
  }
  // Cosmetic only: each card's database functions check the role themselves.
  const admin = role === "admin" || role === "super_admin"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t("admin.title")}</h1>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{t(`admin.role.${role}`)}</span>
      </div>
      {role === "super_admin" && (
        <Button asChild variant="outline" className="w-full justify-between">
          <Link href="/admin/super">
            <span className="flex items-center gap-2">
              <CrownIcon className="text-primary" />
              {t("super.title")}
            </span>
            <ChevronRightIcon />
          </Link>
        </Button>
      )}
      <SystemHealthCard />
      {admin && <PendingPayments />}
      <SupportTickets />
      {admin && (
        <>
          <Subscribers />
          <SupportContactsForm />
          <AboutInfoForm />
          <LocalGoldAdmin />
        </>
      )}
    </div>
  )
}

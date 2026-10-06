"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { differenceInCalendarDays, format } from "date-fns"
import { CakeIcon, Loader2Icon, SearchIcon, SendIcon, UsersRoundIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { ago, confirmChange, rpc, Section } from "@/components/admin/ui"
import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { isPhoneLoginEmail, loginLabel } from "@/lib/auth-identifier"
import { formatDuration } from "@/lib/format"
import { useLocaleStore } from "@/stores/locale-store"
import type { MessageKey } from "@/lib/i18n/dictionaries"

/** A row of public.admin_customers: account, Telegram, plan and payment metadata only — never finances. */
type Customer = {
  user_id: string
  email: string | null
  display_name: string | null
  telegram_username: string | null
  /** Sign-up method: "email", "google", … */
  provider: string
  joined_at: string
  last_active_at: string | null
  plan_code: string | null
  tier: "FREE" | "PRO" | "ULTRA"
  source: "ADMIN" | "KHQR" | "TRIAL" | "REFERRAL" | "PROMO" | null
  period_end: string | null
  status: "ACTIVE" | "EXPIRED" | "FREE"
  last_paid_at: string | null
  last_payment_method: "KHQR" | "BANK_TRANSFER" | "CASH" | "OTHER" | null
  last_payment_amount: number | null
  last_payment_currency: "USD" | "KHR" | null
  paid_count: number
  /** Internal / test account: left out of business metrics. */
  is_test: boolean
  birth_date: string | null
  occupation: string | null
  account_status?: "ACTIVE" | "DORMANT" | "DELETED"
  suspended: boolean
  total: number
}
// "all" is the active accounts; dormant ones (6+ months quiet) have their own tab.
type Filter = "all" | "paying" | "free" | "test" | "dormant"
const PAGE = 30

const STATUS_TONE: Record<Customer["status"], string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  EXPIRED: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  FREE: "bg-muted text-muted-foreground",
}

const joined = (iso: string) => format(new Date(iso), "dd-MMM-yyyy")

function Badges({ c }: { c: Customer }) {
  const t = useT()
  return (
    <span className="flex flex-wrap items-center gap-1 text-[11px]">
      <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">{t("customers.joined", { date: joined(c.joined_at) })}</span>
      <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
        {t(c.provider === "google" ? "customers.provider.google" : isPhoneLoginEmail(c.email) ? "customers.provider.phone" : "customers.provider.email")}
      </span>
      {c.birth_date && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/10 px-1.5 py-0.5 text-rose-700 dark:text-rose-300">
          <CakeIcon className="size-3" aria-hidden />
          {format(new Date(`${c.birth_date}T12:00:00`), "dd/MM/yyyy")}
        </span>
      )}
      {c.occupation && <span className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-sky-700 dark:text-sky-300">{t(`occupation.${c.occupation}` as MessageKey)}</span>}
      {c.is_test && <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 font-semibold text-violet-700 dark:text-violet-300">🧪 {t("customers.test")}</span>}
      {c.suspended && <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 font-semibold text-destructive">🔴 {t("admin.badge.suspended")}</span>}
    </span>
  )
}

function CustomerRow({ c, onOpen }: { c: Customer; onOpen: () => void }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const daysLeft = c.status === "ACTIVE" && c.period_end ? differenceInCalendarDays(new Date(c.period_end), new Date()) : null
  // How the plan was obtained: paid (KHQR / entered by an admin) or free (trial, referral, promo).
  const how = c.status === "ACTIVE" && c.source ? t(`customers.source.${c.source}`) : null
  return (
    <button type="button" onClick={onOpen} className={cn("w-full space-y-1 px-4 py-3 text-left hover:bg-muted/60", c.is_test && "opacity-75")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{c.display_name || loginLabel(c.email) || "—"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {loginLabel(c.email)}
            {c.telegram_username && (
              <span className="ml-1.5 inline-flex items-center gap-0.5 [&_svg]:size-3">
                <SendIcon />@{c.telegram_username}
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_TONE[c.status])}>
            {c.status === "ACTIVE" ? `🟢 ${c.tier}` : c.status === "EXPIRED" ? `🟡 ${t("customers.expired")}` : t("plan.free")}
          </span>
          {daysLeft !== null && (
            <p className={cn("mt-0.5 text-[11px] tabular-nums", daysLeft <= 7 ? "font-medium text-amber-600" : "text-muted-foreground")}>
              {t("customers.daysLeft", { duration: formatDuration(Math.max(0, daysLeft), "remaining", locale) })} · {format(new Date(c.period_end!), "dd/MM/yy")}
            </p>
          )}
          {c.status === "EXPIRED" && c.period_end && <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{format(new Date(c.period_end), "dd/MM/yy")}</p>}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {[
          how,
          c.last_paid_at
            ? t("customers.lastPaid", {
                date: format(new Date(c.last_paid_at), "dd/MM/yy"),
                amount: c.last_payment_amount !== null && c.last_payment_currency ? formatMoney(Number(c.last_payment_amount), c.last_payment_currency) : "",
                method: t(`customers.method.${c.last_payment_method ?? "OTHER"}`),
              })
            : null,
          c.paid_count > 1 ? t("customers.paidCount", { count: c.paid_count }) : null,
          `${t("admin.lastActive")}: ${ago(c.last_active_at)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <Badges c={c} />
    </button>
  )
}

type Tier = "FREE" | "PRO" | "ULTRA"

/**
 * Quick actions for one customer: change plan, suspend / reactivate, mark as a
 * test account. Each asks for a reason and the admin's 2FA, and is audited.
 */
function CustomerSheet({ c, onClose }: { c: Customer; onClose: () => void }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [tier, setTier] = useState<Tier>(c.status === "ACTIVE" ? c.tier : "PRO")
  const name = c.display_name || loginLabel(c.email) || c.user_id
  const act = useMutation({
    mutationFn: ({ fn, args }: { fn: string; args: Record<string, unknown> }) => rpc(fn, args),
    onSuccess: () => {
      toast.success(t("admin.saved"))
      void queryClient.invalidateQueries({ queryKey: ["admin"] })
      onClose()
    },
    onError: (e) => toast.error(/admins cannot/.test((e as Error).message) ? t("admin.cannotSuspendAdmin") : t("common.error")),
  })
  const run = async (prompt: string, fn: string, args: Record<string, unknown>) => {
    const note = await confirmChange(prompt, t)
    if (note) act.mutate({ fn, args: { ...args, p_user_id: c.user_id, p_note: note } })
  }
  const grant = (days: 30 | 365) =>
    void run(t("customers.grantPrompt", { name, tier, days }), "admin_extend_subscription", { p_plan_code: `${tier}_${days === 30 ? "MONTHLY" : "YEARLY"}`, p_days: days })

  return (
    <BottomSheet open onOpenChange={(v) => !v && onClose()} title={name} description={loginLabel(c.email) || undefined}>
      <div className="space-y-4">
        <Badges c={c} />
        <label className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm">
          <span>
            <span className="block font-medium">🧪 {t("customers.markTest")}</span>
            <span className="block text-xs text-muted-foreground">{t("customers.markTestHint")}</span>
          </span>
          <Switch
            checked={c.is_test}
            disabled={act.isPending}
            onCheckedChange={(on) => void run(t(on ? "customers.testPrompt" : "customers.untestPrompt", { name }), "admin_set_test_account", { p_on: on })}
          />
        </label>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-muted/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">{t("admin.plan")}</p>
            <p className="font-semibold">
              {c.status === "ACTIVE" ? c.tier : t("plan.free")}
              {c.status === "ACTIVE" && c.period_end && <span className="text-xs font-normal text-muted-foreground"> · {format(new Date(c.period_end), "dd/MM/yy")}</span>}
            </p>
          </div>
          <div className="rounded-xl bg-muted/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">{t("admin.lastActive")}</p>
            <p className="font-semibold">{ago(c.last_active_at)}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("customers.changePlan")}</p>
          <Segmented value={tier} onChange={setTier} options={(["FREE", "PRO", "ULTRA"] as const).map((v) => ({ value: v, label: v }))} />
          {tier === "FREE" ? (
            <Button
              variant="outline"
              className="w-full text-destructive"
              disabled={act.isPending || c.status !== "ACTIVE"}
              onClick={() => void run(t("admin.cancelConfirm", { name }), "admin_cancel_subscription", {})}
            >
              {t("customers.toFree")}
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={act.isPending} onClick={() => grant(30)}>
                +30 {t("admin.days")} {tier}
              </Button>
              <Button variant="outline" disabled={act.isPending} onClick={() => grant(365)}>
                +365 {t("admin.days")} {tier}
              </Button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">{t("customers.planNote")}</p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("admin.accountStatus")}</p>
          <Button
            variant="outline"
            className={cn("w-full", !c.suspended && "text-destructive")}
            disabled={act.isPending}
            onClick={() =>
              void run(t(c.suspended ? "admin.reactivatePrompt" : "admin.suspendPrompt", { name }), "admin_set_account_status", { p_suspend: !c.suspended })
            }
          >
            {t(c.suspended ? "admin.reactivate" : "admin.suspend")}
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}

/** /admin/super › Customers: everyone except staff, with plan, expiry and last payment. */
export function CustomerDirectory() {
  const t = useT()
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [limit, setLimit] = useState(PAGE)
  const [open, setOpen] = useState<Customer | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const { data, isFetching } = useQuery({
    queryKey: ["admin", "customers", debounced, filter, limit],
    queryFn: () => rpc<Customer[]>("admin_customers", { p_search: debounced, p_filter: filter, p_limit: limit, p_offset: 0 }),
    placeholderData: (prev) => prev,
  })
  const total = data?.[0]?.total ?? 0

  return (
    <Section title={t("customers.title")} icon={<UsersRoundIcon />} action={isFetching ? <Loader2Icon className="size-4 animate-spin text-muted-foreground" /> : null}>
      <Segmented
        value={filter}
        onChange={(v) => {
          setFilter(v)
          setLimit(PAGE)
        }}
        options={[
          { value: "all", label: t("customers.filter.all") },
          { value: "paying", label: t("customers.filter.paying") },
          { value: "free", label: t("customers.filter.free") },
          { value: "test", label: "🧪" },
          { value: "dormant", label: t("customers.filter.dormant") },
        ]}
      />
      <div className="relative">
        <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("customers.search")} className="pl-8" aria-label={t("customers.search")} />
      </div>
      <Card className="gap-0 divide-y py-0">
        {!data?.length ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t(debounced || filter !== "all" ? "admin.noUsers" : "customers.none")}</p>
        ) : (
          data.map((c) => <CustomerRow key={c.user_id} c={c} onOpen={() => setOpen(c)} />)
        )}
      </Card>
      {data && total > data.length && (
        <Button variant="ghost" className="w-full" onClick={() => setLimit((l) => l + PAGE)}>
          {t("admin.more", { shown: data.length, total })}
        </Button>
      )}
      <p className="text-[11px] text-muted-foreground">{t("customers.note")}</p>
      {open && <CustomerSheet c={open} onClose={() => setOpen(null)} />}
    </Section>
  )
}

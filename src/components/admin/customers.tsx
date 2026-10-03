"use client"

import { useQuery } from "@tanstack/react-query"
import { differenceInCalendarDays, format } from "date-fns"
import { Loader2Icon, SearchIcon, SendIcon, UsersRoundIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { ago, rpc, Section } from "@/components/admin/ui"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

/** A row of public.admin_customers: account, Telegram, plan and payment metadata only — never finances. */
type Customer = {
  user_id: string
  email: string | null
  display_name: string | null
  telegram_username: string | null
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
  total: number
}
type Filter = "all" | "paying" | "free"
const PAGE = 30

const STATUS_TONE: Record<Customer["status"], string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  EXPIRED: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  FREE: "bg-muted text-muted-foreground",
}

function CustomerRow({ c }: { c: Customer }) {
  const t = useT()
  const daysLeft = c.status === "ACTIVE" && c.period_end ? differenceInCalendarDays(new Date(c.period_end), new Date()) : null
  // How the plan was obtained: paid (KHQR / entered by an admin) or free (trial, referral, promo).
  const how = c.status === "ACTIVE" && c.source ? t(`customers.source.${c.source}`) : null
  return (
    <div className="space-y-1 px-4 py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{c.display_name || c.email || "—"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {c.email}
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
              {t("customers.daysLeft", { count: Math.max(0, daysLeft) })} · {format(new Date(c.period_end!), "dd/MM/yy")}
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
    </div>
  )
}

/** /admin/super › Customers: everyone except staff, with plan, expiry and last payment. */
export function CustomerDirectory() {
  const t = useT()
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [limit, setLimit] = useState(PAGE)

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
        ]}
      />
      <div className="relative">
        <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("customers.search")} className="pl-8" aria-label={t("customers.search")} />
      </div>
      <Card className="gap-0 divide-y py-0">
        {!data?.length ? <p className="px-4 py-4 text-sm text-muted-foreground">{t("admin.noUsers")}</p> : data.map((c) => <CustomerRow key={c.user_id} c={c} />)}
      </Card>
      {data && total > data.length && (
        <Button variant="ghost" className="w-full" onClick={() => setLimit((l) => l + PAGE)}>
          {t("admin.more", { shown: data.length, total })}
        </Button>
      )}
      <p className="text-[11px] text-muted-foreground">{t("customers.note")}</p>
    </Section>
  )
}

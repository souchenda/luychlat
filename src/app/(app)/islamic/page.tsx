"use client"

import { useQueries, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { CalendarClockIcon, CoinsIcon, HandHeartIcon, InfoIcon, Loader2Icon, ScaleIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useRepo, useWorkspaces } from "@/lib/data/hooks"
import type { Category, Currency, Debt, Transaction, Wallet } from "@/lib/data/types"
import { remaining } from "@/lib/debts"
import { toDateInput } from "@/lib/dates"
import { useT } from "@/lib/i18n/use-t"
import { calculateZakat, formatHijri, hawlStatus, NISAB_GOLD_GRAMS, NISAB_SILVER_GRAMS, purificationBalance, toHijri } from "@/lib/islamic"
import { useIslamicDefaults, useIslamicMutations, useIslamicSettings } from "@/lib/islamic-settings"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { usePrefsStore } from "@/stores/prefs-store"
import { portfolio } from "@/lib/gold"
import { useGoldHoldingsOf } from "@/lib/gold-data"
import { investmentTotals } from "@/lib/investments"
import { useInvestmentsOf, useMarketPrices } from "@/lib/investments-data"
import { useLocaleStore } from "@/stores/locale-store"
import { useSessionStore } from "@/stores/session-store"

type LogKind = "zakat" | "sadaqah" | "waqf" | "riba_purification"

const usd = (amount: number, currency: Currency, rate: number) => (currency === "USD" ? amount : amount / rate)

function Line({ label, value, strong, negative }: { label: string; value: string; strong?: boolean; negative?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", strong && "font-semibold", negative && "text-[#F43F5E]")}>{value}</span>
    </div>
  )
}

/** The user's own money for Zakat: Personal (+ Business) wallets, debts and Islamic categories. */
function useIslamicData(includeBusiness: boolean) {
  const { repo, scope } = useRepo()
  const me = useSessionStore((s) => s.user?.id)
  const workspaces = (useWorkspaces().data ?? []).filter(
    (w) => w.user_id === me && (w.type === "PERSONAL" || (includeBusiness && w.type === "BUSINESS")),
  )
  const wallets = useQueries({ queries: workspaces.map((w) => ({ queryKey: ["wallets", scope, w.id], queryFn: () => repo.listWallets(w.id) })) })
  const debts = useQueries({ queries: workspaces.map((w) => ({ queryKey: ["debts", scope, w.id], queryFn: () => repo.listDebts(w.id) })) })
  const categories = useQueries({ queries: workspaces.map((w) => ({ queryKey: ["categories", scope, w.id], queryFn: () => repo.listCategories(w.id) })) })
  const allCategories = categories.flatMap((q) => q.data ?? [])
  const islamicCats = allCategories.filter((c) => c.preset_key && ["zakat", "sadaqah", "waqf", "riba_purification", "bank_interest"].includes(c.preset_key))
  const txs = useQueries({
    queries: islamicCats.map((c) => ({
      queryKey: ["transactions", scope, c.workspace_id, "islamic", c.id],
      queryFn: () => repo.listTransactions(c.workspace_id, { categoryId: c.id }),
    })),
  })
  // Gold recorded on the Gold page counts too (pure gold content, platinum excluded).
  const gold = useGoldHoldingsOf(workspaces.map((w) => w.id))
  // Stocks and crypto at today's market value count like cash.
  const investments = useInvestmentsOf(workspaces.map((w) => w.id))
  const { prices } = useMarketPrices()
  const rate = usePrefsStore((s) => s.khrPerUsd)
  return {
    workspaces,
    goldGrams: portfolio(gold, {}, 1).pureGoldGrams,
    investmentsUsd: investmentTotals(investments, prices, rate).valueUsd,
    wallets: wallets.flatMap((q) => q.data ?? []).filter((w) => !w.archived_at),
    debts: debts.flatMap((q) => q.data ?? []),
    categories: allCategories,
    transactions: txs.flatMap((q) => q.data ?? []),
    loading: wallets.some((q) => q.isLoading) || debts.some((q) => q.isLoading),
  }
}

/** Log a Zakat / Sadaqah / Waqf / purification payment as an expense in the right category. */
function LogSheet({
  kind,
  suggestedUsd,
  wallets,
  categories,
  onClose,
}: {
  kind: LogKind | null
  suggestedUsd: number
  wallets: Wallet[]
  categories: Category[]
  onClose: () => void
}) {
  const t = useT()
  const { repo } = useRepo()
  const queryClient = useQueryClient()
  const rate = usePrefsStore((s) => s.khrPerUsd)
  const [walletId, setWalletId] = useState("")
  const [amountText, setAmountText] = useState("")
  const [date, setDate] = useState(toDateInput(new Date().toISOString()))
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const wallet = wallets.find((w) => w.id === walletId)

  useEffect(() => {
    if (!kind) return
    const first = wallets[0]
    setWalletId(first?.id ?? "")
    setAmountText(suggestedUsd > 0 && first ? String(first.currency === "USD" ? roundMoney(suggestedUsd, "USD") : roundMoney(suggestedUsd * rate, "KHR")) : "")
    setDate(toDateInput(new Date().toISOString()))
    setNote("")
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the sheet opens
  }, [kind])

  const save = async () => {
    if (!kind || !wallet) return
    const amount = roundMoney(parseAmount(amountText), wallet.currency)
    if (!(amount > 0)) return
    const category = categories.find((c) => c.workspace_id === wallet.workspace_id && c.preset_key === kind)
    if (!category) return toast.error(t("islamic.categoryMissing"))
    setBusy(true)
    try {
      await repo.createEntry(wallet.workspace_id, {
        type: "EXPENSE",
        wallet_id: wallet.id,
        category_id: category.id,
        amount,
        currency: wallet.currency,
        exchange_rate: null,
        note: note.trim() || null,
        transaction_date: new Date(`${date}T12:00:00`).toISOString(),
        receipt_url: null,
      })
      for (const key of ["transactions", "wallets"]) void queryClient.invalidateQueries({ queryKey: [key] })
      toast.success(t("islamic.logged"))
      onClose()
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet open={kind !== null} onOpenChange={(v) => !v && onClose()} title={kind ? t(`islamic.log.${kind}`) : ""}>
      {wallets.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("entry.noWallet")}</p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="space-y-2">
            <Label>{t("islamic.fromWallet")}</Label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {wallets.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} · {formatMoney(w.balance, w.currency)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="isl-amount">{t("islamic.amount", { currency: wallet?.currency ?? "" })}</Label>
            <Input id="isl-amount" className="h-14 text-2xl font-semibold tabular-nums" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="isl-date">{t("entry.date")}</Label>
              <Input id="isl-date" type="date" className="h-11" max="9999-12-31" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="isl-note">{t("entry.note")}</Label>
              <Input id="isl-note" className="h-11" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <Button type="submit" className="h-12 w-full text-base" disabled={busy || !(parseAmount(amountText) > 0)}>
            {busy ? <Loader2Icon className="animate-spin" /> : <HandHeartIcon />}
            {t("islamic.save")}
          </Button>
        </form>
      )}
    </BottomSheet>
  )
}

export default function IslamicPage() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const rate = usePrefsStore((s) => s.khrPerUsd)
  const { settings, loading: settingsLoading } = useIslamicSettings()
  const defaults = useIslamicDefaults()
  const { update } = useIslamicMutations()
  const data = useIslamicData(settings.include_business)
  const [logKind, setLogKind] = useState<LogKind | null>(null)
  const [logAmount, setLogAmount] = useState(0)
  const [goldPrice, setGoldPrice] = useState("")
  const [silverPrice, setSilverPrice] = useState("")
  const [goldGrams, setGoldGrams] = useState("")
  const [hawlInput, setHawlInput] = useState(toDateInput(new Date().toISOString()))

  useEffect(() => {
    setGoldPrice(settings.gold_price ? String(settings.gold_price) : "")
    setSilverPrice(settings.silver_price ? String(settings.silver_price) : "")
    setGoldGrams(settings.gold_grams ? String(settings.gold_grams) : "")
  }, [settings.gold_price, settings.silver_price, settings.gold_grams])

  const offset = Number(defaults.hijri_offset ?? 0) || 0
  const effectiveGold = settings.gold_price ?? (defaults.gold_price ? Number(defaults.gold_price) : null)
  const effectiveSilver = settings.silver_price ?? (defaults.silver_price ? Number(defaults.silver_price) : null)

  const cash = data.wallets.reduce((s, w) => s + usd(w.balance, w.currency, rate), 0)
  const today = new Date()
  const yearAhead = format(new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()), "yyyy-MM-dd")
  const shortTermDebts = data.debts
    .filter((d: Debt) => d.type === "PAYABLE" && (!d.due_date || d.due_date <= yearAhead))
    .reduce((s, d) => s + usd(remaining(d), d.currency, rate), 0)
  const receivables = settings.include_receivables
    ? data.debts.filter((d) => d.type === "RECEIVABLE").reduce((s, d) => s + usd(remaining(d), d.currency, rate), 0)
    : 0
  const zakat = calculateZakat({
    cash,
    goldGrams: settings.gold_grams + data.goldGrams,
    investments: data.investmentsUsd,
    goldPrice: effectiveGold,
    silverPrice: effectiveSilver,
    basis: settings.nisab_basis,
    receivables,
    shortTermDebts,
  })

  const byKey = useMemo(() => new Map(data.categories.map((c) => [c.id, c.preset_key])), [data.categories])
  const sumOf = (key: string, filter: (tx: Transaction) => boolean = () => true) =>
    data.transactions.filter((tx) => byKey.get(tx.category_id ?? "") === key && filter(tx)).reduce((s, tx) => s + usd(tx.amount, tx.currency, rate), 0)
  const interest = sumOf("bank_interest")
  const purified = sumOf("riba_purification")
  const toPurify = purificationBalance(interest, purified)
  const year = today.getFullYear()
  const thisYear = (tx: Transaction) => new Date(tx.transaction_date).getFullYear() === year
  const charity = { zakat: sumOf("zakat", thisYear), sadaqah: sumOf("sadaqah", thisYear), waqf: sumOf("waqf", thisYear) }
  const charityTotal = charity.zakat + charity.sadaqah + charity.waqf

  const hawl = settings.hawl_start ? hawlStatus(settings.hawl_start, today) : null
  const hijriDue = hawl ? toHijri(new Date(`${hawl.due}T12:00:00`), offset) : null
  const money = (n: number) => formatMoney(roundMoney(n, "USD"), "USD")
  const savePrices = () =>
    update.mutate(
      {
        gold_price: goldPrice.trim() ? Number(goldPrice) : null,
        silver_price: silverPrice.trim() ? Number(silverPrice) : null,
        gold_grams: goldGrams.trim() ? Math.max(0, Number(goldGrams)) : 0,
      },
      { onSuccess: () => toast.success(t("admin.saved")), onError: () => toast.error(t("common.error")) },
    )
  const openLog = (kind: LogKind, amount: number) => {
    setLogAmount(amount)
    setLogKind(kind)
  }

  // The layout shows the header, tabs and the "turned off" notice.
  if (settingsLoading || !settings.enabled) return null

  return (
    <div className="space-y-5">
      {/* Zakat calculator */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 px-1 text-sm font-medium text-muted-foreground">
          <CoinsIcon className="size-4" aria-hidden />
          {t("islamic.zakatTitle")}
        </h2>
        <Card className="gap-3 px-4 py-4">
          <div className="space-y-1.5">
            <Line label={t("islamic.cash")} value={money(cash)} />
            {settings.gold_grams + data.goldGrams > 0 && (
              <Line
                label={t("islamic.gold", { grams: Math.round((settings.gold_grams + data.goldGrams) * 100) / 100 })}
                value={effectiveGold ? money(zakat.goldValue) : "—"}
              />
            )}
            {data.investmentsUsd > 0 && <Line label={t("islamic.investments")} value={money(data.investmentsUsd)} />}
            {data.goldGrams > 0 && <p className="-mt-1 text-[11px] text-muted-foreground">{t("islamic.goldFromAssets", { grams: Math.round(data.goldGrams * 100) / 100 })}</p>}
            {settings.include_receivables && <Line label={t("islamic.receivables")} value={money(receivables)} />}
            <Line label={t("islamic.shortDebts")} value={`−${money(shortTermDebts)}`} negative={shortTermDebts > 0} />
            <div className="border-t pt-1.5">
              <Line label={t("islamic.netWealth")} value={money(zakat.netWealth)} strong />
            </div>
            <Line
              label={t("islamic.nisab", { grams: settings.nisab_basis === "GOLD" ? NISAB_GOLD_GRAMS : NISAB_SILVER_GRAMS, metal: t(settings.nisab_basis === "GOLD" ? "islamic.goldWord" : "islamic.silverWord") })}
              value={zakat.nisab !== null ? money(zakat.nisab) : t("islamic.needPrice")}
            />
          </div>

          <div className={cn("rounded-xl p-3 text-center", zakat.meetsNisab ? "bg-emerald-500/10" : "bg-muted/60")}>
            {zakat.nisab === null ? (
              <p className="text-sm text-muted-foreground">{t("islamic.enterPrice")}</p>
            ) : zakat.meetsNisab ? (
              <>
                <p className="text-xs text-muted-foreground">{t("islamic.zakatDue")}</p>
                <p className="text-3xl font-bold text-emerald-700 tabular-nums dark:text-emerald-400">{money(zakat.zakat)}</p>
                <p className="text-xs text-muted-foreground">≈ {formatMoney(roundMoney(zakat.zakat * rate, "KHR"), "KHR")}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("islamic.belowNisab")}</p>
            )}
          </div>
          {zakat.meetsNisab && (
            <Button className="h-11" onClick={() => openLog("zakat", zakat.zakat)}>
              <HandHeartIcon />
              {t("islamic.payZakat")}
            </Button>
          )}

          <details className="group rounded-xl border px-3 py-2">
            <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">{t("islamic.settings")}</summary>
            <div className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label>{t("islamic.nisabBasis")}</Label>
                <Segmented
                  aria-label={t("islamic.nisabBasis")}
                  value={settings.nisab_basis}
                  onChange={(v) => update.mutate({ nisab_basis: v })}
                  options={[
                    { value: "GOLD", label: t("islamic.goldBasis") },
                    { value: "SILVER", label: t("islamic.silverBasis") },
                  ]}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="isl-gold">{t("islamic.goldPrice")}</Label>
                  <Input id="isl-gold" inputMode="decimal" value={goldPrice} onChange={(e) => setGoldPrice(e.target.value)} placeholder={defaults.gold_price ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="isl-silver">{t("islamic.silverPrice")}</Label>
                  <Input id="isl-silver" inputMode="decimal" value={silverPrice} onChange={(e) => setSilverPrice(e.target.value)} placeholder={defaults.silver_price ?? ""} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="isl-grams">{t("islamic.goldGrams")}</Label>
                <Input id="isl-grams" inputMode="decimal" value={goldGrams} onChange={(e) => setGoldGrams(e.target.value)} placeholder="0" />
              </div>
              <Button variant="secondary" className="w-full" onClick={savePrices} disabled={update.isPending}>
                {t("common.save")}
              </Button>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{t("islamic.includeReceivables")}</span>
                <Switch checked={settings.include_receivables} onCheckedChange={(v) => update.mutate({ include_receivables: v })} aria-label={t("islamic.includeReceivables")} />
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{t("islamic.includeBusiness")}</span>
                <Switch checked={settings.include_business} onCheckedChange={(v) => update.mutate({ include_business: v })} aria-label={t("islamic.includeBusiness")} />
              </div>
              <p className="text-xs text-muted-foreground">{t("islamic.scopeHint")}</p>
            </div>
          </details>

          <p className="flex gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("islamic.disclaimer")}
          </p>
        </Card>
      </section>

      {/* Hawl */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 px-1 text-sm font-medium text-muted-foreground">
          <CalendarClockIcon className="size-4" aria-hidden />
          {t("islamic.hawlTitle")}
        </h2>
        <Card className="gap-3 px-4 py-4">
          {hawl ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm">{t("islamic.hawlDue", { date: format(new Date(`${hawl.due}T12:00:00`), "dd/MM/yyyy") })}</p>
                <p className={cn("text-sm font-semibold tabular-nums", hawl.isDue ? "text-[#F43F5E]" : "text-emerald-700 dark:text-emerald-400")}>
                  {hawl.isDue ? t("islamic.hawlIsDue") : t("islamic.daysLeft", { days: hawl.daysLeft })}
                </p>
              </div>
              {hijriDue && <p className="-mt-2 text-xs text-muted-foreground">{formatHijri(hijriDue, locale, { short: true })}</p>}
              <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(hawl.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${hawl.progress * 100}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">{t("islamic.hawlStarted", { date: format(new Date(`${hawl.start}T12:00:00`), "dd/MM/yyyy") })}</p>
              {hawl.isDue && (
                <Button variant="outline" onClick={() => update.mutate({ hawl_start: hawl.due })}>
                  {t("islamic.nextHawl")}
                </Button>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t("islamic.hawlHint")}</p>
              <div className="flex gap-2">
                <Input type="date" className="h-11 flex-1" max="9999-12-31" value={hawlInput} onChange={(e) => setHawlInput(e.target.value)} aria-label={t("islamic.hawlTitle")} />
                <Button className="h-11" onClick={() => update.mutate({ hawl_start: hawlInput })} disabled={!hawlInput}>
                  {t("islamic.startHawl")}
                </Button>
              </div>
            </>
          )}
        </Card>
      </section>

      {/* Riba purification */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 px-1 text-sm font-medium text-muted-foreground">
          <ScaleIcon className="size-4" aria-hidden />
          {t("islamic.ribaTitle")}
        </h2>
        <Card className="gap-3 px-4 py-4">
          <Line label={t("islamic.interestReceived")} value={money(interest)} />
          <Line label={t("islamic.purified")} value={money(purified)} />
          <div className="border-t pt-1.5">
            <Line label={t("islamic.toPurify")} value={money(toPurify)} strong />
          </div>
          {toPurify > 0 && (
            <Button variant="outline" onClick={() => openLog("riba_purification", toPurify)}>
              <HandHeartIcon />
              {t("islamic.purifyNow")}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">{t("islamic.ribaHint")}</p>
        </Card>
      </section>

      {/* Charity this year */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 px-1 text-sm font-medium text-muted-foreground">
          <HandHeartIcon className="size-4" aria-hidden />
          {t("islamic.charityTitle", { year })}
        </h2>
        <Card className="gap-3 px-4 py-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            {(["zakat", "sadaqah", "waqf"] as const).map((k) => (
              <div key={k} className="rounded-xl bg-muted/60 px-2 py-2.5">
                <p className="text-[11px] text-muted-foreground">{t(`islamic.cat.${k}`)}</p>
                <p className="text-sm font-semibold tabular-nums">{money(charity[k])}</p>
              </div>
            ))}
          </div>
          <Line label={t("islamic.charityTotal")} value={money(charityTotal)} strong />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => openLog("sadaqah", 0)}>
              {t("islamic.log.sadaqah")}
            </Button>
            <Button variant="outline" onClick={() => openLog("waqf", 0)}>
              {t("islamic.log.waqf")}
            </Button>
          </div>
        </Card>
      </section>

      <LogSheet kind={logKind} suggestedUsd={logAmount} wallets={data.wallets} categories={data.categories} onClose={() => setLogKind(null)} />
    </div>
  )
}

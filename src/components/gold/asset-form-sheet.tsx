"use client"

import { Loader2Icon, Trash2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { stepUp } from "@/components/security/step-up"
import { ASSET_EMOJI, ASSET_KINDS, DEFAULT_LIFE_YEARS, LIFE_YEARS, depreciation, hasPlot, type PersonalAssetKind, type PhysicalAsset } from "@/lib/assets"
import { usePhysicalAssetMutations } from "@/lib/assets-data"
import type { Currency, Debt } from "@/lib/data/types"
import { khmerDigits } from "@/lib/dates"
import { debtStatus, remaining } from "@/lib/debts"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { LAND_PRICE_SOURCE, PHNOM_PENH_KHANS, PROVINCE, landReference } from "@/lib/land-prices"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"

const NO_LOAN = "none"
const NO_LOCATION = "none"

/**
 * Add or edit land, a house, a vehicle, a laptop…: either an estimated value, or — with a
 * useful life — the purchase cost depreciated straight-line (book value shown live);
 * and the bank loan that financed it (optional).
 */
export function AssetFormSheet({
  open,
  onOpenChange,
  workspaceId,
  asset,
  debts,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string | undefined
  asset?: PhysicalAsset | null
  debts: Debt[]
}) {
  const t = useT()
  const { add, update, remove } = usePhysicalAssetMutations(workspaceId)
  const [kind, setKind] = useState<PersonalAssetKind>("HOUSE")
  const [name, setName] = useState("")
  const [value, setValue] = useState("")
  const [currency, setCurrency] = useState<Currency>("USD")
  const [date, setDate] = useState("")
  const [price, setPrice] = useState("")
  const [loanId, setLoanId] = useState(NO_LOAN)
  // Useful life in years ("0" = no depreciation).
  const [life, setLife] = useState("0")
  // Land / house: the Khan (or a province) and the plot size, for the area price reference.
  const [location, setLocation] = useState(NO_LOCATION)
  const [area, setArea] = useState("")
  const locale = useLocaleStore((s) => s.locale)
  const num = (n: number) => (locale === "km" ? khmerDigits(String(n)) : String(n))
  // Loans we owe that are still open (plus the one already linked).
  const loans = debts.filter((d) => d.type === "PAYABLE" && (debtStatus(d) !== "SETTLED" || d.id === asset?.debt_id))

  useEffect(() => {
    if (!open) return
    setKind((asset?.kind as PersonalAssetKind | undefined) ?? "HOUSE")
    setName(asset?.name ?? "")
    setValue(asset ? String(asset.estimated_value) : "")
    setCurrency(asset?.currency ?? "USD")
    setDate(asset?.purchase_date ?? "")
    setPrice(asset?.purchase_price != null ? String(asset.purchase_price) : "")
    setLoanId(asset?.debt_id ?? NO_LOAN)
    setLife(asset ? String(asset.useful_life_months ? Math.round(asset.useful_life_months / 12) : 0) : String(DEFAULT_LIFE_YEARS.HOUSE ?? 0))
    setLocation(asset?.location ?? NO_LOCATION)
    setArea(asset?.area_m2 != null ? String(asset.area_m2) : "")
  }, [open, asset])

  const pickKind = (k: PersonalAssetKind) => {
    setKind(k)
    // A new asset takes the usual life for its kind (a laptop 3 years, land none); an existing one keeps its own.
    if (!asset) setLife(String(DEFAULT_LIFE_YEARS[k] ?? 0))
  }
  const lifeMonths = Number(life) > 0 ? Number(life) * 12 : null
  const cost = price.trim() ? parseAmount(price) : null
  // The live schedule (once cost and date are in).
  const schedule = lifeMonths && cost != null && cost >= 0 && date ? depreciation({ purchase_price: cost, purchase_date: date, useful_life_months: lifeMonths, currency }) : null
  const plot = hasPlot(kind)
  const areaM2 = area.trim() ? parseAmount(area) : null
  const reference = plot ? landReference(location, areaM2) : null
  const usd = (n: number) => formatMoney(n, "USD")
  const khanName = (k: { km: string; en: string }) => (locale === "km" ? k.km : k.en)

  const busy = add.isPending || update.isPending
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const bought = price.trim() ? parseAmount(price) : null
    if (!name.trim()) return void toast.error(t("gold.nameRequired"))
    if (bought !== null && !(bought >= 0)) return void toast.error(t("walletForm.amountInvalid"))
    // Depreciating: the cost and date are what the schedule is computed from; the stored value is today's book value.
    if (lifeMonths && (bought === null || !date)) return void toast.error(t("assets.costRequired"))
    const estimate = schedule ? schedule.bookValue : parseAmount(value)
    if (!(estimate >= 0)) return void toast.error(t("walletForm.amountInvalid"))
    if (plot && areaM2 !== null && !(areaM2 > 0)) return void toast.error(t("walletForm.amountInvalid"))
    const input = {
      kind,
      name: name.trim(),
      estimated_value: roundMoney(estimate, currency),
      currency,
      purchase_date: date || null,
      purchase_price: bought === null ? null : roundMoney(bought, currency),
      debt_id: loanId === NO_LOAN ? null : loanId,
      note: null,
      useful_life_months: lifeMonths,
      location: plot && location !== NO_LOCATION ? location : null,
      area_m2: plot && areaM2 ? Math.round(areaM2 * 100) / 100 : null,
    }
    const opts = {
      onSuccess: () => {
        toast.success(t("gold.saved"))
        onOpenChange(false)
      },
      onError: () => toast.error(t("common.error")),
    }
    if (asset) update.mutate({ id: asset.id, input }, opts)
    else add.mutate(input, opts)
  }

  const del = async () => {
    if (!asset || !(await stepUp(t("gold.deleteConfirm", { name: asset.name })))) return
    remove.mutate(asset.id, {
      onSuccess: () => {
        toast.success(t("walletForm.deleted"))
        onOpenChange(false)
      },
      onError: () => toast.error(t("common.error")),
    })
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t(asset ? "assets.edit" : "assets.add")}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-4 gap-1.5">
          {ASSET_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => pickKind(k)}
              aria-pressed={kind === k}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] leading-tight",
                kind === k ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted",
              )}
            >
              <span className="text-xl" aria-hidden>
                {ASSET_EMOJI[k]}
              </span>
              <span className="line-clamp-2 text-center">{t(`assets.kind.${k}` as MessageKey)}</span>
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="asset-name">{t("gold.name")}</Label>
          <Input id="asset-name" className="h-11" maxLength={80} placeholder={t("assets.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>{t("assets.life")}</Label>
          <Segmented
            aria-label={t("assets.life")}
            value={life}
            onChange={setLife}
            options={[
              { value: "0", label: t("assets.lifeNone") },
              ...LIFE_YEARS.map((y) => ({ value: String(y), label: t("assets.lifeYears", { n: num(y) }) })),
            ]}
          />
          <p className="text-xs text-muted-foreground">{t(lifeMonths ? "assets.lifeHint" : "assets.lifeNoneHint")}</p>
        </div>

        {lifeMonths ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="asset-price">{t("assets.purchaseCost")}</Label>
              <div className="flex gap-2">
                <Input id="asset-price" inputMode="decimal" placeholder="0" className="h-11 min-w-0 flex-1 text-base tabular-nums" value={price} onChange={(e) => setPrice(e.target.value)} />
                <div className="w-28 shrink-0">
                  <Segmented
                    aria-label={t("walletForm.currency")}
                    value={currency}
                    onChange={(v) => setCurrency(v as Currency)}
                    options={[
                      { value: "USD", label: "$" },
                      { value: "KHR", label: "៛" },
                    ]}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-date">{t("gold.purchaseDate")}</Label>
              <Input id="asset-date" type="date" max="9999-12-31" className="h-11" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            {schedule && (
              <div className="space-y-1 rounded-xl border bg-muted/40 px-3 py-2.5 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("assets.monthly")}</span>
                  <span className="tabular-nums">−{formatMoney(schedule.monthly, currency)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("assets.elapsed")}</span>
                  <span className="tabular-nums">{t("assets.monthsOf", { done: num(schedule.elapsed), total: num(schedule.life) })}</span>
                </div>
                <div className="flex justify-between gap-2 font-semibold">
                  <span>{t("assets.bookValueToday")}</span>
                  <span className="tabular-nums text-primary">{formatMoney(schedule.bookValue, currency)}</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {plot && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>{t("assets.location")}</Label>
                    <Select value={location} onValueChange={setLocation}>
                      <SelectTrigger className="h-11 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_LOCATION}>{t("assets.locationNone")}</SelectItem>
                        {PHNOM_PENH_KHANS.map((k) => (
                          <SelectItem key={k.key} value={k.key}>
                            {t("assets.khan", { name: khanName(k) })}
                          </SelectItem>
                        ))}
                        <SelectItem value={PROVINCE}>{t("assets.province")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="asset-area">{t("assets.area")}</Label>
                    <Input id="asset-area" inputMode="decimal" placeholder="0" className="h-11 tabular-nums" value={area} onChange={(e) => setArea(e.target.value)} />
                  </div>
                </div>
                {reference ? (
                  <div className="space-y-1 rounded-xl border bg-muted/40 px-3 py-2.5 text-sm">
                    <p className="font-medium">{t("assets.refTitle")}</p>
                    <p className="tabular-nums">
                      {t("assets.refPerM2", { name: khanName(reference.khan), low: usd(reference.khan.min), high: usd(reference.khan.max) })}
                      {reference.low !== null && reference.high !== null && (
                        <>
                          {" → "}
                          <span className="font-semibold">{t("assets.refTotal", { area: area.trim(), low: usd(reference.low), high: usd(reference.high) })}</span>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {kind === "HOUSE" ? `${t("assets.refHouse")} ` : ""}
                      {t("assets.refAdvisory")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("assets.refSource", { period: LAND_PRICE_SOURCE.period })}{" "}
                      <a href={LAND_PRICE_SOURCE.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                        {LAND_PRICE_SOURCE.credit}
                      </a>
                    </p>
                  </div>
                ) : (
                  location === PROVINCE && <p className="rounded-xl border border-dashed px-3 py-2.5 text-xs text-muted-foreground">{t("assets.refProvince")}</p>
                )}
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="asset-value">{t("assets.estimatedValue")}</Label>
              <div className="flex gap-2">
                <Input id="asset-value" inputMode="decimal" placeholder="0" className="h-11 min-w-0 flex-1 text-base tabular-nums" value={value} onChange={(e) => setValue(e.target.value)} />
                <div className="w-28 shrink-0">
                  <Segmented
                    aria-label={t("walletForm.currency")}
                    value={currency}
                    onChange={(v) => setCurrency(v as Currency)}
                    options={[
                      { value: "USD", label: "$" },
                      { value: "KHR", label: "៛" },
                    ]}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("assets.valueHint")}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="asset-date">{t("gold.purchaseDate")}</Label>
                <Input id="asset-date" type="date" max="9999-12-31" className="h-11" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-price">{t("assets.purchasePrice")}</Label>
                <Input id="asset-price" inputMode="decimal" placeholder="0" className="h-11 tabular-nums" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <Label>{t("assets.loan")}</Label>
          <Select value={loanId} onValueChange={setLoanId}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_LOAN}>{t("assets.noLoan")}</SelectItem>
              {loans.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.party_name} · {formatMoney(remaining(d), d.currency)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("assets.loanHint")}</p>
        </div>

        <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
          {busy && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>
        {asset && (
          <Button type="button" variant="outline" className="w-full text-destructive" onClick={del} disabled={remove.isPending}>
            <Trash2Icon />
            {t("walletForm.delete")}
          </Button>
        )}
      </form>
    </BottomSheet>
  )
}

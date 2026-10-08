"use client"

import { ArchiveIcon, Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Amount } from "@/components/money/amount"
import { stepUp } from "@/components/security/step-up"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { dualTotal } from "@/lib/analytics"
import { ASSET_EMOJI, localToday, type AssetKind, type PhysicalAsset, type PhysicalAssetInput } from "@/lib/assets"
import { usePhysicalAssetMutations, usePhysicalAssets } from "@/lib/assets-data"
import type { Currency } from "@/lib/data/types"
import { khmerDigits } from "@/lib/dates"
import { FIXED_ASSET_CATEGORIES, RECOMMENDED_LIFE, isFixedAssetCategory, registerTotals, schedule, type FixedAssetCategory, type FixedAssetStatus } from "@/lib/fixed-assets"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

/** A register entry: one of the standard categories, or stock on hand (valued, never depreciated). */
type RegisterKind = FixedAssetCategory | "STOCK"
const KINDS: RegisterKind[] = [...FIXED_ASSET_CATEGORIES, "STOCK"]
const ALL = "all"
const catKey = (k: string) => `fa.cat.${k}` as MessageKey
const emojiOf = (k: string) => ASSET_EMOJI[k as AssetKind] ?? "📦"

function useNum() {
  const locale = useLocaleStore((s) => s.locale)
  return (n: number) => (locale === "km" ? khmerDigits(String(n)) : String(n))
}

/**
 * Business › Fixed assets: the register (CIFRS for SMEs) — cost, accumulated depreciation and
 * net book value at a glance, the assets filtered by category and status, and stock on hand.
 */
export function FixedAssetRegister({ workspaceId, editable }: { workspaceId: string | undefined; editable: boolean }) {
  const t = useT()
  const num = useNum()
  const { khrPerUsd } = usePrefsStore()
  const query = usePhysicalAssets(workspaceId)
  const all = useMemo(() => query.data ?? [], [query.data])
  const today = localToday()
  const [category, setCategory] = useState<string>(ALL)
  const [status, setStatus] = useState<FixedAssetStatus | typeof ALL>(ALL)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PhysicalAsset | null>(null)
  const [detail, setDetail] = useState<PhysicalAsset | null>(null)

  const register = all.filter((a) => isFixedAssetCategory(a.kind))
  const stock = all.filter((a) => a.kind === "STOCK")
  const totals = registerTotals(register, today)
  const dual = (b: { USD: number; KHR: number }) => dualTotal(b.USD, b.KHR, khrPerUsd)
  const statusOf = (a: PhysicalAsset): FixedAssetStatus => (a.status === "DISPOSED" ? "DISPOSED" : (schedule(a, today)?.status ?? "ACTIVE"))
  const shown = (category === "STOCK" ? stock : category === ALL ? [...register, ...stock] : register.filter((a) => a.kind === category)).filter(
    (a) => status === ALL || (a.kind !== "STOCK" && statusOf(a) === status) || (a.kind === "STOCK" && status === "ACTIVE"),
  )

  const openForm = (a: PhysicalAsset | null) => {
    setDetail(null)
    setEditing(a)
    setFormOpen(true)
  }

  const kpis: { key: string; label: MessageKey; total: { usd: number; khr: number } }[] = [
    { key: "cost", label: "fa.kpi.cost", total: dual(totals.cost) },
    { key: "acc", label: "fa.kpi.accumulated", total: dual(totals.accumulated) },
    { key: "nbv", label: "fa.kpi.nbv", total: dual(totals.nbv) },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {kpis.map((k) => (
          <Card key={k.key} className={cn("gap-1 px-3 py-3", k.key === "nbv" && "ring-1 ring-primary/40")}>
            <p className="text-[11px] leading-tight text-muted-foreground">{t(k.label)}</p>
            <Amount value={k.key === "acc" ? -k.total.usd : k.total.usd} currency="USD" className={cn("block text-base font-bold tabular-nums", k.key === "nbv" && "text-primary")} />
            <Amount value={k.key === "acc" ? -k.total.khr : k.total.khr} currency="KHR" className="block text-[11px] text-muted-foreground tabular-nums" />
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-10 min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("fa.allCategories")}</SelectItem>
            {KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {emojiOf(k)} {t(catKey(k))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {editable && (
          <Button className="h-10 shrink-0" onClick={() => openForm(null)}>
            <PlusIcon />
            {t("fa.add")}
          </Button>
        )}
      </div>
      <Segmented
        aria-label={t("fa.status")}
        value={status}
        onChange={setStatus}
        options={[
          { value: ALL, label: t("fa.status.all") },
          { value: "ACTIVE", label: t("fa.status.ACTIVE") },
          { value: "FULLY_DEPRECIATED", label: t("fa.status.FULLY_DEPRECIATED") },
          { value: "DISPOSED", label: t("fa.status.DISPOSED") },
        ]}
      />

      {query.isLoading ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{t(all.length ? "fa.noneFiltered" : "fa.empty")}</p>
      ) : (
        <Card className="gap-0 divide-y overflow-hidden py-0">
          {shown.map((a) => {
            const s = a.kind === "STOCK" ? null : schedule(a, today)
            const st = statusOf(a)
            const value = a.kind === "STOCK" ? a.estimated_value : (s?.netBookValue ?? a.estimated_value)
            return (
              <button key={a.id} type="button" onClick={() => setDetail(a)} className="block w-full px-4 py-3 text-left transition-colors hover:bg-muted/40">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-lg" aria-hidden>
                    {emojiOf(a.kind)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate font-medium", st === "DISPOSED" && "text-muted-foreground line-through")}>{a.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t(catKey(a.kind))}
                      {a.serial_or_reference ? ` · ${a.serial_or_reference}` : ""}
                      {a.kind !== "STOCK" && st !== "ACTIVE" ? ` · ${t(`fa.status.${st}` as MessageKey)}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold tabular-nums">{formatMoney(st === "DISPOSED" ? 0 : value, a.currency)}</span>
                    <span className="block text-[11px] text-muted-foreground">{t(a.kind === "STOCK" ? "fa.stockValue" : "fa.nbv")}</span>
                  </span>
                </div>
                {s && st === "ACTIVE" && (
                  <div className="mt-2 space-y-1 pl-12 text-[11px] text-muted-foreground">
                    <div className="flex justify-between gap-2">
                      <span>{t("fa.perMonth", { amount: formatMoney(s.monthly, a.currency) })}</span>
                      <span className="tabular-nums">{t("fa.monthsOf", { done: num(s.elapsed), total: num(s.life) })}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div className="h-full rounded-full bg-amber-500/80" style={{ width: `${(s.elapsed / s.life) * 100}%` }} />
                    </div>
                  </div>
                )}
              </button>
            )
          })}
        </Card>
      )}
      <p className="px-1 text-[11px] text-muted-foreground">{t("fa.footnote")}</p>

      <FixedAssetFormSheet open={formOpen} onOpenChange={setFormOpen} workspaceId={workspaceId} asset={editing} />
      <FixedAssetDetailSheet asset={detail} onOpenChange={(v) => !v && setDetail(null)} workspaceId={workspaceId} editable={editable} onEdit={openForm} />
    </div>
  )
}

/** Add / edit: the category fills in its recommended useful life (editable); stock takes a value only. */
function FixedAssetFormSheet({ open, onOpenChange, workspaceId, asset }: { open: boolean; onOpenChange: (v: boolean) => void; workspaceId: string | undefined; asset: PhysicalAsset | null }) {
  const t = useT()
  const num = useNum()
  const { add, update } = usePhysicalAssetMutations(workspaceId)
  const [kind, setKind] = useState<RegisterKind>("MACHINERY_EQUIPMENT")
  const [name, setName] = useState("")
  const [serial, setSerial] = useState("")
  const [currency, setCurrency] = useState<Currency>("USD")
  const [price, setPrice] = useState("")
  const [date, setDate] = useState("")
  const [life, setLife] = useState("")
  const [salvage, setSalvage] = useState("")
  const [value, setValue] = useState("")

  useEffect(() => {
    if (!open) return
    const k: RegisterKind = asset && (isFixedAssetCategory(asset.kind) || asset.kind === "STOCK") ? asset.kind : "MACHINERY_EQUIPMENT"
    setKind(k)
    setName(asset?.name ?? "")
    setSerial(asset?.serial_or_reference ?? "")
    setCurrency(asset?.currency ?? "USD")
    setPrice(asset?.purchase_price != null ? String(asset.purchase_price) : "")
    setDate(asset?.purchase_date ?? localToday())
    setLife(asset?.useful_life_months ? String(asset.useful_life_months) : k === "STOCK" ? "" : String(RECOMMENDED_LIFE[k].default))
    setSalvage(asset && asset.salvage_value ? String(asset.salvage_value) : "")
    setValue(asset ? String(asset.estimated_value) : "")
  }, [open, asset])

  const pick = (k: RegisterKind) => {
    setKind(k)
    // The category's recommended life — still editable.
    if (k !== "STOCK") setLife(String(RECOMMENDED_LIFE[k].default))
  }
  const isStock = kind === "STOCK"
  const cost = price.trim() ? parseAmount(price) : NaN
  const months = Math.round(Number(life))
  const salvageN = salvage.trim() ? parseAmount(salvage) : 0
  const preview = !isStock && cost >= 0 && months > 0 && date ? schedule({ purchase_price: cost, salvage_value: salvageN, purchase_date: date, useful_life_months: months, currency }, localToday()) : null
  const busy = add.isPending || update.isPending

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return void toast.error(t("gold.nameRequired"))
    let input: PhysicalAssetInput
    if (isStock) {
      const v = parseAmount(value)
      if (!(v >= 0)) return void toast.error(t("walletForm.amountInvalid"))
      input = {
        kind,
        name: name.trim(),
        estimated_value: roundMoney(v, currency),
        currency,
        purchase_date: null,
        purchase_price: null,
        debt_id: null,
        note: null,
        useful_life_months: null,
        location: null,
        area_m2: null,
        salvage_value: 0,
        serial_or_reference: serial.trim() || null,
      }
    } else {
      if (!(cost >= 0) || !date) return void toast.error(t("assets.costRequired"))
      if (!(months >= 1 && months <= 600)) return void toast.error(t("fa.lifeInvalid"))
      if (!(salvageN >= 0 && salvageN <= cost)) return void toast.error(t("fa.salvageInvalid"))
      input = {
        kind,
        name: name.trim(),
        estimated_value: preview ? preview.netBookValue : roundMoney(cost, currency),
        currency,
        purchase_date: date,
        purchase_price: roundMoney(cost, currency),
        debt_id: asset?.debt_id ?? null,
        note: null,
        useful_life_months: months,
        location: null,
        area_m2: null,
        salvage_value: roundMoney(salvageN, currency),
        serial_or_reference: serial.trim() || null,
      }
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

  const currencyPill = (
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
  )

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t(asset ? "fa.edit" : "fa.add")}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t("fa.category")}</Label>
          <Select value={kind} onValueChange={(v) => pick(v as RegisterKind)}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {emojiOf(k)} {t(catKey(k))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="fa-name">{t("gold.name")}</Label>
            <Input id="fa-name" className="h-11" maxLength={80} placeholder={t("fa.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="w-32 space-y-1.5">
            <Label htmlFor="fa-serial">{t("fa.serial")}</Label>
            <Input id="fa-serial" className="h-11" maxLength={60} placeholder="SN / TAG" value={serial} onChange={(e) => setSerial(e.target.value)} />
          </div>
        </div>

        {isStock ? (
          <div className="space-y-1.5">
            <Label htmlFor="fa-value">{t("fa.stockValue")}</Label>
            <div className="flex gap-2">
              <Input id="fa-value" inputMode="decimal" placeholder="0" className="h-11 min-w-0 flex-1 text-base tabular-nums" value={value} onChange={(e) => setValue(e.target.value)} />
              {currencyPill}
            </div>
            <p className="text-xs text-muted-foreground">{t("fa.stockHint")}</p>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="fa-cost">{t("fa.cost")}</Label>
              <div className="flex gap-2">
                <Input id="fa-cost" inputMode="decimal" placeholder="0" className="h-11 min-w-0 flex-1 text-base tabular-nums" value={price} onChange={(e) => setPrice(e.target.value)} />
                {currencyPill}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="fa-date">{t("gold.purchaseDate")}</Label>
                <Input id="fa-date" type="date" max="9999-12-31" className="h-11" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fa-life">{t("fa.lifeMonths")}</Label>
                <Input id="fa-life" inputMode="numeric" className="h-11 tabular-nums" value={life} onChange={(e) => setLife(e.target.value.replace(/[^\d]/g, ""))} />
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              {t("fa.lifeRecommended", { min: num(RECOMMENDED_LIFE[kind].min), max: num(RECOMMENDED_LIFE[kind].max) })}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="fa-salvage">{t("fa.salvage")}</Label>
              <Input id="fa-salvage" inputMode="decimal" placeholder="0" className="h-11 tabular-nums" value={salvage} onChange={(e) => setSalvage(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t("fa.salvageHint")}</p>
            </div>
            {preview && (
              <div className="space-y-1 rounded-xl border bg-muted/40 px-3 py-2.5 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("fa.monthly")}</span>
                  <span className="tabular-nums">−{formatMoney(preview.monthly, currency)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("fa.accumulated")}</span>
                  <span className="tabular-nums">−{formatMoney(preview.accumulated, currency)}</span>
                </div>
                <div className="flex justify-between gap-2 font-semibold">
                  <span>{t("fa.nbvToday")}</span>
                  <span className="tabular-nums text-primary">{formatMoney(preview.netBookValue, currency)}</span>
                </div>
              </div>
            )}
          </>
        )}

        <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
          {busy && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>
      </form>
    </BottomSheet>
  )
}

/** One asset: purchase details, the monthly write-off, accumulated depreciation, book value, months left; edit, dispose, delete. */
function FixedAssetDetailSheet({
  asset,
  onOpenChange,
  workspaceId,
  editable,
  onEdit,
}: {
  asset: PhysicalAsset | null
  onOpenChange: (v: boolean) => void
  workspaceId: string | undefined
  editable: boolean
  onEdit: (a: PhysicalAsset) => void
}) {
  const t = useT()
  const num = useNum()
  const { update, remove } = usePhysicalAssetMutations(workspaceId)
  const [disposeOn, setDisposeOn] = useState("")
  const [disposing, setDisposing] = useState(false)
  useEffect(() => {
    setDisposing(false)
    setDisposeOn(localToday())
  }, [asset])
  if (!asset) return null
  const today = localToday()
  const s = asset.kind === "STOCK" ? null : schedule(asset, today)
  const fmt = (n: number) => formatMoney(n, asset.currency)
  const rows: [string, string][] = s
    ? [
        [t("fa.category"), t(catKey(asset.kind))],
        ...(asset.serial_or_reference ? [[t("fa.serial"), asset.serial_or_reference] as [string, string]] : []),
        [t("gold.purchaseDate"), asset.purchase_date ?? "—"],
        [t("fa.cost"), fmt(s.cost)],
        [t("fa.salvage"), fmt(s.salvage)],
        [t("fa.lifeMonths"), num(s.life)],
        [t("fa.monthly"), `−${fmt(s.monthly)}`],
        [t("fa.accumulated"), `−${fmt(s.accumulated)}`],
        [t("fa.remaining"), t("fa.monthsLeft", { n: num(s.remainingMonths) })],
        [t("fa.status"), t(`fa.status.${s.status}` as MessageKey) + (asset.disposed_on ? ` · ${asset.disposed_on}` : "")],
      ]
    : [
        [t("fa.category"), t(catKey(asset.kind))],
        ...(asset.serial_or_reference ? [[t("fa.serial"), asset.serial_or_reference] as [string, string]] : []),
      ]

  const save = (input: Partial<PhysicalAssetInput>) =>
    update.mutate(
      { id: asset.id, input: input as PhysicalAssetInput },
      { onSuccess: () => (toast.success(t("gold.saved")), onOpenChange(false)), onError: () => toast.error(t("common.error")) },
    )
  const del = async () => {
    if (!(await stepUp(t("gold.deleteConfirm", { name: asset.name })))) return
    remove.mutate(asset.id, { onSuccess: () => (toast.success(t("walletForm.deleted")), onOpenChange(false)), onError: () => toast.error(t("common.error")) })
  }

  return (
    <BottomSheet open={Boolean(asset)} onOpenChange={onOpenChange} title={`${emojiOf(asset.kind)} ${asset.name}`}>
      <div className="space-y-4">
        <div className="rounded-xl border bg-muted/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">{t(asset.kind === "STOCK" ? "fa.stockValue" : "fa.nbvToday")}</p>
          <p className="text-2xl font-bold tabular-nums text-primary">
            {fmt(asset.status === "DISPOSED" ? 0 : asset.kind === "STOCK" ? asset.estimated_value : (s?.netBookValue ?? asset.estimated_value))}
          </p>
          {s && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-amber-500/80" style={{ width: `${(s.elapsed / s.life) * 100}%` }} />
            </div>
          )}
        </div>
        <dl className="divide-y rounded-xl border text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 px-4 py-2">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>

        {editable && (
          <div className="space-y-2">
            <Button variant="outline" className="h-11 w-full" onClick={() => onEdit(asset)}>
              <PencilIcon />
              {t("fa.edit")}
            </Button>
            {asset.kind !== "STOCK" &&
              (asset.status === "DISPOSED" ? (
                <Button variant="outline" className="h-11 w-full" disabled={update.isPending} onClick={() => save({ status: "ACTIVE", disposed_on: null })}>
                  {t("fa.restore")}
                </Button>
              ) : disposing ? (
                <div className="flex gap-2">
                  <Input type="date" max={today} className="h-11 min-w-0 flex-1" value={disposeOn} onChange={(e) => setDisposeOn(e.target.value)} aria-label={t("fa.disposedOn")} />
                  <Button className="h-11" disabled={!disposeOn || update.isPending} onClick={() => save({ status: "DISPOSED", disposed_on: disposeOn })}>
                    {t("fa.confirmDispose")}
                  </Button>
                </div>
              ) : (
                <Button variant="outline" className="h-11 w-full" onClick={() => setDisposing(true)}>
                  <ArchiveIcon />
                  {t("fa.dispose")}
                </Button>
              ))}
            <Button type="button" variant="outline" className="h-11 w-full text-destructive" onClick={del} disabled={remove.isPending}>
              <Trash2Icon />
              {t("walletForm.delete")}
            </Button>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

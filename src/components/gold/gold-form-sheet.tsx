"use client"

import { Loader2Icon, Trash2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { stepUp } from "@/components/security/step-up"
import type { Currency } from "@/lib/data/types"
import { GOLD_KINDS, HUN_PER_CHI, HUN_PER_DAMLUNG, hunToGrams, JEWELRY_TYPES, marketValue, PLATINUM_GRADES, splitHun, toHun, type GoldKind, type GoldRates, type JewelryType, type PlatinumGrade } from "@/lib/gold"
import { useGoldMutations, type GoldHolding } from "@/lib/gold-data"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

const num = (s: string) => {
  const n = parseAmount(s)
  return Number.isFinite(n) ? n : 0
}

/** [ __ តម្លឹង ] [ __ ជី ] [ __ ហ៊ុន ] with the total in grams. */
export function WeightInput({
  value,
  onChange,
}: {
  value: { damlung: string; chi: string; hun: string }
  onChange: (v: { damlung: string; chi: string; hun: string }) => void
}) {
  const t = useT()
  const hun = toHun({ damlung: num(value.damlung), chi: num(value.chi), hun: num(value.hun) })
  const field = (key: "damlung" | "chi" | "hun") => (
    <div className="space-y-1">
      <Input
        id={`w-${key}`}
        inputMode="decimal"
        placeholder="0"
        className="h-12 text-center text-lg tabular-nums"
        value={value[key]}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        aria-label={t(`gold.unit.${key}`)}
      />
      <p className="text-center text-xs font-medium text-muted-foreground">{t(`gold.unit.${key}`)}</p>
    </div>
  )
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-3 gap-2">
        {field("damlung")}
        {field("chi")}
        {field("hun")}
      </div>
      <p className="text-xs text-muted-foreground">
        = {hun} {t("gold.unit.hun")} · <span className="font-medium text-foreground">{hunToGrams(hun)} g</span>
      </p>
    </div>
  )
}

/** Add or edit a gold / platinum item: kind, weight in Cambodian units, purchase date and price. */
export function GoldFormSheet({
  open,
  onOpenChange,
  workspaceId,
  holding,
  rates,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string | undefined
  holding?: GoldHolding | null
  rates: GoldRates
}) {
  const t = useT()
  const { add, update, remove } = useGoldMutations(workspaceId)
  const [name, setName] = useState("")
  const [kind, setKind] = useState<GoldKind>("GOLD_24K")
  const [grade, setGrade] = useState<PlatinumGrade>("P75")
  const [jewelryType, setJewelryType] = useState<JewelryType | null>(null)
  const [weight, setWeight] = useState({ damlung: "", chi: "", hun: "" })
  const [date, setDate] = useState("")
  const [price, setPrice] = useState("")
  const [currency, setCurrency] = useState<Currency>("USD")
  // How the price was quoted: the whole amount paid, or the shop's price per ជី / តម្លឹង.
  const [costMode, setCostMode] = useState<"TOTAL" | "PER_CHI" | "PER_DAMLUNG">("TOTAL")

  useEffect(() => {
    if (!open) return
    const parts = holding ? splitHun(holding.weight_hun) : null
    const s = (n: number | undefined) => (n ? String(n) : "")
    setName(holding?.name ?? "")
    setKind(holding?.kind ?? "GOLD_24K")
    setGrade(holding?.grade ?? "P75")
    setJewelryType(holding?.jewelry_type ?? null)
    setWeight({ damlung: s(parts?.damlung), chi: s(parts?.chi), hun: s(parts?.hun) })
    setDate(holding?.purchase_date ?? new Date().toISOString().slice(0, 10))
    setPrice(holding?.purchase_price != null ? String(holding.purchase_price) : "")
    setCurrency(holding?.purchase_currency ?? "USD")
    setCostMode("TOTAL")
  }, [open, holding])

  const hun = toHun({ damlung: num(weight.damlung), chi: num(weight.chi), hun: num(weight.hun) })
  const estimate = marketValue(hun, kind, rates, kind === "PLATINUM" ? grade : null)
  const entered = price.trim() ? parseAmount(price) : null
  // Total cost from a per-unit price: price × weight in that unit.
  const unitHun = costMode === "PER_CHI" ? HUN_PER_CHI : costMode === "PER_DAMLUNG" ? HUN_PER_DAMLUNG : null
  const totalCost = entered === null || !Number.isFinite(entered) ? null : unitHun ? roundMoney((entered * hun) / unitHun, currency) : entered
  const busy = add.isPending || update.isPending

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return void toast.error(t("gold.nameRequired"))
    if (!(hun > 0)) return void toast.error(t("gold.weightRequired"))
    if (price.trim() && totalCost === null) return void toast.error(t("walletForm.amountInvalid"))
    const priceValue = totalCost
    if (priceValue !== null && !(priceValue >= 0)) return void toast.error(t("walletForm.amountInvalid"))
    const input = {
      name: name.trim(),
      kind,
      // ទឹក 75 is the usual white gold in Cambodia; only platinum items carry a grade.
      grade: kind === "PLATINUM" ? grade : null,
      jewelry_type: jewelryType,
      weight_hun: hun,
      purchase_date: date || null,
      purchase_price: priceValue === null ? null : roundMoney(priceValue, currency),
      purchase_currency: priceValue === null ? null : currency,
      note: null,
    }
    const opts = {
      onSuccess: () => {
        toast.success(t("gold.saved"))
        onOpenChange(false)
      },
      onError: () => toast.error(t("common.error")),
    }
    if (holding) update.mutate({ id: holding.id, input }, opts)
    else add.mutate(input, opts)
  }

  const del = async () => {
    if (!holding || !(await stepUp(t("gold.deleteConfirm", { name: holding.name })))) return
    remove.mutate(holding.id, {
      onSuccess: () => {
        toast.success(t("walletForm.deleted"))
        onOpenChange(false)
      },
      onError: () => toast.error(t("common.error")),
    })
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t(holding ? "gold.edit" : "gold.add")}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {GOLD_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={cn(
                "rounded-xl border px-3 py-2 text-left text-sm",
                kind === k ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500" : "hover:bg-muted",
              )}
            >
              <span className="block font-medium">{t(`gold.kind.${k}` as MessageKey)}</span>
              <span className="block text-[11px] text-muted-foreground">{t(`gold.kindHint.${k}` as MessageKey)}</span>
            </button>
          ))}
        </div>

        {kind === "PLATINUM" && (
          <div className="space-y-1.5">
            <Label>{t("gold.grade")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {PLATINUM_GRADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGrade(g)}
                  aria-pressed={grade === g}
                  className={cn("rounded-full px-3 py-1 text-sm", grade === g ? "bg-slate-600 font-semibold text-white" : "bg-muted text-muted-foreground")}
                >
                  {t(`gold.grade.${g}` as MessageKey)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>{t("gold.jewelryType")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {JEWELRY_TYPES.map((j) => (
              <button
                key={j}
                type="button"
                onClick={() => setJewelryType(jewelryType === j ? null : j)}
                aria-pressed={jewelryType === j}
                className={cn("rounded-full px-3 py-1 text-sm", jewelryType === j ? "bg-amber-500 font-semibold text-white" : "bg-muted text-muted-foreground")}
              >
                {t(`gold.jewelry.${j}` as MessageKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="gold-name">{t("gold.name")}</Label>
          <Input id="gold-name" className="h-11" maxLength={80} placeholder={t("gold.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>{t("gold.weight")}</Label>
          <WeightInput value={weight} onChange={setWeight} />
          {estimate !== null && hun > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("gold.estimate")} <span className="font-semibold text-foreground">{formatMoney(estimate, "USD")}</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="gold-date">{t("gold.purchaseDate")}</Label>
            <Input id="gold-date" type="date" max="9999-12-31" className="h-11" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gold-price">{t(costMode === "TOTAL" ? "gold.purchasePrice" : costMode === "PER_CHI" ? "gold.pricePerChi" : "gold.pricePerDamlung")}</Label>
            <Input id="gold-price" inputMode="decimal" placeholder="0" className="h-11 tabular-nums" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
        </div>
        <Segmented
          aria-label={t("gold.costMode")}
          value={costMode}
          onChange={setCostMode}
          options={[
            { value: "TOTAL", label: t("gold.costTotal") },
            { value: "PER_CHI", label: t("gold.costPerChi") },
            { value: "PER_DAMLUNG", label: t("gold.costPerDamlung") },
          ]}
        />
        {unitHun && totalCost !== null && hun > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("gold.costComputed")} <span className="font-semibold text-foreground">{formatMoney(totalCost, currency)}</span>
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{t("gold.priceHint")}</p>
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

        <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
          {busy && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>
        {holding && (
          <Button type="button" variant="outline" className="w-full text-destructive" onClick={del} disabled={remove.isPending}>
            <Trash2Icon />
            {t("walletForm.delete")}
          </Button>
        )}
      </form>
    </BottomSheet>
  )
}

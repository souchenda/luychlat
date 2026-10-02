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
import type { Currency } from "@/lib/data/types"
import {
  CERT_TYPES,
  CLARITIES,
  COMMON_SIZES_LI,
  DIAMOND_FORMS,
  FORM_EMOJI,
  GIA_COLORS,
  KH_COLORS,
  caratFromSize,
  resaleValue,
  type CertType,
  type ColorScale,
  type Diamond,
  type DiamondForm,
} from "@/lib/diamonds"
import { useDiamondMutations } from "@/lib/diamonds-data"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

const NONE = "-"

/** Add or edit a diamond: form, size in លី and carat, colour (ទឹក or GIA), clarity, certificate, price and shop buy-back. */
export function DiamondFormSheet({
  open,
  onOpenChange,
  workspaceId,
  diamond,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string | undefined
  diamond?: Diamond | null
}) {
  const t = useT()
  const { add, update, remove } = useDiamondMutations(workspaceId)
  const [form, setForm] = useState<DiamondForm>("RING")
  const [name, setName] = useState("")
  const [size, setSize] = useState("")
  const [carat, setCarat] = useState("")
  const [scale, setScale] = useState<ColorScale>("KH")
  const [color, setColor] = useState(NONE)
  const [clarity, setClarity] = useState(NONE)
  const [cert, setCert] = useState<CertType>("NONE")
  const [certNo, setCertNo] = useState("")
  const [store, setStore] = useState("")
  const [date, setDate] = useState("")
  const [price, setPrice] = useState("")
  const [currency, setCurrency] = useState<Currency>("USD")
  const [buyback, setBuyback] = useState("15")
  const [tradein, setTradein] = useState("")

  useEffect(() => {
    if (!open) return
    const s = (n: number | null | undefined) => (n == null ? "" : String(n))
    setForm(diamond?.form ?? "RING")
    setName(diamond?.name ?? "")
    setSize(s(diamond?.size_li))
    setCarat(s(diamond?.carat))
    setScale(diamond?.color_scale ?? "KH")
    setColor(diamond?.color ?? NONE)
    setClarity(diamond?.clarity ?? NONE)
    setCert(diamond?.cert_type ?? "NONE")
    setCertNo(diamond?.cert_number ?? "")
    setStore(diamond?.store ?? "")
    setDate(diamond?.purchase_date ?? new Date().toISOString().slice(0, 10))
    setPrice(s(diamond?.purchase_price))
    setCurrency(diamond?.currency ?? "USD")
    setBuyback(diamond ? String(diamond.buyback_pct) : "15")
    setTradein(s(diamond?.tradein_pct))
  }, [open, diamond])

  const sizeNum = parseAmount(size)
  const estimate = sizeNum > 0 ? caratFromSize(sizeNum) : null
  const priceNum = parseAmount(price)
  const bbNum = parseAmount(buyback)
  const tiNum = tradein.trim() ? parseAmount(tradein) : null
  const preview =
    priceNum >= 0 && bbNum >= 0 && bbNum <= 100
      ? resaleValue({ purchase_price: priceNum, currency, buyback_pct: bbNum, tradein_pct: tiNum !== null && tiNum >= 0 && tiNum <= 100 ? tiNum : null })
      : null
  const busy = add.isPending || update.isPending

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return void toast.error(t("gold.nameRequired"))
    if (!(priceNum >= 0)) return void toast.error(t("walletForm.amountInvalid"))
    if (!(bbNum >= 0 && bbNum <= 100) || (tiNum !== null && !(tiNum >= 0 && tiNum <= 100))) return void toast.error(t("diamond.pctInvalid"))
    const caratNum = carat.trim() ? parseAmount(carat) : null
    const input = {
      name: name.trim(),
      form,
      size_li: sizeNum > 0 ? sizeNum : null,
      carat: caratNum !== null && caratNum > 0 ? caratNum : null,
      color_scale: color === NONE ? null : scale,
      color: color === NONE ? null : color,
      clarity: clarity === NONE ? null : clarity,
      cert_type: cert,
      cert_number: cert === "NONE" ? null : certNo.trim() || null,
      store: store.trim() || null,
      purchase_date: date || null,
      purchase_price: roundMoney(priceNum, currency),
      currency,
      buyback_pct: bbNum,
      tradein_pct: tiNum,
      note: null,
    }
    const opts = {
      onSuccess: () => {
        toast.success(t("gold.saved"))
        onOpenChange(false)
      },
      onError: () => toast.error(t("common.error")),
    }
    if (diamond) update.mutate({ id: diamond.id, input }, opts)
    else add.mutate(input, opts)
  }

  const del = () => {
    if (!diamond || !window.confirm(t("gold.deleteConfirm", { name: diamond.name }))) return
    remove.mutate(diamond.id, {
      onSuccess: () => {
        toast.success(t("walletForm.deleted"))
        onOpenChange(false)
      },
      onError: () => toast.error(t("common.error")),
    })
  }

  const colors: readonly string[] = scale === "KH" ? KH_COLORS : GIA_COLORS
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t(diamond ? "diamond.edit" : "diamond.add")}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-5 gap-1.5">
          {DIAMOND_FORMS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setForm(f)}
              aria-pressed={form === f}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] leading-tight",
                form === f ? "border-sky-500 bg-sky-500/10 ring-1 ring-sky-500" : "hover:bg-muted",
              )}
            >
              <span className="text-xl" aria-hidden>
                {FORM_EMOJI[f]}
              </span>
              <span className="line-clamp-2 text-center">{t(`diamond.form.${f}` as MessageKey)}</span>
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dia-name">{t("gold.name")}</Label>
          <Input id="dia-name" className="h-11" maxLength={80} placeholder={t("diamond.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="dia-size">{t("diamond.size")}</Label>
            <Input id="dia-size" inputMode="decimal" list="dia-sizes" placeholder="5.4" className="h-11 tabular-nums" value={size} onChange={(e) => setSize(e.target.value)} />
            <datalist id="dia-sizes">
              {COMMON_SIZES_LI.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dia-carat">{t("diamond.carat")}</Label>
            <Input id="dia-carat" inputMode="decimal" placeholder={estimate !== null ? String(estimate) : "0.50"} className="h-11 tabular-nums" value={carat} onChange={(e) => setCarat(e.target.value)} />
          </div>
        </div>
        {estimate !== null && !carat.trim() && (
          <button type="button" className="-mt-2 text-xs text-primary" onClick={() => setCarat(String(estimate))}>
            {t("diamond.caratEstimate", { carat: estimate })}
          </button>
        )}

        <div className="space-y-1.5">
          <Label>{t("diamond.color")}</Label>
          <Segmented
            aria-label={t("diamond.colorScale")}
            value={scale}
            onChange={(v) => {
              setScale(v as ColorScale)
              setColor(NONE)
            }}
            options={[
              { value: "KH", label: t("diamond.scaleKh") },
              { value: "GIA", label: "GIA (D–M)" },
            ]}
          />
          <div className="flex flex-wrap gap-1.5">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(color === c ? NONE : c)}
                aria-pressed={color === c}
                className={cn("min-w-11 rounded-full px-3 py-1 text-sm", color === c ? "bg-sky-600 font-semibold text-white" : "bg-muted text-muted-foreground")}
              >
                {scale === "KH" ? `${t("diamond.water")} ${c}` : c}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t("diamond.clarity")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {CLARITIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setClarity(clarity === c ? NONE : c)}
                aria-pressed={clarity === c}
                className={cn("rounded-full px-2.5 py-1 font-mono text-xs", clarity === c ? "bg-sky-600 font-semibold text-white" : "bg-muted text-muted-foreground")}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[8rem_1fr] gap-2">
          <div className="space-y-1.5">
            <Label>{t("diamond.cert")}</Label>
            <Select value={cert} onValueChange={(v) => setCert(v as CertType)}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CERT_TYPES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(`diamond.cert.${c}` as MessageKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dia-certno">{t("diamond.certNumber")}</Label>
            <Input id="dia-certno" className="h-11 font-mono" maxLength={60} disabled={cert === "NONE"} value={certNo} onChange={(e) => setCertNo(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dia-store">{t("diamond.store")}</Label>
          <Input id="dia-store" className="h-11" maxLength={80} placeholder={t("diamond.storePlaceholder")} value={store} onChange={(e) => setStore(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="dia-date">{t("gold.purchaseDate")}</Label>
            <Input id="dia-date" type="date" max="9999-12-31" className="h-11" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dia-price">{t("gold.purchasePrice")}</Label>
            <Input id="dia-price" inputMode="decimal" placeholder="0" className="h-11 tabular-nums" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
        </div>
        <div className="ml-auto w-28">
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

        <div className="space-y-2 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
          <p className="text-sm font-medium">{t("diamond.buyback")}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="dia-bb" className="text-xs">
                {t("diamond.buybackCash")}
              </Label>
              <Input id="dia-bb" inputMode="decimal" className="h-10 tabular-nums" value={buyback} onChange={(e) => setBuyback(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dia-ti" className="text-xs">
                {t("diamond.buybackTrade")}
              </Label>
              <Input id="dia-ti" inputMode="decimal" placeholder="10" className="h-10 tabular-nums" value={tradein} onChange={(e) => setTradein(e.target.value)} />
            </div>
          </div>
          {preview && priceNum > 0 && (
            <div className="space-y-0.5 text-xs">
              <p className="flex justify-between">
                <span className="text-muted-foreground">{t("diamond.liquid")}</span>
                <span className="font-semibold">{formatMoney(preview.liquid, currency)}</span>
              </p>
              {preview.tradeIn !== null && (
                <p className="flex justify-between text-muted-foreground">
                  <span>{t("diamond.tradeIn")}</span>
                  <span>{formatMoney(preview.tradeIn, currency)}</span>
                </p>
              )}
            </div>
          )}
        </div>

        <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
          {busy && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>
        {diamond && (
          <Button type="button" variant="outline" className="w-full text-destructive" onClick={del} disabled={remove.isPending}>
            <Trash2Icon />
            {t("walletForm.delete")}
          </Button>
        )}
      </form>
    </BottomSheet>
  )
}

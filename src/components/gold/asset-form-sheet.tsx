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
import { ASSET_EMOJI, ASSET_KINDS, type AssetKind, type PhysicalAsset } from "@/lib/assets"
import { usePhysicalAssetMutations } from "@/lib/assets-data"
import type { Currency, Debt } from "@/lib/data/types"
import { debtStatus, remaining } from "@/lib/debts"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

const NO_LOAN = "none"

/** Add or edit land, a house, a vehicle…: estimated value, and the bank loan that financed it (optional). */
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
  const [kind, setKind] = useState<AssetKind>("HOUSE")
  const [name, setName] = useState("")
  const [value, setValue] = useState("")
  const [currency, setCurrency] = useState<Currency>("USD")
  const [date, setDate] = useState("")
  const [price, setPrice] = useState("")
  const [loanId, setLoanId] = useState(NO_LOAN)
  // Loans we owe that are still open (plus the one already linked).
  const loans = debts.filter((d) => d.type === "PAYABLE" && (debtStatus(d) !== "SETTLED" || d.id === asset?.debt_id))

  useEffect(() => {
    if (!open) return
    setKind(asset?.kind ?? "HOUSE")
    setName(asset?.name ?? "")
    setValue(asset ? String(asset.estimated_value) : "")
    setCurrency(asset?.currency ?? "USD")
    setDate(asset?.purchase_date ?? "")
    setPrice(asset?.purchase_price != null ? String(asset.purchase_price) : "")
    setLoanId(asset?.debt_id ?? NO_LOAN)
  }, [open, asset])

  const busy = add.isPending || update.isPending
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const estimate = parseAmount(value)
    const bought = price.trim() ? parseAmount(price) : null
    if (!name.trim()) return void toast.error(t("gold.nameRequired"))
    if (!(estimate >= 0)) return void toast.error(t("walletForm.amountInvalid"))
    if (bought !== null && !(bought >= 0)) return void toast.error(t("walletForm.amountInvalid"))
    const input = {
      kind,
      name: name.trim(),
      estimated_value: roundMoney(estimate, currency),
      currency,
      purchase_date: date || null,
      purchase_price: bought === null ? null : roundMoney(bought, currency),
      debt_id: loanId === NO_LOAN ? null : loanId,
      note: null,
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

  const del = () => {
    if (!asset || !window.confirm(t("gold.deleteConfirm", { name: asset.name }))) return
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
        <div className="grid grid-cols-5 gap-1.5">
          {ASSET_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
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

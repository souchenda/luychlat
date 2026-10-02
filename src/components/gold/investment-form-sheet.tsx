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
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { MARKETS, normalizeSymbol, PRICE_CURRENCY, priceKey, SYMBOL_SUGGESTIONS, type Investment, type Market, type MarketPrices } from "@/lib/investments"
import { useInvestmentMutations } from "@/lib/investments-data"
import { formatMoney, parseAmount } from "@/lib/money"

/** Add or edit a stock or crypto holding: symbol, quantity, average buy price, and (optionally) today's price. */
export function InvestmentFormSheet({
  open,
  onOpenChange,
  workspaceId,
  holding,
  prices,
  defaultMarket = "STOCK_CSX",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string | undefined
  holding?: Investment | null
  prices: MarketPrices
  defaultMarket?: Market
}) {
  const t = useT()
  const { add, update, remove } = useInvestmentMutations(workspaceId)
  const [market, setMarket] = useState<Market>(defaultMarket)
  const [symbol, setSymbol] = useState("")
  const [name, setName] = useState("")
  const [quantity, setQuantity] = useState("")
  const [avgCost, setAvgCost] = useState("")
  const [currency, setCurrency] = useState<Currency>("KHR")
  const [price, setPrice] = useState("")

  useEffect(() => {
    if (!open) return
    const m = holding?.market ?? defaultMarket
    setMarket(m)
    setSymbol(holding?.symbol ?? "")
    setName(holding?.name ?? "")
    setQuantity(holding ? String(holding.quantity) : "")
    setAvgCost(holding ? String(holding.avg_cost) : "")
    setCurrency(holding?.currency ?? PRICE_CURRENCY[m])
    setPrice(holding?.current_price != null ? String(holding.current_price) : "")
  }, [open, holding, defaultMarket])

  const pickMarket = (m: Market) => {
    setMarket(m)
    if (!holding) setCurrency(PRICE_CURRENCY[m])
  }

  const sym = normalizeSymbol(symbol)
  const adminPrice = sym ? prices[priceKey(market, sym)] : undefined
  const busy = add.isPending || update.isPending

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const qty = parseAmount(quantity)
    const cost = parseAmount(avgCost)
    const own = price.trim() ? parseAmount(price) : null
    if (!sym) return void toast.error(t("invest.symbolInvalid"))
    if (!(qty > 0)) return void toast.error(t("invest.quantityInvalid"))
    if (!(cost >= 0) || (own !== null && !(own >= 0))) return void toast.error(t("walletForm.amountInvalid"))
    const priceChanged = own !== (holding?.current_price ?? null)
    const input = {
      market,
      symbol: sym,
      name: name.trim() || null,
      quantity: qty,
      avg_cost: cost,
      // Crypto is quoted in US dollars.
      currency: market === "CRYPTO" ? ("USD" as Currency) : currency,
      current_price: own,
      price_updated_at: own === null ? null : priceChanged ? new Date().toISOString() : (holding?.price_updated_at ?? new Date().toISOString()),
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
    if (!holding || !(await stepUp(t("gold.deleteConfirm", { name: holding.symbol })))) return
    remove.mutate(holding.id, {
      onSuccess: () => {
        toast.success(t("walletForm.deleted"))
        onOpenChange(false)
      },
      onError: () => toast.error(t("common.error")),
    })
  }

  const cur = market === "CRYPTO" ? "USD" : currency
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t(holding ? "invest.edit" : "invest.add")}>
      <form onSubmit={submit} className="space-y-4">
        <Segmented aria-label={t("invest.market")} value={market} onChange={pickMarket} options={MARKETS.map((m) => ({ value: m, label: t(`invest.market.${m}` as MessageKey) }))} />

        <div className="grid grid-cols-[7rem_1fr] gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="inv-symbol">{t("invest.symbol")}</Label>
            <Input
              id="inv-symbol"
              className="h-11 font-mono uppercase"
              maxLength={15}
              list={`symbols-${market}`}
              autoCapitalize="characters"
              placeholder={SYMBOL_SUGGESTIONS[market][0]}
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            />
            <datalist id={`symbols-${market}`}>
              {SYMBOL_SUGGESTIONS[market].map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-name">{t("invest.name")}</Label>
            <Input id="inv-name" className="h-11" maxLength={80} placeholder={t("invest.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="inv-qty">{t(market === "CRYPTO" ? "invest.quantityCrypto" : "invest.quantityShares")}</Label>
          <Input id="inv-qty" inputMode="decimal" placeholder="0" className="h-11 text-base tabular-nums" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="inv-cost">{t("invest.avgCost")}</Label>
          <div className="flex gap-2">
            <Input id="inv-cost" inputMode="decimal" placeholder="0" className="h-11 min-w-0 flex-1 tabular-nums" value={avgCost} onChange={(e) => setAvgCost(e.target.value)} />
            {market !== "CRYPTO" && (
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
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="inv-price">{t("invest.currentPrice")}</Label>
          {adminPrice !== undefined ? (
            <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm">
              {t("invest.adminPrice", { price: formatMoney(adminPrice, PRICE_CURRENCY[market]) })}
            </p>
          ) : (
            <>
              <Input id="inv-price" inputMode="decimal" placeholder={t("invest.pricePlaceholder", { currency: cur === "USD" ? "$" : "៛" })} className="h-11 tabular-nums" value={price} onChange={(e) => setPrice(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t("invest.priceHint")}</p>
            </>
          )}
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

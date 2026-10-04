"use client"

import { CheckIcon, DownloadIcon, Loader2Icon, PlusIcon, QrCodeIcon, RotateCcwIcon, ScrollTextIcon, Share2Icon, Trash2Icon, XIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { canWrite, useActiveWorkspace, useProfile, usableWallets, useWallets } from "@/lib/data/hooks"
import type { Currency } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { itemsTotal, type Invoice, type InvoiceStatus } from "@/lib/invoice"
import { fetchReceipt, InvoiceLimitError, useInvoiceMutations, useInvoiceQuota, useInvoices } from "@/lib/invoices"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { showUpgrade } from "@/lib/plan"
import { useMyKhqr } from "@/lib/profile"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"

const STATUS_STYLE: Record<InvoiceStatus, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  paid: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  cancelled: "bg-muted text-muted-foreground",
}

const ddmmyyyy = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000)
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`
}

type ItemRow = { name: string; qty: string; price: string }
const emptyRow = (): ItemRow => ({ name: "", qty: "1", price: "" })

/** New invoice: customer, items (qty × price) or just a total, a note. */
function InvoiceFormSheet({ open, onOpenChange, workspaceId, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; workspaceId: string; onCreated: (inv: Invoice) => void }) {
  const t = useT()
  const { create } = useInvoiceMutations(workspaceId)
  const [currency, setCurrency] = useState<Currency>("USD")
  const [customer, setCustomer] = useState("")
  const [phone, setPhone] = useState("")
  const [rows, setRows] = useState<ItemRow[]>([emptyRow()])
  const [total, setTotal] = useState("")
  const [notes, setNotes] = useState("")

  useEffect(() => {
    if (!open) return
    setCustomer("")
    setPhone("")
    setRows([emptyRow()])
    setTotal("")
    setNotes("")
  }, [open])

  const items = rows
    .filter((r) => r.name.trim())
    .map((r) => {
      const qty = parseAmount(r.qty)
      const price = parseAmount(r.price)
      return { name: r.name.trim().slice(0, 80), ...(qty > 0 ? { qty } : {}), ...(price >= 0 && r.price.trim() ? { price } : {}) }
    })
  const fromItems = itemsTotal(items)
  const typed = parseAmount(total)
  const amount = fromItems ?? (typed > 0 ? typed : null)

  const setRow = (i: number, patch: Partial<ItemRow>) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const submit = async () => {
    if (!amount || !(amount > 0)) return void toast.error(t("invoices.needAmount"))
    try {
      const inv = await create.mutateAsync({
        total: fromItems === null ? roundMoney(amount, currency) : null,
        currency,
        customer_name: customer.trim() || null,
        customer_phone: phone.trim() || null,
        items,
        notes: notes.trim() || null,
        target_wallet_id: null,
      })
      toast.success(t("invoices.created", { number: inv.invoice_number }))
      onOpenChange(false)
      onCreated(inv)
    } catch (error) {
      if (error instanceof InvoiceLimitError) showUpgrade("general")
      toast.error(error instanceof InvoiceLimitError ? t("invoices.limitReached") : t("common.error"))
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("invoices.new")}>
      <div className="space-y-4">
        <Segmented
          value={currency}
          onChange={setCurrency}
          aria-label={t("invoices.currency")}
          options={[
            { value: "USD", label: "$" },
            { value: "KHR", label: "៛" },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="inv-customer">{t("invoices.customer")}</Label>
            <Input id="inv-customer" className="h-11" maxLength={255} value={customer} onChange={(e) => setCustomer(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-phone">{t("invoices.phone")}</Label>
            <Input id="inv-phone" className="h-11" inputMode="tel" maxLength={50} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("invoices.items")}</Label>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_3.5rem_5.5rem_2rem] items-center gap-2">
              <Input className="h-11" placeholder={t("invoices.itemName")} maxLength={80} value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} aria-label={t("invoices.itemName")} />
              <Input className="h-11 text-center tabular-nums" inputMode="decimal" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} aria-label={t("invoices.qty")} />
              <Input className="h-11 tabular-nums" inputMode="decimal" placeholder={t("invoices.price")} value={r.price} onChange={(e) => setRow(i, { price: e.target.value })} aria-label={t("invoices.price")} />
              <Button type="button" size="icon" variant="ghost" className="size-8 text-muted-foreground" onClick={() => setRows((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : [emptyRow()]))} aria-label={t("common.delete")}>
                <XIcon className="size-4" />
              </Button>
            </div>
          ))}
          {rows.length < 50 && (
            <Button type="button" size="sm" variant="secondary" onClick={() => setRows((list) => [...list, emptyRow()])}>
              <PlusIcon />
              {t("invoices.addItem")}
            </Button>
          )}
        </div>

        {fromItems === null ? (
          <div className="space-y-2">
            <Label htmlFor="inv-total">{t("invoices.total")}</Label>
            <Input id="inv-total" className="h-14 text-2xl font-semibold tabular-nums" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
        ) : (
          <p className="flex items-baseline justify-between rounded-xl bg-muted px-4 py-3">
            <span className="text-sm text-muted-foreground">{t("invoices.total")}</span>
            <span className="text-2xl font-semibold tabular-nums">{formatMoney(roundMoney(fromItems, currency), currency)}</span>
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="inv-notes">{t("entry.note")}</Label>
          <Input id="inv-notes" className="h-11" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <Button className="h-12 w-full text-base" onClick={() => void submit()} disabled={create.isPending}>
          {create.isPending ? <Loader2Icon className="animate-spin" /> : <ScrollTextIcon />}
          {t("invoices.create")}
        </Button>
      </div>
    </BottomSheet>
  )
}

/** One invoice: the receipt image (share / save) and paid / cancel / reopen / delete. */
function InvoiceSheet({ invoice, workspaceId, onClose }: { invoice: Invoice; workspaceId: string; onClose: () => void }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const editable = canWrite(useActiveWorkspace().workspace)
  const me = useProfile().data?.id
  const allWallets = useWallets(workspaceId).data
  const active = useMemo(() => usableWallets(allWallets ?? [], me).filter((w) => !w.archived_at), [allWallets, me])
  const { markPaid, cancel, reopen, remove } = useInvoiceMutations(workspaceId)
  const [walletId, setWalletId] = useState<string>("")
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!walletId && active.length) setWalletId((active.find((w) => w.id === invoice.target_wallet_id) ?? active.find((w) => w.currency === invoice.currency) ?? active[0]).id)
  }, [active, walletId, invoice])

  // Redrawn whenever the status changes (the PAID / CANCELLED stamp).
  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    setFailed(false)
    fetchReceipt(invoice.id, locale)
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setImage({ blob, url })
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [invoice.id, invoice.status, locale])

  const fileName = `${invoice.invoice_number}.png`
  const share = async () => {
    if (!image) return
    const file = new File([image.blob], fileName, { type: "image/png" })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: invoice.invoice_number })
      } catch {
        // Closed the share sheet.
      }
    } else download()
  }
  const download = () => {
    if (!image) return
    const a = document.createElement("a")
    a.href = image.url
    a.download = fileName
    a.click()
  }

  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action()
      toast.success(done)
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <BottomSheet open onOpenChange={(v) => !v && onClose()} title={invoice.invoice_number} description={invoice.customer_name ?? undefined}>
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border bg-white">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob URL of the generated receipt
            <img src={image.url} alt={invoice.invoice_number} className="w-full" />
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              {failed ? t("invoices.imageFailed") : <Loader2Icon className="size-6 animate-spin" />}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11" onClick={() => void share()} disabled={!image}>
            <Share2Icon />
            {t("invoices.share")}
          </Button>
          <Button variant="outline" className="h-11" onClick={download} disabled={!image}>
            <DownloadIcon />
            {t("invoices.save")}
          </Button>
        </div>

        {editable && invoice.status === "pending" && (
          <div className="space-y-3 rounded-xl border p-3">
            {active.length > 0 && (
              <div className="space-y-2">
                <Label>{t("invoices.depositTo")}</Label>
                <Select value={walletId} onValueChange={setWalletId}>
                  <SelectTrigger className="h-11! w-full" aria-label={t("invoices.depositTo")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {active.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name} · {w.currency === "USD" ? "$" : "៛"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Button className="h-11" disabled={markPaid.isPending} onClick={() => void run(() => markPaid.mutateAsync({ id: invoice.id, walletId: walletId || null }), t("invoices.paidDone"))}>
                {markPaid.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
                {t("invoices.markPaid")}
              </Button>
              <Button variant="outline" className="h-11" disabled={cancel.isPending} onClick={() => void run(() => cancel.mutateAsync(invoice.id), t("invoices.cancelledDone"))}>
                <XIcon />
                {t("invoices.cancel")}
              </Button>
            </div>
          </div>
        )}

        {editable && invoice.status !== "pending" && (
          <Button
            variant="outline"
            className="h-11 w-full"
            disabled={reopen.isPending}
            onClick={() => {
              if (invoice.status === "paid" && !window.confirm(t("invoices.reopenConfirm"))) return
              void run(() => reopen.mutateAsync(invoice.id), t("invoices.reopened"))
            }}
          >
            <RotateCcwIcon />
            {t("invoices.reopen")}
          </Button>
        )}
        {editable && (
          <Button
            variant="ghost"
            className="h-10 w-full text-destructive"
            onClick={() => {
              if (!window.confirm(t("invoices.deleteConfirm"))) return
              void run(() => remove.mutateAsync(invoice.id), t("invoices.deleted")).then(onClose)
            }}
          >
            <Trash2Icon />
            {t("common.delete")}
          </Button>
        )}
      </div>
    </BottomSheet>
  )
}

/** The user's KHQR for receipts: shown, or a button to add it (read from a screenshot of the bank app's QR). */
function KhqrCard() {
  const t = useT()
  const khqr = useMyKhqr()
  const fileRef = useRef<HTMLInputElement>(null)
  const pick = async (file: File | undefined) => {
    if (!file) return
    try {
      const saved = await khqr.save.mutateAsync(file)
      if (saved?.payload) toast.success(t("invoices.khqrSaved"))
      else toast.error(t("invoices.khqrUnreadable"))
    } catch {
      toast.error(t("common.error"))
    } finally {
      if (fileRef.current) fileRef.current.value = ""
    }
  }
  const ok = Boolean(khqr.payload)
  return (
    <Card className={cn("flex-row items-center gap-3 px-4 py-3", !ok && "border-dashed")}>
      {khqr.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
        <img src={khqr.url} alt="KHQR" className="size-12 shrink-0 rounded-lg border bg-white object-contain" />
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <QrCodeIcon className="size-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t("invoices.khqrTitle")}</p>
        <p className="text-xs text-muted-foreground">{ok ? t("invoices.khqrOn") : khqr.path ? t("invoices.khqrUnreadable") : t("invoices.khqrHint")}</p>
      </div>
      <Button size="sm" variant={ok ? "ghost" : "default"} onClick={() => fileRef.current?.click()} disabled={khqr.save.isPending}>
        {khqr.save.isPending ? <Loader2Icon className="animate-spin" /> : null}
        {ok || khqr.path ? t("invoices.khqrChange") : t("invoices.khqrAdd")}
      </Button>
      <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} aria-label={t("invoices.khqrAdd")} />
    </Card>
  )
}

export default function InvoicesPage() {
  const t = useT()
  const { workspace } = useActiveWorkspace()
  const ws = workspace?.id
  const editable = canWrite(workspace)
  const invoices = useInvoices(ws)
  const quota = useInvoiceQuota().data
  const [formOpen, setFormOpen] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  const list = invoices.data ?? []
  const current = list.find((i) => i.id === viewing) ?? null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{t("invoices.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("invoices.subtitle")}</p>
        </div>
        {editable && (
          <Button onClick={() => (quota?.limit != null && quota.used >= quota.limit ? showUpgrade("general") : setFormOpen(true))}>
            <PlusIcon />
            {t("invoices.new")}
          </Button>
        )}
      </div>

      {quota?.limit != null && (
        <p className="text-xs text-muted-foreground">{t("invoices.quota", { used: Math.min(quota.used, quota.limit), limit: quota.limit })}</p>
      )}

      <KhqrCard />

      {invoices.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("invoices.empty")}</p>
      ) : (
        <Card className="gap-0 divide-y overflow-hidden py-0">
          {list.map((inv) => (
            <button key={inv.id} type="button" onClick={() => setViewing(inv.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{inv.customer_name || inv.items[0]?.name || inv.notes || inv.invoice_number}</p>
                <p className="text-xs text-muted-foreground">
                  {inv.invoice_number} · {ddmmyyyy(inv.created_at)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">{formatMoney(inv.total_amount, inv.currency)}</p>
                <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[inv.status])}>{t(`invoices.status.${inv.status}`)}</span>
              </div>
            </button>
          ))}
        </Card>
      )}

      {ws && <InvoiceFormSheet open={formOpen} onOpenChange={setFormOpen} workspaceId={ws} onCreated={(inv) => setViewing(inv.id)} />}
      {ws && current && <InvoiceSheet key={current.id} invoice={current} workspaceId={ws} onClose={() => setViewing(null)} />}
    </div>
  )
}

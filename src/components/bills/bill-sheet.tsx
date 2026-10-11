"use client"

import { CameraIcon, ExternalLinkIcon, Loader2Icon, Trash2Icon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { CategoryIcon } from "@/components/categories/category-icon"
import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  BILL_EMOJI,
  BILL_PRESETS,
  NSSF_URL,
  nssfAmountFor,
  useBillMutations,
  useBillStatements,
  useNssfMembers,
  type Bill,
  type BillFrequency,
  type BillInput,
  type BillKind,
  type NssfType,
} from "@/lib/bills"
import { compressImage } from "@/lib/image"
import { dueDayOf, utilityBillTitle, type UtilityBill } from "@/lib/utility-bill"
import { categoryLabel } from "@/lib/categories/presets"
import type { Category, Currency } from "@/lib/data/types"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { useActiveWorkspace } from "@/lib/data/hooks"
import { billKindAllowed } from "@/lib/workspace-scope"
import { useLocaleStore } from "@/stores/locale-store"

const REMIND_CHOICES = [1, 2, 3, 5, 7, 15]
const NONE = "__none__"

type Form = {
  preset: string
  title: string
  kind: BillKind
  amount: string
  currency: Currency
  frequency: BillFrequency
  dueDay: string
  dueDate: string
  nssfType: NssfType | null
  remind: number[]
  categoryId: string
  active: boolean
}

const fromBill = (b: Bill): Form => ({
  preset: "",
  title: b.title,
  kind: b.kind,
  amount: String(b.amount),
  currency: b.currency,
  frequency: b.frequency,
  dueDay: b.due_day ? String(b.due_day) : "",
  dueDate: b.due_date ?? "",
  nssfType: b.nssf_type,
  remind: b.remind_days,
  categoryId: b.category_id ?? NONE,
  active: b.is_active,
})

const EMPTY: Form = { preset: "", title: "", kind: "OTHER", amount: "", currency: "USD", frequency: "MONTHLY", dueDay: "1", dueDate: "", nssfType: null, remind: [2], categoryId: NONE, active: true }

/** Add or edit a bill. A preset (Electricity, NSSF monthly …) fills the form; everything stays editable. */
export function BillSheet({
  open,
  onOpenChange,
  workspaceId,
  bill,
  categories,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  bill: Bill | null
  categories: Category[]
}) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { save, remove, addStatement, removeStatement } = useBillMutations(workspaceId)
  const [form, setForm] = useState<Form>(EMPTY)
  // A photographed paper bill (electricity / water): fills the form, and is kept as this month's statement.
  const [scanned, setScanned] = useState<UtilityBill | null>(null)
  const [scanning, setScanning] = useState(false)
  const scanInput = useRef<HTMLInputElement>(null)
  const statements = useBillStatements(bill?.id).data ?? []
  // NSSF: one contribution per active member of the card vault (at least one: the account holder).
  const nssfMembers = (useNssfMembers().data ?? []).filter((m) => m.is_active).length
  // A business adds no NSSF member bills (founder decision 11/10).
  const workspaceType = useActiveWorkspace().workspace?.type
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))

  useEffect(() => {
    if (open) {
      setForm(bill ? fromBill(bill) : EMPTY)
      setScanned(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the sheet opens
  }, [open, bill?.id])

  const applyPreset = (id: string) => {
    const p = BILL_PRESETS.find((x) => x.id === id)
    if (!p) return
    const category = CATEGORY_FOR[p.kind].map((key) => categories.find((c) => c.preset_key === key)).find(Boolean)
    setForm({
      ...EMPTY,
      preset: id,
      kind: p.kind,
      title: t(`bills.preset.${id}` as MessageKey),
      amount: p.kind === "NSSF" ? String(nssfAmountFor(Math.max(1, nssfMembers), p.input.frequency ?? "MONTHLY")) : p.input.amount ? String(p.input.amount) : "",
      currency: p.input.currency ?? "USD",
      frequency: p.input.frequency ?? "MONTHLY",
      dueDay: p.input.due_day ? String(p.input.due_day) : "1",
      remind: p.input.remind_days ?? [2],
      nssfType: p.input.nssf_type ?? null,
      categoryId: category?.id ?? NONE,
    })
  }

  const scan = async (file: File | undefined) => {
    if (!file) return
    setScanning(true)
    try {
      const body = new FormData()
      body.append("image", await compressImage(file, 1800, 0.88), "bill.jpg")
      const res = await fetch("/api/bills/ocr", { method: "POST", body }).catch(() => null)
      const json = (await res?.json().catch(() => null)) as { bill?: UtilityBill; error?: string } | null
      const b = json?.bill
      if (!b) return void toast.info(t(json?.error === "busy" || !res ? "bills.scanBusy" : "bills.scanNone"))
      const category = CATEGORY_FOR[b.kind].map((key) => categories.find((c) => c.preset_key === key)).find(Boolean)
      setForm((f) => ({
        ...f,
        preset: "",
        kind: b.kind,
        title: bill ? f.title : utilityBillTitle(b),
        amount: String(b.amount),
        currency: b.currency,
        frequency: "MONTHLY",
        dueDay: String(dueDayOf(b.dueDate) ?? f.dueDay),
        categoryId: f.categoryId !== NONE ? f.categoryId : (category?.id ?? NONE),
      }))
      setScanned(b)
      toast.success(t("bills.scanFilled"))
    } finally {
      setScanning(false)
      if (scanInput.current) scanInput.current.value = ""
    }
  }

  const value = parseAmount(form.amount)
  const day = Number(form.dueDay)
  const valid =
    form.title.trim().length > 0 && value > 0 && (form.frequency === "MONTHLY" ? Number.isInteger(day) && day >= 1 && day <= 31 : Boolean(form.dueDate))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    const input: BillInput = {
      title: form.title.trim(),
      kind: form.kind,
      amount: roundMoney(value, form.currency),
      currency: form.currency,
      frequency: form.frequency,
      due_day: form.frequency === "MONTHLY" ? day : null,
      due_date: form.frequency === "YEARLY" ? form.dueDate : null,
      nssf_type: form.kind === "NSSF" ? form.nssfType : null,
      remind_days: [...form.remind].sort((a, b) => b - a),
      category_id: form.categoryId === NONE ? null : form.categoryId,
      is_active: form.active,
    }
    try {
      const id = await save.mutateAsync({ id: bill?.id, input })
      // This month's paper bill: invoice, usage, rate — the history under the bill.
      if (scanned) await addStatement.mutateAsync({ billId: id, s: scanned }).catch(() => null)
      toast.success(t("bills.saved"))
      onOpenChange(false)
    } catch {
      toast.error(t("common.error"))
    }
  }

  /** 🗑️ One statement of the history (a duplicate or a misread scan), after a confirm. */
  const dropStatement = async (st: (typeof statements)[number]) => {
    const label = [st.invoice_no, formatMoney(st.amount, st.currency)].filter(Boolean).join(" · ")
    if (!window.confirm(t("bills.statementRemoveConfirm", { name: label }))) return
    try {
      await removeStatement.mutateAsync(st.id)
      toast.success(t("bills.statementRemoved"))
    } catch {
      toast.error(t("common.error"))
    }
  }

  const destroy = async () => {
    if (!bill || !window.confirm(t("bills.deleteConfirm", { name: bill.title }))) return
    await remove.mutateAsync(bill.id)
    toast.success(t("bills.removed"))
    onOpenChange(false)
  }

  const expense = categories.filter((c) => c.type === "EXPENSE")

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={bill ? t("bills.editTitle") : t("bills.newTitle")}>
      <form onSubmit={submit} className="space-y-4">
        <Button type="button" variant="outline" className="h-11 w-full" disabled={scanning} onClick={() => scanInput.current?.click()}>
          {scanning ? <Loader2Icon className="animate-spin" /> : <CameraIcon />}
          {t(scanning ? "bills.scanReading" : "bills.scan")}
        </Button>
        <input ref={scanInput} type="file" accept="image/*" className="hidden" onChange={(e) => void scan(e.target.files?.[0])} />
        {scanned && (
          <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            {[scanned.invoiceNo, scanned.customerId, scanned.usage !== null ? `${scanned.usage} ${scanned.kind === "WATER" ? "m³" : "kWh"}` : null, scanned.dueDate].filter(Boolean).join(" · ")}
          </p>
        )}
        {!bill && (
          <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
            {BILL_PRESETS.filter((p) => billKindAllowed(p.kind, workspaceType)).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  form.preset === p.id ? "border-primary bg-primary/10 font-semibold text-primary" : "hover:bg-muted",
                )}
              >
                {BILL_EMOJI[p.kind]} {t(`bills.preset.${p.id}` as MessageKey)}
              </button>
            ))}
          </div>
        )}

        {form.kind === "NSSF" && nssfMembers > 0 && String(nssfAmountFor(nssfMembers, form.frequency)) !== form.amount && (
          <button
            type="button"
            onClick={() => set({ amount: String(nssfAmountFor(nssfMembers, form.frequency)), currency: "KHR" })}
            className="w-full rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-left text-xs text-primary"
          >
            {t("nssf.useAmount", { count: nssfMembers, amount: formatMoney(nssfAmountFor(nssfMembers, form.frequency), "KHR") })}
          </button>
        )}

        {form.kind === "NSSF" && (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            {t("bills.nssfCheck")}{" "}
            <a href={NSSF_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium underline [&_svg]:size-3">
              nssf.gov.kh <ExternalLinkIcon />
            </a>
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="bill-title">{t("bills.name")}</Label>
          <Input id="bill-title" value={form.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} className="h-11" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bill-amount">{t("bills.amount")}</Label>
          <div className="flex gap-2">
            <Input
              id="bill-amount"
              value={form.amount}
              onChange={(e) => set({ amount: e.target.value })}
              inputMode="decimal"
              placeholder="0"
              autoComplete="off"
              className="h-12 flex-1 text-xl font-semibold tabular-nums"
            />
            <div className="w-32">
              <Segmented
                aria-label={t("walletForm.currency")}
                value={form.currency}
                onChange={(v) => set({ currency: v })}
                options={[
                  { value: "USD", label: "$" },
                  { value: "KHR", label: "៛" },
                ]}
              />
            </div>
          </div>
        </div>

        <Segmented
          aria-label={t("bills.frequency")}
          value={form.frequency}
          onChange={(v) => set({ frequency: v })}
          options={[
            { value: "MONTHLY", label: t("bills.monthly") },
            { value: "YEARLY", label: t("bills.yearly") },
          ]}
        />

        {form.frequency === "MONTHLY" ? (
          <div className="space-y-2">
            <Label htmlFor="bill-day">{t("bills.dueDay")}</Label>
            <Input id="bill-day" inputMode="numeric" value={form.dueDay} onChange={(e) => set({ dueDay: e.target.value.replace(/\D/g, "").slice(0, 2) })} className="h-11 w-28" />
            <p className="text-xs text-muted-foreground">{t("bills.dueDayHint")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="bill-date">{t(form.kind === "NSSF" ? "bills.expiryDate" : "bills.dueDate")}</Label>
            <Input id="bill-date" type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} className="h-11" />
          </div>
        )}

        <div className="space-y-2">
          <Label>{t("bills.remind")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {REMIND_CHOICES.map((d) => {
              const on = form.remind.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ remind: on ? form.remind.filter((x) => x !== d) : [...form.remind, d].slice(-5) })}
                  className={cn("rounded-full border px-2.5 py-1 text-xs tabular-nums", on ? "border-primary bg-primary/10 font-semibold text-primary" : "hover:bg-muted")}
                >
                  {t(d === 1 ? "bills.dayBefore" : "bills.daysBefore", { count: d })}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">{t("bills.remindHint")}</p>
        </div>

        <div className="space-y-2">
          <Label>{t("bills.category")}</Label>
          <Select value={form.categoryId} onValueChange={(v) => set({ categoryId: v })}>
            <SelectTrigger className="h-12! w-full" aria-label={t("bills.category")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("bills.noCategory")}</SelectItem>
              {expense.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <CategoryIcon category={c} className="size-7" />
                  {categoryLabel(c, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {bill && (
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>{t("bills.active")}</span>
            <Switch checked={form.active} onCheckedChange={(v) => set({ active: v })} />
          </label>
        )}

        <div className="flex gap-2">
          {bill && (
            <Button type="button" variant="outline" size="icon" className="h-12 w-12 text-destructive" onClick={() => void destroy()} aria-label={t("bills.delete")}>
              <Trash2Icon />
            </Button>
          )}
          <Button type="submit" className="h-12 flex-1 text-base" disabled={!valid || save.isPending}>
            {save.isPending && <Loader2Icon className="animate-spin" />}
            {t("common.save")}
          </Button>
        </div>
        {statements.length > 0 && (
          <div className="space-y-1 rounded-xl border px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">{t("bills.history")}</p>
            {statements.map((st) => (
              <div key={st.id} className="flex items-center justify-between gap-2 text-xs tabular-nums">
                <span>{st.due_date ? st.due_date.split("-").reverse().slice(0, 2).join("/") : "—"}</span>
                <span className="text-muted-foreground">{st.usage !== null ? `${st.usage} ${form.kind === "WATER" ? "m³" : "kWh"}` : ""}</span>
                <span>{formatMoney(st.amount, st.currency)}</span>
                <span>{st.status === "PAID" ? "✅" : "⏳"}</span>
                <button
                  type="button"
                  className="-mr-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  aria-label={t("bills.statementRemove")}
                  title={t("bills.statementRemove")}
                  disabled={removeStatement.isPending}
                  onClick={() => void dropStatement(st)}
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </form>
    </BottomSheet>
  )
}

/** Expense categories a bill kind is logged under by default, first match wins (personal and business presets differ). */
const CATEGORY_FOR: Record<BillKind, string[]> = {
  ELECTRICITY: ["utilities", "housing"],
  WATER: ["utilities", "housing"],
  INTERNET: ["phone", "operating", "utilities"],
  RENT: ["rent", "housing"],
  WASTE: ["utilities", "housing"],
  LOAN: ["debt_repayment"],
  NSSF: ["health"],
  OTHER: [],
  DEPOSIT: [],
}

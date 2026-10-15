"use client"

import { CarIcon, Loader2Icon, PencilIcon, PlusIcon, RefreshCwIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { CameraScanBar } from "@/components/common/camera-scan-bar"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cambodiaToday } from "@/lib/bills"
import type { Currency } from "@/lib/data/types"
import { dayDate } from "@/lib/dates"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount, roundMoney, roundRiel } from "@/lib/money"
import { PartyAvatar } from "@/components/common/party-avatar"
import { COST_HINT, daysLeft, DEFAULT_REMIND_DAYS, docStatus, REMIND_CHOICES, renewedExpiry, toggleRemindDay, VEHICLE_DOC_TYPES, type VehicleDoc, type VehicleDocType } from "@/lib/vehicle-docs"
import { useVehicleDocMutations, useVehicleDocs } from "@/lib/vehicle-docs-data"
import type { VehicleRead } from "@/lib/scan"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

const STATUS_STYLE = {
  valid: "text-emerald-700 dark:text-emerald-400",
  soon: "text-amber-700 dark:text-amber-400",
  expired: "text-rose-600 dark:text-rose-400",
} as const

/**
 * /bills (Personal workspace only): 🚗 ឆៀកឡាន, ពន្ធផ្លូវ and ធានារ៉ាប់រងយានយន្ត per vehicle — expiry,
 * status, estimated cost, «បន្តរួច». Reminders 30, 15 and 7 days before (bell + Telegram) come from
 * the database's daily run (run_vehicle_doc_alerts).
 */
export function VehicleDocsCard({ workspaceId, editable, addType = null }: { workspaceId: string; editable: boolean; addType?: VehicleDocType | null }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const hidden = usePrefsStore((s) => s.hideBalances)
  const docs = useVehicleDocs(workspaceId).data ?? []
  const { renew } = useVehicleDocMutations(workspaceId)
  const [sheet, setSheet] = useState<{ open: boolean; doc: VehicleDoc | null; type?: VehicleDocType }>({ open: false, doc: null })
  // From the vault's «ឆៀកឡាន» / «ពន្ធផ្លូវ»: the form opens once, with that type chosen.
  useEffect(() => {
    if (addType && editable) setSheet({ open: true, doc: null, type: addType })
  }, [addType, editable])
  const [renewing, setRenewing] = useState<VehicleDoc | null>(null)
  const today = cambodiaToday()
  const date = (iso: string) => dayDate(new Date(`${iso}T12:00:00`), locale)

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <CarIcon className="size-4" aria-hidden />
          {t("vdoc.title")}
        </h2>
        {editable && (
          <Button variant="ghost" size="sm" className="h-8 text-primary" onClick={() => setSheet({ open: true, doc: null })}>
            <PlusIcon />
            {t("vdoc.add")}
          </Button>
        )}
      </div>
      {docs.length === 0 ? (
        <Card className="px-4 py-3">
          <p className="text-sm text-muted-foreground">{t("vdoc.empty")}</p>
        </Card>
      ) : (
        <Card className="gap-0 divide-y py-0">
          {docs.map((d) => {
            const status = docStatus(d.expires_on, today)
            const left = daysLeft(d.expires_on, today)
            return (
              <div key={d.id} className="flex items-start gap-3 px-4 py-3">
                <PartyAvatar
                  name={d.doc_type === "INSURANCE" && d.provider ? d.provider : d.vehicle}
                  category={d.doc_type === "INSURANCE" && d.provider ? "INSURANCE" : "VEHICLE"}
                  className="size-9"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {t(`vdoc.type.${d.doc_type}` as MessageKey)}
                    {d.provider ? ` · ${d.provider}` : ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.vehicle}
                    {d.cost != null ? ` · ${t("vdoc.about")} ${formatMoney(d.cost, d.currency, { hidden })}` : ""}
                  </p>
                  <p className={`mt-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
                    {t(`vdoc.status.${status}` as MessageKey)} · {t("vdoc.expires", { date: date(d.expires_on) })}
                    {status !== "valid" && ` (${left < 0 ? t("vdoc.daysAgo", { n: -left }) : left === 0 ? t("vdoc.today") : t("vdoc.daysLeft", { n: left })})`}
                  </p>
                </div>
                {editable && (
                  <div className="flex shrink-0 gap-1">
                    {status !== "valid" && (
                      <Button variant="outline" size="sm" className="h-8" onClick={() => setRenewing(d)}>
                        <RefreshCwIcon />
                        {t("vdoc.renewed")}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="size-8" aria-label={t("vdoc.editTitle")} onClick={() => setSheet({ open: true, doc: d })}>
                      <PencilIcon />
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </Card>
      )}
      <p className="px-1 text-xs text-muted-foreground">{t("vdoc.hint")}</p>

      <VehicleDocSheet open={sheet.open} onOpenChange={(open) => setSheet((s) => ({ ...s, open }))} workspaceId={workspaceId} doc={sheet.doc} initialType={sheet.type} vehicles={[...new Set(docs.map((d) => d.vehicle))]} />
      {renewing && (
        <RenewSheet
          doc={renewing}
          busy={renew.isPending}
          onClose={() => setRenewing(null)}
          onSave={async (expiresOn) => {
            try {
              await renew.mutateAsync({ id: renewing.id, expiresOn })
              toast.success(t("vdoc.renewedSaved", { date: date(expiresOn) }))
              setRenewing(null)
            } catch {
              toast.error(t("common.error"))
            }
          }}
        />
      )}
    </section>
  )
}

/** «បន្តរួច»: the new expiry, one year on by default. */
function RenewSheet({ doc, busy, onClose, onSave }: { doc: VehicleDoc; busy: boolean; onClose: () => void; onSave: (expiresOn: string) => void }) {
  const t = useT()
  const [value, setValue] = useState(() => renewedExpiry(doc.expires_on, cambodiaToday(), doc.doc_type))
  return (
    <BottomSheet open onOpenChange={(v) => !v && onClose()} title={t("vdoc.renewTitle")} description={`${t(`vdoc.type.${doc.doc_type}` as MessageKey)} · ${doc.vehicle}`}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="vdoc-renew">{t("vdoc.newExpiry")}</Label>
          <Input id="vdoc-renew" type="date" value={value} onChange={(e) => setValue(e.target.value)} className="h-11" />
        </div>
        <Button className="h-11 w-full" disabled={busy || !value || value <= doc.expires_on} onClick={() => onSave(value)}>
          {busy && <Loader2Icon className="animate-spin" />}
          {t("vdoc.renewSave")}
        </Button>
      </div>
    </BottomSheet>
  )
}

type Form = { vehicle: string; type: VehicleDocType; provider: string; expiresOn: string; cost: string; currency: Currency; remindDays: number[] }

function VehicleDocSheet({ open, onOpenChange, workspaceId, doc, vehicles, initialType }: { open: boolean; onOpenChange: (open: boolean) => void; workspaceId: string; doc: VehicleDoc | null; vehicles: string[]; initialType?: VehicleDocType }) {
  const t = useT()
  const { save, remove } = useVehicleDocMutations(workspaceId)
  const start = initialType ?? "INSPECTION"
  const blank = (): Form => ({ vehicle: vehicles[0] ?? "", type: start, provider: "", expiresOn: "", cost: "", currency: COST_HINT[start].currency, remindDays: [...DEFAULT_REMIND_DAYS] })
  const fromDoc = (d: VehicleDoc): Form => ({ vehicle: d.vehicle, type: d.doc_type, provider: d.provider ?? "", expiresOn: d.expires_on, cost: d.cost == null ? "" : String(d.cost), currency: d.currency, remindDays: d.remind_days ?? [...DEFAULT_REMIND_DAYS] })
  const [form, setForm] = useState<Form>(blank)
  const [key, setKey] = useState<string | null>(null)
  // Fresh on each opening (edit: the document's values).
  const openKey = open ? (doc?.id ?? "new") : null
  if (openKey !== key) {
    setKey(openKey)
    if (open) setForm(doc ? fromDoc(doc) : blank())
  }
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const vehicle = form.vehicle.trim()
    if (!vehicle || !form.expiresOn) return void toast.error(t("vdoc.required"))
    const value = form.cost.trim() ? parseAmount(form.cost) : null
    if (value !== null && !(value > 0)) return void toast.error(t("vdoc.badCost"))
    try {
      await save.mutateAsync({
        id: doc?.id,
        input: {
          vehicle,
          doc_type: form.type,
          provider: form.type === "INSURANCE" ? form.provider.trim() || null : null,
          expires_on: form.expiresOn,
          // An estimate: riel to the nearest 100 ៛.
          cost: value === null ? null : form.currency === "KHR" ? roundRiel(value) : roundMoney(value, "USD"),
          currency: form.currency,
          notes: doc?.notes ?? null,
          remind_days: form.remindDays,
        },
      })
      toast.success(t("vdoc.saved"))
      onOpenChange(false)
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t(doc ? "vdoc.editTitle" : "vdoc.newTitle")}>
      <form onSubmit={submit} className="space-y-4">
        {/* Camera-first: an inspection, road tax, insurance or registration document fills what it shows. */}
        <CameraScanBar<VehicleRead>
          kind="vehicle"
          hint={t("scan.hintVehicle")}
          onRead={(v) =>
            set({
              ...(v.vehicle ? { vehicle: v.vehicle } : {}),
              ...(v.docType ? { type: v.docType, ...(doc ? {} : { currency: COST_HINT[v.docType].currency }) } : {}),
              ...(v.expiresOn ? { expiresOn: v.expiresOn } : {}),
              ...(v.provider ? { provider: v.provider } : {}),
              // The amount printed on the receipt (road tax «ប្រាក់ពន្ធ» / «សរុប») — exact, as the bank or GDT stated it.
              ...(v.cost !== null ? { cost: String(v.cost), ...(v.currency ? { currency: v.currency } : {}) } : {}),
            })
          }
        />
        <div className="space-y-1.5">
          <Label htmlFor="vdoc-vehicle">{t("vdoc.vehicle")}</Label>
          <Input id="vdoc-vehicle" list="vdoc-vehicles" value={form.vehicle} onChange={(e) => set({ vehicle: e.target.value })} placeholder={t("vdoc.vehiclePlaceholder")} maxLength={60} className="h-11" />
          <datalist id="vdoc-vehicles">
            {vehicles.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </div>
        <Segmented
          aria-label={t("vdoc.typeLabel")}
          value={form.type}
          onChange={(type) => set({ type, ...(doc ? {} : { currency: COST_HINT[type].currency }) })}
          options={VEHICLE_DOC_TYPES.map((v) => ({ value: v, label: t(`vdoc.short.${v}` as MessageKey) }))}
        />
        {form.type === "INSURANCE" && (
          <div className="space-y-1.5">
            <Label htmlFor="vdoc-provider">{t("vdoc.provider")}</Label>
            <Input id="vdoc-provider" value={form.provider} onChange={(e) => set({ provider: e.target.value })} placeholder="Forte, AIA…" maxLength={60} className="h-11" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="vdoc-expiry">{t("bills.expiryDate")}</Label>
          <Input id="vdoc-expiry" type="date" value={form.expiresOn} onChange={(e) => set({ expiresOn: e.target.value })} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vdoc-cost">
            {t("vdoc.cost")} <span className="font-normal text-muted-foreground">{COST_HINT[form.type].text}</span>
          </Label>
          <div className="flex gap-2">
            <Input id="vdoc-cost" value={form.cost} onChange={(e) => set({ cost: e.target.value })} inputMode="decimal" placeholder="0" autoComplete="off" className="h-12 flex-1 text-xl font-semibold tabular-nums" />
            <div className="w-32">
              <Segmented aria-label={t("walletForm.currency")} value={form.currency} onChange={(currency) => set({ currency })} options={[{ value: "USD", label: "$" }, { value: "KHR", label: "៛" }]} />
            </div>
          </div>
        </div>
        {/* Reminders by bell and Telegram: each of 30 / 15 / 7 days before on or off; the day itself and after expiry always. */}
        <div className="space-y-1.5">
          <Label>{t("vdoc.remindLabel")}</Label>
          <div className="flex gap-2" role="group" aria-label={t("vdoc.remindLabel")}>
            {REMIND_CHOICES.map((d) => {
              const on = form.remindDays.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ remindDays: toggleRemindDay(form.remindDays, d) })}
                  className={`h-11 flex-1 rounded-xl border text-sm font-medium transition-colors ${on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
                >
                  {t("vdoc.remindDays", { n: d })}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">{t("vdoc.remindAlways")}</p>
        </div>
        <Button type="submit" className="h-11 w-full" disabled={save.isPending}>
          {save.isPending && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>
        {doc && (
          <Button
            type="button"
            variant="ghost"
            className="w-full text-destructive"
            onClick={async () => {
              if (!window.confirm(t("vdoc.deleteConfirm"))) return
              try {
                await remove.mutateAsync(doc.id)
                onOpenChange(false)
              } catch {
                toast.error(t("common.error"))
              }
            }}
          >
            {t("common.delete")}
          </Button>
        )}
      </form>
    </BottomSheet>
  )
}

"use client"

import { Loader2Icon, PlusIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { canWrite, useActiveWorkspace } from "@/lib/data/hooks"
import type { Currency } from "@/lib/data/types"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { showUpgrade } from "@/lib/plan"
import { POOL_KINDS, type PoolKind } from "@/lib/pool"
import { PoolLimitError, usePoolMutations, usePools } from "@/lib/pools"
import { cn } from "@/lib/utils"

type Row = { name: string; amount: string }

/** New pool: kind, name, currency, equal or custom contributions, optional dates. */
function CreatePoolSheet({ open, onOpenChange, workspaceId }: { open: boolean; onOpenChange: (v: boolean) => void; workspaceId: string }) {
  const t = useT()
  const router = useRouter()
  const { create } = usePoolMutations()
  const [kind, setKind] = useState<PoolKind>("FESTIVAL")
  const [title, setTitle] = useState("")
  const [currency, setCurrency] = useState<Currency>("USD")
  const [split, setSplit] = useState<"EQUAL" | "CUSTOM">("EQUAL")
  const [count, setCount] = useState("5")
  const [each, setEach] = useState("")
  // Optional names for equal shares ("គ្រួសារបងធំ"); an empty one keeps "គ្រួសារទី N".
  const [names, setNames] = useState<string[]>([])
  const [rows, setRows] = useState<Row[]>([{ name: "", amount: "" }, { name: "", amount: "" }])
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [recordPaid, setRecordPaid] = useState(true)
  // Festival pools count families by default ("គ្រួសារទី ១") and get the Pchum Ben categories.
  const [unit, setUnit] = useState<"PERSON" | "FAMILY">("FAMILY")
  const [template, setTemplate] = useState(true)

  useEffect(() => {
    if (!open) return
    setTitle("")
    setEach("")
    setCount("5")
    setRows([{ name: "", amount: "" }, { name: "", amount: "" }])
    setStart("")
    setEnd("")
    setRecordPaid(true)
    setUnit("FAMILY")
    setTemplate(true)
    setNames([])
  }, [open])

  const members =
    split === "EQUAL"
      ? Array.from({ length: Math.min(100, Math.max(0, Math.floor(parseAmount(count) || 0))) }, (_, i) => ({
          name: names[i]?.trim().replace(/\s+/g, " ").slice(0, 60) || t(unit === "FAMILY" ? "pool.familyN" : "pool.memberN", { n: i + 1 }),
          pledged: roundMoney(parseAmount(each) || 0, currency),
        }))
      : rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim().slice(0, 60), pledged: roundMoney(parseAmount(r.amount) || 0, currency) }))
  const total = members.reduce((s, m) => s + m.pledged, 0)

  const submit = async () => {
    if (!title.trim()) return void toast.error(t("pool.needTitle"))
    if (!members.length || !(total > 0)) return void toast.error(t("pool.needMembers"))
    if (start && end && end < start) return void toast.error(t("pool.badDates"))
    try {
      const id = await create.mutateAsync({
        workspaceId,
        pool: {
          kind,
          title: title.trim(),
          currency,
          split,
          members,
          target: null,
          start: start || null,
          end: end || null,
          recordPaid,
          unit,
          template: kind === "FESTIVAL" && template ? "pchumben" : null,
        },
      })
      onOpenChange(false)
      router.push(`/pools/${id}`)
    } catch (error) {
      if (error instanceof PoolLimitError) {
        onOpenChange(false)
        showUpgrade("general")
        toast.error(t("pool.limit"))
      } else toast.error(t("common.error"))
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("pool.new")} description={t("pool.newHint")}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {POOL_KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              onClick={() => {
                setKind(k.kind)
                // Donations come in any amount: charity starts with custom contributions.
                if (k.kind === "CHARITY") setSplit("CUSTOM")
              }}
              aria-pressed={kind === k.kind}
              className={cn("rounded-xl border px-3 py-2.5 text-left transition-colors", kind === k.kind ? "border-primary bg-primary/5" : "hover:bg-muted/60")}
            >
              <span className="block text-lg" aria-hidden>
                {k.emoji}
              </span>
              <span className="block text-sm font-medium">{t(`pool.kind.${k.kind}` as MessageKey)}</span>
              <span className="block text-[11px] text-muted-foreground">{t(`pool.kindHint.${k.kind}` as MessageKey)}</span>
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pool-title">{t("pool.title")}</Label>
          <Input id="pool-title" className="h-11" maxLength={80} placeholder={t(`pool.placeholder.${kind}` as MessageKey)} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("pool.currency")}</Label>
            <Segmented
              value={currency}
              onChange={setCurrency}
              aria-label={t("pool.currency")}
              options={[
                { value: "USD", label: "$" },
                { value: "KHR", label: "៛" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("pool.split")}</Label>
            <Segmented
              value={split}
              onChange={setSplit}
              aria-label={t("pool.split")}
              options={[
                { value: "EQUAL", label: t("pool.equal") },
                { value: "CUSTOM", label: t("pool.custom") },
              ]}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t("pool.unit")}</Label>
          <Segmented
            value={unit}
            onChange={setUnit}
            aria-label={t("pool.unit")}
            options={[
              { value: "PERSON", label: t("pool.unitPerson") },
              { value: "FAMILY", label: t("pool.unitFamily") },
            ]}
          />
        </div>
        {kind === "FESTIVAL" && (
          <label className="flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={template} onChange={(e) => setTemplate(e.target.checked)} />
            <span>
              <span className="block font-medium">{t("pool.templatePchumBen")}</span>
              <span className="block text-xs text-muted-foreground">{t("pool.templatePchumBenHint")}</span>
            </span>
          </label>
        )}

        {split === "EQUAL" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pool-count">{t(unit === "FAMILY" ? "pool.familyCount" : "pool.memberCount")}</Label>
              <Input id="pool-count" className="h-11 tabular-nums" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pool-each">{t(unit === "FAMILY" ? "pool.perFamily" : "pool.perMember", { currency: currency === "USD" ? "$" : "៛" })}</Label>
              <Input id="pool-each" className="h-11 tabular-nums" inputMode="decimal" value={each} onChange={(e) => setEach(e.target.value)} />
            </div>
            {members.length > 0 && members.length <= 30 && (
              <details className="col-span-2 rounded-xl border px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium">{t(unit === "FAMILY" ? "pool.nameFamilies" : "pool.namePeople")}</summary>
                <div className="mt-2 space-y-1.5">
                  {members.map((_, i) => (
                    <Input
                      key={i}
                      className="h-10"
                      maxLength={60}
                      placeholder={t(unit === "FAMILY" ? "pool.familyN" : "pool.memberN", { n: i + 1 })}
                      value={names[i] ?? ""}
                      onChange={(e) => setNames((list) => {
                        const next = [...list]
                        next[i] = e.target.value
                        return next
                      })}
                      aria-label={t(unit === "FAMILY" ? "pool.familyN" : "pool.memberN", { n: i + 1 })}
                    />
                  ))}
                </div>
              </details>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label>{t("pool.members")}</Label>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_6rem_2rem] gap-2">
                <Input className="h-11" maxLength={60} placeholder={t("pool.memberName")} value={r.name} onChange={(e) => setRows((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label={t("pool.memberName")} />
                <Input className="h-11 tabular-nums" inputMode="decimal" placeholder={currency === "USD" ? "$" : "៛"} value={r.amount} onChange={(e) => setRows((list) => list.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} aria-label={t("pool.amount")} />
                <Button type="button" size="icon" variant="ghost" className="size-8 self-center" onClick={() => setRows((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : list))} aria-label={t("common.delete")}>
                  <XIcon className="size-4" />
                </Button>
              </div>
            ))}
            {rows.length < 100 && (
              <Button type="button" size="sm" variant="secondary" onClick={() => setRows((list) => [...list, { name: "", amount: "" }])}>
                <PlusIcon />
                {t("pool.addMember")}
              </Button>
            )}
          </div>
        )}

        <p className="flex items-baseline justify-between rounded-xl bg-muted px-4 py-3">
          <span className="text-sm text-muted-foreground">{t("pool.totalFund", { n: members.length })}</span>
          <span className="text-xl font-semibold tabular-nums">{formatMoney(total, currency)}</span>
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pool-start">{t("pool.start")}</Label>
            <Input id="pool-start" type="date" className="h-11" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pool-end">{t("pool.end")}</Label>
            <Input id="pool-end" type="date" className="h-11" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">{t("pool.datesHint")}</p>

        <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]" checked={recordPaid} onChange={(e) => setRecordPaid(e.target.checked)} />
          <span>
            <span className="block font-medium">{t("pool.recordPaid")}</span>
            <span className="block text-xs text-muted-foreground">{t("pool.recordPaidHint")}</span>
          </span>
        </label>

        <Button className="h-12 w-full text-base" onClick={() => void submit()} disabled={create.isPending}>
          {create.isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          {t("pool.create")}
        </Button>
      </div>
    </BottomSheet>
  )
}

export default function PoolsPage() {
  const t = useT()
  const { workspace } = useActiveWorkspace()
  const ws = workspace?.id
  const pools = usePools(ws)
  const [open, setOpen] = useState(false)
  const list = pools.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{t("pool.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pool.pageHint")}</p>
        </div>
        {canWrite(workspace) && (
          <Button onClick={() => setOpen(true)}>
            <PlusIcon />
            {t("pool.new")}
          </Button>
        )}
      </div>

      {pools.isLoading ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : list.length === 0 ? (
        <Card className="gap-2 px-4 py-6 text-center">
          <p className="text-3xl" aria-hidden>
            🪷 👨‍👩‍👧‍👦 🏕️ 🤝
          </p>
          <p className="text-sm text-muted-foreground">{t("pool.empty")}</p>
        </Card>
      ) : (
        <Card className="gap-0 divide-y overflow-hidden py-0">
          {list.map((p) => (
            <Link key={p.id} href={`/pools/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-lg" aria-hidden>
                {POOL_KINDS.find((k) => k.kind === p.kind)?.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.title}</span>
                <span className="block text-xs text-muted-foreground">{t(`pool.kind.${p.kind}` as MessageKey)}</span>
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", p.status === "active" ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                {t(p.status === "active" ? "pool.active" : "pool.settled")}
              </span>
            </Link>
          ))}
        </Card>
      )}

      {ws && <CreatePoolSheet open={open} onOpenChange={setOpen} workspaceId={ws} />}
    </div>
  )
}

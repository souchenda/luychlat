"use client"

import { useMoney } from "@/lib/use-money"
import { ArrowLeftIcon, CheckIcon, CircleCheckIcon, CopyIcon, ImageIcon, Loader2Icon, MinusIcon, PlusIcon, Share2Icon, UnlinkIcon, UserPlusIcon } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { EntryFormSheet } from "@/components/transactions/entry-form-sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { canWrite, useActiveWorkspace, useWallets } from "@/lib/data/hooks"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { parseAmount, roundMoney } from "@/lib/money"
import { poolEmoji, type PoolMember, type PoolSettleMode, type PoolSnapshot } from "@/lib/pool"
import { usePool, usePoolMutations } from "@/lib/pools"
import { cn } from "@/lib/utils"
import { khmerDigits } from "@/lib/dates"
import { useLocaleStore } from "@/stores/locale-store"

const ddmm = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000)
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

/** Record that a member put money in (income in the pool's wallet). */
function ContributeSheet({ pool, open, onOpenChange }: { pool: PoolSnapshot; open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT()
  const money = useMoney()
  const { contribute } = usePoolMutations()
  const [memberId, setMemberId] = useState(pool.members[0]?.id ?? "")
  const member = pool.members.find((m) => m.id === memberId)
  const [amount, setAmount] = useState("")

  const submit = async () => {
    const value = roundMoney(parseAmount(amount), pool.currency)
    if (!memberId || !(value > 0)) return void toast.error(t("pool.needAmount"))
    try {
      await contribute.mutateAsync({ poolId: pool.id!, memberId, amount: value })
      toast.success(t("pool.contributed", { name: member?.name ?? "", amount: money(value, pool.currency) }))
      setAmount("")
      onOpenChange(false)
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("pool.contribute")} description={pool.title}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t("pool.member")}</Label>
          <Select
            value={memberId}
            onValueChange={(id) => {
              setMemberId(id)
              const m = pool.members.find((x) => x.id === id)
              if (m && m.pledged > m.paid) setAmount(String(roundMoney(m.pledged - m.paid, pool.currency)))
            }}
          >
            <SelectTrigger className="h-11! w-full" aria-label={t("pool.member")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pool.members.map((m) => (
                <SelectItem key={m.id} value={m.id!}>
                  {m.name} · {money(m.paid, pool.currency)}
                  {m.pledged > 0 && ` / ${money(m.pledged, pool.currency)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pool-amount">{t("pool.amount")}</Label>
          <Input id="pool-amount" className="h-14 text-2xl font-semibold tabular-nums" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <Button className="h-12 w-full text-base" onClick={() => void submit()} disabled={contribute.isPending}>
          {contribute.isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          {t("pool.contribute")}
        </Button>
      </div>
    </BottomSheet>
  )
}

/** A new member with a target (the usual one in this pool), so they get a Pay button straight away. */
function AddMemberSheet({ pool, open, onOpenChange }: { pool: PoolSnapshot; open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT()
  const { addMember } = usePoolMutations()
  // The most common target among members (equal split: everyone's).
  const usual = useMemo(() => {
    const counts = new Map<number, number>()
    for (const m of pool.members) if (m.pledged > 0) counts.set(m.pledged, (counts.get(m.pledged) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
  }, [pool.members])
  const [name, setName] = useState("")
  const [target, setTarget] = useState(usual ? String(usual) : "")

  const save = async () => {
    const clean = name.trim().replace(/\s+/g, " ").slice(0, 60)
    if (!clean) return
    try {
      await addMember.mutateAsync({ poolId: pool.id!, name: clean, pledged: roundMoney(parseAmount(target) || 0, pool.currency) })
      setName("")
      onOpenChange(false)
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("pool.addMember")} description={pool.title}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pool-new-name">{t("pool.newMember")}</Label>
          <Input id="pool-new-name" className="h-11" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pool-new-target">{t("pool.memberTarget")}</Label>
          <Input id="pool-new-target" className="h-11 tabular-nums" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
        <Button className="h-12 w-full text-base" onClick={() => void save()} disabled={addMember.isPending || !name.trim()}>
          {addMember.isPending ? <Loader2Icon className="animate-spin" /> : <UserPlusIcon />}
          {t("pool.addMember")}
        </Button>
      </div>
    </BottomSheet>
  )
}

/**
 * One member: tap the name to rename it in place; one tap on "បង់ $50" records what they
 * still owe (Undo in the toast); paid in full shows "✓ បានបង់ $50".
 */
function MemberRow({ pool, m, editable }: { pool: PoolSnapshot; m: PoolMember; editable: boolean }) {
  const t = useT()
  const money = useMoney()
  const { markPaid, undoPaid, rename } = usePoolMutations()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(m.name)
  const owed = roundMoney(m.pledged - m.paid, pool.currency)
  const full = m.pledged > 0 && owed <= 0
  const open = pool.status === "active"

  const saveName = () => {
    setEditing(false)
    const clean = name.trim().replace(/\s+/g, " ").slice(0, 60)
    if (!clean || clean === m.name) return setName(m.name)
    rename.mutate({ memberId: m.id!, name: clean }, { onSuccess: () => toast.success(t("pool.renamed")), onError: () => {
        setName(m.name)
        toast.error(t("common.error"))
      } })
  }

  const pay = () =>
    markPaid.mutate(
      { poolId: pool.id!, memberId: m.id! },
      {
        onSuccess: (ids) =>
          toast.success(t("pool.contributed", { name: m.name, amount: money(owed, pool.currency) }), {
            action: ids.length ? { label: t("pool.undo"), onClick: () => undoPaid.mutate(ids, { onError: () => toast.error(t("common.error")) }) } : undefined,
          }),
        onError: () => toast.error(t("common.error")),
      },
    )

  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2">
      <div className="min-w-0 flex-1">
        {editing ? (
          <Input
            autoFocus
            className="h-9"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur()
              if (e.key === "Escape") {
                setName(m.name)
                setEditing(false)
              }
            }}
            aria-label={t("pool.tapToRename")}
          />
        ) : (
          <button
            type="button"
            disabled={!editable}
            onClick={() => setEditing(true)}
            className="block max-w-full truncate text-left text-sm font-medium decoration-dotted underline-offset-4 enabled:hover:underline"
            title={editable ? t("pool.tapToRename") : undefined}
          >
            {name}
          </button>
        )}
        {m.pledged > 0 && !full && m.paid > 0 && (
          <span className="block text-xs text-muted-foreground tabular-nums">
            {money(m.paid, pool.currency)} / {money(m.pledged, pool.currency)}
          </span>
        )}
        {m.pledged === 0 && m.paid > 0 && <span className="block text-xs text-muted-foreground tabular-nums">{money(m.paid, pool.currency)}</span>}
      </div>
      {full ? (
        <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-emerald-700 tabular-nums dark:text-emerald-400">
          <CircleCheckIcon className="size-4" aria-hidden />
          {t("pool.paidMember", { amount: money(m.pledged, pool.currency) })}
        </span>
      ) : owed > 0 && open && editable ? (
        <Button size="sm" className="h-9 shrink-0 bg-emerald-600 px-3 text-white tabular-nums hover:bg-emerald-700" onClick={pay} disabled={markPaid.isPending}>
          {markPaid.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
          {t("pool.payMember", { amount: money(owed, pool.currency) })}
        </Button>
      ) : (
        owed > 0 && <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{money(owed, pool.currency)}</span>
      )}
    </div>
  )
}

/** Close the pool: refund / roll over (money left) or collect (money short). */
function SettleSheet({ pool, open, onOpenChange }: { pool: PoolSnapshot; open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT()
  const money = useMoney()
  const router = useRouter()
  const { settle } = usePoolMutations()
  const surplus = pool.remaining > 0
  const short = pool.remaining < 0
  const [mode, setMode] = useState<PoolSettleMode>(short ? "COLLECT" : "REFUND")
  const [nextTitle, setNextTitle] = useState(pool.title)
  const paidTotal = pool.members.reduce((s, m) => s + m.paid, 0)
  const share = (m: { paid: number }) =>
    roundMoney(Math.abs(pool.remaining) * (paidTotal > 0 ? m.paid / paidTotal : 1 / Math.max(1, pool.members.length)), pool.currency)

  const go = async () => {
    try {
      const r = (await settle.mutateAsync({ poolId: pool.id!, mode, nextTitle })) as { next_pool_id?: string | null }
      toast.success(t("pool.closed"))
      onOpenChange(false)
      if (r?.next_pool_id) router.push(`/pools/${r.next_pool_id}`)
    } catch {
      toast.error(t("common.error"))
    }
  }

  const options: { mode: PoolSettleMode; label: MessageKey; hint: MessageKey }[] = short
    ? [{ mode: "COLLECT", label: "pool.settle.COLLECT", hint: "pool.settleHint.COLLECT" }]
    : [
        { mode: "REFUND", label: "pool.settle.REFUND", hint: "pool.settleHint.REFUND" },
        ...(surplus ? [{ mode: "ROLLOVER" as const, label: "pool.settle.ROLLOVER" as const, hint: "pool.settleHint.ROLLOVER" as const }] : []),
      ]

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("pool.close")} description={`${pool.title} · ${money(pool.remaining, pool.currency)}`}>
      <div className="space-y-4">
        <div className="space-y-2">
          {options.map((o) => (
            <button
              key={o.mode}
              type="button"
              onClick={() => setMode(o.mode)}
              aria-pressed={mode === o.mode}
              className={cn("w-full rounded-xl border px-4 py-3 text-left", mode === o.mode ? "border-primary bg-primary/5" : "hover:bg-muted/60")}
            >
              <span className="block text-sm font-medium">{t(o.label)}</span>
              <span className="block text-xs text-muted-foreground">{t(o.hint)}</span>
            </button>
          ))}
        </div>
        {mode === "ROLLOVER" ? (
          <div className="space-y-1.5">
            <Label htmlFor="pool-next">{t("pool.nextTitle")}</Label>
            <Input id="pool-next" className="h-11" maxLength={80} value={nextTitle} onChange={(e) => setNextTitle(e.target.value)} />
          </div>
        ) : (
          pool.remaining !== 0 && (
            <Card className="gap-0 divide-y py-0">
              {pool.members.map((m) => (
                <div key={m.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>{m.name}</span>
                  <span className="font-medium tabular-nums">{money(share(m), pool.currency)}</span>
                </div>
              ))}
            </Card>
          )
        )}
        <Button className="h-12 w-full text-base" onClick={() => void go()} disabled={settle.isPending}>
          {settle.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
          {t("pool.closeConfirm")}
        </Button>
      </div>
    </BottomSheet>
  )
}

export default function PoolPage() {
  const t = useT()
  const money = useMoney()
  const { id } = useParams<{ id: string }>()
  const { workspace } = useActiveWorkspace()
  const editable = canWrite(workspace)
  const query = usePool(id)
  const pool = query.data
  const walletsData = useWallets(workspace?.id).data
  const wallet = useMemo(() => (walletsData ?? []).filter((w) => w.id === pool?.wallet_id), [walletsData, pool?.wallet_id])
  const { sharing, telegramCode, telegramUnlink, khqrKey, markPaid, undoPaid, removeIdle } = usePoolMutations()
  const queryClient = useQueryClient()
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [contributeOpen, setContributeOpen] = useState(false)
  const [settleOpen, setSettleOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const locale = useLocaleStore((s) => s.locale)
  // Counts in Khmer digits for Khmer ("សមាជិក (៥)").
  const num = (n: number) => (locale === "km" ? khmerDigits(String(n)) : String(n))
  const [code, setCode] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState<string | null>(null)

  if (query.isLoading) return <Skeleton className="h-80 w-full rounded-xl" />
  if (!pool) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-muted-foreground">{t("pool.notFound")}</p>
        <Button asChild variant="outline">
          <Link href="/pools">{t("common.back")}</Link>
        </Button>
      </div>
    )
  }

  const active = pool.status === "active"
  // Only real participants: names added without a target that never paid are left out
  // (when the pool has targets at all — a rolled-over pool starts with none).
  const hasTargets = pool.members.some((m) => m.pledged > 0)
  const idle = hasTargets ? pool.members.filter((m) => m.pledged === 0 && m.paid === 0) : []
  const members = pool.members.filter((m) => !idle.includes(m))
  const owedAll = roundMoney(members.reduce((s, m) => s + Math.max(0, m.pledged - m.paid), 0), pool.currency)
  const owingCount = members.filter((m) => m.pledged - m.paid > 0).length
  const collectAll = () =>
    markPaid.mutate(
      { poolId: pool.id! },
      {
        onSuccess: (ids) =>
          toast.success(t("pool.collectedAll", { amount: money(owedAll, pool.currency), n: num(ids.length) }), {
            action: ids.length ? { label: t("pool.undo"), onClick: () => undoPaid.mutate(ids, { onError: () => toast.error(t("common.error")) }) } : undefined,
          }),
        onError: () => toast.error(t("common.error")),
      },
    )
  const link = pool.share_slug && typeof window !== "undefined" ? `${window.location.origin}/p/${pool.share_slug}` : null
  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      toast.success(t("pool.copied"))
    } catch {
      toast.error(t("common.error"))
    }
  }
  const shareLink = async () => {
    if (!link) return
    if (navigator.share) await navigator.share({ title: pool.title, url: link }).catch(() => {})
    else void copy()
  }
  const toggleSharing = (patch: { on: boolean; photos?: boolean; members?: boolean }) =>
    sharing.mutate({ poolId: pool.id!, ...patch }, { onError: () => toast.error(t("common.error")) })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <Button asChild size="icon" variant="ghost" aria-label={t("common.back")}>
          <Link href="/pools">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <span className="flex-1 text-sm text-muted-foreground">{t(`pool.kind.${pool.kind}` as MessageKey)}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", active ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
          {t(active ? "pool.active" : "pool.settled")}
        </span>
      </div>

      <Card className="gap-4 px-4 py-4">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <span aria-hidden>{poolEmoji(pool.kind)}</span>
          {pool.title}
        </h1>
        <div>
          <p className="text-sm text-muted-foreground">{t("pool.inPool")}</p>
          <p className={cn("text-4xl font-bold tracking-tight tabular-nums", pool.remaining < 0 && "text-rose-600")}>{money(pool.remaining, pool.currency)}</p>
          {pool.pooled > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {t("pool.pooledSpent", { pooled: money(pool.pooled, pool.currency), spent: money(pool.spent, pool.currency) })}
            </p>
          )}
        </div>
        {active && pool.pooled === 0 && <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm leading-relaxed text-muted-foreground">{t("pool.emptyHint")}</p>}
        {active && pool.topup_per_member !== null && (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            {t("pool.topupHint", { amount: money(pool.topup_per_member, pool.currency) })}
          </p>
        )}
        {active && editable && (
          <div className="grid grid-cols-2 gap-2">
            <Button className="h-12 bg-emerald-600 text-base text-white hover:bg-emerald-700" onClick={() => setContributeOpen(true)}>
              <PlusIcon />
              {t("pool.payIn")}
            </Button>
            <Button variant="outline" className="h-12 text-base" onClick={() => setExpenseOpen(true)} disabled={!wallet.length}>
              <MinusIcon />
              {t("pool.takeOut")}
            </Button>
          </div>
        )}
      </Card>

      {pool.settlement && (
        <Card className="gap-2 px-4 py-4">
          <p className="text-sm font-semibold">{t(`pool.settled.${pool.settlement.mode}` as MessageKey, { amount: money(Math.abs(pool.settlement.remaining), pool.currency) })}</p>
          {pool.settlement.shares.map((s) => (
            <div key={s.name} className="flex justify-between text-sm">
              <span>{s.name}</span>
              <span className="font-medium tabular-nums">{money(s.amount, pool.currency)}</span>
            </div>
          ))}
        </Card>
      )}

      <section className="space-y-2">
        <div className="flex items-end justify-between gap-2 px-1">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("pool.members")} ({num(members.length)})
            {editable && <span className="block text-[11px] font-normal">{t("pool.tapToRename")}</span>}
          </h2>
          {active && editable && owingCount > 1 && (
            <Button size="sm" variant="outline" className="h-9 border-emerald-600/40 text-emerald-700 tabular-nums dark:text-emerald-400" onClick={collectAll} disabled={markPaid.isPending}>
              {markPaid.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
              {t("pool.collectAll", { amount: money(owedAll, pool.currency) })}
            </Button>
          )}
        </div>
        <Card className="gap-0 divide-y overflow-hidden py-0">
          {members.map((m) => (
            <MemberRow key={m.id} pool={pool} m={m} editable={editable} />
          ))}
          {active && editable && (
            <button type="button" onClick={() => setAddOpen(true)} className="flex w-full items-center gap-2 px-4 py-3 text-sm text-primary hover:bg-muted/50">
              <UserPlusIcon className="size-4" aria-hidden />
              {t("pool.addMember")}
            </button>
          )}
        </Card>
        {editable && idle.length > 0 && (
          <button
            type="button"
            className="px-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
            disabled={removeIdle.isPending}
            onClick={() =>
              removeIdle.mutate(
                idle.map((m) => m.id!),
                { onSuccess: () => toast.success(t("pool.idleRemoved", { n: num(idle.length) })), onError: () => toast.error(t("common.error")) },
              )
            }
          >
            {t("pool.idleMembers", { n: num(idle.length) })}
          </button>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("pool.entries")}</h2>
        {pool.entries.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{t("pool.noEntries")}</p>
        ) : (
          <Card className="gap-0 divide-y overflow-hidden py-0">
            {pool.entries.slice(0, 100).map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-11 shrink-0 text-xs text-muted-foreground tabular-nums">{ddmm(e.date)}</span>
                <span className="min-w-0 flex-1 truncate">{e.note || e.category || "—"}</span>
                {e.receipt && <ImageIcon className="size-3.5 text-muted-foreground" aria-label={t("pool.hasReceipt")} />}
                <span className={cn("font-medium tabular-nums", e.type === "INCOME" && "text-emerald-600 dark:text-emerald-400")}>
                  {money(e.type === "INCOME" ? e.amt : -e.amt, pool.currency, { signed: true })}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>

      {editable && (
        <Card className="gap-3 px-4 py-4">
          <label className="flex items-center gap-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{t("pool.shareLink")}</span>
              <span className="block text-xs text-muted-foreground">{t("pool.shareHint")}</span>
            </span>
            <Switch checked={Boolean(pool.share_slug)} onCheckedChange={(on) => toggleSharing({ on })} disabled={sharing.isPending} aria-label={t("pool.shareLink")} />
          </label>
          {link && (
            <>
              <div className="flex gap-2">
                <Input readOnly value={link} className="h-10 text-xs" aria-label={t("pool.shareLink")} onFocus={(e) => e.target.select()} />
                <Button size="icon" variant="outline" className="size-10 shrink-0" onClick={() => void copy()} aria-label={t("pool.copy")}>
                  <CopyIcon />
                </Button>
                <Button size="icon" variant="outline" className="size-10 shrink-0" onClick={() => void shareLink()} aria-label={t("pool.share")}>
                  <Share2Icon />
                </Button>
              </div>
              <label className="flex items-center gap-3 text-sm">
                <span className="flex-1">{t("pool.sharePhotos")}</span>
                <Switch checked={pool.share_photos} onCheckedChange={(v) => toggleSharing({ on: true, photos: v })} aria-label={t("pool.sharePhotos")} />
              </label>
              <label className="flex items-center gap-3 text-sm">
                <span className="flex-1">{t("pool.shareMembers")}</span>
                <Switch checked={pool.share_members} onCheckedChange={(v) => toggleSharing({ on: true, members: v })} aria-label={t("pool.shareMembers")} />
              </label>
            </>
          )}
        </Card>
      )}

      {editable && active && (
        <Card className="gap-3 px-4 py-4">
          <p className="text-sm font-medium">{t("pool.telegram")}</p>
          {pool.tg_linked ? (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-sm text-emerald-700 dark:text-emerald-400">{t("pool.telegramLinked")}</p>
              <Button size="sm" variant="ghost" onClick={() => telegramUnlink.mutate(pool.id!, { onError: () => toast.error(t("common.error")) })}>
                <UnlinkIcon />
                {t("pool.unlink")}
              </Button>
            </div>
          ) : code ? (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">{t("pool.telegramSteps")}</p>
              <p className="rounded-xl bg-muted px-3 py-2 font-mono text-base">/pool link {code}</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{t("pool.telegramHint")}</p>
              <Button
                variant="outline"
                className="h-10"
                disabled={telegramCode.isPending}
                onClick={() => telegramCode.mutate(pool.id!, { onSuccess: setCode, onError: () => toast.error(t("common.error")) })}
              >
                {telegramCode.isPending && <Loader2Icon className="animate-spin" />}
                {t("pool.telegramConnect")}
              </Button>
            </>
          )}
        </Card>
      )}

      {editable && active && pool.tg_linked && (
        <Card className="gap-3 px-4 py-4">
          <p className="text-sm font-medium">{t("pool.autobok")}</p>
          <p className="text-xs text-muted-foreground">{t("pool.autobokHint")}</p>
          {apiKey ? (
            <div className="space-y-2">
              <p className="break-all rounded-xl bg-muted px-3 py-2 font-mono text-xs">{apiKey}</p>
              <Button
                variant="outline"
                className="h-10 w-full"
                onClick={() => {
                  void navigator.clipboard?.writeText(apiKey).then(() => toast.success(t("pool.autobokCopied")))
                }}
              >
                <CopyIcon />
                {t("pool.autobokCopy")}
              </Button>
              <p className="text-xs text-amber-700 dark:text-amber-400">{t("pool.autobokOnce")}</p>
            </div>
          ) : (
            <Button
              variant="outline"
              className="h-10"
              disabled={khqrKey.isPending}
              onClick={() => khqrKey.mutate(pool.id!, { onSuccess: setApiKey, onError: () => toast.error(t("common.error")) })}
            >
              {khqrKey.isPending && <Loader2Icon className="animate-spin" />}
              {t("pool.autobokCreate")}
            </Button>
          )}
        </Card>
      )}

      {editable && active && (
        <Button variant="outline" className="h-11 w-full" onClick={() => setSettleOpen(true)}>
          <CheckIcon />
          {t("pool.close")}
        </Button>
      )}

      {workspace?.id && wallet.length > 0 && <EntryFormSheet
          open={expenseOpen}
          onOpenChange={(v) => {
            setExpenseOpen(v)
            // The pool's picture comes from its wallet's entries.
            if (!v) void queryClient.invalidateQueries({ queryKey: ["pools"] })
          }} workspaceId={workspace.id} wallets={wallet} type="EXPENSE" />}
      {active && <ContributeSheet key={pool.members.length} pool={pool} open={contributeOpen} onOpenChange={setContributeOpen} />}
      {active && <SettleSheet pool={pool} open={settleOpen} onOpenChange={setSettleOpen} />}
      {active && <AddMemberSheet key={`add-${pool.members.length}`} pool={pool} open={addOpen} onOpenChange={setAddOpen} />}
    </div>
  )
}

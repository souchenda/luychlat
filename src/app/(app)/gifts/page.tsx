"use client"

import { Loader2Icon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { WalletSelect } from "@/components/wallets/wallet-select"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { canWrite, useActiveWorkspace, useProfile, usableWallets, useWallets } from "@/lib/data/hooks"
import type { Currency } from "@/lib/data/types"
import { toDateInput } from "@/lib/dates"
import { GIFT_EVENTS, giftEmoji, giftSummary, personKey, type Gift, type GiftDirection, type GiftEventType } from "@/lib/gift"
import { useGiftMutations, useGifts } from "@/lib/gifts"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const totals = (m: Partial<Record<Currency, number>>) =>
  (Object.entries(m) as [Currency, number][]).map(([c, n]) => formatMoney(n, c)).join(" + ") || "—"

function EventChips({ value, onChange, withAll }: { value: GiftEventType | "all"; onChange: (v: GiftEventType | "all") => void; withAll?: boolean }) {
  const t = useT()
  const options: (GiftEventType | "all")[] = [...(withAll ? (["all"] as const) : []), ...GIFT_EVENTS.map((e) => e.type)]
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", value === o ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted/60")}
        >
          {o === "all" ? t("gift.all") : `${giftEmoji(o)} ${t(`gift.event.${o}` as MessageKey)}`}
        </button>
      ))}
    </div>
  )
}

/** New gift (given or received), optionally also a wallet entry. */
function AddGiftSheet({ open, onOpenChange, workspaceId, direction: initial, people }: { open: boolean; onOpenChange: (v: boolean) => void; workspaceId: string; direction: GiftDirection; people: string[] }) {
  const t = useT()
  const { add } = useGiftMutations(workspaceId)
  const me = useProfile().data?.id
  const walletsData = useWallets(workspaceId).data
  const wallets = useMemo(() => usableWallets(walletsData ?? [], me).filter((w) => !w.archived_at), [walletsData, me])
  const [direction, setDirection] = useState<GiftDirection>(initial)
  const [person, setPerson] = useState("")
  const [phone, setPhone] = useState("")
  const [eventType, setEventType] = useState<GiftEventType>("wedding")
  const [title, setTitle] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState<Currency>("USD")
  const [date, setDate] = useState(toDateInput(new Date().toISOString()))
  const [useWallet, setUseWallet] = useState(true)
  const [walletId, setWalletId] = useState("")
  const [notes, setNotes] = useState("")

  useEffect(() => {
    if (!open) return
    setDirection(initial)
    setPerson("")
    setPhone("")
    setTitle("")
    setAmount("")
    setNotes("")
    setDate(toDateInput(new Date().toISOString()))
    setUseWallet(true)
  }, [open, initial])
  useEffect(() => {
    if (!walletId && wallets.length) setWalletId((wallets.find((w) => w.currency === currency) ?? wallets[0]).id)
  }, [wallets, walletId, currency])

  const submit = async () => {
    const value = roundMoney(parseAmount(amount), currency)
    if (!person.trim()) return void toast.error(t("gift.needPerson"))
    if (!(value > 0)) return void toast.error(t("walletForm.amountInvalid"))
    try {
      await add.mutateAsync({
        direction,
        person: person.trim(),
        phone: phone.trim() || null,
        eventType,
        title: title.trim() || null,
        amount: value,
        currency,
        date,
        walletId: useWallet && wallets.length ? walletId || null : null,
        notes: notes.trim() || null,
      })
      toast.success(t("gift.saved"))
      onOpenChange(false)
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("gift.add")}>
      <div className="space-y-4">
        <Segmented
          value={direction}
          onChange={setDirection}
          aria-label={t("gift.direction")}
          options={[
            { value: "given", label: t("gift.tabGiven") },
            { value: "received", label: t("gift.tabReceived") },
          ]}
        />
        <div className="grid grid-cols-[1fr_9rem] gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="gift-person">{t("gift.person")}</Label>
            <Input id="gift-person" className="h-11" list="gift-people" maxLength={255} placeholder={t("gift.personPlaceholder")} value={person} onChange={(e) => setPerson(e.target.value)} />
            <datalist id="gift-people">
              {people.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gift-phone">{t("gift.phone")}</Label>
            <Input id="gift-phone" className="h-11" inputMode="tel" maxLength={50} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("gift.eventType")}</Label>
          <EventChips value={eventType} onChange={(v) => v !== "all" && setEventType(v)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gift-title">{t("gift.title")}</Label>
          <Input id="gift-title" className="h-11" maxLength={255} placeholder={t("gift.titlePlaceholder")} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="gift-amount">{t("gift.amount")}</Label>
            <Input id="gift-amount" className="h-11 text-lg font-semibold tabular-nums" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("gift.currency")}</Label>
            <Segmented
              value={currency}
              onChange={setCurrency}
              aria-label={t("gift.currency")}
              options={[
                { value: "USD", label: "$" },
                { value: "KHR", label: "៛" },
              ]}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gift-date">{t("gift.date")}</Label>
          <Input id="gift-date" type="date" className="h-11" max="9999-12-31" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-3 rounded-xl border p-3">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]" checked={useWallet} onChange={(e) => setUseWallet(e.target.checked)} />
            <span>
              <span className="block font-medium">{t(direction === "given" ? "gift.deduct" : "gift.addToWallet")}</span>
              <span className="block text-xs text-muted-foreground">{t("gift.recordOnlyHint")}</span>
            </span>
          </label>
          {useWallet &&
            (wallets.length ? (
              <WalletSelect wallets={wallets} value={walletId} onChange={setWalletId} label={t(direction === "given" ? "gift.deduct" : "gift.addToWallet")} />
            ) : (
              <p className="text-sm text-muted-foreground">{t("entry.noWallet")}</p>
            ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gift-notes">{t("entry.note")}</Label>
          <Input id="gift-notes" className="h-11" maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <Button className="h-12 w-full text-base" onClick={() => void submit()} disabled={add.isPending}>
          {add.isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          {t("gift.save")}
        </Button>
      </div>
    </BottomSheet>
  )
}

/** The two-way picture with one person and what to give back. */
function PersonCard({ name, entries }: { name: string; entries: Gift[] }) {
  const t = useT()
  const s = giftSummary(entries)
  return (
    <Card className="gap-2 px-4 py-3">
      <p className="font-semibold">👤 {name}</p>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-emerald-500/10 px-3 py-2">
          <p className="text-xs text-muted-foreground">{t("gift.theyGave", { count: s.countReceived })}</p>
          <p className="font-semibold tabular-nums">{totals(s.received)}</p>
        </div>
        <div className="rounded-xl bg-muted/60 px-3 py-2">
          <p className="text-xs text-muted-foreground">{t("gift.weGave", { count: s.countGiven })}</p>
          <p className="font-semibold tabular-nums">{totals(s.given)}</p>
        </div>
      </div>
      {s.suggestion && (
        <p className="rounded-xl bg-primary/5 px-3 py-2 text-sm">
          💡 {t(s.suggestion.basis === "they_gave" ? "gift.suggestBack" : "gift.suggestSame", { amount: formatMoney(s.suggestion.amount, s.suggestion.currency) })}
          {s.lastReceived && s.suggestion.basis === "they_gave" && (
            <span className="block text-xs text-muted-foreground">
              {giftEmoji(s.lastReceived.event_type)} {t(`gift.event.${s.lastReceived.event_type}` as MessageKey)} · {ddmmyyyy(s.lastReceived.event_date)}
            </span>
          )}
        </p>
      )}
    </Card>
  )
}

export default function GiftsPage() {
  const t = useT()
  const { workspace } = useActiveWorkspace()
  const ws = workspace?.id
  const editable = canWrite(workspace)
  const gifts = useGifts(ws)
  const { remove } = useGiftMutations(ws)
  const [tab, setTab] = useState<GiftDirection>("given")
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<GiftEventType | "all">("all")
  const [addOpen, setAddOpen] = useState(false)
  const all = useMemo(() => gifts.data ?? [], [gifts.data])

  const people = useMemo(() => [...new Map(all.map((g) => [personKey(g.person_name), g.person_name])).values()], [all])
  const q = personKey(search)
  const matches = q ? all.filter((g) => personKey(g.person_name).includes(q)) : []
  const matchedPeople = [...new Map(matches.map((g) => [personKey(g.person_name), g.person_name])).entries()].slice(0, 5)
  const list = all.filter((g) => g.direction === tab && (filter === "all" || g.event_type === filter) && (!q || personKey(g.person_name).includes(q)))
  const tabTotal = list.reduce<Partial<Record<Currency, number>>>((m, g) => ({ ...m, [g.currency]: (m[g.currency] ?? 0) + g.amount }), {})

  const del = async (g: Gift) => {
    if (!window.confirm(t(g.transaction_id ? "gift.deleteConfirmWallet" : "gift.deleteConfirm"))) return
    try {
      await remove.mutateAsync(g.id!)
      toast.success(t("gift.deleted"))
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{t("gift.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("gift.pageHint")}</p>
        </div>
        {editable && (
          <Button onClick={() => setAddOpen(true)}>
            <PlusIcon />
            {t("gift.add")}
          </Button>
        )}
      </div>

      <div className="relative">
        <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input className="h-11 pl-9" placeholder={t("gift.search")} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t("gift.search")} />
      </div>
      {matchedPeople.map(([key, name]) => (
        <PersonCard key={key} name={name} entries={matches.filter((g) => personKey(g.person_name) === key)} />
      ))}

      <Segmented
        value={tab}
        onChange={setTab}
        aria-label={t("gift.direction")}
        options={[
          { value: "given", label: t("gift.tabGiven") },
          { value: "received", label: t("gift.tabReceived") },
        ]}
      />
      <EventChips value={filter} onChange={setFilter} withAll />

      {gifts.isLoading ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("gift.empty")}</p>
      ) : (
        <>
          <p className="px-1 text-xs text-muted-foreground">{t("gift.tabTotal", { count: list.length, amount: totals(tabTotal) })}</p>
          <Card className="gap-0 divide-y overflow-hidden py-0">
            {list.map((g) => (
              <div key={g.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-lg" aria-hidden>
                  {giftEmoji(g.event_type)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{g.person_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[g.event_title || t(`gift.event.${g.event_type}` as MessageKey), ddmmyyyy(g.event_date), g.transaction_id ? t("gift.inWallet") : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className={cn("text-sm font-semibold tabular-nums", g.direction === "received" && "text-emerald-600 dark:text-emerald-400")}>{formatMoney(g.amount, g.currency)}</span>
                {editable && (
                  <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => void del(g)} aria-label={t("common.delete")}>
                    <Trash2Icon className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </Card>
        </>
      )}

      {ws && <AddGiftSheet open={addOpen} onOpenChange={setAddOpen} workspaceId={ws} direction={tab} people={people} />}
    </div>
  )
}

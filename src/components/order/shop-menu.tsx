"use client"

import { Loader2Icon, MinusIcon, PlusIcon, ShoppingBagIcon, StoreIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { formatMoney } from "@/lib/money"
import { addToCart, cartTotal, defaultChoices, pickupSlots, setQty, validPhone, type CartLine, type MenuItem } from "@/lib/order-ahead"
import { cn } from "@/lib/utils"

type Menu = { status: "open" | "closed"; shop?: { name: string }; lead_minutes?: number; note?: string | null; items?: MenuItem[] }

/**
 * A shop's public menu (founder, 4/11/2026 — docs/order-ahead.md): pick, choose the options, a pickup time, a name and a
 * phone, then «កម្មង់» → the order page to pay. Khmer first with English, no sign-in, phone-first. The prices shown are the
 * menu's; the server prices the order again.
 */
export function ShopMenu({ slug }: { slug: string }) {
  const router = useRouter()
  const [menu, setMenu] = useState<Menu | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [picking, setPicking] = useState<MenuItem | null>(null)
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [checkout, setCheckout] = useState(false)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [pickup, setPickup] = useState("")
  const [note, setNote] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetch(`/api/order/${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((m: Menu) => setMenu(m))
      .catch(() => setMenu({ status: "closed" }))
  }, [slug])

  const items = useMemo(() => menu?.items ?? [], [menu])
  const total = cartTotal(cart, items)
  const count = cart.reduce((a, l) => a + l.qty, 0)
  const slots = useMemo(() => pickupSlots(Date.now(), menu?.lead_minutes ?? 15), [menu?.lead_minutes])

  if (!menu) return <Centered><Loader2Icon className="size-6 animate-spin text-muted-foreground" /></Centered>
  if (menu.status !== "open") return <Centered><p className="text-center text-sm text-muted-foreground">ហាងនេះមិនទាន់បើកទទួលការកម្មង់ទេ<br />This shop isn&apos;t taking orders right now</p></Centered>

  const open = (item: MenuItem) => {
    if (!item.options.length) return setCart((c) => addToCart(c, item.id, {}))
    setPicking(item)
    setChoices(defaultChoices(item))
  }

  const send = async () => {
    setError(null)
    if (!name.trim()) return setError("សូមដាក់ឈ្មោះ · Please enter your name")
    if (!validPhone(phone)) return setError("សូមដាក់លេខទូរស័ព្ទ · Please enter a phone number")
    if (!pickup) return setError("សូមជ្រើសម៉ោងមកយក · Please choose a pickup time")
    setSending(true)
    try {
      const res = await fetch(`/api/order/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart.map((l) => ({ id: l.id, qty: l.qty, choices: l.choices })), name, phone, pickup, note }),
      })
      const r = (await res.json()) as { status: string; token?: string; reason?: string }
      if (r.status === "ok" && r.token) return router.push(`/o/${r.token}`)
      setError(r.reason === "pickup" ? "ម៉ោងនេះលឿនពេក — សូមជ្រើសម៉ោងផ្សេង · Please choose a later time" : "កម្មង់មិនបានទេ — សូមព្យាយាមម្តងទៀត · Couldn't place the order, please try again")
    } catch {
      setError("កម្មង់មិនបានទេ — សូមព្យាយាមម្តងទៀត · Couldn't place the order, please try again")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-background px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-32">
      <header className="mb-4 flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
          <StoreIcon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">{menu.shop?.name}</h1>
          <p className="text-xs text-muted-foreground">កម្មង់ទុកមុន មកយកមិនចាំបាច់តម្រង់ជួរ · Order ahead, skip the line</p>
        </div>
      </header>
      {menu.note && <p className="mb-3 rounded-xl bg-muted px-3 py-2 text-sm">{menu.note}</p>}

      {!checkout ? (
        <ul className="space-y-2">
          {items.map((item) => {
            const inCart = cart.filter((l) => l.id === item.id).reduce((a, l) => a + l.qty, 0)
            return (
              <li key={item.id}>
                <button type="button" onClick={() => open(item)} className="flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition-transform active:scale-[0.99]">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{item.name}</span>
                    {item.description && <span className="block text-xs text-muted-foreground">{item.description}</span>}
                    <span className="mt-0.5 block text-sm font-medium text-primary tabular-nums">{formatMoney(item.price, item.currency)}</span>
                  </span>
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", inCart ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")}>
                    {inCart ? <span className="text-sm font-bold tabular-nums">{inCart}</span> : <PlusIcon className="size-5" />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="space-y-4">
          <ul className="divide-y rounded-2xl border bg-card">
            {cart.map((l) => {
              const item = items.find((m) => m.id === l.id)
              if (!item) return null
              const opts = Object.values(l.choices).join(" · ")
              return (
                <li key={l.key} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{item.name}</span>
                    {opts && <span className="block text-xs text-muted-foreground">{opts}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <button type="button" aria-label="-" onClick={() => setCart((c) => setQty(c, l.key, l.qty - 1))} className="grid size-9 place-items-center rounded-full bg-muted"><MinusIcon className="size-4" /></button>
                    <span className="w-5 text-center font-semibold tabular-nums">{l.qty}</span>
                    <button type="button" aria-label="+" onClick={() => setCart((c) => setQty(c, l.key, l.qty + 1))} className="grid size-9 place-items-center rounded-full bg-muted"><PlusIcon className="size-4" /></button>
                  </span>
                </li>
              )
            })}
          </ul>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">ម៉ោងមកយក · Pickup time</span>
            <select value={pickup} onChange={(e) => setPickup(e.target.value)} className="h-12 w-full rounded-xl border bg-background px-3 text-base">
              <option value="">—</option>
              {slots.map((s) => (
                <option key={s.iso} value={s.iso}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">ឈ្មោះ · Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" className="h-12 w-full rounded-xl border bg-background px-3 text-base" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">លេខទូរស័ព្ទ · Phone</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={16} className="h-12 w-full rounded-xl border bg-background px-3 text-base" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">ចំណាំ (បើមាន) · Note (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="h-12 w-full rounded-xl border bg-background px-3 text-base" />
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">ឈ្មោះ និងលេខទូរស័ព្ទ ផ្ញើទៅហាងនេះតែប៉ុណ្ណោះ ដើម្បីហៅបងពេលរួចរាល់។ · Your name and phone go to this shop only, to call you when it&apos;s ready.</p>
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
        </div>
      )}

      {/* The choices of one item: one tap per option. */}
      {picking && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setPicking(null)}>
          <div className="mx-auto w-full max-w-md space-y-4 rounded-t-3xl bg-background px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+1rem)]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{picking.name}</h2>
            {picking.options.map((o) => (
              <div key={o.name} className="space-y-2">
                <p className="text-sm font-medium">{o.name}</p>
                <div className="flex flex-wrap gap-2">
                  {o.choices.map((c) => (
                    <button key={c} type="button" onClick={() => setChoices((x) => ({ ...x, [o.name]: c }))} className={cn("h-11 min-w-14 rounded-full border px-4 text-sm font-medium", choices[o.name] === c ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <Button type="button" className="h-12 w-full rounded-2xl text-base" onClick={() => { setCart((c) => addToCart(c, picking.id, choices)); setPicking(null) }}>
              <PlusIcon /> ដាក់ក្នុងកន្ត្រក · Add · {formatMoney(picking.price, picking.currency)}
            </Button>
          </div>
        </div>
      )}

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur">
          <div className="mx-auto flex max-w-md items-center gap-3">
            {checkout && <Button type="button" variant="outline" className="h-12 rounded-2xl" onClick={() => setCheckout(false)}>← ម៉ឺនុយ</Button>}
            <Button type="button" className="h-12 flex-1 rounded-2xl text-base" disabled={sending || !total} onClick={() => (checkout ? void send() : setCheckout(true))}>
              {sending ? <Loader2Icon className="animate-spin" /> : <ShoppingBagIcon />}
              {checkout ? "កម្មង់ និងបង់ប្រាក់ · Order & pay" : `មើលកន្ត្រក (${count}) · Cart`}
              {total && <span className="ml-auto tabular-nums">{formatMoney(total.total, total.currency)}</span>}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center px-6">{children}</div>
}

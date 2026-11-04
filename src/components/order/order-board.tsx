"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ClockIcon, CopyIcon, CrownIcon, Loader2Icon, PhoneIcon, UtensilsCrossedIcon, XIcon } from "lucide-react"
import Link from "next/link"
import QRCode from "qrcode"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useActiveWorkspace } from "@/lib/data/hooks"
import { formatMoney } from "@/lib/money"
import { nextStep, ORDER_STATE_LABEL, slugFrom, validSlug, type OrderState } from "@/lib/order-ahead"
import { usePlan, useUpgradeStore } from "@/lib/plan"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type Shop = { workspace_id: string; slug: string; enabled: boolean; khqr_code_id: string | null; lead_minutes: number; note: string | null }
type Code = { id: string; bank_code: string; currency: "USD" | "KHR"; merchant_name: string | null; is_default: boolean }
type Order = { id: string; code: string; items: { name: string; qty: number; choices: Record<string, string> }[]; total: number; currency: "USD" | "KHR"; customer_name: string; customer_phone: string; pickup_at: string; status: OrderState; created_at: string }

const SITE = "https://app.luychlat.com"
const hhmm = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(11, 16)
const todayStart = () => new Date(Date.parse(`${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)}T00:00:00+07:00`)).toISOString()
const NEXT_LABEL: Partial<Record<OrderState, string>> = { PAID: "បានទទួលលុយ", ACCEPTED: "ទទួល — ចាប់ផ្តើមរៀបចំ", READY: "រួចរាល់ — ហៅអតិថិជន", PICKED_UP: "បានយករួច" }

/**
 * «ការកម្មង់» for the shop (founder, 4/11/2026 — docs/order-ahead.md): the public link and QR, the settings (on / off, the
 * KHQR, the lead time), and today's orders with one tap to the next step. ULTRA only — the database refuses customers'
 * orders otherwise. Phase 1: the shop confirms «បានទទួលលុយ» when its bank shows the payment.
 */
export function OrderBoard() {
  const { workspace } = useActiveWorkspace()
  const ws = workspace?.id
  const { isUltra, loading } = usePlan()
  const queryClient = useQueryClient()
  const db = getSupabaseBrowserClient()
  const shop = useQuery({
    queryKey: ["order-shop", ws],
    enabled: Boolean(ws && db),
    queryFn: async () => ((await db!.from("order_shops").select("*").eq("workspace_id", ws!).maybeSingle()).data as Shop | null),
  })
  const codes = useQuery({
    queryKey: ["order-khqr-codes", ws],
    enabled: Boolean(ws && db),
    queryFn: async () => ((await db!.from("workspace_khqr_codes").select("id, bank_code, currency, merchant_name, is_default").eq("workspace_id", ws!)).data as Code[] | null) ?? [],
  })
  const orders = useQuery({
    queryKey: ["customer-orders", ws],
    enabled: Boolean(ws && db && shop.data),
    refetchInterval: 15_000,
    queryFn: async () =>
      ((await db!.from("customer_orders").select("id, code, items, total, currency, customer_name, customer_phone, pickup_at, status, created_at").eq("workspace_id", ws!).gte("created_at", todayStart()).order("created_at", { ascending: false })).data as Order[] | null) ?? [],
  })
  const [form, setForm] = useState<{ slug: string; enabled: boolean; khqr: string; lead: string } | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (shop.isLoading || form || !workspace) return
    const s = shop.data
    setForm({ slug: s?.slug ?? slugFrom(workspace.name), enabled: s?.enabled ?? false, khqr: s?.khqr_code_id ?? "", lead: String(s?.lead_minutes ?? 15) })
  }, [shop.isLoading, shop.data, workspace, form])

  const link = shop.data ? `${SITE}/s/${shop.data.slug}` : null
  useEffect(() => {
    if (link) void QRCode.toDataURL(link, { width: 480, margin: 2 }).then(setQr)
  }, [link])

  if (workspace && workspace.type !== "BUSINESS") return <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">ទំព័រនេះសម្រាប់គណនីអាជីវកម្មប៉ុណ្ណោះ</p>
  if (!loading && !isUltra)
    return (
      <Card className="items-center gap-3 px-6 py-8 text-center">
        <CrownIcon className="size-8 text-amber-500" aria-hidden />
        <p className="font-semibold">កម្មង់ទុកមុន សម្រាប់កញ្ចប់ ULTRA</p>
        <p className="text-sm text-muted-foreground">អតិថិជនកម្មង់ និងបង់តាម KHQR ទុកមុន មកយកមិនចាំបាច់តម្រង់ជួរ</p>
        <Button type="button" onClick={() => useUpgradeStore.getState().show("business")}>
          ជាវ ULTRA
        </Button>
      </Card>
    )
  if (!form) return <Loader2Icon className="mx-auto size-6 animate-spin text-muted-foreground" />

  const save = async () => {
    if (!validSlug(form.slug)) return toast.error("ឈ្មោះ link ត្រូវជាអក្សរឡាតាំង លេខ និង - (3–40 តួ)")
    const row = { workspace_id: ws!, slug: form.slug, enabled: form.enabled, khqr_code_id: form.khqr || null, lead_minutes: Number(form.lead), updated_at: new Date().toISOString() }
    const { error } = shop.data ? await db!.from("order_shops").update(row).eq("workspace_id", ws!) : await db!.from("order_shops").insert(row)
    if (error) return toast.error(/duplicate|unique/i.test(error.message) ? "ឈ្មោះ link នេះមានហាងផ្សេងប្រើហើយ" : "រក្សាទុកមិនបានទេ")
    toast.success("បានរក្សាទុក")
    void queryClient.invalidateQueries({ queryKey: ["order-shop", ws] })
  }

  const step = async (o: Order, to: OrderState) => {
    setBusy(o.id)
    const { data, error } = await db!.rpc("order_set_status", { p_order: o.id, p_status: to })
    setBusy(null)
    if (error || (data as { status?: string } | null)?.status !== "ok") return toast.error("ប្តូរស្ថានភាពមិនបានទេ")
    void queryClient.invalidateQueries({ queryKey: ["customer-orders", ws] })
  }

  const live = (orders.data ?? []).filter((o) => o.status !== "PICKED_UP" && o.status !== "CANCELLED")
  const done = (orders.data ?? []).filter((o) => o.status === "PICKED_UP" || o.status === "CANCELLED")

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">ការកម្មង់ទុកមុន</h1>
        <Button asChild size="sm" variant="outline">
          <Link href="/business/menu">
            <UtensilsCrossedIcon /> Menu
          </Link>
        </Button>
      </div>

      {shop.data && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-medium text-muted-foreground">ថ្ងៃនេះ ({live.length} កំពុងដំណើរការ)</h2>
          {live.length === 0 && <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">មិនទាន់មានការកម្មង់ទេ</p>}
          {live.map((o) => {
            const next = nextStep(o.status)
            return (
              <Card key={o.id} className={cn("gap-2 px-4 py-3", o.status === "READY" && "border-emerald-400")}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xl font-extrabold tabular-nums">{o.code}</span>
                  <span className="text-sm font-semibold tabular-nums">{formatMoney(Number(o.total), o.currency)}</span>
                </div>
                <p className="text-sm">
                  {o.customer_name} · <ClockIcon className="inline size-3.5 align-[-2px]" aria-hidden /> {hhmm(o.pickup_at)} ·{" "}
                  <a href={`tel:${o.customer_phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-primary">
                    <PhoneIcon className="size-3.5" /> {o.customer_phone}
                  </a>
                </p>
                <ul className="text-sm text-muted-foreground">
                  {o.items.map((l, i) => (
                    <li key={i}>
                      {l.qty} × {l.name}
                      {Object.values(l.choices ?? {}).length ? ` (${Object.values(l.choices).join(" · ")})` : ""}
                    </li>
                  ))}
                </ul>
                <p className={cn("text-xs font-medium", o.status === "PENDING_PAYMENT" ? "text-amber-600" : "text-emerald-700 dark:text-emerald-400")}>{ORDER_STATE_LABEL[o.status]}</p>
                <div className="flex gap-2">
                  {next && (
                    <Button type="button" className="h-11 flex-1 rounded-xl" disabled={busy === o.id} onClick={() => void step(o, next)}>
                      {NEXT_LABEL[next]}
                    </Button>
                  )}
                  <Button type="button" variant="outline" className="h-11 rounded-xl" aria-label="បោះបង់" disabled={busy === o.id} onClick={() => window.confirm(`បោះបង់ ${o.code}?`) && void step(o, "CANCELLED")}>
                    <XIcon />
                  </Button>
                </div>
              </Card>
            )
          })}
          {done.length > 0 && <p className="px-1 text-xs text-muted-foreground">រួចរាល់ ឬបោះបង់ថ្ងៃនេះ៖ {done.map((o) => o.code).join(", ")}</p>}
        </section>
      )}

      <Card className="gap-3 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">បើកទទួលការកម្មង់</p>
            <p className="text-xs text-muted-foreground">អតិថិជនកម្មង់ និងបង់តាម link ឬ QR ខាងក្រោម</p>
          </div>
          <Switch checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} aria-label="បើកទទួលការកម្មង់" />
        </div>
        <label className="block space-y-1">
          <span className="text-sm">ឈ្មោះ link</span>
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            app.luychlat.com/s/
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} className="h-11 min-w-0 flex-1 rounded-lg border bg-background px-2 text-foreground" />
          </span>
        </label>
        <label className="block space-y-1">
          <span className="text-sm">KHQR សម្រាប់ទទួលលុយ</span>
          <select value={form.khqr} onChange={(e) => setForm({ ...form, khqr: e.target.value })} className="h-11 w-full rounded-lg border bg-background px-2">
            <option value="">លំនាំដើម (តាមរូបិយប័ណ្ណ)</option>
            {(codes.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.bank_code} · {c.currency} {c.merchant_name ? `· ${c.merchant_name}` : ""}
              </option>
            ))}
          </select>
          {codes.data && codes.data.length === 0 && <span className="block text-xs text-amber-700">មិនទាន់មាន KHQR — បញ្ចូលនៅទំព័រ SoundBox ឬវិក្កយបត្រ KHQR</span>}
        </label>
        <div className="space-y-1">
          <span className="text-sm">ពេលរៀបចំយ៉ាងតិច</span>
          <Segmented value={form.lead} onChange={(lead) => setForm({ ...form, lead })} options={[{ value: "10", label: "10 នាទី" }, { value: "15", label: "15 នាទី" }, { value: "30", label: "30 នាទី" }]} aria-label="ពេលរៀបចំយ៉ាងតិច" />
        </div>
        <Button type="button" onClick={() => void save()}>
          រក្សាទុក
        </Button>
      </Card>

      {link && (
        <Card className="items-center gap-3 px-4 py-4 text-center">
          <p className="text-sm font-semibold">Link និង QR របស់ហាង — បិទនៅតុ ឬផ្ញើទៅអតិថិជន</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL drawn here */}
          {qr && <img src={qr} alt="QR" className="aspect-square w-48 rounded-xl bg-white p-2" />}
          <Button type="button" variant="outline" onClick={() => void navigator.clipboard?.writeText(link).then(() => toast.success("បានចម្លង link"))}>
            <CopyIcon /> {link.replace("https://", "")}
          </Button>
          {!shop.data?.enabled && <p className="text-xs text-amber-700">ហាងកំពុងបិទ — អតិថិជនមិនទាន់កម្មង់បានទេ</p>}
        </Card>
      )}
    </div>
  )
}

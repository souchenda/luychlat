import { createClient } from "@supabase/supabase-js"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import QRCode from "qrcode"

import { PoolGauge } from "@/components/pools/pool-gauge"
import { PoolAutoRefresh } from "@/components/pools/pool-auto-refresh"
import { isKhqr } from "@/lib/khqr"
import { formatMoney } from "@/lib/money"
import { poolEmoji, toSnapshot, type PoolKind, type PoolSnapshot } from "@/lib/pool"
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config"

// Live numbers on every visit; never cached, never indexed.
export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "បេឡារួម · LuyChlat", robots: { index: false, follow: false } }

const KIND: Record<PoolKind, string> = {
  FESTIVAL: "បុណ្យប្រពៃណី · Festival",
  FAMILY: "ជួបជុំគ្រួសារ · Family gathering",
  TRIP: "ដំណើរកម្សាន្ត · Trip",
  GENERAL: "មូលនិធិរួម · Group fund",
}
const GAUGE: Record<PoolSnapshot["gauge"], string> = { safe: "គ្រប់គ្រាន់ · Enough", caution: "ប្រយ័ត្ន · Caution", low: "ជិតអស់ · Low" }
const ddmm = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000)
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

/**
 * The public, read-only page of a shared pool (/p/<slug>): what was pooled,
 * spent and is left, the expenses, and — when the keeper allowed it — the
 * members and receipt photos. No account needed; the slug is random and the
 * keeper can switch it off any time. Only this pool's wallet is shown.
 */
export default async function PublicPoolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!/^[a-f0-9]{32}$/.test(slug)) notFound()
  const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data } = await supabase.rpc("pool_public", { p_slug: slug })
  if (!data) notFound()
  const pool = toSnapshot(data as PoolSnapshot)

  // Receipt photos (only when shared): short-lived links.
  const paths = pool.entries.flatMap((e) => (e.receipt ? [e.receipt] : []))
  const photoUrl = new Map<string, string>()
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("receipts").createSignedUrls(paths, 15 * 60)
    for (const s of signed ?? []) if (s.path && s.signedUrl) photoUrl.set(s.path, s.signedUrl)
  }
  const khqrSvg = pool.khqr && isKhqr(pool.khqr) ? await QRCode.toString(pool.khqr, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) : null
  const settlement = pool.settlement
  const money = (n: number) => formatMoney(n, pool.currency)

  return (
    <main className="mx-auto min-h-dvh max-w-lg space-y-4 bg-background px-4 py-6">
      <PoolAutoRefresh />
      <header className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">{KIND[pool.kind]}</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <span aria-hidden>{poolEmoji(pool.kind)}</span>
          {pool.title}
        </h1>
        {pool.keeper && <p className="text-sm text-muted-foreground">អ្នករក្សាលុយ · Keeper: {pool.keeper}</p>}
      </header>

      <section className="rounded-2xl border bg-card p-4">
        <PoolGauge pool={pool} labels={{ status: GAUGE[pool.gauge], pooled: "លុយរួម · Pooled", spent: "បានចាយ · Spent", remaining: "នៅសល់ · Remaining" }} />
        {pool.status === "active" && pool.topup_per_member !== null && (
          <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            ⚠️ សូមរៃបន្ថែមម្នាក់ {money(pool.topup_per_member)} · Suggested top-up per person
          </p>
        )}
      </section>

      {settlement && (
        <section className="space-y-2 rounded-2xl border bg-card p-4">
          <h2 className="font-semibold">
            {settlement.mode === "REFUND"
              ? `✅ បិទបញ្ជី · សល់ ${money(settlement.remaining)} ប្រគល់ជូនវិញ`
              : settlement.mode === "COLLECT"
                ? `📥 បិទបញ្ជី · ខ្វះ ${money(Math.abs(settlement.remaining))} សូមរៃបន្ថែម`
                : `🔁 សល់ ${money(settlement.remaining)} ផ្ទេរទៅបេឡាបន្ទាប់`}
          </h2>
          {settlement.shares.map((s) => (
            <div key={s.name} className="flex justify-between text-sm">
              <span>{s.name}</span>
              <span className="font-medium tabular-nums">{money(s.amount)}</span>
            </div>
          ))}
        </section>
      )}

      {khqrSvg && (
        <section className="space-y-2 rounded-2xl border bg-card p-4 text-center">
          <p className="text-sm font-semibold">ស្កេនបង់ជូនអ្នករក្សាលុយ · Scan to pay the keeper</p>
          <div className="mx-auto w-56 rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: khqrSvg }} />
          <p className="text-xs text-muted-foreground">KHQR</p>
        </section>
      )}

      {!pool.members_hidden && pool.members.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-medium text-muted-foreground">សមាជិក · Members</h2>
          <div className="divide-y rounded-2xl border bg-card">
            {pool.members.map((m, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>{m.name}</span>
                <span className="tabular-nums">
                  {money(m.paid)}
                  {m.pledged > 0 && <span className="text-muted-foreground"> / {money(m.pledged)}</span>}
                  {m.pledged > 0 && m.paid >= m.pledged && " ✅"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-medium text-muted-foreground">ចំណូល និងចំណាយ · Entries</h2>
        {pool.entries.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">មិនទាន់មាន · Nothing yet</p>
        ) : (
          <div className="divide-y rounded-2xl border bg-card">
            {pool.entries.map((e, i) => {
              const url = e.receipt ? photoUrl.get(e.receipt) : undefined
              return (
                <div key={i} className="space-y-2 px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="w-11 shrink-0 text-xs text-muted-foreground tabular-nums">{ddmm(e.date)}</span>
                    <span className="min-w-0 flex-1 truncate">{e.note || e.category || "—"}</span>
                    <span className={e.type === "INCOME" ? "font-medium text-emerald-600 tabular-nums dark:text-emerald-400" : "font-medium tabular-nums"}>
                      {formatMoney(e.type === "INCOME" ? e.amt : -e.amt, pool.currency, { signed: true })}
                    </span>
                  </div>
                  {url && (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="block w-24 overflow-hidden rounded-lg border">
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                      <img src={url} alt="" className="h-24 w-24 object-cover" loading="lazy" />
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <footer className="pt-2 text-center text-xs text-muted-foreground">
        ទំព័រនេះអានបានតែប៉ុណ្ណោះ · Read-only, updates by itself
        <br />
        <Link href="/" className="font-medium text-primary">
          LuyChlat · លុយឆ្លាត
        </Link>
      </footer>
    </main>
  )
}

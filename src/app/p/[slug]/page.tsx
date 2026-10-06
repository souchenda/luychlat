import { createClient } from "@supabase/supabase-js"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import QRCode from "qrcode"

import { PoolGauge } from "@/components/pools/pool-gauge"
import { PoolAutoRefresh } from "@/components/pools/pool-auto-refresh"
import { PublicPoolDisclaimer } from "@/components/pools/public-pool-disclaimer"
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
  CHARITY: "សប្បុរសធម៌ · Charity / Social fund",
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

  // Receipt photos (only when shared) come through the public photo route (uploads and Telegram photos alike).
  const photoUrl = (e: { photo?: string | null }) => (e.photo ? `/api/pool-photo/${slug}/${e.photo}` : null)
  const charity = pool.kind === "CHARITY"
  const khqrSvg = pool.khqr && isKhqr(pool.khqr) ? await QRCode.toString(pool.khqr, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) : null
  const settlement = pool.settlement
  // "Report an issue": the support Telegram link an admin set (Support settings), else the official bot.
  const { data: contacts } = await supabase.rpc("support_contacts")
  const supportUrl = (contacts as { telegram_url?: string } | null)?.telegram_url
  const reportUrl = supportUrl && /^https:\/\/t\.me\//.test(supportUrl) ? supportUrl : "https://t.me/luychlat_bot"
  const money = (n: number) => formatMoney(n, pool.currency)
  // Only real participants: names with no target that never paid are left out
  // (when the pool has targets at all — a rolled-over pool starts with none). Same rule as the app.
  const hasTargets = pool.members.some((m) => m.pledged > 0)
  const members = hasTargets ? pool.members.filter((m) => m.pledged > 0 || m.paid > 0) : pool.members

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg space-y-4 bg-background px-4 py-6">
      <PoolAutoRefresh />
      <header className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">{KIND[pool.kind]}</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <span aria-hidden>{poolEmoji(pool.kind)}</span>
          {pool.title}
        </h1>
        {pool.keeper && <p className="text-sm text-muted-foreground">អ្នករក្សាលុយ · Keeper: {pool.keeper}</p>}
        {charity && (
          // What the page really offers: every entry in the open. Not a verification of the cause by LuyChlat.
          <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            🔓 បញ្ជីចំហ · Open ledger — every expense{pool.share_photos ? " and receipt" : ""} is public
          </p>
        )}
      </header>

      <section className="rounded-2xl border bg-card p-4">
        <PoolGauge pool={pool} labels={{ status: GAUGE[pool.gauge], pooled: "លុយរួម · Pooled", spent: "បានចាយ · Spent", remaining: "នៅសល់ · Remaining", collecting: "កំពុងប្រមូលលុយ · Collecting" }} />
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
        <section className={charity ? "space-y-2 rounded-2xl border-2 border-emerald-500/40 bg-card p-4 text-center" : "space-y-2 rounded-2xl border bg-card p-4 text-center"}>
          {charity && pool.status === "active" ? (
            <>
              <p className="text-base font-bold">🤲 បើកទទួលការបរិច្ចាគ · Open for donations</p>
              <p className="text-xs text-muted-foreground">ស្កេន KHQR ដើម្បីបរិច្ចាគជូន {pool.keeper || "អ្នករក្សាលុយ"} · Scan to donate to the keeper</p>
            </>
          ) : (
            <p className="text-sm font-semibold">ស្កេនបង់ជូនអ្នករក្សាលុយ · Scan to pay the keeper</p>
          )}
          <div className="mx-auto w-56 rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: khqrSvg }} />
          <p className="text-xs text-muted-foreground">KHQR</p>
        </section>
      )}

      {!pool.members_hidden && members.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-medium text-muted-foreground">សមាជិក · Members</h2>
          <div className="divide-y rounded-2xl border bg-card">
            {members.map((m, i) => (
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
              const url = photoUrl(e)
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
                    <a href={url} target="_blank" rel="noopener noreferrer" className={charity ? "block overflow-hidden rounded-lg border" : "block w-24 overflow-hidden rounded-lg border"}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- served by the app's photo route */}
                      <img src={url} alt="វិក្កយបត្រ · Receipt" className={charity ? "max-h-72 w-full bg-muted object-contain" : "h-24 w-24 object-cover"} loading="lazy" />
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <PublicPoolDisclaimer reportUrl={reportUrl} />

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

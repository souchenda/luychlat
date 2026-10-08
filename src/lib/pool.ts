import type { Currency } from "@/lib/data/types"

/** Shared pools (បេឡារួម): one event's money, held by a keeper. Used by the app, the public page and the bot. */
export type PoolKind = "FESTIVAL" | "FAMILY" | "TRIP" | "GENERAL" | "CHARITY"
export type PoolGauge = "safe" | "caution" | "low"
export type PoolSettleMode = "REFUND" | "COLLECT" | "ROLLOVER"

export type PoolMember = { id?: string; name: string; pledged: number; paid: number }
export type PoolEntry = {
  id?: string
  type: "INCOME" | "EXPENSE"
  /** In the pool's currency. */
  amt: number
  amount: number
  currency: Currency
  note: string | null
  category: string | null
  preset_key: string | null
  date: string
  receipt: string | null
  /** Key of the entry's photo for the public photo route (/api/pool-photo/<slug>/<photo>). */
  photo?: string | null
}

export type PoolSnapshot = {
  id?: string
  kind: PoolKind
  title: string
  split: "EQUAL" | "CUSTOM"
  currency: Currency
  wallet_id?: string
  wallet_name: string
  target: number
  carried_in: number
  start_date: string | null
  end_date: string | null
  status: "active" | "settled"
  settled_at: string | null
  settlement: { mode: PoolSettleMode; remaining: number; shares: { name: string; amount: number }[]; next_pool_id: string | null } | null
  pooled: number
  spent: number
  remaining: number
  pct: number
  gauge: PoolGauge
  member_count: number
  /** Suggested top-up per member when funds run low (null when not needed). */
  topup_per_member: number | null
  keeper: string
  /** The keeper's KHQR text (when collecting, or when funds are low). */
  khqr: string | null
  /** The pool has its own KHQR (set by the treasurer), not the keeper's profile one. */
  khqr_own?: boolean
  /** The workspace's riel rate (a share's ៛ equivalent in the group). */
  khr_per_usd?: number
  members: PoolMember[]
  members_hidden: boolean
  entries: PoolEntry[]
  top: { note: string | null; amt: number }[]
  share_slug?: string | null
  share_photos: boolean
  share_members: boolean
  tg_linked: boolean
  created_at: string
  /** Shares are people or families ("គ្រួសារទី ១"). */
  unit?: "PERSON" | "FAMILY"
  /** "pchumben": the festival template (offerings / travel / food categories). */
  template?: string | null
  /** The live progress message in the linked group (group view only). */
  progress_msg?: number | null
}

export const POOL_KINDS: { kind: PoolKind; emoji: string }[] = [
  { kind: "FESTIVAL", emoji: "🪷" },
  { kind: "FAMILY", emoji: "👨‍👩‍👧‍👦" },
  { kind: "TRIP", emoji: "🏕️" },
  { kind: "GENERAL", emoji: "🤝" },
  { kind: "CHARITY", emoji: "🎗️" },
]

/** A receipt that came from Telegram (<owner>/tg/<file id>), served by the app's photo routes. */
export const isTelegramReceipt = (ref: string | null | undefined) => Boolean(ref && /^[^/]+\/tg\/[A-Za-z0-9_-]{10,200}$/.test(ref))
export const poolEmoji = (kind: string | null | undefined) => POOL_KINDS.find((k) => k.kind === kind?.toUpperCase())?.emoji ?? "🤝"

export const GAUGE_EMOJI: Record<PoolGauge, string> = { safe: "🟢", caution: "🟡", low: "🔴" }
export const GAUGE_COLOR: Record<PoolGauge, string> = { safe: "#10b981", caution: "#f59e0b", low: "#ef4444" }

/** Numbers from PostgREST come as strings sometimes. */
export function toSnapshot(raw: PoolSnapshot): PoolSnapshot {
  const n = (v: unknown) => Number(v ?? 0)
  return {
    ...raw,
    target: n(raw.target),
    carried_in: n(raw.carried_in),
    pooled: n(raw.pooled),
    spent: n(raw.spent),
    remaining: n(raw.remaining),
    pct: n(raw.pct),
    member_count: n(raw.member_count),
    topup_per_member: raw.topup_per_member == null ? null : n(raw.topup_per_member),
    members: (raw.members ?? []).map((m) => ({ ...m, pledged: n(m.pledged), paid: n(m.paid) })),
    entries: (raw.entries ?? []).map((e) => ({ ...e, amt: n(e.amt), amount: n(e.amount) })),
    top: (raw.top ?? []).map((x) => ({ ...x, amt: n(x.amt) })),
    settlement: raw.settlement
      ? { ...raw.settlement, remaining: n(raw.settlement.remaining), shares: (raw.settlement.shares ?? []).map((s) => ({ ...s, amount: n(s.amount) })) }
      : null,
  }
}

/** The bar's width: remaining as a share of the pool, 0–100. */
export const gaugeWidth = (s: Pick<PoolSnapshot, "pct">) => Math.max(0, Math.min(100, s.pct))

/**
 * The Sunday-evening Telegram digest (opt-in; see the weekly_digest
 * migration). Pure: builds the message from the per-category sums the
 * database returns for this week and last week.
 *
 *   📊 Weekly summary · Personal (29/09 – 05/10)
 *   💸 Spent this week: $245.50
 *   Top categories:
 *   🍔 Food: 45%
 *   🚗 Transport: 20%
 *   👏 You spent $15.00 less than last week!
 *   💡 The 50/30/20 rule — Split your income: …
 *   [📱 Open Dashboard]
 *
 * FREE accounts get a teaser without amounts.
 */

import { adjustmentCategoryIds, categoryLabel, NON_OPERATING_KEYS } from "@/lib/categories/presets"
import type { Locale, MessageKey } from "@/lib/i18n/dictionaries"
import { contentLocale, pick } from "@/lib/i18n/dictionaries"
import { formatMoney } from "@/lib/money"
import { tipOfTheDay } from "@/lib/tips"

export type DigestCategory = { id: string | null; preset_key: string | null; name: string | null; icon: string | null; this_usd: number; last_usd: number }
export type DigestRow = {
  user_id: string
  chat_id: number
  language: Locale
  tier: "FREE" | "PRO" | "ULTRA"
  workspace: string
  workspace_type: string
  currency: "USD" | "KHR"
  rate: number
  entries: number
  categories: DigestCategory[]
}

type T = (key: MessageKey, params?: Record<string, string | number>) => string

/** Category icons (lucide names) as emoji for the chat. */
const ICON_EMOJI: Record<string, string> = {
  utensils: "🍔", coffee: "☕", bus: "🚌", car: "🚗", fuel: "⛽", plane: "✈️", house: "🏠", zap: "⚡", wifi: "📶",
  smartphone: "📱", "shopping-bag": "🛍️", "shopping-cart": "🛒", shirt: "👕", "heart-pulse": "💊", dumbbell: "🏋️",
  "graduation-cap": "🎓", "book-open": "📚", baby: "👶", "paw-print": "🐾", gift: "🎁", film: "🎬", sparkles: "✨",
  banknote: "💵", award: "🏅", "trending-up": "📈", "hand-heart": "🤲", "hand-coins": "🤝", coins: "🪙",
  "piggy-bank": "🐷", package: "📦", store: "🏪", users: "👥", truck: "🚚", megaphone: "📣", wrench: "🔧",
  landmark: "🏛️", briefcase: "💼", receipt: "🧾", scale: "⚖️",
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

/** Spending categories only: debt principal, transfers of capital and adjustments are left out (as in Reports). */
function spending(categories: DigestCategory[]) {
  const withId = categories.map((c) => ({ ...c, id: c.id ?? "", this_usd: Number(c.this_usd) || 0, last_usd: Number(c.last_usd) || 0 }))
  const adjustments = adjustmentCategoryIds(withId.filter((c) => c.id))
  return withId.filter((c) => !(c.preset_key && NON_OPERATING_KEYS.has(c.preset_key)) && !adjustments.has(c.id))
}

export function buildDigest(row: DigestRow, weekStart: string, t: T, today: Date): { text: string; button: string } {
  const lang = row.language
  const range = `${ddmm(weekStart)} – ${ddmm(addDays(weekStart, 6))}`
  const button = t("bot.digestButton")
  if (row.tier === "FREE") {
    return { text: t("bot.digestTeaser", { count: row.entries, workspace: row.workspace }), button }
  }

  const cats = spending(row.categories)
  const thisUsd = cats.reduce((s, c) => s + c.this_usd, 0)
  const lastUsd = cats.reduce((s, c) => s + c.last_usd, 0)
  const money = (usd: number) => formatMoney(row.currency === "KHR" ? Math.round(usd * row.rate) : Math.round(usd * 100) / 100, row.currency)

  const lines = [t("bot.digestTitle", { workspace: row.workspace, range }), t("bot.digestSpent", { amount: money(thisUsd) })]

  const top = cats.filter((c) => c.this_usd > 0).sort((a, b) => b.this_usd - a.this_usd).slice(0, 3)
  if (top.length && thisUsd > 0) {
    lines.push("", t("bot.digestTop"))
    for (const c of top) {
      const label = c.name !== null ? categoryLabel({ name: c.name, preset_key: c.preset_key }, lang) : t("bot.cardUncategorized")
      lines.push(`${ICON_EMOJI[c.icon ?? ""] ?? "🏷️"} ${label}: ${Math.round((c.this_usd / thisUsd) * 100)}%`)
    }
  }

  if (lastUsd > 0) {
    const diff = thisUsd - lastUsd
    // Within 2% (or $1) counts as the same.
    const same = Math.abs(diff) < Math.max(1, lastUsd * 0.02)
    lines.push("", same ? t("bot.digestSame") : t(diff < 0 ? "bot.digestLess" : "bot.digestMore", { amount: money(Math.abs(diff)) }))
  }

  const tip = tipOfTheDay(today, { business: row.workspace_type === "BUSINESS" })
  const tipLang = contentLocale(lang)
  lines.push("", t("bot.digestTip", { tip: `${pick(tip.title, tipLang)} — ${pick(tip.body, tipLang)}` }))
  return { text: lines.join("\n"), button }
}

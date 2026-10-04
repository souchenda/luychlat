/**
 * The weekly Telegram digest (opt-in; see the weekly_digest and digest_income
 * migrations): sent Sunday evening, or on demand with /digest. Pure: builds
 * the message from the per-category sums the database returns for this week
 * and last week.
 *
 *   📊 សង្ខេបប្រចាំសប្ដាហ៍ · Personal (28/09 – 04/10)
 *   💰 ចំណូល: $500.00
 *   💸 ចំណាយ: $245.00
 *   🏦 សន្សំបាន: $255.00 (51%)
 *   ប្រភេទចំណាយធំៗ:
 *   🍔 ម្ហូបអាហារ: 45%
 *   📉 ចំណាយតិចជាងសប្ដាហ៍មុន 12% ($33.00) 👏
 *   💡 …
 *   [📱 បើកផ្ទាំងរបាយការណ៍]
 *
 * FREE accounts get a teaser without amounts.
 */

import { adjustmentCategoryIds, categoryLabel, NON_OPERATING_KEYS } from "@/lib/categories/presets"
import type { Locale, MessageKey } from "@/lib/i18n/dictionaries"
import { contentLocale, pick } from "@/lib/i18n/dictionaries"
import { formatMoney } from "@/lib/money"
import { TIPS, tipOfTheDay, type Tip } from "@/lib/tips"

export type DigestCategory = {
  id: string | null
  /** INCOME or EXPENSE (rows from before income was added are expenses). */
  type?: "INCOME" | "EXPENSE"
  preset_key: string | null
  name: string | null
  icon: string | null
  this_usd: number
  last_usd: number
}
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

/** Monday of the week containing a Cambodia day (YYYY-MM-DD). */
export function weekStartOf(day: string): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay() // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7))
}

/** Operating income and spending only: debt principal, disbursements and adjustments are left out (as in Reports). */
function operating(categories: DigestCategory[]) {
  const rows = categories.map((c) => ({ ...c, type: c.type ?? "EXPENSE", id: c.id ?? "", this_usd: Number(c.this_usd) || 0, last_usd: Number(c.last_usd) || 0 }))
  const adjustments = adjustmentCategoryIds(rows.filter((c) => c.id))
  return rows.filter((c) => !(c.preset_key && NON_OPERATING_KEYS.has(c.preset_key)) && !adjustments.has(c.id))
}

export type DigestStats = {
  income: number
  expense: number
  net: number
  /** Net ÷ income × 100, or null without income. */
  savingsRate: number | null
  lastExpense: number
  /** Spending change against last week in %, or null when last week had none. */
  spendingChange: number | null
  top: { label: string; emoji: string; share: number }[]
}

/** The week's figures (USD), from the database rows. */
export function digestStats(row: DigestRow, lang: Locale, uncategorized: string): DigestStats {
  const cats = operating(row.categories)
  const sum = (type: "INCOME" | "EXPENSE", key: "this_usd" | "last_usd") => cats.filter((c) => c.type === type).reduce((s, c) => s + c[key], 0)
  const income = sum("INCOME", "this_usd")
  const expense = sum("EXPENSE", "this_usd")
  const lastExpense = sum("EXPENSE", "last_usd")
  const net = income - expense
  const top = cats
    .filter((c) => c.type === "EXPENSE" && c.this_usd > 0)
    .sort((a, b) => b.this_usd - a.this_usd)
    .slice(0, 3)
    .map((c) => ({
      label: c.name !== null ? categoryLabel({ name: c.name, preset_key: c.preset_key }, lang) : uncategorized,
      emoji: ICON_EMOJI[c.icon ?? ""] ?? "🏷️",
      share: expense > 0 ? Math.round((c.this_usd / expense) * 100) : 0,
    }))
  return {
    income,
    expense,
    net,
    savingsRate: income > 0 ? Math.round((net / income) * 100) : null,
    lastExpense,
    spendingChange: lastExpense > 0 ? Math.round(((expense - lastExpense) / lastExpense) * 100) : null,
    top,
  }
}

const tipById = (id: string) => TIPS.find((t) => t.id === id)

/**
 * A tip that fits the week: spent more than earned → budgeting; spending up a
 * lot → the 72-hour rule; saving well → an emergency fund / goals; a business
 * → daily cash flow; otherwise the tip of the week.
 */
export function pickTip(stats: DigestStats, row: DigestRow, weekStart: string): Tip {
  const week = Math.floor(Date.parse(`${weekStart}T00:00:00Z`) / (7 * 86_400_000))
  const pickOf = (ids: string[]) => tipById(ids[week % ids.length])
  const choice =
    (stats.income > 0 && stats.net < 0 && pickOf(["rule-50-30-20", "track-small-spending"])) ||
    (stats.spendingChange !== null && stats.spendingChange >= 20 && pickOf(["rule-72-hours", "track-small-spending"])) ||
    (stats.savingsRate !== null && stats.savingsRate >= 20 && pickOf(["emergency-fund", "separate-goals", "pay-yourself-first"])) ||
    (row.workspace_type === "BUSINESS" && pickOf(["cash-flow-daily", "separate-money", "business-buffer"])) ||
    null
  return choice ?? tipOfTheDay(new Date(`${weekStart}T12:00:00Z`), { business: row.workspace_type === "BUSINESS" })
}

export function buildDigest(row: DigestRow, weekStart: string, t: T): { text: string; button: string } {
  const lang = row.language
  const range = `${ddmm(weekStart)} – ${ddmm(addDays(weekStart, 6))}`
  const button = t("bot.digestButton")
  if (row.tier === "FREE") {
    return { text: t("bot.digestTeaser", { count: row.entries, workspace: row.workspace }), button }
  }

  const s = digestStats(row, lang, t("bot.cardUncategorized"))
  const money = (usd: number) => formatMoney(row.currency === "KHR" ? Math.round(usd * row.rate) : Math.round(usd * 100) / 100, row.currency)

  const lines = [t("bot.digestTitle", { workspace: row.workspace, range }), ""]
  if (s.income > 0) lines.push(t("bot.digestIncome", { amount: money(s.income) }))
  lines.push(t("bot.digestSpent", { amount: money(s.expense) }))
  if (s.income > 0) {
    lines.push(
      s.net >= 0
        ? t("bot.digestSaved", { amount: money(s.net), rate: s.savingsRate ?? 0 })
        : t("bot.digestOverspent", { amount: money(-s.net) }),
    )
  }

  if (s.top.length) {
    lines.push("", t("bot.digestTop"))
    for (const c of s.top) lines.push(`${c.emoji} ${c.label}: ${c.share}%`)
  }

  if (s.spendingChange !== null) {
    const diff = money(Math.abs(s.expense - s.lastExpense))
    // Within 2% counts as the same.
    lines.push(
      "",
      Math.abs(s.spendingChange) < 2
        ? t("bot.digestSame")
        : t(s.spendingChange < 0 ? "bot.digestLessPct" : "bot.digestMorePct", { pct: Math.abs(s.spendingChange), amount: diff }),
    )
  }

  const tip = pickTip(s, row, weekStart)
  const tipLang = contentLocale(lang)
  lines.push("", t("bot.digestTip", { tip: `${pick(tip.title, tipLang)} — ${pick(tip.body, tipLang)}` }))
  return { text: lines.join("\n"), button }
}

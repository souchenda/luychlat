/**
 * Weekly Financial Health Doctor (🩺 «សុខភាពហិរញ្ញវត្ថុប្រចាំសប្ដាហ៍»): the business owner's brief in
 * Telegram from the database's cfo_brief_data — sales and estimated net profit vs the week before,
 * cash vs the bills due in the next 7 days, customers more than 7 days overdue, and one tip chosen by
 * plain rules (no guessing). Money in the workspace's currency; riel rounded to the nearest 100 ៛.
 * Pure (cfo-brief.test.ts).
 */
import type { Currency } from "@/lib/data/types"
import { formatMoney, roundRiel } from "@/lib/money"

export type CfoData = {
  workspace: string
  currency: Currency
  rate: number
  week_start: string
  /** USD. */
  sales: number
  sales_prev: number
  income: number
  income_prev: number
  expense: number
  expense_prev: number
  cash: number
  bills: { title: string; amount: number; currency: Currency; due: string }[]
  receivables: { party: string; amount: number; currency: Currency; days: number }[]
}

/** Sunday, 18:00 – 21:00 Cambodia time (a late server start still sends it — never on Monday). */
export function cfoBriefDue(day: string, hour: number): boolean {
  return new Date(`${day}T12:00:00Z`).getUTCDay() === 0 && hour >= 18 && hour < 21
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** A USD figure in the workspace's currency (riel to the nearest 100 ៛). */
export const inWs = (usd: number, d: Pick<CfoData, "currency" | "rate">) => (d.currency === "KHR" ? roundRiel(usd * Number(d.rate)) : Math.round(usd * 100) / 100)
const money = (usd: number, d: Pick<CfoData, "currency" | "rate">) => formatMoney(inWs(usd, d), d.currency)
/** An amount as recorded, in its own currency (riel to the nearest 100 ៛ only when computed — here as stored). */
const own = (amount: number, currency: Currency) => formatMoney(Number(amount), currency)
const toUsd = (amount: number, currency: Currency, rate: number) => (currency === "USD" ? Number(amount) : Number(amount) / Number(rate))

/** "▲ 12%" / "▼ 8%" vs the week before; null without a previous week to compare. */
export function change(now: number, prev: number): { pct: number; text: string } | null {
  if (!(prev > 0)) return null
  const pct = Math.round(((now - prev) / prev) * 100)
  return { pct, text: pct === 0 ? "= 0%" : `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%` }
}

export type CfoFigures = { net: number; netPrev: number; billsUsd: number; cover: number | null; overdueUsd: number }

export function cfoFigures(d: CfoData): CfoFigures {
  const billsUsd = d.bills.reduce((s, b) => s + toUsd(b.amount, b.currency, d.rate), 0)
  return {
    net: d.income - d.expense,
    netPrev: d.income_prev - d.expense_prev,
    billsUsd,
    cover: billsUsd > 0 ? d.cash / billsUsd : null,
    overdueUsd: d.receivables.reduce((s, r) => s + toUsd(r.amount, r.currency, d.rate), 0),
  }
}

/** One pragmatic tip for the week ahead, by priority: cash shortfall, overdue customers, falling sales, heavy spending, else the tax reserve. */
export function cfoTip(d: CfoData, f: CfoFigures = cfoFigures(d)): string {
  if (f.billsUsd > 0 && d.cash < f.billsUsd)
    return `សាច់ប្រាក់ (${money(d.cash, d)}) មិនគ្រប់សម្រាប់វិក្កយបត្រ ៧ ថ្ងៃខាងមុខ (${money(f.billsUsd, d)}) — ប្រមូលបំណុលអតិថិជនជាមុន ឬពន្យារការទិញស្តុកដែលមិនទាន់ចាំបាច់។`
  if (d.receivables.length) {
    const top = d.receivables[0]
    return `ទាក់ទង ${esc(top.party)} ដើម្បីប្រមូល ${own(top.amount, top.currency)} (ហួស ${top.days} ថ្ងៃ) មុនគេ — លុយជាប់ក្នុងបំណុលធ្វើឱ្យលំហូរសាច់ប្រាក់តឹង។`
  }
  const sales = change(d.sales, d.sales_prev)
  if (sales && sales.pct <= -15)
    return `ការលក់ធ្លាក់ ${Math.abs(sales.pct)}% ធៀបសប្ដាហ៍មុន — ទាក់ទងអតិថិជនធំៗវិញ ហើយសាកប្រូម៉ូសិនខ្លី ២–៣ ថ្ងៃ។`
  if (d.income > 0 && d.expense > d.income * 0.8)
    return `ចំណាយស្មើ ${Math.round((d.expense / d.income) * 100)}% នៃចំណូល — ពិនិត្យចំណាយធំៗ ៣ មុខ ហើយកាត់មួយដែលមិនបង្កើតចំណូល។`
  return `ទុក ${money(d.sales * 0.01, d)} (១% នៃការលក់សប្ដាហ៍នេះ) សម្រាប់ពន្ធអប្បបរមា ហើយរក្សាល្បឿនការលក់នេះបន្ត។`
}

/** The brief, Telegram HTML. */
export function buildCfoBrief(d: CfoData): string {
  const f = cfoFigures(d)
  const sales = change(d.sales, d.sales_prev)
  const net = f.netPrev !== 0 && f.netPrev > 0 ? change(f.net, f.netPrev) : null
  const end = addDays(d.week_start, 6)
  const out = [`🩺 <b>សុខភាពហិរញ្ញវត្ថុប្រចាំសប្ដាហ៍ · ${esc(d.workspace)}</b>`, `សប្ដាហ៍ ${ddmm(d.week_start)} – ${ddmm(end)}`, ""]

  out.push(`📈 លក់បាន៖ <b>${money(d.sales, d)}</b>${sales ? ` (${sales.text} · សប្ដាហ៍មុន ${money(d.sales_prev, d)})` : ""}`)
  out.push(`💵 ចំណេញសុទ្ធប្រហែល៖ <b>${money(f.net, d)}</b>${net ? ` (${net.text})` : ""}`)
  out.push(`   ចំណូល ${money(d.income, d)} − ចំណាយ ${money(d.expense, d)}`)
  out.push("")

  out.push(`🏦 សាច់ប្រាក់អាចប្រើ៖ <b>${money(d.cash, d)}</b>`)
  if (!d.bills.length) out.push("🧾 ៧ ថ្ងៃខាងមុខ៖ គ្មានវិក្កយបត្រត្រូវបង់")
  else {
    out.push(`🧾 ត្រូវបង់ ៧ ថ្ងៃខាងមុខ៖ <b>${money(f.billsUsd, d)}</b> (${d.bills.length} វិក្កយបត្រ)`)
    for (const b of d.bills.slice(0, 5)) out.push(`• ${esc(b.title)} — ${own(b.amount, b.currency)} · ${ddmm(b.due)}`)
    out.push(d.cash >= f.billsUsd ? "✅ សាច់ប្រាក់គ្រប់គ្រាន់សម្រាប់វិក្កយបត្រទាំងនេះ" : `⚠️ ខ្វះ ${money(f.billsUsd - d.cash, d)}`)
  }
  out.push("")

  if (!d.receivables.length) out.push("⏳ អតិថិជនជំពាក់ហួស ៧ ថ្ងៃ៖ ✅ គ្មាន")
  else {
    out.push(`⏳ អតិថិជនជំពាក់ហួស ៧ ថ្ងៃ៖ <b>${money(f.overdueUsd, d)}</b>`)
    for (const r of d.receivables.slice(0, 5)) out.push(`• ${esc(r.party)} — ${own(r.amount, r.currency)} · ហួស ${r.days} ថ្ងៃ`)
  }
  out.push("", `💡 <b>យុទ្ធសាស្ត្រសប្ដាហ៍ក្រោយ៖</b> ${cfoTip(d, f)}`)
  return out.join("\n")
}

import { communityBadge } from "@/lib/contributor-thanks"
import * as G from "@/lib/islamic/glossary"

/**
 * The approval room «LCA Approval» as the founder's live activity stream (founder, 19/10/2026): the new-member card —
 * sent quietly (no sound), HTML. Place and qasidah cards: lib/place-alerts.ts, lib/nasheed.ts.
 * Pure (contributor-thanks.test.ts).
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** The welcome line, in the member's community's words: a blessing in Islamic Mode, warm thanks otherwise. */
export const signupWelcome = (islamic: boolean) =>
  islamic ? `« សូមអល់ឡោះ ﷻ ប្រទានពរជ័យ និង${G.BARAKAH}ដល់ការចូលរួមរបស់បងប្អូន! 🤲 »` : "« សូមស្វាគមន៍យ៉ាងកក់ក្តៅ និងថ្លែងអំណរគុណដល់ការគាំទ្ររបស់លោកអ្នក! 🙏 »"

export function signupAlertText(o: { name: string | null; account: string; at: string; islamic: boolean; method: string; source: string | null; total: number }): string {
  const who = o.name ? `${o.name} · ${o.account}` : o.account
  return [
    "👤 <b>សមាជិកថ្មីទើបបានចុះឈ្មោះ</b>",
    `• ឈ្មោះ/គណនី៖ ${esc(who)}`,
    `• ប្រភេទ៖ ${communityBadge(o.islamic)} (${o.islamic ? "Islamic Mode" : "General"})`,
    `• សារស្វាគមន៍៖ ${signupWelcome(o.islamic)}`,
    // Never italic Khmer (CLAUDE.md wording guards).
    `🕒 ${esc(o.at)} · ${esc(o.method)}${o.source ? ` · ស្គាល់តាម៖ ${esc(o.source)}` : ""} · 📊 សមាជិកសរុប ${o.total.toLocaleString("en-US")} នាក់`,
  ].join("\n")
}

/**
 * A member who left (founder, 8/11/2026 — Men Somanit announced at 06:49, then gone from Admin with no trace): the same
 * name and account the sign-up card showed, how the account went, how long it stayed, and the new total — never a balance.
 */
/** What a member used before leaving — counts and dates only, never an amount (founder, 8/11/2026). */
export type DepartureActivity = {
  workspaces: number; shared_in: number; wallets: number; entries: number; first_entry: string | null; last_entry: string | null
  debts: number; budgets: number; bills: number; telegram: boolean; islamic: boolean; tier: string | null; last_active: string | null
}

/** «• បានប្រើ៖ …» lines for the departure card; `when` formats a timestamp (Cambodia time). */
export function activityLines(a: DepartureActivity | null, when: (iso: string) => string): string[] {
  if (!a) return ["• សកម្មភាព៖ អានមិនបាន"]
  const n = (v: unknown) => Number(v ?? 0).toLocaleString("en-US")
  const used = [`${n(a.entries)} ប្រតិបត្តិការ`, `${n(a.wallets)} កាបូប`, `${n(a.debts)} បំណុល`, `${n(a.budgets)} ថវិកា`, `${n(a.bills)} វិក្កយបត្រ`]
  const lines = [Number(a.entries) || Number(a.wallets) || Number(a.debts) || Number(a.budgets) || Number(a.bills) ? `• បានប្រើ៖ ${used.join(" · ")}` : "• បានប្រើ៖ មិនទាន់បានកត់ត្រាអ្វីទេ"]
  if (a.first_entry && a.last_entry) lines.push(`• ប្រតិបត្តិការដំបូង ${esc(when(a.first_entry))} · ចុងក្រោយ ${esc(when(a.last_entry))}`)
  const extra = [
    `${n(a.workspaces)} workspace${Number(a.shared_in) ? ` (+${n(a.shared_in)} ចែករំលែក)` : ""}`,
    a.telegram ? "ភ្ជាប់ Telegram" : "មិនបានភ្ជាប់ Telegram",
    ...(a.islamic ? ["Islamic Mode"] : []),
    `គម្រោង ${esc(a.tier ?? "FREE")}`,
  ]
  lines.push(`• ${extra.join(" · ")}`)
  if (a.last_active) lines.push(`• សកម្មចុងក្រោយ៖ ${esc(when(a.last_active))}`)
  return lines
}

export function departureAlertText(o: { name: string | null; account: string; at: string; joined: string | null; days: number | null; self: boolean; total: number; activity?: string[] }): string {
  const who = o.name ? `${o.name} · ${o.account}` : o.account
  const stayed = o.days === null ? null : o.days < 1 ? "តិចជាង 1 ថ្ងៃ" : `${o.days} ថ្ងៃ`
  return [
    "👤 <b>សមាជិកបានលុបគណនី</b>",
    `• ឈ្មោះ/គណនី៖ ${esc(who)}`,
    `• របៀប៖ ${o.self ? "ម្ចាស់គណនីចុច «លុបគណនី» ដោយខ្លួនឯង" : "លុបពីផ្ទាំងគ្រប់គ្រង (Supabase)"}`,
    ...(o.joined ? [`• បានចុះឈ្មោះ៖ ${esc(o.joined)}${stayed ? ` · នៅជាមួយ ${stayed}` : ""}`] : []),
    ...(o.activity ?? []),
    `🕒 ${esc(o.at)} · 📊 សមាជិកសរុប ${o.total.toLocaleString("en-US")} នាក់`,
  ].join("\n")
}

// The owner's draw from DL Staff waits for the founder (founder, 26/10/2026 — Task #521, Option B): the card in his private
// chat — what, how much, which day, from which DL account, into which Personal wallet, the ERP reference — and two buttons,
// one per row: [ ✅ យល់ព្រមទទួលចូលកាបូបផ្ទាល់ខ្លួន ] [ ❌ បដិសេធ ]. Callback «ed:a:<token>» / «ed:r:<token>» (the token of
// erp_sync_events.draw_token: 10 hex, so it fits Telegram's 64 bytes whatever the reference). Pure (erp-draw-card.test.ts).
import { formatMoney } from "@/lib/money"

export const DRAW_CALLBACK = /^ed:([ar]):([0-9a-f]{10})$/
export const isErpDrawCallback = (data: string | undefined) => DRAW_CALLBACK.test(data ?? "")
export function parseDrawCallback(data: string | undefined): { approve: boolean; token: string } | null {
  const m = DRAW_CALLBACK.exec(data ?? "")
  return m ? { approve: m[1] === "a", token: m[2]! } : null
}

/** «2026-10-26» → «26/10/2026» (digits 0-9 — CLAUDE.md › international digits). */
const ddmmyyyy = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

export type DrawCardData = { amount: number; currency: "USD" | "KHR"; date: string; reference: string; source: string; personal: string; token: string }

export function drawCard(d: DrawCardData) {
  const text = [
    "🙋‍♂️ ម្ចាស់ដកចាយពី DL Staff",
    `💵 ${formatMoney(d.amount, d.currency)}`,
    `📅 ${ddmmyyyy(d.date)}`,
    `🏦 ពីគណនី៖ ${d.source}`,
    `👛 ចូល៖ ${d.personal} (ផ្ទាល់ខ្លួន)`,
    `🔖 ERP #${d.reference}`,
    "",
    "បង ទទួលប្រាក់នេះចូលកាបូបផ្ទាល់ខ្លួនទេ? DL MEAT SUPPLY បានកត់ការដកនេះរួចហើយ — កាបូបផ្ទាល់ខ្លួនមិនប្រែប្រួលទេ ទាល់តែបងចុច ✅។",
  ].join("\n")
  return {
    text,
    reply_markup: {
      inline_keyboard: [[{ text: "✅ យល់ព្រមទទួលចូលកាបូបផ្ទាល់ខ្លួន", callback_data: `ed:a:${d.token}` }], [{ text: "❌ បដិសេធ", callback_data: `ed:r:${d.token}` }]],
    },
  }
}

/** The line that replaces the buttons once decided (the card keeps its details above it). */
export function drawOutcome(r: { status: string; amount?: number | string; currency?: "USD" | "KHR"; wallet?: string | null; state?: string }): string {
  const money = r.amount !== undefined && r.currency ? formatMoney(Number(r.amount), r.currency) : ""
  switch (r.status) {
    case "approved":
      return `✅ បានទទួល ${money} ចូល ${r.wallet ?? "កាបូបផ្ទាល់ខ្លួន"} រួចហើយ`
    case "rejected":
      return `❌ បានបដិសេធ — DL MEAT SUPPLY នៅតែកត់ការដក ${money} ប៉ុន្តែគ្មានប្រាក់ចូលកាបូបផ្ទាល់ខ្លួនទេ`
    case "already":
      return r.state === "approved" ? "✅ បានទទួលចូលកាបូបផ្ទាល់ខ្លួនរួចហើយ" : "❌ បានបដិសេធរួចហើយ"
    case "voided":
      return "🗑️ DL Staff បានលុបការដកនេះហើយ — គ្មានអ្វីត្រូវធ្វើទេ"
    case "no_draw_wallet":
      return "⚠️ មិនទាន់កំណត់កាបូបផ្ទាល់ខ្លួនសម្រាប់រូបិយប័ណ្ណនេះ — គ្មានអ្វីបានកត់ទេ"
    default:
      return "⚠️ រកការដកនេះមិនឃើញទេ"
  }
}

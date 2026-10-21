// Server only: the payment chime's second trigger (founder, 21/10/2026 — lib/payment-chime.ts). An income slip scanned
// and confirmed in the bot rings the counter phone «ទីង-ទីង» with «វិក្កយបត្រ ABA · កត់ត្រាជោគជ័យ». The database decides
// (bot_payment_chime_emit): business income only, once per transaction, never a bank reference that already rang.
// It never fails or delays the bot's reply; the outcome is logged.
import { logEvent } from "./events"
import { botDb, botKey } from "./telegram-bot"

export async function emitSlipChime(transactionId: string | null | undefined, bank: string | null | undefined): Promise<void> {
  if (!transactionId) return
  try {
    const { data, error } = await botDb().rpc("bot_payment_chime_emit", { p_key: botKey(), p_transaction_id: transactionId, p_bank: bank ?? null })
    const r = data as { status?: string; why?: string } | null
    if (error) logEvent("warn", "payment-chime", `Slip chime not emitted: ${error.message}`, { fold: true })
    else if (r?.status === "ok") logEvent("info", "payment-chime", "Slip chime emitted (income slip confirmed)", { fold: true })
    else logEvent("info", "payment-chime", `Slip chime skipped (${r?.why ?? "?"})`, { fold: true })
  } catch (e) {
    logEvent("warn", "payment-chime", `Slip chime not emitted: ${e instanceof Error ? e.message : String(e)}`, { fold: true })
  }
}

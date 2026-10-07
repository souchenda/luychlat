// Server only: bank slips posted in a business group (founder, 2026-10-07).
// In a group linked to a BUSINESS workspace (/biz link), a slip photo from one
// of the group's Telegram admins (creator / administrator, asked from Telegram
// with getChatMember — no setup in LuyChlat) is read by Gemini Vision and
// recorded at once: money out → an expense, money in → Sales income, in the
// wallet its account / bank / currency points to. The reply in the group:
//
//   ✅ -$5.00 បានកត់ត្រា (DL MEAT SUPPLY · ABA)
//   🏷️ ប្រភេទ៖ ទឹកភ្លើង
//   👤 បញ្ចូលដោយ៖ Mak Ravid
//
// Others' photos are ignored. The wallet is never guessed: when it isn't
// certain, the group gets one button per candidate (only admins can tap). The
// category comes from the payee (telecom / EDC / water → utilities, fuel →
// delivery, tax → tax, else other) and is shown, so it can be fixed in the app.
import { resolveWallet, walletLabel, type Slip } from "@/lib/bot/bank-slip"
import type { BotCategory, BotWallet } from "@/lib/bot/parse-entry"
import { formatMoney } from "@/lib/money"
import { walletInstitution } from "@/lib/wallets/providers"

import { logEvent } from "./events"
import { readSlip } from "./slip-bot"
import { botDb, botKey, maskNumbers, tg } from "./telegram-bot"

type Context = { name: string; wallets: BotWallet[]; categories: BotCategory[]; allowed: boolean }
type Photo = { fileId: string; fileUniqueId: string | null; messageId: number; fromId: number; fromName: string; caption: string | null }

/** Is this Telegram user the group's creator or an administrator? */
export async function isGroupAdmin(chatId: number, userId: number): Promise<boolean> {
  const r = await tg<{ status?: string }>("getChatMember", { chat_id: chatId, user_id: userId })
  return r.ok && (r.result?.status === "creator" || r.result?.status === "administrator")
}

/** The business category for a slip, from its payee / caption (shown in the reply, editable in the app). */
export function bizCategory(kind: "EXPENSE" | "INCOME", text: string, categories: BotCategory[]): BotCategory | null {
  const own = categories.filter((c) => c.type === kind)
  const by = (...presets: string[]) => presets.map((p) => own.find((c) => c.preset_key === p)).find(Boolean) ?? null
  if (kind === "INCOME") return by("sales", "services", "other_income")
  if (/\b(smart|cellcard|metfone|seatel|yes ?seatel|ezecom|opennet|sinet)\b|ទូរស័ព្ទ|អ៊ីនធឺណិត|EDC|អគ្គិសនី|ភ្លើង|ទឹកស្អាត|ទឹកប្រើប្រាស់|PPWSA/i.test(text)) return by("utilities", "other_expense")
  if (/\b(tela|caltex|ptt|total|sokimex|petronas|lhr|champa)\b|សាំង|ប្រេង/i.test(text)) return by("delivery", "other_expense")
  if (/\b(gdt|tax)\b|ពន្ធ/i.test(text)) return by("tax", "other_expense")
  if (/ជួល|\brent\b/i.test(text)) return by("rent", "other_expense")
  if (/បៀវត្ស|ប្រាក់ខែ|salary|payroll/i.test(text)) return by("payroll", "other_expense")
  return by("other_expense")
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

type Recorded = { status?: string; workspace?: string; wallet?: string; account_no?: string | null; icon?: string | null; category?: string | null; amount?: number; currency?: "USD" | "KHR"; kind?: string }

/** "✅ -$5.00 បានកត់ត្រា (DL MEAT SUPPLY · ABA)\n🏷️ ប្រភេទ៖ …\n👤 បញ្ចូលដោយ៖ …" */
function recordedText(r: Recorded, sender: string) {
  const sign = r.kind === "INCOME" ? "+" : "-"
  const bank = walletInstitution({ icon: r.icon ?? null, name: r.wallet ?? "" })
  const where = bank.key !== "other" && bank.key !== "cash" ? bank.name.en : walletLabel({ name: r.wallet ?? "", account_no: r.account_no ?? null })
  return maskNumbers(
    [`✅ ${sign}${formatMoney(Number(r.amount), r.currency ?? "USD")} បានកត់ត្រា (${r.workspace} · ${where})`, `🏷️ ប្រភេទ៖ ${r.category ?? "—"}`, `👤 បញ្ចូលដោយ៖ ${sender}`].join("\n"),
  )
}

/** A photo in a group. True when it was a business slip this handled (or ignored on purpose). */
export async function handleGroupSlip(chatId: number, photo: Photo): Promise<boolean> {
  const db = botDb()
  const { data } = await db.rpc("bot_biz_slip_context", { p_key: botKey(), p_group: chatId })
  const ctx = data as Context | null
  if (!ctx?.wallets) return false // not a business group
  if (!ctx.allowed) return true
  // Admins only — anyone else's photo (a customer's screenshot…) is left alone.
  if (!(await isGroupAdmin(chatId, photo.fromId))) return true

  const reply = (text: string, extra: Record<string, unknown> = {}) =>
    tg("sendMessage", { chat_id: chatId, text, reply_to_message_id: photo.messageId, allow_sending_without_reply: true, ...extra })
  await tg("sendChatAction", { chat_id: chatId, action: "typing" })
  const read = await readSlip(photo.fileId)
  if ("error" in read) {
    await reply(read.error === "busy" ? "⚠️ មិនអាចអានវិក្កយបត្របានឥឡូវនេះ — សូមផ្ញើម្ដងទៀតបន្តិចក្រោយ។" : "⚠️ រូបនេះមិនមែនជាវិក្កយបត្រធនាគារ ឬអានមិនច្បាស់ទេ។")
    return true
  }
  const slip: Slip = read.slip
  const kind = slip.direction === "IN" ? "INCOME" : "EXPENSE"
  const category = bizCategory(kind, [slip.party, photo.caption].filter(Boolean).join(" "), ctx.categories)
  const note = [photo.caption?.trim() || null, ["🧾", slip.bank, slip.party ? `${kind === "INCOME" ? "←" : "→"} ${slip.party}` : null].filter(Boolean).join(" "), `👤 ${photo.fromName}`]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 300)
  const action = {
    kind,
    category_id: category?.id ?? null,
    amount: slip.amount,
    currency: slip.currency,
    note,
    date: slip.date && slip.time ? `${slip.date}T${slip.time}:00+07:00` : slip.date,
    receipt: photo.fileId,
    file_unique_id: photo.fileUniqueId,
    sender: photo.fromName,
  }

  const pick = resolveWallet(slip, ctx.wallets)
  if (!pick) {
    await reply(`⚠️ ${ctx.name} មិនទាន់មានកាបូបទេ។`)
    return true
  }
  if ("choices" in pick) {
    // Never a guess: an admin picks the wallet.
    const { data: id } = await db.rpc("bot_biz_slip_pend", { p_key: botKey(), p_group: chatId, p_action: action, p_choices: pick.choices.map((w) => w.id) })
    if (typeof id !== "string") return true
    const money = `${kind === "INCOME" ? "+" : "-"}${formatMoney(slip.amount, slip.currency)}`
    await reply(maskNumbers(`🧾 ${money}${slip.party ? ` · ${slip.party}` : ""}\n👛 កាបូបណា? (Admin ចុចជ្រើសរើស — មិនទាន់កត់ត្រាទេ)`), {
      reply_markup: { inline_keyboard: pick.choices.map((w, i) => [{ text: `👛 ${walletLabel(w)}`, callback_data: `gs:${id}:${i}` }]) },
    })
    return true
  }

  const { data: rec, error } = await db.rpc("bot_biz_slip_record", { p_key: botKey(), p_group: chatId, p_action: { ...action, wallet_id: pick.wallet.id } })
  const r = rec as Recorded | null
  if (error || !r) {
    logEvent("error", "biz-slip", `Group slip failed: ${error?.message ?? "no result"}`, { fold: true })
    await reply("⚠️ មិនអាចកត់ត្រាបានទេ។ សូមសាកម្ដងទៀត។")
  } else if (r.status === "ok") {
    logEvent("info", "biz-slip", `Group slip recorded (${r.workspace}, by a group admin)`, { fold: true })
    await reply(recordedText(r, photo.fromName))
  } else if (r.status === "duplicate") {
    await reply("ℹ️ វិក្កយបត្រនេះបានកត់ត្រារួចហើយ។")
  }
  return true
}

export const isGroupSlipCallback = (data: string | undefined) => Boolean(data?.startsWith("gs:"))

type Callback = { id: string; data?: string; from?: { id: number; first_name?: string; last_name?: string; username?: string }; message?: { message_id: number; chat: { id: number; type: string } } }

/** A wallet button under a group slip: admins only; records it and turns the question into the confirmation. */
export async function handleGroupSlipCallback(cb: Callback) {
  const answer = (text?: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: cb.id, ...(text ? { text: text.slice(0, 190), show_alert: alert } : {}) })
  const [, id, index] = (cb.data ?? "").split(":", 3)
  const chatId = cb.message?.chat.id
  if (!chatId || !cb.from || !UUID.test(id ?? "") || !/^\d$/.test(index ?? "")) return answer()
  if (!(await isGroupAdmin(chatId, cb.from.id))) return answer("សម្រាប់ Admin របស់ក្រុមប៉ុណ្ណោះ។", true)
  const { data, error } = await botDb().rpc("bot_biz_slip_record", { p_key: botKey(), p_group: chatId, p_action: {}, p_pending: id, p_choice: Number(index) })
  const r = data as (Recorded & { sender?: string }) | null
  if (error || !r) return answer("មិនអាចកត់ត្រាបានទេ។", true)
  if (r.status === "expired") return answer("ផុតកំណត់ហើយ — សូមផ្ញើវិក្កយបត្រម្ដងទៀត។", true)
  if (r.status === "duplicate") return answer("បានកត់ត្រារួចហើយ។", true)
  if (r.status !== "ok") return answer("មិនអាចកត់ត្រាបានទេ។", true)
  await answer("✅")
  // "Entered by" is whoever sent the slip (kept on the pending entry), not the admin who picked the wallet.
  const tapper = [cb.from.first_name, cb.from.last_name].filter(Boolean).join(" ") || cb.from.username || "Admin"
  await tg("editMessageText", { chat_id: chatId, message_id: cb.message!.message_id, text: recordedText(r, r.sender ?? tapper) }).catch(() => null)
}

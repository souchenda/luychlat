import { formatMoney } from "@/lib/money"
import type { Currency, TransactionType } from "@/lib/data/types"

/**
 * "[name] recorded an expense of [amount] on [category]". Same wording as
 * public.notify_workspace_activity(), which sends it to the other members.
 */
export function activityText(
  input: {
    actor: string
    type: TransactionType
    amount: number
    currency: Currency
    category?: string | null
    from?: string | null
    to?: string | null
    note?: string | null
  },
  lang: "km" | "en",
) {
  const { actor, type, category, from, to, note } = input
  const amount = formatMoney(input.amount, input.currency)
  if (lang === "km") {
    const title =
      type === "EXPENSE"
        ? `${actor} បានកត់ចំណាយ ${amount}${category ? ` លើ «${category}»` : ""}`
        : type === "INCOME"
          ? `${actor} បានកត់ចំណូល ${amount}${category ? ` ពី «${category}»` : ""}`
          : `${actor} បានផ្ទេរ ${amount} ពី «${from ?? "?"}» ទៅ «${to ?? "?"}»`
    const body = [type === "TRANSFER" ? null : `កាបូប: ${from ?? "?"}`, note ? `កំណត់ចំណាំ: ${note}` : null]
    return { title, body: body.filter(Boolean).join("\n") }
  }
  const title =
    type === "EXPENSE"
      ? `${actor} recorded an expense of ${amount}${category ? ` on "${category}"` : ""}`
      : type === "INCOME"
        ? `${actor} recorded income of ${amount}${category ? ` from "${category}"` : ""}`
        : `${actor} transferred ${amount} from "${from ?? "?"}" to "${to ?? "?"}"`
  const body = [type === "TRANSFER" ? null : `Wallet: ${from ?? "?"}`, note ? `Note: ${note}` : null]
  return { title, body: body.filter(Boolean).join("\n") }
}

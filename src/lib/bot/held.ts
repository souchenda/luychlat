// Held payments (founder, 14/10/2026): money the bot could not place in a wallet without guessing — a KHQR
// sale with no wallet of the receiving bank, or a bank alert whose last digits match two or more wallets —
// waits for a tap. One button per offered wallet: "hk:<held id>:<index>"; the database books only a wallet
// that was offered.

export type HeldChoice = { id: string; name: string; currency?: string; workspace?: string }

type Button = { text: string; callback_data?: string; url?: string }

const HELD = /^hk:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(\d)$/

export const isHeldCallback = (data: string | undefined) => HELD.test(data ?? "")

export function parseHeldCallback(data: string | undefined): { id: string; idx: number } | null {
  const m = HELD.exec(data ?? "")
  return m ? { id: m[1], idx: Number(m[2]) } : null
}

/** One row per wallet ("👛 ACLEDA ••6222 · DL MEAT SUPPLY"), at most 8, then an optional link row. */
export function heldButtons(heldId: string, choices: HeldChoice[], link?: { text: string; url: string }): Button[][] {
  const rows: Button[][] = choices.slice(0, 8).map((c, i) => [
    { text: `👛 ${[c.name, c.workspace].filter(Boolean).join(" · ")}`.slice(0, 60), callback_data: `hk:${heldId}:${i}` },
  ])
  if (link) rows.push([{ text: link.text, url: link.url }])
  return rows
}

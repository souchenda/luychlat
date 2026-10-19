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

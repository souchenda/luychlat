import { communityBadge } from "@/lib/contributor-thanks"

/**
 * The approval room «LCA Approval» as the founder's live activity stream (founder, 19/10/2026): the new-member card.
 * Place and qasidah cards: lib/place-alerts.ts, lib/nasheed.ts. Pure (activity-alerts.test.ts).
 */
export function signupAlertText(o: { name: string | null; account: string; at: string; islamic: boolean; method: string; source: string | null; total: number }): string {
  return [
    `👤 សមាជិកថ្មីបានចុះឈ្មោះ (New User Joined): ${communityBadge(o.islamic)}`,
    `• ឈ្មោះ៖ ${o.name ?? o.account}`,
    ...(o.name ? [`• ទូរស័ព្ទ/អ៊ីមែល៖ ${o.account}`] : []),
    `• ម៉ោង៖ ${o.at}`,
    `• គណនី៖ ${o.islamic ? "🌙 ឥស្លាម (Islamic Mode)" : "☀️ មហាជន (Personal)"}`,
    `• ចូលតាម៖ ${o.method}${o.source ? ` · ស្គាល់តាម៖ ${o.source}` : ""}`,
    `• 📊 សមាជិកសរុប៖ ${o.total.toLocaleString("en-US")} នាក់`,
  ].join("\n")
}

/**
 * A member's place suggestion in the approval room «LCA Approval» (founder, 19/10/2026): the alert's text, its
 * [ ✅ អនុម័ត ] [ ❌ បដិសេធ ] [ 🗺️ Google Maps ] buttons and the line that replaces them once decided. Pure
 * (place-alerts.test.ts); sent by lib/server/place-alerts.ts.
 */

export type PlaceKind = "MOSQUE" | "SURAU" | "HALAL"
export type PendingPlace = {
  id: string
  kind: PlaceKind
  name: string
  province: string | null
  address: string | null
  lat: number | null
  lng: number | null
  note: string | null
  submitter: string
}

export const PLACE_KIND_LABEL: Record<PlaceKind, string> = {
  MOSQUE: "វិហារឥស្លាម (Mosque)",
  SURAU: "ស៊ូរ៉ាវ (Surau)",
  HALAL: "អាហារហាឡាល់ (Halal Food)",
}

export function placeAlertText(p: PendingPlace): string {
  const where = [p.province, p.address].map((v) => v?.trim()).filter(Boolean).join(" · ") || "—"
  return [
    "🔔 សំណើបន្ថែមទីតាំងថ្មី (New Place Submission):",
    `📍 ឈ្មោះ៖ ${p.name}`,
    `🏷️ ប្រភេទ៖ ${PLACE_KIND_LABEL[p.kind] ?? p.kind}`,
    `🗺️ ខេត្ត/អាសយដ្ឋាន៖ ${where}`,
    ...(p.note?.trim() ? [`📝 កំណត់សម្គាល់៖ ${p.note.trim()}`] : []),
    `👤 អ្នកស្នើសុំ៖ ${p.submitter || "—"}`,
  ].join("\n")
}

export const mapsUrl = (lat: number | null, lng: number | null) =>
  lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) ? `https://www.google.com/maps?q=${lat},${lng}` : null

export function placeAlertButtons(p: Pick<PendingPlace, "id" | "lat" | "lng">) {
  const rows: ({ text: string; callback_data: string } | { text: string; url: string })[][] = [
    [
      { text: "✅ អនុម័ត (Approve)", callback_data: `plr:a:${p.id}` },
      { text: "❌ បដិសេធ (Reject)", callback_data: `plr:r:${p.id}` },
    ],
  ]
  const url = mapsUrl(p.lat, p.lng)
  if (url) rows.push([{ text: "🗺️ មើលលើ Google Maps", url }])
  return rows
}

export const isPlaceReviewCallback = (data: string | undefined) => typeof data === "string" && data.startsWith("plr:")
export function parsePlaceReviewCallback(data: string | undefined): { approve: boolean; id: string } | null {
  const m = /^plr:([ar]):([0-9a-f-]{36})$/.exec(data ?? "")
  return m ? { approve: m[1] === "a", id: m[2] } : null
}

/** The line added under the alert once decided (the buttons go). */
export function placeDecisionLine(status: "approved" | "rejected"): string {
  return status === "approved"
    ? "✅ បានអនុម័តរួចរាល់ដោយ Founder — ទីតាំងនេះបានបង្ហាញជាសាធារណៈលើផែនទីហើយ!"
    : "❌ បានបដិសេធ — ទីតាំងនេះត្រូវបានដកចេញ មិនបង្ហាញលើផែនទីទេ។"
}

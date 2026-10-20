/**
 * A member's place suggestion in the approval room «LCA Approval» (founder, 19/10/2026): the alert's text, its
 * [ ✅ អនុម័ត ] [ ❌ បដិសេធ ] buttons and the line that replaces them once decided. Pure
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

export type PlaceCard = PendingPlace & { contact?: string | null }

/** The kind's mark on the card. */
export const PLACE_KIND_BADGE: Record<PlaceKind, string> = { MOSQUE: "🕌", SURAU: "🤲", HALAL: "🍽️" }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * The card in «LCA Approval» (founder, 20/10/2026) — HTML, the caption under the member's photo when they attached
 * one (≤ 1024 characters), else the message itself: name, kind, province, the Google Maps link, who suggested it.
 */
export function placeAlertText(p: PlaceCard): string {
  const url = mapsUrl(p.lat, p.lng)
  const who = p.submitter?.trim() && p.submitter !== "—" ? p.submitter.trim() : "—"
  const contact = p.contact?.trim()
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
  return [
    "📍 <b>សំណើបញ្ចូលទីតាំងថ្មី</b>",
    `• <b>ឈ្មោះ៖</b> ${esc(clip(p.name, 120))}`,
    `• <b>ប្រភេទ៖</b> ${PLACE_KIND_BADGE[p.kind] ?? "📍"} ${PLACE_KIND_LABEL[p.kind] ?? esc(p.kind)}`,
    `• <b>ខេត្ត/រាជធានី៖</b> ${esc(p.province?.trim() || "—")}`,
    ...(p.address?.trim() ? [`• <b>អាសយដ្ឋាន៖</b> ${esc(clip(p.address.trim(), 200))}`] : []),
    ...(p.note?.trim() ? [`• <b>កំណត់សម្គាល់៖</b> ${esc(clip(p.note.trim(), 200))}`] : []),
    `• <b>តំណភ្ជាប់ផែនទី៖</b> ${url ? `<a href="${url}">មើលលើ Google Maps</a>` : "—"}`,
    `• <b>អ្នកស្នើសុំ៖</b> 👤 ${esc(who)}${contact && contact !== who ? ` (${esc(contact)})` : ""}`,
    "",
    "សូមពិនិត្យរូបភាពខាងលើ និងចុចសម្រេចចិត្ត៖",
  ].join("\n")
}

/** No photo attached: the same card, as a message — it asks to check the details rather than a photo. */
export const placeAlertTextNoPhoto = (p: PlaceCard) => placeAlertText(p).replace("សូមពិនិត្យរូបភាពខាងលើ និងចុចសម្រេចចិត្ត៖", "គ្មានរូបថតភ្ជាប់មកទេ — សូមពិនិត្យព័ត៌មានខាងលើ និងចុចសម្រេចចិត្ត៖")

export const mapsUrl = (lat: number | null, lng: number | null) =>
  lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) ? `https://www.google.com/maps?q=${lat},${lng}` : null

/** [ ✅ អនុម័ត ] [ ❌ បដិសេធ ] — the Google Maps link is in the card itself. */
export function placeAlertButtons(p: Pick<PendingPlace, "id">) {
  return [
    [
      { text: "✅ អនុម័ត", callback_data: `plr:a:${p.id}` },
      { text: "❌ បដិសេធ", callback_data: `plr:r:${p.id}` },
    ],
  ]
}

export const isPlaceReviewCallback = (data: string | undefined) => typeof data === "string" && data.startsWith("plr:")
export function parsePlaceReviewCallback(data: string | undefined): { approve: boolean; id: string } | null {
  const m = /^plr:([ar]):([0-9a-f-]{36})$/.exec(data ?? "")
  return m ? { approve: m[1] === "a", id: m[2] } : null
}

/** The line added under the alert once decided (the buttons go): «✅ បានអនុម័តជោគជ័យ — ទីតាំង Surau (កំពត) …». */
export function placeDecisionLine(status: "approved" | "rejected", place: { name?: string | null; province?: string | null } = {}): string {
  const name = place.name?.trim()
  const which = name ? `ទីតាំង ${name}${place.province?.trim() ? ` (${place.province.trim()})` : ""}` : "ទីតាំងនេះ"
  return status === "approved"
    ? `✅ បានអនុម័តជោគជ័យ — ${which} ត្រូវបានដាក់ឱ្យប្រើប្រាស់ជាសាធារណៈលើផែនទីហើយ!`
    : `❌ បានបដិសេធ — ${which} ត្រូវបានដកចេញ មិនបង្ហាញលើផែនទីទេ។`
}

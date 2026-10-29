// The named places of Cambodia for «my location» on a phone without a geocoder (founder, 29/10/2026 — «show where I am,
// like Samsung: កួរស្រូវ»): every OpenStreetMap city, town, suburb, village and hamlet node with a name, as
// [lat, lng, km, en] in public/data/kh-places.json. The phone finds the nearest one itself — the location never leaves it.
// Data © OpenStreetMap contributors (ODbL — the credit is shown where a name from it is). Refresh:
//   node scripts/kh-places.mjs
import { writeFileSync } from "node:fs"

const QUERY = `[out:json][timeout:300];area["ISO3166-1"="KH"][admin_level=2]->.kh;node(area.kh)["place"~"^(city|town|suburb|quarter|village|hamlet|neighbourhood)$"]["name"];out qt;`
const res = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: { "User-Agent": "AppLuyChlat/1.0 (info@luychlat.com)", "Content-Type": "application/x-www-form-urlencoded" },
  body: "data=" + encodeURIComponent(QUERY),
})
if (!res.ok) throw new Error(`Overpass ${res.status}`)
const { elements } = await res.json()
const KHMER = /[ក-៿]/
const round = (n) => Math.round(n * 1e5) / 1e5
const rows = []
for (const e of elements) {
  const t = e.tags ?? {}
  const km = [t["name:km"], t.name].find((n) => n && KHMER.test(n)) ?? ""
  const en = [t["name:en"], t.name].find((n) => n && !KHMER.test(n)) ?? ""
  if (!km && !en) continue
  rows.push([round(e.lat), round(e.lon), km, en])
}
rows.sort((a, b) => a[0] - b[0] || a[1] - b[1])
writeFileSync("public/data/kh-places.json", JSON.stringify({ source: "© OpenStreetMap contributors (ODbL)", fetched: new Date().toISOString().slice(0, 10), places: rows }))
console.log(`✓ ${rows.length} places → public/data/kh-places.json`)

/**
 * One-off: the bank_atms seed migration from an Overpass export (out center tags) of Cambodia's
 * amenity=atm / amenity=bank. Usage: npx tsx scripts/gen-atm-seed.ts <kh_atm.json> <out.sql>
 * The weekly refresh (src/lib/server/atm-sync.ts) keeps it current afterwards.
 */
import { readFileSync, writeFileSync } from "node:fs"

import { toAtmRow, type OsmElement } from "../src/lib/atm"
import { TOWNS } from "../src/lib/kh-towns"

const [input, output] = process.argv.slice(2)
const elements = (JSON.parse(readFileSync(input, "utf8")) as { elements: OsmElement[] }).elements
const rows = elements.map((e) => toAtmRow(e, TOWNS)).filter((r) => r !== null)
const q = (v: string | null) => (v === null ? "null" : `'${v.replaceAll("'", "''")}'`)
const values = rows.map((r) =>
  `  (${[q(r.osm_ref), q(r.bank_code), q(r.type), q(r.name_kh), q(r.name_en), q(r.address), q(r.province), q(r.province_km), r.latitude, r.longitude, r.currencies ? `array[${r.currencies.map(q).join(",")}]` : "null", r.is_24h].join(", ")})`,
)
writeFileSync(
  output,
  `-- Seed: ${rows.length} ATMs and branches of ABA, ACLEDA, Canadia, Wing and Sathapana — © OpenStreetMap contributors (ODbL).\n` +
    `insert into public.bank_atms (osm_ref, bank_code, type, name_kh, name_en, address, province, province_km, latitude, longitude, currencies, is_24h) values\n` +
    values.join(",\n") +
    `\non conflict (osm_ref) do nothing;\n`,
)
console.log(rows.length, "rows")

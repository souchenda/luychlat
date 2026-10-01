/**
 * Small per-device memory for reconciliation: the column mapping per wallet
 * (when the header looks the same next time) and the category picked for a
 * bank description. Losing it only means choosing again.
 */
import type { Mapping } from "./parse"
import { tokens } from "./match"

const MAPPING_KEY = (walletId: string) => `luysmart-recon-mapping:${walletId}`
const CATEGORY_KEY = (workspaceId: string) => `luysmart-recon-categories:${workspaceId}`

const headerSignature = (header: string[]) => header.map((h) => h.trim().toLowerCase()).join("|")

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: nothing to remember.
  }
}

export function loadMapping(walletId: string, rows: string[][]): Mapping | null {
  const saved = read<{ signature: string; mapping: Mapping }>(MAPPING_KEY(walletId))
  if (!saved) return null
  const header = rows[saved.mapping.headerRow]
  return header && headerSignature(header) === saved.signature ? saved.mapping : null
}

export function saveMapping(walletId: string, rows: string[][], mapping: Mapping) {
  write(MAPPING_KEY(walletId), { signature: headerSignature(rows[mapping.headerRow] ?? []), mapping })
}

/** "PAYMENT TO SMART AXIATA 012345" → "payment smart axiata" (no numbers, first 3 words). */
export function descriptionKey(description: string): string {
  return [...tokens(description)].slice(0, 3).join(" ")
}

export function loadCategoryMemory(workspaceId: string): Record<string, string> {
  return read<Record<string, string>>(CATEGORY_KEY(workspaceId)) ?? {}
}

export function rememberCategories(workspaceId: string, picks: { description: string; categoryId: string }[]) {
  const memory = loadCategoryMemory(workspaceId)
  for (const p of picks) {
    const key = descriptionKey(p.description)
    if (key) memory[key] = p.categoryId
  }
  // Keep the newest 300.
  const entries = Object.entries(memory)
  write(CATEGORY_KEY(workspaceId), Object.fromEntries(entries.slice(-300)))
}

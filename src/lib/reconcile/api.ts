import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export type LineDecision =
  | { action: "match"; txId: string; score: number }
  | { action: "create"; categoryId: string | null; fee: boolean }
  | { action: "ignore" }
  | { action: "none" }

export type ImportPayloadLine = {
  line_no: number
  posted_on: string
  amount: number
  description: string
  bank_ref: string | null
  running_balance: number | null
  fingerprint: string
  action: LineDecision["action"]
  transaction_id?: string
  score?: number
  category_id?: string | null
  fee?: boolean
}

export type ImportMeta = {
  bank: string
  source_format: "CSV" | "XLSX"
  file_sha256: string
  period_start: string
  period_end: string
  opening_balance: number | null
  closing_balance: number | null
  adjust_note?: string
}

export type ImportResult = {
  import_id: string
  inserted: number
  skipped: number
  matched: number
  created: number
  balance_as_of: number | null
  difference: number
  adjusted: number
  aligned: boolean
}

export type StatementImport = {
  id: string
  bank: string
  source_format: string
  period_start: string
  period_end: string
  closing_balance: number | null
  line_count: number
  created_at: string
}

const client = () => {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) throw new Error("not_signed_in")
  return supabase
}

export async function knownFingerprints(walletId: string, fingerprints: string[]): Promise<Set<string>> {
  const { data, error } = await client().rpc("statement_known_fingerprints", { p_wallet_id: walletId, p_fingerprints: fingerprints })
  if (error) throw error
  return new Set((data as string[] | null) ?? [])
}

export async function isFileImported(walletId: string, sha256: string): Promise<boolean> {
  const { data, error } = await client()
    .from("statement_imports")
    .select("id")
    .eq("wallet_id", walletId)
    .eq("file_sha256", sha256)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export async function importStatement(walletId: string, meta: ImportMeta, lines: ImportPayloadLine[], align: boolean): Promise<ImportResult> {
  const { data, error } = await client().rpc("import_statement", {
    p_wallet_id: walletId,
    p_meta: meta,
    p_lines: lines,
    p_align: align,
  })
  if (error) throw error
  return data as ImportResult
}

export async function listImports(walletId: string): Promise<StatementImport[]> {
  const { data, error } = await client()
    .from("statement_imports")
    .select("id, bank, source_format, period_start, period_end, closing_balance, line_count, created_at")
    .eq("wallet_id", walletId)
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) throw error
  return (data as StatementImport[]).map((i) => ({ ...i, closing_balance: i.closing_balance === null ? null : Number(i.closing_balance) }))
}

export async function deleteImport(importId: string): Promise<void> {
  const { error } = await client().rpc("delete_statement_import", { p_import_id: importId })
  if (error) throw error
}

/** Maps a database error to an i18n reason. */
export function importErrorReason(error: unknown): "already_imported" | "plan_required" | "changed" | "generic" {
  const message = String((error as { message?: string })?.message ?? error)
  if (/already_imported/.test(message)) return "already_imported"
  if (/plan_required/.test(message)) return "plan_required"
  if (/match_/.test(message)) return "changed"
  return "generic"
}

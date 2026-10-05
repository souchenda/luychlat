import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Removes files whose records were deleted (public.storage_cleanup, filled by
 * the database when loan documents go — including every file of a deleted
 * loan). Only the Storage API can delete the file itself, so the app does it
 * for the workspaces the user belongs to. A failure leaves the queue as it is
 * for the next try. Never throws.
 */
export async function drainStorageCleanup(supabase: SupabaseClient): Promise<number> {
  try {
    const { data, error } = await supabase.from("storage_cleanup").select("id, bucket, path").order("id").limit(200)
    if (error || !data?.length) return 0
    let removed = 0
    for (const bucket of ["loan-docs", "receipts"] as const) {
      const rows = data.filter((r) => r.bucket === bucket)
      if (!rows.length) continue
      const res = await supabase.storage.from(bucket).remove(rows.map((r) => r.path as string))
      if (res.error) continue
      const done = await supabase.from("storage_cleanup").delete().in("id", rows.map((r) => r.id as number))
      if (!done.error) removed += rows.length
    }
    return removed
  } catch {
    return 0
  }
}

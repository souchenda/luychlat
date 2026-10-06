import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Delete my account (store compliance). The files first, while the account can
 * still reach them (Storage only deletes through its API): receipts and slips,
 * profile photo, NSSF card photos and the loan documents of my workspaces. Then
 * public.delete_my_account() removes the data and the sign-in in one go.
 * Throws the database's reason (staff_account, shared_workspaces, reauth_required, mfa_required).
 */
export async function deleteMyAccount(supabase: SupabaseClient, userId: string) {
  const remove = async (bucket: string, paths: string[]) => {
    for (let i = 0; i < paths.length; i += 100) await supabase.storage.from(bucket).remove(paths.slice(i, i + 100))
  }
  const listAll = async (bucket: string, prefix: string) => {
    const out: string[] = []
    for (let offset = 0; ; offset += 1000) {
      const { data } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset })
      if (!data?.length) break
      out.push(...data.filter((f) => f.id).map((f) => `${prefix}/${f.name}`))
      if (data.length < 1000) break
    }
    return out
  }

  // Best effort: a file that can't be removed must not block deleting the account.
  try {
    await remove("receipts", await listAll("receipts", userId))
    await remove("profile-images", await listAll("profile-images", `user/${userId}`))
    await remove("nssf-cards", await listAll("nssf-cards", userId))
    const { data: owned } = await supabase.from("workspaces").select("id").eq("user_id", userId)
    const ids = (owned ?? []).map((w) => w.id as string)
    if (ids.length) {
      const { data: docs } = await supabase.from("debt_documents").select("bucket, path").in("workspace_id", ids)
      await remove("loan-docs", (docs ?? []).filter((d) => d.bucket === "loan-docs").map((d) => d.path as string))
    }
  } catch {
    // keep going
  }

  const { error } = await supabase.rpc("delete_my_account", { p_confirm: "DELETE" })
  if (error) throw new Error(error.message)
}

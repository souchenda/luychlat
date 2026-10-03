"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/** POST to an /api/admin/* route as the signed-in admin; throws with the status on failure. */
export async function adminPost<T>(path: string, body: unknown = {}): Promise<T> {
  const token = (await getSupabaseBrowserClient()?.auth.getSession())?.data.session?.access_token
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? String(res.status))
  }
  return (await res.json()) as T
}

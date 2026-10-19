"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { globalAdhanPreset, type AdhanPreset, type GlobalAdhanRow } from "@/lib/adhan-presets"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { supabaseUrl } from "@/lib/supabase/config"

/**
 * The Adhans the admin published for everyone (table adhan_presets, founder 19/10/2026): read by every member beside
 * the bundled presets, so a new one appears without a code change; published / removed only by the super admin
 * through /api/adhan/presets.
 */
const KEY = ["adhan-presets-global"]

export function useGlobalAdhanPresets(): AdhanPreset[] {
  const { data } = useQuery({
    queryKey: KEY,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const db = getSupabaseBrowserClient()
      if (!db) return []
      const { data, error } = await db.from("adhan_presets").select("id, name_km, name_en, credit, audio_path").eq("active", true).order("sort").order("created_at")
      if (error) throw error
      return ((data ?? []) as GlobalAdhanRow[]).map((r) => globalAdhanPreset(r, supabaseUrl)).filter((p): p is AdhanPreset => Boolean(p))
    },
  })
  return data ?? []
}

const failure = async (res: Response) => {
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  return new Error(body?.error ?? (res.status === 413 ? "too_big" : "failed"))
}

/** «ដាក់ចូលអេប ប្រើរួមគ្នាទាំងអស់»: the new preset's id («g:<id>») once published. */
export function usePublishAdhan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (v: { file: File; nameKm: string; nameEn: string; credit: string }) => {
      const form = new FormData()
      form.set("name_km", v.nameKm)
      form.set("name_en", v.nameEn)
      form.set("credit", v.credit)
      form.set("rights", "yes")
      form.set("file", v.file, v.file.name || "adhan")
      const res = await fetch("/api/adhan/presets", { method: "POST", body: form })
      if (!res.ok) throw await failure(res)
      return `g:${((await res.json()) as { id: string }).id}`
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })
}

/** Take a published Adhan off for everyone. */
export function useRemoveGlobalAdhan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (presetId: string) => {
      const res = await fetch(`/api/adhan/presets?id=${encodeURIComponent(presetId.replace(/^g:/, ""))}`, { method: "DELETE" })
      if (!res.ok) throw await failure(res)
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  })
}

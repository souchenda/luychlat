"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { duaRecordingUrl } from "@/lib/dua-audio"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { supabaseUrl } from "@/lib/supabase/config"

/**
 * The admin's du'a recordings (table dua_recordings, founder 19/10/2026): read by everyone signed in, so a du'a's
 * 🔊 and «🔁 ទន្ទេញ» appear the moment it has one; set only by the super admin through /api/duas/audio (or the bot).
 */
export type DuaUploaded = { url: string; credit: string; updatedAt: string }

const KEY = ["dua-recordings"]

export function useDuaRecordings() {
  return useQuery({
    queryKey: KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, DuaUploaded>> => {
      const db = getSupabaseBrowserClient()
      if (!db) return {}
      const { data, error } = await db.from("dua_recordings").select("dua_id, audio_path, credit, updated_at")
      if (error) throw error
      const out: Record<string, DuaUploaded> = {}
      for (const r of (data ?? []) as { dua_id: string; audio_path: string; credit: string; updated_at: string }[]) {
        out[r.dua_id] = { url: duaRecordingUrl(supabaseUrl, r.audio_path), credit: r.credit, updatedAt: r.updated_at }
      }
      return out
    },
  })
}

const failure = async (res: Response) => {
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  return new Error(body?.error ?? (res.status === 413 ? "too_big" : "failed"))
}

/** «📤 បញ្ចូលសំឡេង»: the file to the server, which cleans and records it. */
export function useDuaUpload() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (v: { dua: string; credit: string; file: File }) => {
      const form = new FormData()
      form.set("dua", v.dua)
      form.set("credit", v.credit)
      form.set("rights", "yes")
      form.set("file", v.file, v.file.name || "recording")
      const res = await fetch("/api/duas/audio", { method: "POST", body: form })
      if (!res.ok) throw await failure(res)
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  })
}

/** «🗑 លុបសំឡេង»: the recording off this du'a (its 🔊 disappears). */
export function useDuaRemove() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (dua: string) => {
      const res = await fetch(`/api/duas/audio?dua=${encodeURIComponent(dua)}`, { method: "DELETE" })
      if (!res.ok) throw await failure(res)
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  })
}

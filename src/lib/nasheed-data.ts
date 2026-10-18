"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { Track } from "@/lib/audio-queue"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/**
 * Qasidah & Nasheed (table nasheed_tracks, founder, 18/10/2026): STREAM — a recording we hold the rights to,
 * played in the app from the public bucket «nasheed-audio» (its rights note is required); LINK — an artist's
 * official channel, opened there. Only the super admin adds or removes entries (RLS).
 */
export type NasheedTrack = {
  id: string
  kind: "STREAM" | "LINK"
  title_km: string
  title_en: string | null
  artist: string
  audio_path: string | null
  url: string | null
  rights_note: string | null
  sort: number
  active: boolean
}

export const NASHEED_BUCKET = "nasheed-audio"
const KEY = ["nasheed-tracks"]
const db = () => getSupabaseBrowserClient()!

export function useNasheedTracks() {
  return useQuery({
    queryKey: KEY,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await db().from("nasheed_tracks").select("*").order("sort").order("created_at")
      if (error) throw error
      return (data ?? []) as NasheedTrack[]
    },
  })
}

/** The streamed tracks as the player's queue (the bucket is public: a plain https address). */
export function nasheedQueue(tracks: NasheedTrack[], locale: string): Track[] {
  const supabase = getSupabaseBrowserClient()
  return tracks
    .filter((t) => t.kind === "STREAM" && t.audio_path && t.active)
    .map((t) => ({
      key: `nasheed:${t.id}`,
      title: locale === "km" ? t.title_km : (t.title_en ?? t.title_km),
      subtitle: t.artist,
      src: supabase ? supabase.storage.from(NASHEED_BUCKET).getPublicUrl(t.audio_path!).data.publicUrl : "",
    }))
}

export type NasheedInput = { kind: "STREAM" | "LINK"; title_km: string; title_en: string | null; artist: string; url: string | null; rights_note: string | null; file: File | null }

/** The super admin's add / remove (the database refuses anyone else). */
export function useNasheedMutations() {
  const queryClient = useQueryClient()
  const done = () => void queryClient.invalidateQueries({ queryKey: KEY })
  const add = useMutation({
    mutationFn: async (v: NasheedInput) => {
      let audio_path: string | null = null
      if (v.kind === "STREAM") {
        if (!v.file) throw new Error("file")
        const ext = (v.file.name.split(".").pop() ?? "mp3").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp3"
        audio_path = `${crypto.randomUUID()}.${ext}`
        const { error } = await db().storage.from(NASHEED_BUCKET).upload(audio_path, v.file, { contentType: v.file.type || "audio/mpeg", upsert: false })
        if (error) throw error
      }
      const { error } = await db()
        .from("nasheed_tracks")
        .insert({ kind: v.kind, title_km: v.title_km, title_en: v.title_en, artist: v.artist, url: v.kind === "LINK" ? v.url : null, rights_note: v.rights_note, audio_path })
      if (error) {
        if (audio_path) await db().storage.from(NASHEED_BUCKET).remove([audio_path])
        throw error
      }
    },
    onSuccess: done,
  })
  const remove = useMutation({
    mutationFn: async (t: NasheedTrack) => {
      const { error } = await db().from("nasheed_tracks").delete().eq("id", t.id)
      if (error) throw error
      if (t.audio_path) await db().storage.from(NASHEED_BUCKET).remove([t.audio_path])
    },
    onSuccess: done,
  })
  return { add, remove }
}

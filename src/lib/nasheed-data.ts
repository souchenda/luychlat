"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { Track } from "@/lib/audio-queue"
import { audioSrc, contentTypeOf, ownPath, rankTracks, submissionExt, submissionPath, SUBMISSIONS_BUCKET } from "@/lib/nasheed"
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
  /** PRIVATE: a member's own track — only they see it (founder, 20/10/2026). */
  status: "PENDING" | "APPROVED" | "REJECTED" | "PRIVATE"
  credit: string | null
  submitted_by: string | null
  likes: number
  created_at: string
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
      // The community's favourites rise (lib/nasheed rankTracks).
      return rankTracks((data ?? []) as NasheedTrack[])
    },
  })
}

/** The approved streamed tracks as the player's queue: the app's own files, or the public bucket's address. */
export function nasheedQueue(tracks: NasheedTrack[], locale: string): Track[] {
  const supabase = getSupabaseBrowserClient()
  const publicUrl = (path: string) => (supabase ? supabase.storage.from(NASHEED_BUCKET).getPublicUrl(path).data.publicUrl : "")
  return tracks.flatMap((t) => {
    const src = t.kind === "STREAM" && t.active && t.status === "APPROVED" ? audioSrc(t.audio_path, publicUrl) : null
    return src !== null ? [{ key: `nasheed:${t.id}`, title: locale === "km" ? t.title_km : (t.title_en ?? t.title_km), subtitle: t.artist, src }] : []
  })
}

const LIKES_KEY = ["nasheed-likes"]

/** The tracks this person has liked (their own rows only — RLS). */
export function useMyNasheedLikes() {
  return useQuery({
    queryKey: LIKES_KEY,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await db().from("nasheed_likes").select("track_id")
      if (error) throw error
      return new Set(((data ?? []) as { track_id: string }[]).map((r) => r.track_id))
    },
  })
}

/** ❤️ on / off, shown at once and put right if the database refuses. */
export function useToggleNasheedLike() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, liked }: { id: string; liked: boolean }) => {
      const { error } = liked ? await db().from("nasheed_likes").delete().eq("track_id", id) : await db().from("nasheed_likes").insert({ track_id: id })
      if (error) throw error
    },
    onMutate: ({ id, liked }) => {
      queryClient.setQueryData<Set<string>>(LIKES_KEY, (old) => {
        const next = new Set(old)
        if (liked) next.delete(id)
        else next.add(id)
        return next
      })
      queryClient.setQueryData<NasheedTrack[]>(KEY, (old) => old?.map((t) => (t.id === id ? { ...t, likes: Math.max(0, t.likes + (liked ? -1 : 1)) } : t)))
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: LIKES_KEY })
      void queryClient.invalidateQueries({ queryKey: KEY })
    },
  })
}

export type SubmitInput = { title: string; artist: string; file: File; authentic: boolean }

/** «📤 ចែករំលែកបទកសាដះ»: the file to the member's private folder, then the server records it and alerts the founder. */
export function useSubmitNasheed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (v: SubmitInput) => {
      const { data: auth } = await db().auth.getUser()
      const ext = submissionExt(v.file)
      if (!auth.user || !ext) throw new Error("invalid")
      const path = submissionPath(auth.user.id, ext)
      const up = await db().storage.from(SUBMISSIONS_BUCKET).upload(path, v.file, { contentType: contentTypeOf(ext), upsert: false })
      // The storage refused the file (size, type, connection): a clear «upload failed», never a silent stop.
      if (up.error) throw new Error(/size|large|413/i.test(up.error.message) ? "too_big" : "upload_failed")
      const res = await fetch("/api/nasheed/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: v.title, artist: v.artist, path, authentic: v.authentic }),
      })
      if (!res.ok) {
        await db().storage.from(SUBMISSIONS_BUCKET).remove([path])
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? "failed")
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  })
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
      // The app's own CC files ship with the app; a submission's file lives in the private bucket.
      if (t.audio_path?.startsWith("sub:")) await db().storage.from(SUBMISSIONS_BUCKET).remove([t.audio_path.slice(4)])
      else if (t.audio_path && !t.audio_path.startsWith("/")) await db().storage.from(NASHEED_BUCKET).remove([t.audio_path])
    },
    onSuccess: done,
  })
  return { add, remove }
}

export type PrivateInput = { title: string; artist: string; file: File }

/** 🔒 «ទុកស្តាប់ផ្ទាល់ខ្លួន»: the file to the member's own private folder (a UUID name), then their private track. */
export function useSavePrivateNasheed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (v: PrivateInput) => {
      const { data: auth } = await db().auth.getUser()
      const ext = submissionExt(v.file)
      if (!auth.user || !ext) throw new Error("invalid")
      const path = submissionPath(auth.user.id, ext)
      const up = await db().storage.from(SUBMISSIONS_BUCKET).upload(path, v.file, { contentType: contentTypeOf(ext), upsert: false })
      if (up.error) throw new Error(/size|large|413/i.test(up.error.message) ? "too_big" : "upload_failed")
      const { error } = await db().rpc("nasheed_save_private", { p_title: v.title, p_artist: v.artist, p_path: path })
      if (error) {
        await db().storage.from(SUBMISSIONS_BUCKET).remove([path])
        throw new Error(/too many private/.test(error.message) ? "too_many_private" : "failed")
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  })
}

/** 🗑 One of my private tracks: the row, then its file. */
export function useDeletePrivateNasheed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await db().rpc("nasheed_delete_private", { p_id: id })
      if (error) throw error
      if (typeof data === "string" && data) await db().storage.from(SUBMISSIONS_BUCKET).remove([data])
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  })
}

/** My private tracks as the player's queue — signed URLs from the private bucket (an hour; refreshed every 50 minutes). */
export function usePrivateQueue(tracks: NasheedTrack[], locale: string) {
  const mine = tracks.filter((t) => t.status === "PRIVATE" && ownPath(t.audio_path))
  return useQuery({
    queryKey: ["nasheed-private-urls", mine.map((t) => t.id).join(",")],
    enabled: mine.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async (): Promise<Track[]> => {
      const { data, error } = await db().storage.from(SUBMISSIONS_BUCKET).createSignedUrls(mine.map((t) => ownPath(t.audio_path)!), 60 * 60)
      if (error) throw error
      return mine.flatMap((t, i) => {
        const src = data?.[i]?.signedUrl
        return src ? [{ key: `nasheed:${t.id}`, title: locale === "km" ? t.title_km : (t.title_en ?? t.title_km), subtitle: t.artist, src }] : []
      })
    },
  })
}

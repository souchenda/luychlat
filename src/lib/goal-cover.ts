"use client"

import { useQuery } from "@tanstack/react-query"

import { compressImage } from "@/lib/image"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

const BUCKET = "goal-covers"

/** A goal's cover photo: compressed on the phone (upright, no EXIF), into the uploader's own folder. */
export async function uploadGoalCover(file: File, userId: string): Promise<string> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) throw new Error("offline")
  const blob = await compressImage(file, 1280, 0.82)
  const path = `${userId}/${Date.now()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false })
  if (error) throw error
  return path
}

export async function removeGoalCover(path: string) {
  await getSupabaseBrowserClient()?.storage.from(BUCKET).remove([path])
}

/** A short-lived signed URL (the bucket is private: the workspace's members only). */
export function useGoalCoverUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["goal-cover", path],
    enabled: Boolean(path),
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data } = (await getSupabaseBrowserClient()?.storage.from(BUCKET).createSignedUrl(path!, 60 * 60)) ?? { data: null }
      return data?.signedUrl ?? null
    },
  })
}

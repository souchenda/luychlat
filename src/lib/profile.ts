"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import { queryKeys, useRepo } from "@/lib/data/hooks"
import { compressImage } from "@/lib/image"
import { decodeKhqr } from "@/lib/khqr-decode"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useSessionStore } from "@/stores/session-store"

/**
 * Personal profile (photo, name, phone, bio) and the business profile of a
 * BUSINESS workspace (logo, name, phone, address, industry). Images live in
 * the private "profile-images" bucket and are shown through signed URLs:
 *   user/<user id>/<file>   ws/<workspace id>/<file>
 */
const BUCKET = "profile-images"
const SIGNED_SECONDS = 60 * 60

export const INDUSTRIES = ["retail", "food", "wholesale", "agriculture", "services", "transport", "construction", "manufacturing", "online", "other"] as const

/** Short-lived URL for a stored profile photo or logo (null while loading or when there is none). */
export function useImageUrl(path: string | null | undefined): string | null {
  const { data } = useQuery({
    queryKey: ["profile-image", path],
    enabled: Boolean(path),
    staleTime: (SIGNED_SECONDS - 300) * 1000,
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase || !path) return null
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_SECONDS)
      return data?.signedUrl ?? null
    },
  })
  return data ?? null
}

/** Square-ish 512 px JPEG (EXIF/GPS dropped), uploaded under a new name; the old file is removed. */
async function uploadImage(folder: string, file: File, previous: string | null | undefined): Promise<string> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) throw new Error("offline")
  const blob = await compressImage(file, 512, 0.8)
  const path = `${folder}/${Date.now()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false })
  if (error) throw error
  if (previous && previous !== path) await supabase.storage.from(BUCKET).remove([previous])
  return path
}

export type ProfileInput = { display_name: string; phone: string; bio: string; photo?: File | null; removePhoto?: boolean; avatar_path?: string | null }

export function useSaveProfile() {
  const queryClient = useQueryClient()
  const { scope } = useRepo()
  const userId = useSessionStore((s) => s.user?.id)
  return useMutation({
    mutationFn: async (input: ProfileInput) => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase || !userId) throw new Error("offline")
      let avatar_path = input.avatar_path ?? null
      if (input.photo) avatar_path = await uploadImage(`user/${userId}`, input.photo, input.avatar_path)
      else if (input.removePhoto && input.avatar_path) {
        await supabase.storage.from(BUCKET).remove([input.avatar_path])
        avatar_path = null
      }
      const { error } = await supabase.from("profiles").upsert({
        id: userId,
        display_name: input.display_name.trim().slice(0, 40),
        phone: input.phone.trim().slice(0, 30) || null,
        bio: input.bio.trim().slice(0, 200) || null,
        avatar_path,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(scope) })
      void queryClient.invalidateQueries({ queryKey: ["members"] })
    },
  })
}

export type BusinessInput = {
  workspaceId: string
  name: string
  phone: string
  address: string
  industry: string
  photo?: File | null
  removePhoto?: boolean
  logo_path?: string | null
}

export function useSaveBusinessProfile() {
  const queryClient = useQueryClient()
  const { scope } = useRepo()
  return useMutation({
    mutationFn: async (input: BusinessInput) => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) throw new Error("offline")
      let logo_path = input.logo_path ?? null
      if (input.photo) logo_path = await uploadImage(`ws/${input.workspaceId}`, input.photo, input.logo_path)
      else if (input.removePhoto && input.logo_path) {
        await supabase.storage.from(BUCKET).remove([input.logo_path])
        logo_path = null
      }
      const { error } = await supabase
        .from("workspaces")
        .update({
          name: input.name.trim().slice(0, 60),
          business_phone: input.phone.trim().slice(0, 30) || null,
          business_address: input.address.trim().slice(0, 200) || null,
          business_industry: input.industry || null,
          logo_path,
        })
        .eq("id", input.workspaceId)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces(scope) }),
  })
}

/** Archive / restore / delete a business workspace (owner only; never the last active one). */
export function useBusinessLifecycle() {
  const queryClient = useQueryClient()
  const { scope } = useRepo()
  const done = () => void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces(scope) })
  return {
    setArchived: useMutation({
      mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
        const { error } = await getSupabaseBrowserClient()!.rpc("set_business_archived", { p_workspace_id: id, p_archived: archived })
        if (error) throw error
      },
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await getSupabaseBrowserClient()!.rpc("delete_business_workspace", { p_workspace_id: id })
        if (error) throw error
      },
      onSuccess: done,
    }),
  }
}

/**
 * The user's own KHQR (from their bank app), attached to payment reminders so
 * the debtor can scan and pay. Kept as the original image, at most ~1600 px,
 * so the code stays sharp enough to scan. Its text (khqr_payload, read in the
 * browser) lets receipts and the bot redraw the same code.
 */
export function useMyKhqr() {
  const queryClient = useQueryClient()
  const userId = useSessionStore((s) => s.user?.id ?? null)
  const key = ["my-khqr", userId] as const
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return null
      // A separate query: if the column isn't there yet the profile still loads.
      const { data, error } = await supabase.from("profiles").select("khqr_path, khqr_payload").eq("id", userId!).maybeSingle()
      if (error) {
        // Before the khqr_payload column exists.
        const old = await supabase.from("profiles").select("khqr_path").eq("id", userId!).maybeSingle()
        return { path: (old.data?.khqr_path as string | null) ?? null, payload: null }
      }
      return { path: (data?.khqr_path as string | null) ?? null, payload: (data?.khqr_payload as string | null) ?? null }
    },
  })
  const path = query.data?.path ?? null
  const payload = query.data?.payload ?? null
  const url = useImageUrl(path)

  // A KHQR saved before its text was kept: read it once from the image.
  useEffect(() => {
    if (!userId || !path || payload || !url) return
    let cancelled = false
    void (async () => {
      const image = await fetch(url).then((r) => (r.ok ? r.blob() : null)).catch(() => null)
      const text = image ? await decodeKhqr(image) : null
      const supabase = getSupabaseBrowserClient()
      if (cancelled || !text || !supabase) return
      const { error } = await supabase.from("profiles").update({ khqr_payload: text }).eq("id", userId)
      if (!error) queryClient.setQueryData(key, { path, payload: text })
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per image
  }, [userId, path, payload, url])

  const save = useMutation({
    mutationFn: async (file: File | null) => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase || !userId) throw new Error("offline")
      let next: string | null = null
      let text: string | null = null
      if (file) {
        text = await decodeKhqr(file)
        // The profile-images bucket takes files up to 1 MB.
        const small = file.size <= 900_000 && /^image\/(png|jpeg|webp)$/.test(file.type)
        const blob = small ? file : await compressImage(file, 1600, 0.92)
        const ext = small ? (file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg") : "jpg"
        next = `user/${userId}/khqr-${Date.now()}.${ext}`
        const { error } = await supabase.storage.from(BUCKET).upload(next, blob, { contentType: small ? file.type : "image/jpeg", upsert: false })
        if (error) throw error
      }
      const { error } = await supabase.from("profiles").update({ khqr_path: next, khqr_payload: text }).eq("id", userId)
      if (error) throw error
      if (path && path !== next) await supabase.storage.from(BUCKET).remove([path])
      return { path: next, payload: text }
    },
    onSuccess: (next) => queryClient.setQueryData(key, next),
  })
  return { path, payload, url, loading: query.isLoading, save }
}

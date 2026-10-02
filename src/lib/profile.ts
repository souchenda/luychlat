"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { queryKeys, useRepo } from "@/lib/data/hooks"
import { compressImage } from "@/lib/image"
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

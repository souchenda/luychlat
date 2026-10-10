"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { CardKind, DetailKey } from "@/lib/id-card"
import { useRepo } from "@/lib/data/hooks"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/** Card photos: NSSF cards and the other vault cards, each in a private bucket (a folder per account). */
export type CardBucket = "nssf-cards" | "id-cards"

/**
 * A vault card (public.id_cards): national ID, driving licence, vehicle registration, insurance or
 * bank card. Private to the account. The photos are the ground truth; the fields index them.
 */
export type IdCard = {
  id: string
  kind: CardKind
  holder_kh: string | null
  holder_en: string | null
  doc_number: string | null
  dob: string | null
  gender: "MALE" | "FEMALE" | null
  issued_on: string | null
  expires_on: string | null
  issuer: string | null
  details: Partial<Record<DetailKey, string>>
  qr_text: string | null
  front_path: string | null
  back_path: string | null
  verified_by_user: boolean
  is_uncertain: boolean
  note: string | null
  created_at: string
}
export type IdCardInput = Omit<IdCard, "id" | "created_at">

const BUCKET: CardBucket = "id-cards"

const client = () => {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) throw new Error("offline")
  return supabase
}

/** A short-lived link to a stored card photo. */
export async function signedCardUrl(bucket: CardBucket, path: string): Promise<string | null> {
  const { data } = (await getSupabaseBrowserClient()?.storage.from(bucket).createSignedUrl(path, 15 * 60)) ?? { data: null }
  return data?.signedUrl ?? null
}

export function useCardPhotoUrl(bucket: CardBucket, path: string | null) {
  return useQuery({
    queryKey: ["card-photo", bucket, path],
    enabled: Boolean(path),
    staleTime: 10 * 60_000,
    queryFn: () => signedCardUrl(bucket, path!),
  })
}

export function useIdCards() {
  const { scope } = useRepo()
  return useQuery({
    queryKey: ["id-cards", scope],
    queryFn: async (): Promise<IdCard[]> => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return []
      const { data, error } = await supabase.from("id_cards").select("*").order("created_at")
      if (error) throw error
      return (data ?? []) as IdCard[]
    },
  })
}

export function useIdCardMutations() {
  const queryClient = useQueryClient()
  const { scope } = useRepo()
  const done = () => void queryClient.invalidateQueries({ queryKey: ["id-cards", scope] })
  return {
    save: useMutation({
      mutationFn: async ({ id, input }: { id?: string; input: Partial<IdCardInput> }) => {
        const { error } = id ? await client().from("id_cards").update(input).eq("id", id) : await client().from("id_cards").insert(input)
        if (error) throw error
      },
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (c: IdCard) => {
        const paths = [c.front_path, c.back_path].filter((p): p is string => Boolean(p))
        if (paths.length) await client().storage.from(BUCKET).remove(paths)
        const { error } = await client().from("id_cards").delete().eq("id", c.id)
        if (error) throw error
      },
      onSuccess: done,
    }),
    /** A card photo into the account's own folder; returns its path. */
    uploadPhoto: async (image: Blob) => {
      const supabase = client()
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error("not signed in")
      const path = `${auth.user.id}/${crypto.randomUUID()}.jpg`
      const { error } = await supabase.storage.from(BUCKET).upload(path, image, { contentType: image.type || "image/jpeg" })
      if (error) throw error
      return path
    },
    removePhoto: async (path: string) => {
      await client().storage.from(BUCKET).remove([path])
    },
  }
}

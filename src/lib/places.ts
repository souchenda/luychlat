"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { compressImage } from "@/lib/image"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useSessionStore } from "@/stores/session-store"

/**
 * Directory of mosques, surau and halal food places (table islamic_places).
 * Everyone sees approved places; a suggestion is visible to its author until
 * an admin approves it. Only admins can mark a place as halal-certified.
 */
export type PlaceKind = "MOSQUE" | "SURAU" | "HALAL"
export const PLACE_KINDS: PlaceKind[] = ["MOSQUE", "SURAU", "HALAL"]

export type IslamicPlace = {
  id: string
  kind: PlaceKind
  name: string
  province: string | null
  address: string | null
  lat: number | null
  lng: number | null
  phone: string | null
  note: string | null
  halal_certified: boolean
  approved: boolean
  /** Photo in the private place-photos bucket (<uploader>/<file>). */
  photo_path?: string | null
  created_by: string | null
  created_at: string
}

export type PlaceInput = Pick<IslamicPlace, "kind" | "name" | "province" | "address" | "lat" | "lng" | "phone" | "note" | "photo_path"> & {
  halal_certified?: boolean
  approved?: boolean
}

const KEY = ["islamic-places"] as const

export function usePlaces() {
  const userId = useSessionStore((s) => s.user?.id)
  return useQuery({
    queryKey: [...KEY, userId],
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return [] as IslamicPlace[]
      const { data, error } = await supabase.from("islamic_places").select("*").order("name")
      if (error) throw error
      return (data ?? []) as IslamicPlace[]
    },
  })
}

export function usePlaceMutations() {
  const queryClient = useQueryClient()
  const done = () => void queryClient.invalidateQueries({ queryKey: KEY })
  const client = () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) throw new Error("offline")
    return supabase
  }
  return {
    /** A user's suggestion (pending) or, for an admin, a listed place. */
    add: useMutation({
      mutationFn: async (input: PlaceInput) => {
        const { error } = await client().from("islamic_places").insert(input)
        if (error) throw error
      },
      onSuccess: done,
    }),
    /** Admin: approve / certify / edit. */
    update: useMutation({
      mutationFn: async ({ id, patch }: { id: string; patch: Partial<PlaceInput> }) => {
        const { error } = await client().from("islamic_places").update(patch).eq("id", id)
        if (error) throw error
      },
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await client().from("islamic_places").delete().eq("id", id)
        if (error) throw error
      },
      onSuccess: done,
    }),
  }
}

/**
 * Coordinates from what people paste: "11.55, 104.92", a Google Maps link with
 * "@11.55,104.92" or "q=11.55,104.92". Null when none is found or out of range.
 */
export function parseLatLng(text: string): { lat: number; lng: number } | null {
  const m = text.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null
}

/** Google Maps link for a place: its pin when known, otherwise a search by name and address. */
export function mapsUrl(p: Pick<IslamicPlace, "name" | "address" | "province" | "lat" | "lng">): string {
  const query = p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : [p.name, p.address, p.province, "Cambodia"].filter(Boolean).join(", ")
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

const PHOTO_BUCKET = "place-photos"

/** Uploads a (compressed) place photo into the user's folder; returns its path. */
export async function uploadPlacePhoto(file: File, userId: string): Promise<string> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) throw new Error("offline")
  const blob = await compressImage(file, 1280, 0.8)
  const path = `${userId}/${Date.now()}.jpg`
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false })
  if (error) throw error
  return path
}

/** Short-lived URL for a place photo (visible to everyone once the place is approved). */
export function usePlacePhotoUrl(path: string | null | undefined): string | null {
  const { data } = useQuery({
    queryKey: ["place-photo", path],
    enabled: Boolean(path),
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase || !path) return null
      const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60)
      return data?.signedUrl ?? null
    },
  })
  return data ?? null
}

"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { compressImage } from "@/lib/image"
import { khqrBank, khqrInfo, type KhqrBank } from "@/lib/khqr"
import { isDuplicate, sortCodes, type KhqrCode } from "@/lib/khqr-codes"
import { decodeKhqr } from "@/lib/khqr-decode"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

const BUCKET = "khqr-codes"
const key = (ws: string | undefined) => ["khqr-codes", ws] as const

const client = () => {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) throw new Error("offline")
  return supabase
}

/** The workspace's KHQR codes, the default first. */
export function useWorkspaceKhqrs(workspaceId: string | undefined) {
  return useQuery({
    queryKey: key(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<KhqrCode[]> => {
      const { data, error } = await client().from("workspace_khqr_codes").select("*").eq("workspace_id", workspaceId!)
      if (error) throw error
      return sortCodes((data ?? []) as KhqrCode[])
    },
  })
}

export function useKhqrImageUrl(path: string | null) {
  return useQuery({
    queryKey: ["khqr-image", path],
    enabled: Boolean(path),
    staleTime: 10 * 60_000,
    queryFn: async () => (await client().storage.from(BUCKET).createSignedUrl(path!, 15 * 60)).data?.signedUrl ?? null,
  })
}

export type AddResult = { status: "ok"; code: KhqrCode } | { status: "unreadable" | "duplicate" }

export function useKhqrCodeMutations(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  const done = () => void queryClient.invalidateQueries({ queryKey: key(workspaceId) })
  return {
    /** A screenshot of a bank app's KHQR: read on the phone (bank and currency from the code), kept with its image. */
    add: useMutation({
      mutationFn: async (file: File): Promise<AddResult> => {
        if (!workspaceId) throw new Error("no workspace")
        const payload = await decodeKhqr(file)
        if (!payload) return { status: "unreadable" }
        const existing = queryClient.getQueryData<KhqrCode[]>(key(workspaceId)) ?? []
        if (isDuplicate(existing, payload)) return { status: "duplicate" }
        const info = khqrInfo(payload)
        const supabase = client()
        const image = await compressImage(file, 1600, 0.92)
        const path = `${workspaceId}/${crypto.randomUUID()}.jpg`
        const uploaded = await supabase.storage.from(BUCKET).upload(path, image, { contentType: "image/jpeg" })
        const { data, error } = await supabase
          .from("workspace_khqr_codes")
          .insert({
            workspace_id: workspaceId,
            bank_code: khqrBank(payload),
            currency: info.currency ?? "KHR",
            merchant_name: info.name,
            khqr_payload: payload,
            image_path: uploaded.error ? null : path,
          })
          .select("*")
          .single()
        if (error) {
          if (!uploaded.error) await supabase.storage.from(BUCKET).remove([path])
          if (error.code === "23505") return { status: "duplicate" }
          throw error
        }
        return { status: "ok", code: data as KhqrCode }
      },
      onSuccess: done,
    }),
    setDefault: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await client().rpc("khqr_set_default", { p_id: id })
        if (error) throw error
      },
      onSuccess: done,
    }),
    /** A correction when the code doesn't say (bank OTHER, no currency). */
    update: useMutation({
      mutationFn: async ({ id, bank_code, currency }: { id: string; bank_code: KhqrBank; currency: "KHR" | "USD" }) => {
        const { error } = await client().from("workspace_khqr_codes").update({ bank_code, currency }).eq("id", id)
        if (error) throw error
      },
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (code: KhqrCode) => {
        const { error } = await client().from("workspace_khqr_codes").delete().eq("id", code.id)
        if (error) throw error
        if (code.image_path) await client().storage.from(BUCKET).remove([code.image_path])
      },
      onSuccess: done,
    }),
  }
}

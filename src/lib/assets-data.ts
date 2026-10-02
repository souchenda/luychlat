"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { PhysicalAsset, PhysicalAssetInput } from "@/lib/assets"
import { useRepo } from "@/lib/data/hooks"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

const toAsset = (row: PhysicalAsset): PhysicalAsset => ({
  ...row,
  estimated_value: Number(row.estimated_value),
  purchase_price: row.purchase_price == null ? null : Number(row.purchase_price),
})

export function usePhysicalAssets(workspaceId: string | undefined) {
  const { scope } = useRepo()
  return useQuery({
    queryKey: ["physical-assets", scope, workspaceId ?? ""],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return [] as PhysicalAsset[]
      const { data, error } = await supabase.from("physical_assets").select("*").eq("workspace_id", workspaceId!).order("created_at", { ascending: false })
      if (error) throw error
      return ((data ?? []) as PhysicalAsset[]).map(toAsset)
    },
  })
}

export function usePhysicalAssetMutations(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  const { scope } = useRepo()
  const done = () => void queryClient.invalidateQueries({ queryKey: ["physical-assets", scope] })
  const client = () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !workspaceId) throw new Error("offline")
    return supabase
  }
  return {
    add: useMutation({
      mutationFn: async (input: PhysicalAssetInput) => {
        const { error } = await client().from("physical_assets").insert({ workspace_id: workspaceId, ...input })
        if (error) throw error
      },
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: async ({ id, input }: { id: string; input: PhysicalAssetInput }) => {
        const { error } = await client().from("physical_assets").update(input).eq("id", id)
        if (error) throw error
      },
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await client().from("physical_assets").delete().eq("id", id)
        if (error) throw error
      },
      onSuccess: done,
    }),
  }
}

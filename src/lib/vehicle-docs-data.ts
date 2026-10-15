"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useRepo } from "@/lib/data/hooks"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { VehicleDoc } from "@/lib/vehicle-docs"

export type VehicleDocInput = Pick<VehicleDoc, "vehicle" | "doc_type" | "provider" | "expires_on" | "cost" | "currency" | "notes" | "remind_days">

const toDoc = (row: VehicleDoc): VehicleDoc => ({ ...row, cost: row.cost == null ? null : Number(row.cost) })

async function listDocs(workspaceId: string): Promise<VehicleDoc[]> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return []
  const { data, error } = await supabase.from("vehicle_documents").select("*").eq("workspace_id", workspaceId).order("expires_on")
  if (error) throw error
  return ((data ?? []) as VehicleDoc[]).map(toDoc)
}

/** The Personal workspace's vehicle documents, soonest expiry first. */
export function useVehicleDocs(workspaceId: string | undefined, enabled = true) {
  const { scope } = useRepo()
  return useQuery({ queryKey: ["vehicle-docs", scope, workspaceId ?? ""], enabled: Boolean(workspaceId) && enabled, queryFn: () => listDocs(workspaceId!) })
}

export function useVehicleDocMutations(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  const { scope } = useRepo()
  const done = () => queryClient.invalidateQueries({ queryKey: ["vehicle-docs", scope] })
  const client = () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !workspaceId) throw new Error("offline")
    return supabase
  }
  const save = useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: VehicleDocInput }) => {
      const q = client().from("vehicle_documents")
      const { error } = id ? await q.update(input).eq("id", id) : await q.insert({ workspace_id: workspaceId, ...input })
      if (error) throw error
    },
    onSuccess: done,
  })
  /** «បន្តរួច»: the new expiry date. */
  const renew = useMutation({
    mutationFn: async ({ id, expiresOn }: { id: string; expiresOn: string }) => {
      const { error } = await client().from("vehicle_documents").update({ expires_on: expiresOn }).eq("id", id)
      if (error) throw error
    },
    onSuccess: done,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client().from("vehicle_documents").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: done,
  })
  return { save, renew, remove }
}

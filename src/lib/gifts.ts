"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useRepo } from "@/lib/data/hooks"
import type { Currency } from "@/lib/data/types"
import type { Gift, GiftDirection, GiftEventType } from "@/lib/gift"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export type NewGift = {
  direction: GiftDirection
  person: string
  phone: string | null
  eventType: GiftEventType
  title: string | null
  amount: number
  currency: Currency
  date: string
  walletId: string | null
  notes: string | null
}

const client = () => {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) throw new Error("offline")
  return supabase
}

export function useGifts(workspaceId: string | undefined) {
  const { scope } = useRepo()
  return useQuery({
    queryKey: ["gifts", scope, workspaceId ?? ""],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await client()
        .from("gift_ledger")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("event_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1000)
      if (error) throw error
      return ((data ?? []) as Gift[]).map((g) => ({ ...g, amount: Number(g.amount) }))
    },
  })
}

export function useGiftMutations(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  const done = (money: boolean) => {
    void queryClient.invalidateQueries({ queryKey: ["gifts"] })
    if (money) for (const key of ["transactions", "wallets", "categories"]) void queryClient.invalidateQueries({ queryKey: [key] })
  }
  return {
    add: useMutation({
      mutationFn: async (g: NewGift) => {
        const { error } = await client().rpc("add_gift", {
          p_workspace_id: workspaceId,
          p_direction: g.direction,
          p_person: g.person,
          p_phone: g.phone,
          p_event_type: g.eventType,
          p_title: g.title,
          p_amount: g.amount,
          p_currency: g.currency,
          p_date: g.date,
          p_wallet_id: g.walletId,
          p_notes: g.notes,
        })
        if (error) throw error
      },
      onSuccess: (_d, g) => done(Boolean(g.walletId)),
    }),
    update: useMutation({
      mutationFn: async (v: { id: string; patch: Partial<Pick<Gift, "person_name" | "phone_number" | "event_type" | "event_title" | "event_date" | "notes">> }) => {
        const { error } = await client().from("gift_ledger").update(v.patch).eq("id", v.id)
        if (error) throw error
      },
      onSuccess: () => done(false),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await client().rpc("delete_gift", { p_gift_id: id })
        if (error) throw error
      },
      onSuccess: () => done(true),
    }),
  }
}

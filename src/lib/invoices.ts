"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useRepo } from "@/lib/data/hooks"
import type { Currency } from "@/lib/data/types"
import { toInvoice, type Invoice, type InvoiceItem } from "@/lib/invoice"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export type InvoiceInput = {
  /** Null: the sum of qty × price. */
  total: number | null
  currency: Currency
  customer_name: string | null
  customer_phone: string | null
  items: InvoiceItem[]
  notes: string | null
  target_wallet_id: string | null
}

/** Thrown when a FREE account has used its invoices for the month. */
export class InvoiceLimitError extends Error {}

const client = () => {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) throw new Error("offline")
  return supabase
}

export function useInvoices(workspaceId: string | undefined) {
  const { scope } = useRepo()
  return useQuery({
    queryKey: ["invoices", scope, workspaceId ?? ""],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await client()
        .from("invoices")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(200)
      if (error) throw error
      return ((data ?? []) as Invoice[]).map(toInvoice)
    },
  })
}

/** This month's invoices and the plan's limit (null = unlimited). */
export function useInvoiceQuota() {
  const { scope } = useRepo()
  return useQuery({
    queryKey: ["invoices", scope, "quota"],
    queryFn: async () => {
      const { data, error } = await client().rpc("my_invoice_quota")
      if (error) throw error
      return data as { used: number; limit: number | null }
    },
  })
}

/** The receipt image (PNG) as drawn by the server. */
export async function fetchReceipt(id: string, lang: string): Promise<Blob> {
  const res = await fetch(`/api/invoices/${id}/receipt?lang=${encodeURIComponent(lang)}`, { cache: "no-store" })
  if (!res.ok) throw new Error(`receipt ${res.status}`)
  return res.blob()
}

export function useInvoiceMutations(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  const { scope } = useRepo()
  const done = (money = false) => {
    void queryClient.invalidateQueries({ queryKey: ["invoices", scope] })
    if (money) {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] })
      void queryClient.invalidateQueries({ queryKey: ["wallets"] })
      void queryClient.invalidateQueries({ queryKey: ["categories"] })
    }
  }
  return {
    create: useMutation({
      mutationFn: async (input: InvoiceInput) => {
        const { data, error } = await client().rpc("create_invoice", {
          p_workspace_id: workspaceId,
          p_total: input.total,
          p_currency: input.currency,
          p_customer_name: input.customer_name,
          p_customer_phone: input.customer_phone,
          p_items: input.items,
          p_notes: input.notes,
          p_target_wallet_id: input.target_wallet_id,
        })
        if (error) throw /plan_limit:invoices/.test(error.message) ? new InvoiceLimitError() : error
        return toInvoice(data as Invoice)
      },
      onSuccess: () => done(),
    }),
    markPaid: useMutation({
      mutationFn: async (v: { id: string; walletId: string | null }) => {
        const { data, error } = await client().rpc("mark_invoice_paid", { p_invoice_id: v.id, p_wallet_id: v.walletId, p_date: null })
        if (error) throw error
        return data as { status: string; logged?: boolean; wallet?: string | null }
      },
      onSuccess: () => done(true),
    }),
    cancel: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await client().rpc("cancel_invoice", { p_invoice_id: id })
        if (error) throw error
      },
      onSuccess: () => done(),
    }),
    reopen: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await client().rpc("reopen_invoice", { p_invoice_id: id })
        if (error) throw error
      },
      onSuccess: () => done(true),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await client().from("invoices").delete().eq("id", id)
        if (error) throw error
      },
      onSuccess: () => done(),
    }),
  }
}

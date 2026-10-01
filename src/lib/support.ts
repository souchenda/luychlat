"use client"

import { useQuery } from "@tanstack/react-query"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export type SupportContacts = { telegram_url?: string; community_url?: string; phone?: string; hours?: string }
export type TicketCategory = "PAYMENT" | "BUG" | "FEATURE" | "OTHER"
export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"
export type SupportTicket = {
  id: string
  category: TicketCategory
  message: string
  contact: string | null
  status: TicketStatus
  admin_reply: string | null
  replied_at: string | null
  created_at: string
}

export const TICKET_CATEGORIES: TicketCategory[] = ["PAYMENT", "BUG", "FEATURE", "OTHER"]

/** Contact channels set in /admin (readable in Guest Mode too). */
export function useSupportContacts() {
  return useQuery({
    queryKey: ["support-contacts"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return {} as SupportContacts
      const { data, error } = await supabase.rpc("support_contacts")
      if (error) throw error
      return (data ?? {}) as SupportContacts
    },
  })
}

/** tel: link from "+855 12 345 678". */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`

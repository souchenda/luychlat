"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useRepo } from "@/lib/data/hooks"
import type { Currency } from "@/lib/data/types"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/**
 * Bills & reminders (public.recurring_bills): recurring bills of a workspace
 * with reminders N days before each due date (app notifications and Telegram,
 * see run_bill_alerts). "Paid" covers one due date at a time (paid_until).
 */
export type BillKind = "ELECTRICITY" | "WATER" | "INTERNET" | "RENT" | "WASTE" | "LOAN" | "NSSF" | "OTHER"
export type BillFrequency = "MONTHLY" | "YEARLY"
export type NssfType = "self_employed_monthly" | "self_employed_yearly" | "enterprise"

export type Bill = {
  id: string
  workspace_id: string
  title: string
  kind: BillKind
  amount: number
  currency: Currency
  frequency: BillFrequency
  due_day: number | null
  due_date: string | null
  nssf_type: NssfType | null
  remind_days: number[]
  category_id: string | null
  paid_until: string | null
  is_active: boolean
  created_at: string
}
export type BillInput = Pick<Bill, "title" | "kind" | "amount" | "currency" | "frequency" | "due_day" | "due_date" | "nssf_type" | "remind_days" | "category_id" | "is_active">

export const BILL_EMOJI: Record<BillKind, string> = {
  ELECTRICITY: "⚡",
  WATER: "💧",
  INTERNET: "📶",
  RENT: "🏠",
  WASTE: "🗑️",
  LOAN: "🏦",
  NSSF: "🛡️",
  OTHER: "🧾",
}

export type BillPreset = { id: string; kind: BillKind; input: Partial<BillInput> }

/**
 * Starting points for the form. The NSSF (ប.ស.ស.) self-employed figures are
 * defaults the user can change — rates and deadlines are set by NSSF and can
 * change (the form says so, with a link to nssf.gov.kh).
 */
export const BILL_PRESETS: BillPreset[] = [
  { id: "electricity", kind: "ELECTRICITY", input: { currency: "KHR", frequency: "MONTHLY", due_day: 10, remind_days: [3] } },
  { id: "water", kind: "WATER", input: { currency: "KHR", frequency: "MONTHLY", due_day: 10, remind_days: [3] } },
  { id: "internet", kind: "INTERNET", input: { currency: "USD", frequency: "MONTHLY", due_day: 1, remind_days: [3] } },
  { id: "rent", kind: "RENT", input: { currency: "USD", frequency: "MONTHLY", due_day: 1, remind_days: [3] } },
  { id: "waste", kind: "WASTE", input: { currency: "KHR", frequency: "MONTHLY", due_day: 5, remind_days: [2] } },
  { id: "loan", kind: "LOAN", input: { currency: "USD", frequency: "MONTHLY", due_day: 25, remind_days: [5, 2] } },
  // Due before the 15th: reminders on the 10th and the 13th.
  { id: "nssf_monthly", kind: "NSSF", input: { amount: 15600, currency: "KHR", frequency: "MONTHLY", due_day: 15, remind_days: [5, 2], nssf_type: "self_employed_monthly" } },
  // 15,600៛ × 12, paid ahead for the year: a reminder 15 days before it runs out.
  { id: "nssf_yearly", kind: "NSSF", input: { amount: 187200, currency: "KHR", frequency: "YEARLY", remind_days: [15], nssf_type: "self_employed_yearly" } },
  { id: "other", kind: "OTHER", input: { currency: "USD", frequency: "MONTHLY", due_day: 1, remind_days: [2] } },
]

export const NSSF_URL = "https://www.nssf.gov.kh"

const pad = (n: number) => String(n).padStart(2, "0")
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
/** Today in Cambodia (YYYY-MM-DD). */
export const cambodiaToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)

/**
 * The next unpaid due date (same rule as public.bill_next_due): the first
 * occurrence after paid_until, or for a new bill the first on or after the day
 * it was created. May be in the past (overdue).
 */
export function nextDue(bill: Pick<Bill, "frequency" | "due_day" | "due_date" | "paid_until" | "created_at">): string {
  const created = new Date(Date.parse(bill.created_at) + 7 * 3_600_000).toISOString().slice(0, 10)
  const after = bill.paid_until ?? new Date(Date.parse(`${created}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  const [ay, am] = after.split("-").map(Number)
  if (bill.frequency === "MONTHLY") {
    let y = ay
    let m = am
    for (let i = 0; i < 25; i++) {
      const d = ymd(y, m, Math.min(bill.due_day ?? 1, daysInMonth(y, m)))
      if (d > after) return d
      m += 1
      if (m > 12) {
        m = 1
        y += 1
      }
    }
  }
  const base = bill.due_date ?? after
  const [by, bm, bd] = base.split("-").map(Number)
  for (let i = 0; i < 50; i++) {
    const d = ymd(by + i, bm, Math.min(bd, daysInMonth(by + i, bm)))
    if (d > after) return d
  }
  return base
}

/** Whole days from today (Cambodia) to a date; negative when overdue. */
export const daysUntil = (iso: string, today = cambodiaToday()) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)

const toBill = (row: Bill): Bill => ({ ...row, amount: Number(row.amount) })

async function listBills(workspaceId: string): Promise<Bill[]> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return []
  const { data, error } = await supabase.from("recurring_bills").select("*").eq("workspace_id", workspaceId).order("created_at")
  if (error) throw error
  return ((data ?? []) as Bill[]).map(toBill)
}

export const billKeys = { list: (scope: string, ws: string) => ["bills", scope, ws] as const }

/** Bills of a workspace (cloud accounts; Guest Mode has none). */
export function useBills(workspaceId: string | undefined) {
  const { scope } = useRepo()
  return useQuery({ queryKey: billKeys.list(scope, workspaceId ?? ""), enabled: Boolean(workspaceId), queryFn: () => listBills(workspaceId!) })
}

export function useBillMutations(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  const { scope } = useRepo()
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ["bills", scope] })
    void queryClient.invalidateQueries({ queryKey: ["transactions"] })
    void queryClient.invalidateQueries({ queryKey: ["wallets"] })
  }
  const client = () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !workspaceId) throw new Error("offline")
    return supabase
  }
  return {
    save: useMutation({
      mutationFn: async ({ id, input }: { id?: string; input: BillInput }) => {
        const { error } = id
          ? await client().from("recurring_bills").update(input).eq("id", id)
          : await client().from("recurring_bills").insert({ workspace_id: workspaceId, ...input })
        if (error) throw error
      },
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await client().from("recurring_bills").delete().eq("id", id)
        if (error) throw error
      },
      onSuccess: done,
    }),
    /** Marks the next due date paid; with a wallet, also logs the expense there. */
    markPaid: useMutation({
      mutationFn: async (v: { id: string; walletId?: string | null; amount?: number | null }) => {
        const { data, error } = await client().rpc("mark_bill_paid", { p_bill_id: v.id, p_wallet_id: v.walletId ?? null, p_amount: v.amount ?? null, p_date: null })
        if (error) throw error
        return data as { paid_due: string; next_due: string; transaction_id: string | null }
      },
      onSuccess: done,
    }),
  }
}

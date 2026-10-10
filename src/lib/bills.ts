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
import type { UtilityBill } from "@/lib/utility-bill"

/** One month's paper bill under a recurring bill (public.bill_statements). */
export type BillStatement = {
  id: string
  bill_id: string
  due_date: string | null
  amount: number
  currency: "KHR" | "USD"
  usage: number | null
  rate: number | null
  invoice_no: string | null
  status: "PENDING" | "PAID"
  created_at: string
}

/** A bill's statements, newest first (the usage history). */
export function useBillStatements(billId: string | null | undefined) {
  const { scope } = useRepo()
  return useQuery({
    queryKey: ["bill-statements", scope, billId ?? ""],
    enabled: Boolean(billId),
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return [] as BillStatement[]
      const { data, error } = await supabase
        .from("bill_statements")
        .select("id, bill_id, due_date, amount, currency, usage, rate, invoice_no, status, created_at")
        .eq("bill_id", billId!)
        .order("due_date", { ascending: false, nullsFirst: false })
        .limit(12)
      if (error) return [] as BillStatement[]
      return ((data ?? []) as BillStatement[]).map((s) => ({ ...s, amount: Number(s.amount), usage: s.usage == null ? null : Number(s.usage), rate: s.rate == null ? null : Number(s.rate) }))
    },
  })
}

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
    /** Saves the bill; returns its id (for a scanned bill's statement). */
    save: useMutation({
      mutationFn: async ({ id, input }: { id?: string; input: BillInput }): Promise<string> => {
        if (id) {
          const { error } = await client().from("recurring_bills").update(input).eq("id", id)
          if (error) throw error
          return id
        }
        const { data, error } = await client().from("recurring_bills").insert({ workspace_id: workspaceId, ...input }).select("id").single()
        if (error) throw error
        return (data as { id: string }).id
      },
      onSuccess: done,
    }),
    /** This month's scanned paper bill under its recurring bill (a re-scan of the same invoice is ignored). */
    addStatement: useMutation({
      mutationFn: async ({ billId, s }: { billId: string; s: UtilityBill }) => {
        const { error } = await client().from("bill_statements").upsert(
          {
            bill_id: billId,
            workspace_id: workspaceId,
            due_date: s.dueDate,
            amount: s.amount,
            currency: s.currency,
            usage: s.usage,
            rate: s.rate,
            invoice_no: s.invoiceNo,
            customer_id: s.customerId,
            customer_name: s.customerName,
            location: s.location,
            provider: s.provider,
          },
          { onConflict: "bill_id,invoice_no", ignoreDuplicates: true },
        )
        if (error) throw error
      },
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["bill-statements", scope] }),
    }),
    /** One statement of the history (a duplicate or a misread scan); the bill itself stays. */
    removeStatement: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await client().from("bill_statements").delete().eq("id", id).eq("workspace_id", workspaceId!)
        if (error) throw error
      },
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["bill-statements", scope] }),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await client().from("recurring_bills").delete().eq("id", id)
        if (error) throw error
      },
      onSuccess: done,
    }),
    /** «↩️ មិនទាន់បង់»: back to unpaid (and that payment's own expense removed, when it is known). */
    unmarkPaid: useMutation({
      mutationFn: async (id: string) => {
        const { data, error } = await client().rpc("unmark_bill_paid", { p_bill_id: id })
        if (error) throw error
        return data as { status: string; expense_removed?: boolean; expense_kept?: boolean }
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

// ---------------------------------------------------------------------------
// NSSF card vault (public.nssf_members): private to the account
// ---------------------------------------------------------------------------
export type NssfRelationship = "self" | "spouse" | "child"
export type NssfMember = {
  id: string
  name: string
  relationship: NssfRelationship
  nssf_id: string | null
  front_path: string | null
  back_path: string | null
  /** The stored photo is the card alone (cropped); older photos are cropped again by the owner's app. */
  front_cropped?: boolean
  back_cropped?: boolean
  is_active: boolean
  created_at: string
}
export type NssfMemberInput = Pick<NssfMember, "name" | "relationship" | "nssf_id" | "front_path" | "back_path" | "is_active"> &
  Partial<Pick<NssfMember, "front_cropped" | "back_cropped">>

/** Default self-employed contribution per member (editable on the bill). */
export const NSSF_MONTHLY_PER_MEMBER = 15600
const NSSF_BUCKET = "nssf-cards"

/** The NSSF bill amount for this many members: 15,600៛ each a month, × 12 a year. */
export const nssfAmountFor = (members: number, frequency: BillFrequency) => NSSF_MONTHLY_PER_MEMBER * members * (frequency === "YEARLY" ? 12 : 1)

export function useNssfMembers() {
  const { scope } = useRepo()
  return useQuery({
    queryKey: ["nssf-members", scope],
    queryFn: async (): Promise<NssfMember[]> => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return []
      const { data, error } = await supabase.from("nssf_members").select("*").order("created_at")
      if (error) throw error
      return (data ?? []) as NssfMember[]
    },
  })
}

/** A short-lived link to a stored card photo (to show it, or to crop it again). */
export async function signedPhotoUrl(path: string): Promise<string | null> {
  const { data } = (await getSupabaseBrowserClient()?.storage.from(NSSF_BUCKET).createSignedUrl(path, 5 * 60)) ?? { data: null }
  return data?.signedUrl ?? null
}

export function useNssfPhotoUrl(path: string | null) {
  return useQuery({
    queryKey: ["nssf-photo", path],
    enabled: Boolean(path),
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await getSupabaseBrowserClient()!.storage.from(NSSF_BUCKET).createSignedUrl(path!, 15 * 60)
      return data?.signedUrl ?? null
    },
  })
}

export function useNssfMutations() {
  const queryClient = useQueryClient()
  const { scope } = useRepo()
  const done = () => void queryClient.invalidateQueries({ queryKey: ["nssf-members", scope] })
  const client = () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) throw new Error("offline")
    return supabase
  }
  return {
    save: useMutation({
      mutationFn: async ({ id, input }: { id?: string; input: NssfMemberInput }) => {
        const { error } = id ? await client().from("nssf_members").update(input).eq("id", id) : await client().from("nssf_members").insert(input)
        if (error) throw error
      },
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (m: NssfMember) => {
        const paths = [m.front_path, m.back_path].filter((p): p is string => Boolean(p))
        if (paths.length) await client().storage.from(NSSF_BUCKET).remove(paths)
        const { error } = await client().from("nssf_members").delete().eq("id", m.id)
        if (error) throw error
      },
      onSuccess: done,
    }),
    /** Uploads a card photo into the account's own folder; returns its path. */
    uploadPhoto: async (image: Blob) => {
      const supabase = client()
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error("not signed in")
      const path = `${auth.user.id}/${crypto.randomUUID()}.jpg`
      const { error } = await supabase.storage.from(NSSF_BUCKET).upload(path, image, { contentType: image.type || "image/jpeg" })
      if (error) throw error
      return path
    },
    removePhoto: async (path: string) => {
      await client().storage.from(NSSF_BUCKET).remove([path])
    },
  }
}

// ---------------------------------------------------------------------------
// EV home charging (public.ev_charge_logs): kWh only, never a wallet expense —
// the cost is in the electricity bill. Public charging is a normal expense.
// ---------------------------------------------------------------------------
export type EvChargeLog = { id: string; kwh: number | null; note: string | null; charged_at: string }

export function useEvLogs(workspaceId: string | undefined) {
  const { scope } = useRepo()
  return useQuery({
    queryKey: ["ev-logs", scope, workspaceId ?? ""],
    enabled: Boolean(workspaceId),
    queryFn: async (): Promise<EvChargeLog[]> => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return []
      const since = new Date(Date.now() - 62 * 86_400_000).toISOString()
      const { data, error } = await supabase.from("ev_charge_logs").select("id, kwh, note, charged_at").eq("workspace_id", workspaceId!).gte("charged_at", since).order("charged_at", { ascending: false })
      if (error) throw error
      return ((data ?? []) as EvChargeLog[]).map((r) => ({ ...r, kwh: r.kwh === null ? null : Number(r.kwh) }))
    },
  })
}

export function useEvMutations(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  const { scope } = useRepo()
  const done = () => void queryClient.invalidateQueries({ queryKey: ["ev-logs", scope] })
  return {
    add: useMutation({
      mutationFn: async (kwh: number | null) => {
        const { error } = await getSupabaseBrowserClient()!.from("ev_charge_logs").insert({ workspace_id: workspaceId, kwh })
        if (error) throw error
      },
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await getSupabaseBrowserClient()!.from("ev_charge_logs").delete().eq("id", id)
        if (error) throw error
      },
      onSuccess: done,
    }),
  }
}

// EV driving economics: the month's figures (public.car_month) and the car's distance log.
export type CarMonth = { home_kwh: number; rate: number; public_usd: number; khr_per_usd: number; month_km: number }

export function useCarMonth(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["car-month", workspaceId ?? ""],
    enabled: Boolean(workspaceId),
    queryFn: async (): Promise<CarMonth | null> => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return null
      const { data, error } = await supabase.rpc("car_month", { p_ws: workspaceId })
      if (error) return null
      const d = data as Record<string, unknown>
      return { home_kwh: Number(d.home_kwh), rate: Number(d.rate), public_usd: Number(d.public_usd), khr_per_usd: Number(d.khr_per_usd), month_km: Number(d.month_km) }
    },
  })
}

export function useLogDistance(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ kind, km }: { kind: "ODOMETER" | "TRIP"; km: number }) => {
      const { error } = await getSupabaseBrowserClient()!.from("vehicle_distance_logs").insert({ workspace_id: workspaceId, kind, km })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["car-month"] }),
  })
}

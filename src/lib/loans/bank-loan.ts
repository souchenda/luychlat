"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/**
 * Bank loans (schedule_method BANK): 1-tap installment payments. The RPC
 * splits each installment into the principal repayment, an interest expense
 * and a fee expense; debt_loan_installments keeps the reference.
 */

export type LoanInstallmentPaid = {
  id: string
  debt_id: string
  n: number
  principal: number
  interest: number
  fee: number
  wallet_id: string | null
  repayment_id: string | null
  interest_tx_id: string | null
  fee_tx_id: string | null
  paid_at: string
}

export type PaidResult = { id: string; n: number; count: number; principal: number; interest: number; fee: number; total: number }

const client = () => getSupabaseBrowserClient()!

export const loanInstallmentsKey = (debtId: string) => ["loan-installments", debtId] as const

export function useLoanInstallments(debtId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: loanInstallmentsKey(debtId ?? ""),
    enabled: Boolean(debtId) && enabled,
    queryFn: async () => {
      const { data, error } = await client().from("debt_loan_installments").select("*").eq("debt_id", debtId!).order("n")
      if (error) throw error
      return (data as LoanInstallmentPaid[]).map((r) => ({ ...r, principal: Number(r.principal), interest: Number(r.interest), fee: Number(r.fee) }))
    },
  })
}

/** Everything a payment touches: the loan, its history, wallets, the ledger and the new expense categories. */
function useInvalidateLoan() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all(
      ["debts", "repayments", "wallets", "transactions", "categories", "loan-installments", "notifications"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    )
}

export function useLoanInstallmentMutations() {
  const invalidate = useInvalidateLoan()
  const pay = useMutation({
    mutationFn: async (v: { debtId: string; walletId: string; exchangeRate: number | null }) => {
      const { data, error } = await client().rpc("pay_loan_installment", {
        p_debt_id: v.debtId,
        p_wallet_id: v.walletId,
        p_exchange_rate: v.exchangeRate,
        p_payment_date: new Date().toISOString(),
      })
      if (error) throw error
      const r = data as Record<string, number | string>
      return { id: String(r.id), n: Number(r.n), count: Number(r.count), principal: Number(r.principal), interest: Number(r.interest), fee: Number(r.fee), total: Number(r.total) } as PaidResult
    },
    onSettled: () => void invalidate(),
  })
  const undo = useMutation({
    mutationFn: async (installmentId: string) => {
      const { error } = await client().rpc("undo_loan_installment", { p_installment_id: installmentId })
      if (error) throw error
    },
    onSettled: () => void invalidate(),
  })
  return { pay, undo }
}

/** The wallet last used for a loan's installments (this device only). */
const walletKey = (debtId: string) => `luychlat:loan-wallet:${debtId}`
export function rememberedWallet(debtId: string): string | null {
  try {
    return localStorage.getItem(walletKey(debtId))
  } catch {
    return null
  }
}
export function rememberWallet(debtId: string, walletId: string) {
  try {
    localStorage.setItem(walletKey(debtId), walletId)
  } catch {
    // Private mode: the picker simply opens next time.
  }
}

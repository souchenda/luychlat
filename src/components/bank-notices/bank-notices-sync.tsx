"use client"

import { registerPlugin } from "@capacitor/core"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { toast } from "sonner"

import { noticePayload, type BankNotice } from "@/lib/bank-notices"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { isNativeApp } from "@/lib/native-bridge"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

type BankNoticesPlugin = {
  status(): Promise<{ enabled: boolean }>
  openSettings(): Promise<void>
  drain(): Promise<{ notices: BankNotice[] }>
}
export const BankNotices = registerPlugin<BankNoticesPlugin>("BankNotices")

/** Notices waiting for the network (kept on this phone only), and the last unreadable ones (Settings shows them). */
const PENDING_KEY = "luychlat:bank-notices-pending"
export const UNREAD_KEY = "luychlat:bank-notices-unread"

const load = (key: string): BankNotice[] => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as BankNotice[]
  } catch {
    return []
  }
}
const save = (key: string, list: BankNotice[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(-30)))
  } catch {
    // Storage blocked: the notice is lost on this phone only; nothing is booked by a guess.
  }
}

type Result = { status: string; transaction_id?: string; wallet?: string; type?: string; amount?: number; currency?: "USD" | "KHR"; suffix?: string }

/**
 * The bank apps' notices on this Android phone, recorded (founder, 9/11/2026): when the app opens or comes back, the
 * queue BankNoticeListener kept is read, each notice parsed (lib/bank-notices.ts) and sent to public.app_bank_alert.
 * Recorded → one toast with Undo; no wallet with those digits / two of them → a toast that says so (nothing booked);
 * unreadable → kept for Settings. Off the network → kept and sent next time. Browsers and iPhones: nothing.
 */
export function BankNoticesSync() {
  const t = useT()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!isNativeApp()) return
    let running = false
    const run = async () => {
      if (running || document.visibilityState !== "visible") return
      running = true
      try {
        const db = getSupabaseBrowserClient()
        if (!db) return
        let fresh: BankNotice[] = []
        try {
          fresh = (await BankNotices.drain()).notices ?? []
        } catch {
          return // an app before 1.15 has no listener
        }
        const queue = [...load(PENDING_KEY), ...fresh]
        if (queue.length === 0) return
        const keep: BankNotice[] = []
        const unread = load(UNREAD_KEY)
        let booked = 0
        for (const n of queue) {
          const payload = await noticePayload(n)
          if (!payload) {
            unread.push(n)
            continue
          }
          const { data, error } = await db.rpc("app_bank_alert", { p_alert: payload })
          if (error) {
            keep.push(n)
            continue
          }
          const r = data as Result
          const money = formatMoney(payload.amount, payload.currency)
          if (r.status === "ok" && r.transaction_id) {
            booked++
            const id = r.transaction_id
            toast.success(t(payload.direction === "IN" ? "bankNotice.in" : "bankNotice.out", { amount: money, wallet: r.wallet ?? "" }), {
              duration: 8000,
              action: {
                label: t("bankNotice.undo"),
                onClick: () => void db.rpc("app_bank_undo", { p_transaction_id: id }).then(() => queryClient.invalidateQueries()),
              },
            })
          } else if (r.status === "no_wallet" || r.status === "ambiguous") {
            toast.warning(t(r.status === "no_wallet" ? "bankNotice.noWallet" : "bankNotice.ambiguous", { amount: money, digits: payload.suffix }), { duration: 10000 })
          } else if (r.status === "signed_out") {
            keep.push(n)
          }
        }
        save(PENDING_KEY, keep)
        save(UNREAD_KEY, unread)
        if (booked > 0) {
          void queryClient.invalidateQueries({ queryKey: ["transactions"] })
          void queryClient.invalidateQueries({ queryKey: ["wallets"] })
        }
      } finally {
        running = false
      }
    }
    void run()
    document.addEventListener("visibilitychange", run)
    return () => document.removeEventListener("visibilitychange", run)
  }, [t, queryClient])

  return null
}

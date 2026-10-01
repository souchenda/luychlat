"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import { telegramAlertMessage } from "@/lib/alerts"
import { queryKeys, useRepo, useWorkspaces } from "@/lib/data/hooks"
import { todayDate } from "@/lib/debts"
import { sendTelegram } from "@/lib/telegram"

const LAST_RUN_KEY = "luysmart-alerts-last-run"

/**
 * Guest Mode stand-in for the daily public.run_debt_alerts() job: on app open
 * (at most once per day) it creates due-date notifications and, if a bot is
 * configured, sends them to Telegram. In the cloud the database job does this.
 */
export function AlertScheduler() {
  const { repo, scope } = useRepo()
  const workspaces = useWorkspaces().data
  const queryClient = useQueryClient()

  useEffect(() => {
    if (scope !== "guest" || !workspaces?.length) return
    const today = todayDate()
    try {
      if (localStorage.getItem(LAST_RUN_KEY) === today) return
      localStorage.setItem(LAST_RUN_KEY, today)
    } catch {
      // Storage blocked: still run (dedupe by debt + stage prevents repeats).
    }

    void (async () => {
      const telegram = await repo.getTelegramSettings()
      for (const ws of workspaces) {
        const created = await repo.syncDueAlerts(ws.id)
        if (!created.length) continue
        void queryClient.invalidateQueries({ queryKey: queryKeys.notifications(scope, ws.id) })
        if (!telegram?.enabled) continue
        const debts = await repo.listDebts(ws.id)
        for (const n of created) {
          const debt = debts.find((d) => d.id === n.debt_id)
          if (debt && n.alert_key) await sendTelegram(telegram, telegramAlertMessage(debt, n.alert_key, telegram.language))
        }
      }
    })()
  }, [repo, scope, workspaces, queryClient])

  return null
}

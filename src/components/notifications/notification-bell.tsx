"use client"

import { formatDistanceToNow } from "date-fns"
import { enUS, km } from "date-fns/locale"
import { AlarmClockIcon, ArrowDownLeftIcon, ArrowUpRightIcon, BellIcon, BellOffIcon, TriangleAlertIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { MORNING_QUOTE, morningCard } from "@/lib/morning"
import { holyDayCard } from "@/lib/holy-day-alerts"
import { useIslamicEnabled } from "@/lib/islamic-settings"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { MemberAvatar } from "@/components/family/member-avatar"
import { Button } from "@/components/ui/button"
import { alertText } from "@/lib/alerts"
import { clearShownNotifications, syncAppBadge } from "@/lib/app-badge"
import { useActiveWorkspace, useCategories, useDebts, useNotificationMutations, useNotifications, useTransactions, useWallets } from "@/lib/data/hooks"
import type { AppNotification, Transaction } from "@/lib/data/types"
import { TransactionEditor } from "@/components/transactions/transaction-editor"
import { inFilter, MONEY_WINDOW_DAYS, notificationKind, transactionLine, type FeedFilter } from "@/lib/notification-feed"
import { usePrefsStore } from "@/stores/prefs-store"
import { scopeOf } from "@/lib/workspace-scope"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"
import { contentLocale } from "@/lib/i18n/dictionaries"

const FILTERS: { value: FeedFilter; label: string }[] = [
  { value: "all", label: "notifications.filter.all" },
  { value: "money", label: "notifications.filter.money" },
  { value: "bills", label: "notifications.filter.bills" },
  { value: "tips", label: "notifications.filter.tips" },
]

/**
 * Header bell: unread badge + the active workspace's feed — its alerts (bills, installments, family
 * activity), its money in and out of the last days, and the day's tips — with filter tabs. Strictly
 * the active workspace: a business never shows personal money or reminders, and the other way round.
 */
export function NotificationBell() {
  const t = useT()
  const router = useRouter()
  const locale = useLocaleStore((s) => s.locale)
  const { workspace } = useActiveWorkspace()
  const notifications = useNotifications(workspace?.id).data ?? []
  const debts = useDebts(workspace?.id).data ?? []
  const { markRead } = useNotificationMutations(workspace?.id)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<FeedFilter>("all")
  const [opened, setOpened] = useState<Transaction | null>(null)
  const hidden = usePrefsStore((s) => s.hideBalances)
  const scope = scopeOf(workspace?.type)
  // The workspace's money in and out of the last days (own transfers are not listed).
  const [since] = useState(() => new Date(Date.now() - MONEY_WINDOW_DAYS * 86_400_000).toISOString())
  const recent = useTransactions(open ? workspace?.id : undefined, { from: since, limit: 30 }).data ?? []
  const wallets = useWallets(workspace?.id).data ?? []
  const categories = useCategories(workspace?.id).data ?? []
  // Unread state as it was when the sheet opened, so new items stay highlighted while reading.
  const [unreadAtOpen, setUnreadAtOpen] = useState<Set<string>>(new Set())

  const unread = notifications.filter((n) => !n.is_read).length
  // ☀️ The day's positive start — the same quote as the 07:00 Telegram post and push. Not counted
  // in the red badge: the badge stays for what needs action (due dates, family activity).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (open) setNow(Date.now())
  }, [open])
  const morning = morningCard(now)
  // 🪷 ថ្ងៃសីល: the eve reminder and the day's blessing, as on Telegram (not with Islamic Mode on).
  const islamic = useIslamicEnabled()
  // A personal reminder: never in a business workspace.
  const holy = islamic || !scope.holyDays ? null : holyDayCard(now)

  // A few dozen rows at most: built on each render.
  const money = recent.flatMap((tx) => {
        const line = transactionLine(
          {
            ...tx,
            type: tx.type as "INCOME" | "EXPENSE" | "TRANSFER",
            currency: tx.currency as "KHR" | "USD",
            wallet_name: wallets.find((w) => w.id === tx.wallet_id)?.name ?? null,
            category_name: categories.find((c) => c.id === tx.category_id)?.name ?? null,
          },
          hidden,
        )
        return line ? [{ tx, line, at: tx.transaction_date }] : []
      })
  const showTips = inFilter("tips", filter)
  const shownAlerts = notifications.filter((n) => inFilter(notificationKind(n), filter))
  const shownMoney = inFilter("money", filter) ? money : []
  // One list, newest first: alerts and money together.
  const feed = [
    ...shownAlerts.map((n) => ({ kind: "alert" as const, n, at: n.scheduled_at })),
    ...shownMoney.map((m) => ({ kind: "money" as const, m, at: m.at })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  // The home-screen icon badge follows the real unread count (never a stale "1").
  useEffect(() => {
    void syncAppBadge(unread)
  }, [unread])

  // Opening the app (or coming back to it) clears our alerts from the phone's
  // notification shade — Android counts those on the icon too.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void clearShownNotifications()
    }
    onVisible()
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [])

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      void clearShownNotifications()
      setUnreadAtOpen(new Set(notifications.filter((n) => !n.is_read).map((n) => n.id)))
      if (unread > 0) markRead.mutate()
    }
  }

  // Due-date alerts are re-rendered in the current UI language from live debt data.
  const content = (n: AppNotification) => {
    const debt = n.debt_id ? debts.find((d) => d.id === n.debt_id) : undefined
    if (debt && n.alert_key) return alertText(debt, n.alert_key, contentLocale(locale))
    return { title: n.title, body: n.message }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative shrink-0"
        onClick={() => onOpenChange(true)}
        aria-label={unread ? t("notifications.titleUnread", { count: unread }) : t("notifications.title")}
      >
        <BellIcon className="size-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-4 font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>

      <BottomSheet open={open} onOpenChange={onOpenChange} title={t("notifications.title")}>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto border-b px-4 pb-3" role="tablist" aria-label={t("notifications.title")}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "shrink-0 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors",
                filter === f.value ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground",
              )}
            >
              {t(f.label as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
        {showTips && morning && (
          <div className="-mx-4 flex gap-3 border-b bg-amber-500/5 px-4 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-lg" aria-hidden>
              ☀️
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{t("notifications.morningTitle")}</span>
              <span className="block text-xs text-muted-foreground">{MORNING_QUOTE}</span>
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {formatDistanceToNow(new Date(morning.at), { addSuffix: true, locale: locale === "km" ? km : enUS })}
              </span>
            </span>
          </div>
        )}
        {showTips && holy && (
          <div className="-mx-4 flex gap-3 border-b bg-emerald-500/5 px-4 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-lg" aria-hidden>
              🪷
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{holy.title}</span>
              <span className="block text-xs whitespace-pre-line text-muted-foreground">{holy.message}</span>
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {formatDistanceToNow(new Date(holy.at), { addSuffix: true, locale: locale === "km" ? km : enUS })}
              </span>
            </span>
          </div>
        )}
        {feed.length === 0 && !(showTips && (morning || holy)) ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <BellOffIcon className="size-8" />
            {t("notifications.empty")}
          </div>
        ) : feed.length === 0 ? null : (
          <ul className="-mx-4 divide-y">
            {feed.map((item) => {
              if (item.kind === "money") {
                const { tx, line } = item.m
                const inflow = tx.type === "INCOME"
                return (
                  <li key={`tx-${tx.id}`}>
                    <button type="button" className="flex w-full gap-3 px-4 py-3 text-left hover:bg-muted/60" onClick={() => setOpened(tx)}>
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full",
                          inflow ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-rose-500/12 text-rose-600 dark:text-rose-400",
                        )}
                        aria-hidden
                      >
                        {inflow ? <ArrowDownLeftIcon className="size-4" /> : <ArrowUpRightIcon className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm font-semibold", inflow && "text-emerald-700 dark:text-emerald-400")}>{line.title}</span>
                        {line.body && <span className="block truncate text-xs text-muted-foreground">{line.body}</span>}
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          {formatDistanceToNow(new Date(item.at), { addSuffix: true, locale: locale === "km" ? km : enUS })}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              }
              const n = item.n
              const { title, body } = content(n)
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full gap-3 px-4 py-3 text-left hover:bg-muted/60",
                      unreadAtOpen.has(n.id) && "bg-primary/5",
                    )}
                    onClick={() => {
                      const target = n.debt_id ? `/debts/${n.debt_id}` : n.type === "ACTIVITY" ? "/transactions" : null
                      if (!target) return
                      setOpen(false)
                      router.push(target)
                    }}
                  >
                    {n.type === "ACTIVITY" ? (
                      <span className="relative shrink-0" aria-hidden>
                        <MemberAvatar id={n.actor_name} name={n.actor_name ?? "?"} className="size-9 text-sm" />
                        <BellIcon className="absolute -right-1 -bottom-1 size-4 rounded-full bg-popover p-0.5 text-primary" />
                        {unreadAtOpen.has(n.id) && (
                          <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-popover" />
                        )}
                      </span>
                    ) : (
                    <span
                      className={cn(
                        "relative flex size-9 shrink-0 items-center justify-center rounded-full",
                        n.alert_key === "D7" || n.alert_key === "D3"
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-red-500/12 text-red-600 dark:text-red-400",
                      )}
                      aria-hidden
                    >
                      {n.alert_key === "D7" || n.alert_key === "D3" ? <AlarmClockIcon className="size-4" /> : <TriangleAlertIcon className="size-4" />}
                      {unreadAtOpen.has(n.id) && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-popover" />}
                    </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{title}</span>
                      <span className="block text-xs whitespace-pre-line text-muted-foreground">{body}</span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(n.scheduled_at), { addSuffix: true, locale: locale === "km" ? km : enUS })}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </BottomSheet>
      {opened && (
        <TransactionEditor
          workspaceId={workspace?.id}
          wallets={wallets}
          transaction={opened}
          onClose={() => setOpened(null)}
        />
      )}
    </>
  )
}

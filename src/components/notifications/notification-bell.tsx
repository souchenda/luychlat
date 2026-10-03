"use client"

import { formatDistanceToNow } from "date-fns"
import { enUS, km } from "date-fns/locale"
import { AlarmClockIcon, BellIcon, BellOffIcon, TriangleAlertIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { MemberAvatar } from "@/components/family/member-avatar"
import { Button } from "@/components/ui/button"
import { alertText } from "@/lib/alerts"
import { clearShownNotifications, syncAppBadge } from "@/lib/app-badge"
import { useActiveWorkspace, useDebts, useNotificationMutations, useNotifications } from "@/lib/data/hooks"
import type { AppNotification } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"
import { contentLocale } from "@/lib/i18n/dictionaries"

/** Header bell: unread badge + notification list for the active workspace. */
export function NotificationBell() {
  const t = useT()
  const router = useRouter()
  const locale = useLocaleStore((s) => s.locale)
  const { workspace } = useActiveWorkspace()
  const notifications = useNotifications(workspace?.id).data ?? []
  const debts = useDebts(workspace?.id).data ?? []
  const { markRead } = useNotificationMutations(workspace?.id)
  const [open, setOpen] = useState(false)
  // Unread state as it was when the sheet opened, so new items stay highlighted while reading.
  const [unreadAtOpen, setUnreadAtOpen] = useState<Set<string>>(new Set())

  const unread = notifications.filter((n) => !n.is_read).length

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
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <BellOffIcon className="size-8" />
            {t("notifications.empty")}
          </div>
        ) : (
          <ul className="-mx-4 divide-y">
            {notifications.map((n) => {
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
    </>
  )
}

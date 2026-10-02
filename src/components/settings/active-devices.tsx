"use client"

import { formatDistanceToNowStrict } from "date-fns"
import { km } from "date-fns/locale"
import { ChevronRightIcon, Loader2Icon, LogOutIcon, MonitorIcon, MonitorSmartphoneIcon, SmartphoneIcon, TabletIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useT } from "@/lib/i18n/use-t"
import { describeDevice, isActiveNow, useActiveSessions, useSessionMutations, type ActiveSession } from "@/lib/sessions"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"

const KIND_ICON = { phone: SmartphoneIcon, tablet: TabletIcon, desktop: MonitorIcon }

function SessionRow({ session, onRevoke, busy }: { session: ActiveSession; onRevoke?: () => void; busy?: boolean }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const device = describeDevice(session.user_agent)
  const Icon = KIND_ICON[device.kind]
  const active = isActiveNow(session)
  const ago = formatDistanceToNowStrict(new Date(session.last_active_at), { addSuffix: true, locale: locale === "km" ? km : undefined })
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", session.is_current ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {device.os === "Unknown" ? t("devices.unknown") : device.os}
          {device.browser && <span className="font-normal text-muted-foreground"> · {device.browser}</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {session.ip && <span className="font-mono">{session.ip}</span>}
          {session.ip && " · "}
          {active ? (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
              {t("devices.activeNow")}
            </span>
          ) : (
            ago
          )}
        </p>
      </div>
      {onRevoke && (
        <Button size="sm" variant="ghost" className="shrink-0 text-destructive" onClick={onRevoke} disabled={busy}>
          {busy ? <Loader2Icon className="animate-spin" /> : <LogOutIcon />}
          {t("devices.revoke")}
        </Button>
      )}
    </div>
  )
}

/** Settings › Security › Active devices: see where the account is signed in and sign other devices out. */
export function ActiveDevices() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const query = useActiveSessions()
  const { revoke, revokeOthers } = useSessionMutations()
  const sessions = query.data ?? []
  const current = sessions.find((s) => s.is_current)
  const others = sessions.filter((s) => !s.is_current)

  const revokeOne = (s: ActiveSession) => {
    const device = describeDevice(s.user_agent)
    if (!window.confirm(t("devices.revokeConfirm", { device: `${device.os} ${device.browser}`.trim() }))) return
    revoke.mutate(s.id, {
      onSuccess: () => toast.success(t("devices.revoked")),
      onError: () => toast.error(t("common.error")),
    })
  }
  const revokeAll = () => {
    if (!window.confirm(t("devices.revokeAllConfirm", { count: others.length }))) return
    revokeOthers.mutate(undefined, {
      onSuccess: () => toast.success(t("devices.revokedAll")),
      onError: () => toast.error(t("common.error")),
    })
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60">
        <span className="text-muted-foreground [&_svg]:size-5">
          <MonitorSmartphoneIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t("devices.title")}</span>
          <span className="block text-xs text-muted-foreground">
            {query.isLoading ? "…" : t("devices.count", { count: sessions.length || 1 })}
          </span>
        </span>
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </button>

      <BottomSheet open={open} onOpenChange={setOpen} title={t("devices.title")} description={t("devices.hint")}>
        <div className="space-y-4">
          {query.isLoading ? (
            <Loader2Icon className="mx-auto size-6 animate-spin text-muted-foreground" />
          ) : query.isError ? (
            <p className="text-sm text-destructive">{t("devices.loadError")}</p>
          ) : (
            <>
              <section className="space-y-2">
                <h3 className="px-1 text-xs font-medium text-muted-foreground">{t("devices.current")}</h3>
                <Card className="gap-0 py-0">{current ? <SessionRow session={current} /> : <p className="px-4 py-3 text-sm text-muted-foreground">—</p>}</Card>
              </section>

              {others.length > 0 && (
                <Button variant="outline" className="h-11 w-full text-destructive" onClick={revokeAll} disabled={revokeOthers.isPending}>
                  {revokeOthers.isPending ? <Loader2Icon className="animate-spin" /> : <LogOutIcon />}
                  {t("devices.revokeAll")}
                </Button>
              )}

              <section className="space-y-2">
                <h3 className="px-1 text-xs font-medium text-muted-foreground">{t("devices.others", { count: others.length })}</h3>
                {others.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{t("devices.noOthers")}</p>
                ) : (
                  <Card className="gap-0 py-0">
                    <div className="divide-y">
                      {others.map((s) => (
                        <SessionRow key={s.id} session={s} onRevoke={() => revokeOne(s)} busy={revoke.isPending && revoke.variables === s.id} />
                      ))}
                    </div>
                  </Card>
                )}
              </section>
              <p className="text-xs text-muted-foreground">{t("devices.note")}</p>
            </>
          )}
        </div>
      </BottomSheet>
    </>
  )
}

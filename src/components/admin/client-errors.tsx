"use client"

import { useQuery } from "@tanstack/react-query"
import { BugIcon, Loader2Icon, SmartphoneIcon } from "lucide-react"

import { ago, rpc, Section } from "@/components/admin/ui"
import { Card } from "@/components/ui/card"
import { buildLabel, type DeviceInfo, deviceLine } from "@/lib/diagnostics"
import { useT } from "@/lib/i18n/use-t"

type Row = { message: string; page: string | null; hits: number; users: number; last_at: string; builds: string[]; device: Partial<DeviceInfo> }

/**
 * Control Center › System & bot: the errors people's phones met in the last 24 hours, grouped by message (founder,
 * 28/10/2026 — we know before anyone complains). Cleaned on the phone: no amounts, phones or e-mails.
 */
export function ClientErrorsCard() {
  const t = useT()
  const errors = useQuery({ queryKey: ["admin", "client-errors"], refetchInterval: 60_000, queryFn: () => rpc<Row[]>("admin_client_errors", { p_hours: 24 }) })
  return (
    <Section title={t("ops.errors.title")} icon={<BugIcon />}>
      <Card className="gap-0 divide-y py-0">
        {errors.isLoading ? (
          <Loader2Icon className="mx-auto my-6 size-5 animate-spin text-muted-foreground" />
        ) : !errors.data?.length ? (
          <p className="px-4 py-4 text-sm text-emerald-700 dark:text-emerald-400">{t("ops.errors.none")}</p>
        ) : (
          errors.data.map((e) => (
            <div key={e.message} className="space-y-0.5 px-4 py-3">
              <p className="text-sm font-medium break-words">{e.message}</p>
              <p className="text-[11px] text-muted-foreground">
                {t("ops.errors.hits", { hits: e.hits, users: e.users })} · {e.page ?? "?"} · {ago(e.last_at)}
              </p>
              <p className="text-[11px] break-words text-muted-foreground">
                <SmartphoneIcon className="mr-1 inline size-3 align-[-1px]" aria-hidden />
                {deviceLine(e.device)} · Build {e.builds.map(buildLabel).join(", ")}
              </p>
            </div>
          ))
        )}
      </Card>
    </Section>
  )
}

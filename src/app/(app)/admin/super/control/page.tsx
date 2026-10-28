"use client"

import { ArrowLeftIcon, Loader2Icon, ShieldAlertIcon } from "lucide-react"
import Link from "next/link"

import { useState } from "react"

import { ClientErrorsCard } from "@/components/admin/client-errors"
import { ControlCenter } from "@/components/admin/control-center"
import { SecuritySummaryCard } from "@/components/admin/security-summary"
import { SystemHealthCard } from "@/components/admin/system-health-card"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useT } from "@/lib/i18n/use-t"
import { usePlan } from "@/lib/plan"

type Tab = "security" | "system" | "traffic"
const today = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)

/**
 * Super admin › Control Center (founder, 28/10/2026 — «one place»): the server and its security with the emergency
 * buttons, the app's system health and bot 24/7, and today's traffic and attacks. Hiding is cosmetic: every piece's
 * data and actions need super_admin.
 */
export default function ControlCenterPage() {
  const t = useT()
  const { plan, loading } = usePlan()
  const [tab, setTab] = useState<Tab>("security")
  if (loading) return <Loader2Icon className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" />
  if (plan.staff_role !== "super_admin") {
    return (
      <Card className="items-center gap-2 px-6 py-10 text-center">
        <ShieldAlertIcon className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-semibold">{t("admin.forbidden")}</p>
      </Card>
    )
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1">
        <Button asChild size="icon" variant="ghost" aria-label={t("common.back")}>
          <Link href="/admin/super">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{t("ops.title")}</h1>
      </div>
      <Segmented<Tab>
        aria-label={t("ops.title")}
        value={tab}
        onChange={setTab}
        options={[
          { value: "security", label: t("ops.tab.security") },
          { value: "system", label: t("ops.tab.system") },
          { value: "traffic", label: t("ops.tab.traffic") },
        ]}
      />
      {tab === "security" && <ControlCenter />}
      {tab === "system" && (
        <>
          <SystemHealthCard embedded />
          <ClientErrorsCard />
        </>
      )}
      {tab === "traffic" && <SecuritySummaryCard from={today()} to={today()} today={today()} />}
    </div>
  )
}

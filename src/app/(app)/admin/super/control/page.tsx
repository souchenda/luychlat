"use client"

import { ArrowLeftIcon, Loader2Icon, ShieldAlertIcon } from "lucide-react"
import Link from "next/link"

import { ControlCenter } from "@/components/admin/control-center"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useT } from "@/lib/i18n/use-t"
import { usePlan } from "@/lib/plan"

/** Super admin › Control Center (founder, 28/10/2026). Hiding is cosmetic: the data and actions need super_admin. */
export default function ControlCenterPage() {
  const t = useT()
  const { plan, loading } = usePlan()
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
      <ControlCenter />
    </div>
  )
}

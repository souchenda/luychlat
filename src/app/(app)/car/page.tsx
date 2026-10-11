"use client"

import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"

import { EvHomeCard } from "@/components/bills/ev-home-card"
import { VehicleDocsCard } from "@/components/bills/vehicle-docs-card"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { canWrite, useActiveWorkspace } from "@/lib/data/hooks"
import { useT } from "@/lib/i18n/use-t"
import { scopeOf } from "@/lib/workspace-scope"

/**
 * /car — the Personal workspace's car: vehicle documents (inspection, road tax, insurance, with their
 * reminders) and home EV charging. The same cards as on /bills; never in a business workspace.
 */
export default function CarPage() {
  const t = useT()
  const { workspace } = useActiveWorkspace()
  const scope = scopeOf(workspace?.type)
  const ws = workspace?.id
  const editable = canWrite(workspace)
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="size-9" aria-label={t("common.back")}>
          <Link href="/bills">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h1 className="flex-1 text-xl font-semibold">{t("vdoc.carTitle")}</h1>
      </div>
      {!ws ? null : !scope.vehicleDocs ? (
        <Card className="px-4 py-4">
          <p className="text-sm text-muted-foreground">{t("vdoc.personalOnly")}</p>
        </Card>
      ) : (
        <>
          <VehicleDocsCard workspaceId={ws} editable={editable} />
          {scope.homeEv && <EvHomeCard workspaceId={ws} editable={editable} />}
        </>
      )}
    </div>
  )
}

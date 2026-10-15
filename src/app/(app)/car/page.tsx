"use client"

import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"

import { CarLoansCard } from "@/components/bills/car-loans-card"
import { EvHomeCard } from "@/components/bills/ev-home-card"
import { VehicleDocsCard } from "@/components/bills/vehicle-docs-card"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { canWrite, useActiveWorkspace } from "@/lib/data/hooks"
import { useT } from "@/lib/i18n/use-t"
import { VEHICLE_DOC_TYPES, type VehicleDocType } from "@/lib/vehicle-docs"
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
  // «ឆៀកឡាន» / «ពន្ធផ្លូវ» chosen in the card vault (/cards): /car?add=INSPECTION opens the form with that type.
  const [addType, setAddType] = useState<VehicleDocType | null>(null)
  useEffect(() => {
    const add = new URLSearchParams(window.location.search).get("add")
    if (add && (VEHICLE_DOC_TYPES as readonly string[]).includes(add)) setAddType(add as VehicleDocType)
  }, [])
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
          <CarLoansCard workspaceId={ws} />
          <VehicleDocsCard workspaceId={ws} editable={editable} addType={addType} />
          {scope.homeEv && <EvHomeCard workspaceId={ws} editable={editable} />}
        </>
      )}
    </div>
  )
}

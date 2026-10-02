"use client"

import { DownloadIcon, Loader2Icon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { BulkDeleteSheet } from "@/components/transactions/bulk-delete-sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { buildBackup, downloadBackup } from "@/lib/data/backup"
import { useActiveWorkspace, useRepo } from "@/lib/data/hooks"
import { useT } from "@/lib/i18n/use-t"

/** ការគ្រប់គ្រងទិន្នន័យ: delete by date, and a backup copy of everything (the data itself lives in the cloud). */
export function DataManagement() {
  const t = useT()
  const { repo } = useRepo()
  const { workspace } = useActiveWorkspace()
  const [bulkOpen, setBulkOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const exportBackup = async () => {
    setExporting(true)
    try {
      downloadBackup(await buildBackup(repo))
      toast.success(t("data.backupDone"))
    } catch {
      toast.error(t("common.error"))
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("data.title")}</h2>
      <Card className="gap-0 divide-y py-0">
        {/* Delete by date */}
        <div className="space-y-2 px-4 py-3">
          <div className="flex items-start gap-3">
            <Trash2Icon className="mt-0.5 size-5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t("bulk.title")}</p>
              <p className="text-xs text-muted-foreground">{t("bulk.settingsHint", { workspace: workspace ? t(`ws.${workspace.type}`) : "" })}</p>
            </div>
          </div>
          <Button variant="outline" className="w-full" onClick={() => setBulkOpen(true)}>
            <Trash2Icon />
            {t("bulk.open")}
          </Button>
        </div>

        {/* Backup copy */}
        <div className="space-y-2 px-4 py-3">
          <p className="text-sm font-medium">{t("data.backupTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("data.backupHintCloud")}</p>
          <Button variant="outline" className="w-full" onClick={exportBackup} disabled={exporting}>
            {exporting ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
            {t("data.export")}
          </Button>
        </div>
      </Card>

      <BulkDeleteSheet open={bulkOpen} onOpenChange={setBulkOpen} workspaceId={workspace?.id} />
    </section>
  )
}

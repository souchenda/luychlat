"use client"

import { useQueryClient } from "@tanstack/react-query"
import { format, parseISO } from "date-fns"
import { DownloadIcon, HistoryIcon, Loader2Icon, Trash2Icon, UploadIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { BulkDeleteSheet } from "@/components/transactions/bulk-delete-sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { backupSummary, buildBackup, downloadBackup, readBackupFile, restoreBackup, type BackupFile } from "@/lib/data/backup"
import type { SnapshotRow } from "@/lib/data/guest-db"
import { useActiveWorkspace, useRepo } from "@/lib/data/hooks"
import { listSnapshots, restoreSnapshot, summarize } from "@/lib/data/snapshots"
import { useT } from "@/lib/i18n/use-t"
import { useSessionStore } from "@/stores/session-store"

const when = (iso: string) => format(new Date(iso), "dd/MM/yyyy HH:mm")

/** ការគ្រប់គ្រងទិន្នន័យ: rollback to yesterday, delete by date, backup / restore. */
export function DataManagement() {
  const t = useT()
  const queryClient = useQueryClient()
  const { repo } = useRepo()
  const isGuest = useSessionStore((s) => !s.user)
  const { workspace } = useActiveWorkspace()
  const fileRef = useRef<HTMLInputElement>(null)

  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([])
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [pendingRestore, setPendingRestore] = useState<BackupFile | null>(null)
  const [busy, setBusy] = useState<"rollback" | "export" | "restore" | null>(null)

  const refreshSnapshots = () => void listSnapshots().then(setSnapshots)
  useEffect(() => {
    if (isGuest) refreshSnapshots()
  }, [isGuest])

  const daily = snapshots.filter((s) => s.kind === "daily")
  const yesterday = daily[0]

  const openRollback = () => {
    refreshSnapshots()
    setSelected(yesterday?.id ?? null)
    setRollbackOpen(true)
  }

  const rollback = async () => {
    if (!selected) return
    setBusy("rollback")
    try {
      await restoreSnapshot(selected)
      await queryClient.invalidateQueries()
      toast.success(t("data.rollbackDone"))
      setRollbackOpen(false)
      refreshSnapshots()
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(null)
    }
  }

  const exportBackup = async () => {
    setBusy("export")
    try {
      downloadBackup(await buildBackup(repo, isGuest ? "guest" : "cloud"))
      toast.success(t("data.backupDone"))
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(null)
    }
  }

  const pickFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = ""
    if (!file) return
    try {
      setPendingRestore(await readBackupFile(file))
    } catch (error) {
      toast.error(t(error instanceof Error && error.message === "integrity" ? "data.restoreIntegrity" : "data.restoreInvalid"))
    }
  }

  const restore = async () => {
    if (!pendingRestore) return
    setBusy("restore")
    try {
      await restoreBackup(pendingRestore)
      await queryClient.invalidateQueries()
      toast.success(t("data.restoreDone"))
      setPendingRestore(null)
      refreshSnapshots()
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(null)
    }
  }

  const summary = pendingRestore ? backupSummary(pendingRestore) : null
  const selectedRow = snapshots.find((s) => s.id === selected)

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("data.title")}</h2>
      <Card className="gap-0 divide-y py-0">
        {/* Rollback */}
        <div className="space-y-2 px-4 py-3">
          <div className="flex items-start gap-3">
            <HistoryIcon className="mt-0.5 size-5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t("data.rollback")}</p>
              <p className="text-xs text-muted-foreground">
                {!isGuest
                  ? t("data.rollbackCloud")
                  : yesterday
                    ? t("data.rollbackHint", { date: format(parseISO(yesterday.label_date), "dd/MM/yyyy") })
                    : t("data.noSnapshot")}
              </p>
            </div>
          </div>
          <Button variant="outline" className="w-full" onClick={openRollback} disabled={!isGuest || snapshots.length === 0}>
            <HistoryIcon />
            {t("data.rollbackButton")}
          </Button>
        </div>

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

        {/* Backup / restore */}
        <div className="space-y-2 px-4 py-3">
          <p className="text-sm font-medium">{t("data.backupTitle")}</p>
          <p className="text-xs text-muted-foreground">{isGuest ? t("data.backupHint") : t("data.backupHintCloud")}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={exportBackup} disabled={busy !== null}>
              {busy === "export" ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
              {t("data.export")}
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy !== null || !isGuest}>
              <UploadIcon />
              {t("data.import")}
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </div>
      </Card>

      {/* Rollback dialog: yesterday preselected, older days and undo points available */}
      <Dialog open={rollbackOpen} onOpenChange={(o) => busy === null && setRollbackOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("data.rollback")}</DialogTitle>
            <DialogDescription>{t("data.rollbackExplain")}</DialogDescription>
          </DialogHeader>
          <ul className="max-h-64 space-y-1.5 overflow-y-auto" role="radiogroup" aria-label={t("data.rollback")}>
            {snapshots.map((s) => {
              const c = summarize(s.data)
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected === s.id}
                    onClick={() => setSelected(s.id)}
                    className={`w-full rounded-lg border p-2.5 text-left text-sm ${selected === s.id ? "border-primary bg-primary/5" : ""}`}
                  >
                    <span className="block font-medium">
                      {s.kind === "daily"
                        ? t(s.id === yesterday?.id ? "data.snapshotYesterday" : "data.snapshotEndOf", {
                            date: format(parseISO(s.label_date), "dd/MM/yyyy"),
                          })
                        : t("data.snapshotUndo", { date: when(s.created_at) })}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t("data.snapshotCounts", { wallets: c.wallets, transactions: c.transactions, debts: c.debts })}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRollbackOpen(false)} disabled={busy !== null}>
              {t("common.cancel")}
            </Button>
            <Button onClick={rollback} disabled={!selectedRow || busy !== null}>
              {busy === "rollback" && <Loader2Icon className="animate-spin" />}
              {t("data.rollbackConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore confirmation */}
      <Dialog open={Boolean(pendingRestore)} onOpenChange={(o) => !o && busy === null && setPendingRestore(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("data.import")}</DialogTitle>
            <DialogDescription>{t("data.restoreExplain")}</DialogDescription>
          </DialogHeader>
          {summary && (
            <p className="text-sm">
              {t("data.backupFrom", { date: when(summary.exportedAt) })}
              <span className="block text-xs text-muted-foreground">
                {t("data.snapshotCounts", { wallets: summary.wallets, transactions: summary.transactions, debts: summary.debts })}
                {summary.receipts > 0 && ` · ${t("data.receiptsCount", { count: summary.receipts })}`}
              </span>
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPendingRestore(null)} disabled={busy !== null}>
              {t("common.cancel")}
            </Button>
            <Button onClick={restore} disabled={busy !== null}>
              {busy === "restore" && <Loader2Icon className="animate-spin" />}
              {t("data.restoreConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkDeleteSheet open={bulkOpen} onOpenChange={setBulkOpen} workspaceId={workspace?.id} />
    </section>
  )
}

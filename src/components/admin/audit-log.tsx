"use client"

import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { DownloadIcon, Link2Icon, Link2OffIcon, Loader2Icon, ScrollTextIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

export type AuditEntry = {
  id: number
  seq: number
  at: string
  actor_id: string | null
  actor_email: string | null
  session_id: string | null
  action: string
  target_id: string | null
  target_email: string | null
  note: string | null
  ref: string | null
  prev_hash: string
  hash: string
}
type Verify = { ok: boolean; entries: number; broken_at?: number; last_hash?: string }

const rpc = async <T,>(name: string, args?: Record<string, unknown>) => {
  const { data, error } = await getSupabaseBrowserClient()!.rpc(name, args)
  if (error) throw error
  return data as T
}

const PAGE = 20
const COLUMNS = ["Seq", "Timestamp (UTC)", "Admin email", "Admin ID", "Session ID", "Action", "Target email", "Target ID", "Note", "Reference", "Previous hash", "Hash"]
const rowOf = (e: AuditEntry) => [
  e.seq,
  new Date(e.at).toISOString(),
  e.actor_email ?? "",
  e.actor_id ?? "",
  e.session_id ?? "",
  e.action,
  e.target_email ?? "",
  e.target_id ?? "",
  e.note ?? "",
  e.ref ?? "",
  e.prev_hash,
  e.hash,
]
// Spreadsheet formula injection: text starting with = + - @ is kept as text.
const safeText = (v: string | number) => (typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v)

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function exportLog(kind: "csv" | "xlsx", verify: Verify | undefined) {
  const entries = await rpc<AuditEntry[]>("admin_audit_list", { p_limit: 10000, p_offset: 0 })
  const rows = [...entries].reverse().map((e) => rowOf(e).map(safeText))
  const stamp = format(new Date(), "yyyyMMdd-HHmm")
  const chain = verify ? (verify.ok ? `Chain verified: ${verify.entries} entries, last hash ${verify.last_hash ?? "-"}` : `CHAIN BROKEN at entry ${verify.broken_at}`) : "Chain not checked"
  if (kind === "csv") {
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const lines = [COLUMNS, ...rows].map((r) => r.map(cell).join(","))
    download(new Blob([`﻿${lines.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" }), `luychlat-admin-audit-${stamp}.csv`)
    return
  }
  const XLSX = await import("xlsx")
  const sheet = XLSX.utils.aoa_to_sheet([COLUMNS, ...rows])
  sheet["!cols"] = [6, 26, 28, 38, 38, 22, 28, 38, 40, 30, 66, 66].map((wch) => ({ wch }))
  const info = XLSX.utils.aoa_to_sheet([["LuyChlat admin audit log"], ["Exported (UTC)", new Date().toISOString()], ["Entries", rows.length], [chain]])
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, "Audit log")
  XLSX.utils.book_append_sheet(book, info, "Integrity")
  XLSX.writeFile(book, `luychlat-admin-audit-${stamp}.xlsx`, { compression: true })
}

/**
 * /admin › Audit log: every admin action, newest first. The log is
 * append-only in the database and each entry carries the SHA-256 of the one
 * before it, so any edit or removal breaks the chain shown here.
 */
export function AuditLogCard() {
  const t = useT()
  const [limit, setLimit] = useState(PAGE)
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null)
  const list = useQuery({
    queryKey: ["admin", "audit", limit],
    queryFn: () => rpc<AuditEntry[]>("admin_audit_list", { p_limit: limit, p_offset: 0 }),
    placeholderData: (prev) => prev,
  })
  const verify = useQuery({ queryKey: ["admin", "audit-verify"], queryFn: () => rpc<Verify>("admin_audit_verify") })

  const run = async (kind: "csv" | "xlsx") => {
    setExporting(kind)
    try {
      await exportLog(kind, verify.data)
    } catch {
      toast.error(t("common.error"))
    } finally {
      setExporting(null)
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold [&_svg]:size-4 [&_svg]:text-primary">
          <ScrollTextIcon />
          {t("admin.audit.title")}
        </h2>
        {verify.data && (
          <span className={cn("flex items-center gap-1 text-xs font-medium [&_svg]:size-3.5", verify.data.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
            {verify.data.ok ? <Link2Icon /> : <Link2OffIcon />}
            {verify.data.ok ? t("admin.audit.chainOk", { count: verify.data.entries }) : t("admin.audit.chainBroken", { seq: verify.data.broken_at ?? "?" })}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" disabled={exporting !== null} onClick={() => void run("xlsx")}>
          {exporting === "xlsx" ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
          {t("admin.audit.exportXlsx")}
        </Button>
        <Button variant="outline" size="sm" disabled={exporting !== null} onClick={() => void run("csv")}>
          {exporting === "csv" ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
          {t("admin.audit.exportCsv")}
        </Button>
      </div>
      <Card className="gap-0 divide-y py-0">
        {!list.data?.length ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{list.isLoading ? "…" : t("admin.audit.empty")}</p>
        ) : (
          list.data.map((e) => (
            <div key={e.id} className="space-y-0.5 px-4 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-xs font-semibold">{e.action}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                  #{e.seq} · {format(new Date(e.at), "dd/MM/yy HH:mm")}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {e.actor_email ?? "—"}
                {e.target_email && ` → ${e.target_email}`}
              </p>
              {(e.note || e.ref) && <p className="truncate text-xs text-muted-foreground">{[e.note, e.ref].filter(Boolean).join(" · ")}</p>}
            </div>
          ))
        )}
      </Card>
      {list.data && list.data.length >= limit && (
        <Button variant="ghost" className="w-full" onClick={() => setLimit((l) => l + PAGE)}>
          {t("admin.audit.more")}
        </Button>
      )}
    </section>
  )
}

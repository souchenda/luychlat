"use client"

/**
 * Opening a statement file in the app: refuses it while imports are paused
 * after repeated unsafe files, reads it safely (file.ts), and reports a
 * refused file to the server (reason, extension and size only).
 */
import { toast } from "sonner"

import type { MessageKey } from "@/lib/i18n/dictionaries"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

import { readStatementFile, StatementFileError, type StatementFile } from "./file"

export async function openStatementFile(file: File): Promise<StatementFile> {
  const db = getSupabaseBrowserClient()
  const { data: until } = (await db?.rpc("statement_import_blocked_until")) ?? { data: null }
  if (until && new Date(until as string) > new Date()) throw new StatementFileError("blocked")
  try {
    return await readStatementFile(file)
  } catch (error) {
    if (error instanceof StatementFileError && error.code === "unsafe") {
      const format = file.name.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1] ?? ""
      await db?.rpc("report_unsafe_upload", { p_reason: error.reason, p_format: format, p_size_kb: Math.round(file.size / 1024) }).then(
        () => undefined,
        () => undefined,
      )
    }
    throw error
  }
}

/** The message for a file that couldn't be opened. */
export function statementFileErrorToast(error: unknown, t: (key: MessageKey) => string) {
  if (!(error instanceof StatementFileError)) return toast.error(t("common.error"))
  if (error.code === "unsafe") return toast.error(t("recon.file.unsafe"), { duration: 15_000 })
  toast.error(t(`recon.file.${error.code}` as MessageKey), error.code === "blocked" ? { duration: 10_000 } : undefined)
}

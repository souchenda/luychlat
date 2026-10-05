"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { compressImage } from "@/lib/image"
import { drainStorageCleanup } from "@/lib/storage-cleanup"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/**
 * Loan document vault (PRO): up to 20 files per debt in the private
 * 'loan-docs' bucket (<workspace>/<debt>/<file>), visible to the workspace's
 * members. Photos from before the vault stay in the receipts bucket.
 */

export const DOC_CATEGORIES = ["CONTRACT", "SCHEDULE", "COLLATERAL", "SLIP", "OTHER"] as const
export type DocCategory = (typeof DOC_CATEGORIES)[number]
export const DOC_EMOJI: Record<DocCategory, string> = { CONTRACT: "📑", SCHEDULE: "📊", COLLATERAL: "🏠", SLIP: "🧾", OTHER: "📁" }

export const MAX_DOCS = 20
export const MAX_DOC_BYTES = 20 * 1024 * 1024
export const DOC_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"

export type LoanDocument = {
  id: string
  debt_id: string
  workspace_id: string
  bucket: "loan-docs" | "receipts"
  path: string
  category: DocCategory
  file_name: string
  mime_type: string
  size_bytes: number | null
  created_at: string
}

const client = () => getSupabaseBrowserClient()!
export const docsKey = (debtId: string) => ["loan-docs", debtId] as const
export const isPdf = (d: Pick<LoanDocument, "mime_type">) => d.mime_type === "application/pdf"

export function useLoanDocuments(debtId: string) {
  return useQuery({
    queryKey: docsKey(debtId),
    queryFn: async () => {
      const { data, error } = await client().from("debt_documents").select("*").eq("debt_id", debtId).order("created_at")
      if (error) throw error
      return data as LoanDocument[]
    },
  })
}

/** A short-lived link; with `download`, the browser saves it under the file's name. */
export async function documentUrl(doc: LoanDocument, download = false): Promise<string> {
  const { data, error } = await client()
    .storage.from(doc.bucket)
    .createSignedUrl(doc.path, 600, download ? { download: doc.file_name } : undefined)
  if (error || !data) throw error ?? new Error("no url")
  return data.signedUrl
}

export function useDocumentUrl(doc: LoanDocument | null) {
  return useQuery({
    queryKey: ["loan-doc-url", doc?.bucket, doc?.path],
    enabled: Boolean(doc),
    staleTime: 5 * 60_000,
    queryFn: () => documentUrl(doc!),
  })
}

const safeName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-80) || "file"

/** Large camera photos are shrunk (still readable); PDFs and small images go as they are. */
async function prepare(file: File): Promise<{ body: Blob; type: string; name: string }> {
  if ((file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp") && file.size > 2 * 1024 * 1024) {
    const body = await compressImage(file, 2400, 0.85)
    return { body, type: body.type || "image/jpeg", name: file.name.replace(/\.\w+$/, "") + ".jpg" }
  }
  return { body: file, type: file.type, name: file.name }
}

export function useLoanDocumentMutations(debt: { id: string; workspace_id: string; attachment_paths?: string[] }) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: docsKey(debt.id) })

  const upload = useMutation({
    mutationFn: async ({ file, category }: { file: File; category: DocCategory }) => {
      const { body, type, name } = await prepare(file)
      const path = `${debt.workspace_id}/${debt.id}/${crypto.randomUUID()}-${safeName(name)}`
      const supabase = client()
      const up = await supabase.storage.from("loan-docs").upload(path, body, { contentType: type, upsert: false })
      if (up.error) throw up.error
      const { error } = await supabase
        .from("debt_documents")
        .insert({ debt_id: debt.id, workspace_id: debt.workspace_id, path, category, file_name: name.slice(0, 200), mime_type: type, size_bytes: body.size })
      if (error) {
        await supabase.storage.from("loan-docs").remove([path])
        throw error
      }
    },
    onSettled: () => void invalidate(),
  })

  const setCategory = useMutation({
    mutationFn: async ({ id, category }: { id: string; category: DocCategory }) => {
      const { error } = await client().from("debt_documents").update({ category }).eq("id", id)
      if (error) throw error
    },
    onSettled: () => void invalidate(),
  })

  const remove = useMutation({
    mutationFn: async (doc: LoanDocument) => {
      const supabase = client()
      // The database queues the file (public.storage_cleanup); it's removed just below.
      const { error } = await supabase.from("debt_documents").delete().eq("id", doc.id)
      if (error) throw error
      if (doc.bucket === "receipts") {
        // A photo from before the vault: also off the debt.
        await supabase
          .from("debts")
          .update({ attachment_paths: (debt.attachment_paths ?? []).filter((p) => p !== doc.path) })
          .eq("id", debt.id)
      }
      await drainStorageCleanup(supabase)
    },
    onSettled: () => {
      void invalidate()
      void queryClient.invalidateQueries({ queryKey: ["debts"] })
    },
  })

  return { upload, setCategory, remove }
}

async function asFile(doc: LoanDocument): Promise<File> {
  const res = await fetch(await documentUrl(doc))
  if (!res.ok) throw new Error(`download ${res.status}`)
  const blob = await res.blob()
  return new File([blob], doc.file_name, { type: doc.mime_type || blob.type })
}

function saveFile(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement("a")
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/**
 * Share sheet (Telegram, mail…) with the actual files when the device can;
 * otherwise each file is downloaded. Returns how it went.
 */
export async function shareDocuments(docs: LoanDocument[], title: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const files = await Promise.all(docs.map(asFile))
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files })) {
    try {
      await nav.share({ files, title })
      return "shared"
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return "cancelled"
    }
  }
  for (const file of files) saveFile(file)
  return "downloaded"
}

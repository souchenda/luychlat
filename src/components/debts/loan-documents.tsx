"use client"

import { CrownIcon, ExternalLinkIcon, FileTextIcon, FolderOpenIcon, ImageIcon, Loader2Icon, PlusIcon, Share2Icon, Trash2Icon, XIcon } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { Debt } from "@/lib/data/types"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import {
  DOC_ACCEPT,
  DOC_CATEGORIES,
  DOC_EMOJI,
  isPdf,
  MAX_DOC_BYTES,
  MAX_DOCS,
  shareDocuments,
  useDocumentUrl,
  useLoanDocumentMutations,
  useLoanDocuments,
  type DocCategory,
  type LoanDocument,
} from "@/lib/loans/documents"
import { showUpgrade, usePlan } from "@/lib/plan"
import { cn } from "@/lib/utils"

const ALLOWED = new Set(DOC_ACCEPT.split(","))
const fileSize = (bytes: number | null) =>
  bytes == null ? "" : bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

function CategoryChips({ value, onChange }: { value: DocCategory; onChange: (c: DocCategory) => void }) {
  const t = useT()
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("loanDocs.category")}>
      {DOC_CATEGORIES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          onClick={() => onChange(c)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            value === c ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
          )}
        >
          {DOC_EMOJI[c]} {t(`loanDocs.cat.${c}` as MessageKey)}
        </button>
      ))}
    </div>
  )
}

/** Full-screen preview: images inline, PDFs in the browser's viewer (with "open" for phones that can't embed). */
function Preview({ doc, onClose, onShare }: { doc: LoanDocument; onClose: () => void; onShare: () => void }) {
  const t = useT()
  const url = useDocumentUrl(doc).data
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" role="dialog" aria-modal="true" aria-label={doc.file_name}>
      <div className="flex items-center gap-2 px-3 py-2 text-white">
        <p className="min-w-0 flex-1 truncate text-sm">{doc.file_name}</p>
        <Button size="icon" variant="secondary" className="rounded-full" onClick={onShare} aria-label={t("loanDocs.share")}>
          <Share2Icon />
        </Button>
        {url && (
          <Button asChild size="icon" variant="secondary" className="rounded-full">
            <a href={url} target="_blank" rel="noopener noreferrer" aria-label={t("loanDocs.openTab")}>
              <ExternalLinkIcon />
            </a>
          </Button>
        )}
        <Button size="icon" variant="secondary" className="rounded-full" onClick={onClose} aria-label={t("common.close")}>
          <XIcon />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-2">
        {!url ? (
          <Loader2Icon className="size-6 animate-spin text-white" />
        ) : isPdf(doc) ? (
          <iframe src={url} title={doc.file_name} className="size-full rounded-lg bg-white" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={url} alt={doc.file_name} className="max-h-full max-w-full object-contain" />
        )}
      </div>
    </div>
  )
}

/** 📂 Loan documents: contract, schedule, collateral, slips… (PRO, up to 20 per loan). */
export function LoanDocuments({ debt }: { debt: Debt }) {
  const t = useT()
  const { isPro } = usePlan()
  const docs = useLoanDocuments(debt.id).data ?? []
  const { upload, setCategory, remove } = useLoanDocumentMutations(debt)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<File[]>([])
  const [category, setNewCategory] = useState<DocCategory>("CONTRACT")
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [viewing, setViewing] = useState<LoanDocument | null>(null)
  const [editing, setEditing] = useState<LoanDocument | null>(null)
  const [sharing, setSharing] = useState<string | null>(null)
  const room = MAX_DOCS - docs.length

  const choose = (list: FileList | null) => {
    const files = Array.from(list ?? [])
    if (fileRef.current) fileRef.current.value = ""
    if (!files.length) return
    const ok = files.filter((f) => ALLOWED.has(f.type) && f.size <= MAX_DOC_BYTES)
    if (ok.length < files.length) toast.error(t("loanDocs.rejected", { count: files.length - ok.length }))
    if (ok.length > room) toast.error(t("loanDocs.limit", { max: MAX_DOCS }))
    if (ok.slice(0, room).length) setPending(ok.slice(0, room))
  }

  const uploadAll = async () => {
    const files = pending
    setProgress({ done: 0, total: files.length })
    let failed = 0
    for (const [i, file] of files.entries()) {
      try {
        await upload.mutateAsync({ file, category })
      } catch (error) {
        failed++
        if (/plan_required/.test(String((error as Error)?.message))) {
          showUpgrade("general")
          break
        }
      }
      setProgress({ done: i + 1, total: files.length })
    }
    setProgress(null)
    setPending([])
    if (failed) toast.error(t("loanDocs.failed", { count: failed }))
    else toast.success(t("loanDocs.added", { count: files.length }))
  }

  const share = async (list: LoanDocument[], key: string) => {
    setSharing(key)
    try {
      const how = await shareDocuments(list, `${debt.party_name} — ${t("loanDocs.title")}`)
      if (how === "downloaded") toast.success(t("loanDocs.downloaded", { count: list.length }))
    } catch {
      toast.error(t("common.error"))
    } finally {
      setSharing(null)
    }
  }

  const del = (doc: LoanDocument) => {
    if (!window.confirm(t("loanDocs.removeConfirm", { name: doc.file_name }))) return
    remove.mutate(doc, { onError: () => toast.error(t("common.error")) })
  }

  const grouped = DOC_CATEGORIES.map((c) => ({ c, items: docs.filter((d) => d.category === c) })).filter((g) => g.items.length)

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5 px-1">
        <FolderOpenIcon className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="flex-1 text-sm font-medium text-muted-foreground">
          {t("loanDocs.title")} <span className="tabular-nums">({docs.length}/{MAX_DOCS})</span>
        </h2>
        {!isPro && <CrownIcon className="size-3.5 text-amber-500" aria-label="PRO" />}
        {docs.length > 1 && (
          <Button size="sm" variant="ghost" className="h-7 text-primary" disabled={sharing !== null} onClick={() => void share(docs, "all")}>
            {sharing === "all" ? <Loader2Icon className="animate-spin" /> : <Share2Icon />}
            {t("loanDocs.shareAll")}
          </Button>
        )}
      </div>
      <Card className="gap-3 px-3 py-3">
        {grouped.map(({ c, items }) => (
          <div key={c} className="space-y-1">
            <p className="px-1 text-xs font-medium text-muted-foreground">
              {DOC_EMOJI[c]} {t(`loanDocs.cat.${c}` as MessageKey)}
            </p>
            <ul className="divide-y rounded-xl border">
              {items.map((doc) => (
                <li key={doc.id} className="flex items-center gap-2 px-2 py-1.5">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setViewing(doc)}>
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", isPdf(doc) ? "bg-rose-500/10 text-rose-600" : "bg-sky-500/10 text-sky-600")}>
                      {isPdf(doc) ? <FileTextIcon className="size-4" /> : <ImageIcon className="size-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{doc.file_name}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {isPdf(doc) ? "PDF" : t("loanDocs.image")}
                        {doc.size_bytes != null && ` · ${fileSize(doc.size_bytes)}`}
                      </span>
                    </span>
                  </button>
                  <Button size="icon" variant="ghost" className="size-8 text-primary" disabled={sharing !== null} onClick={() => void share([doc], doc.id)} aria-label={t("loanDocs.share")}>
                    {sharing === doc.id ? <Loader2Icon className="animate-spin" /> : <Share2Icon className="size-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" onClick={() => setEditing(doc)} aria-label={t("loanDocs.category")}>
                    <span aria-hidden>{DOC_EMOJI[doc.category]}</span>
                  </Button>
                  <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" onClick={() => del(doc)} aria-label={t("loanDocs.remove")}>
                    <Trash2Icon className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {room > 0 && (
          <Button variant="outline" className="h-11" disabled={progress !== null} onClick={() => (isPro ? fileRef.current?.click() : showUpgrade("general"))}>
            {progress ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            {progress ? t("loanDocs.uploading", { done: progress.done, total: progress.total }) : t("loanDocs.add")}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">{t("loanDocs.hint", { max: MAX_DOCS })}</p>
        <input ref={fileRef} type="file" multiple accept={DOC_ACCEPT} className="sr-only" onChange={(e) => choose(e.target.files)} aria-label={t("loanDocs.add")} />
      </Card>

      <BottomSheet open={pending.length > 0 && !progress} onOpenChange={(v) => !v && setPending([])} title={t("loanDocs.add")} description={t("loanDocs.pickCategory")}>
        <div className="space-y-4">
          <ul className="space-y-1 text-sm">
            {pending.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                {f.type === "application/pdf" ? <FileTextIcon className="size-4 text-rose-600" /> : <ImageIcon className="size-4 text-sky-600" />}
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{fileSize(f.size)}</span>
              </li>
            ))}
          </ul>
          <CategoryChips value={category} onChange={setNewCategory} />
          <Button className="h-11 w-full" onClick={() => void uploadAll()}>
            {t("loanDocs.upload", { count: pending.length })}
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)} title={editing?.file_name ?? ""} description={t("loanDocs.category")}>
        {editing && (
          <CategoryChips
            value={editing.category}
            onChange={(c) => {
              setCategory.mutate({ id: editing.id, category: c }, { onError: () => toast.error(t("common.error")) })
              setEditing(null)
            }}
          />
        )}
      </BottomSheet>

      {viewing && <Preview doc={viewing} onClose={() => setViewing(null)} onShare={() => void share([viewing], viewing.id)} />}
    </section>
  )
}

"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeftIcon, PlusIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { canWrite, useActiveWorkspace } from "@/lib/data/hooks"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { optionsText, parseOptions, type MenuItem } from "@/lib/order-ahead"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type Row = MenuItem & { available: boolean; sort_order: number }
type Draft = { id: string | null; name: string; description: string; price: string; currency: "USD" | "KHR"; options: string; available: boolean }

const EMPTY: Draft = { id: null, name: "", description: "", price: "", currency: "USD", options: "", available: true }

/**
 * The shop's menu for order-ahead (founder, 4/11/2026 — docs/order-ahead.md): name, price ($ or ៛), a short description,
 * options as text («ស្ករ: 0%, 50%, 100%» per line) and «available» — off hides it from customers at once (sold out).
 */
export function MenuEditor() {
  const { workspace } = useActiveWorkspace()
  const ws = workspace?.id
  const editable = canWrite(workspace)
  const db = getSupabaseBrowserClient()
  const queryClient = useQueryClient()
  const items = useQuery({
    queryKey: ["order-items", ws],
    enabled: Boolean(ws && db),
    queryFn: async () => ((await db!.from("order_items").select("*").eq("workspace_id", ws!).order("sort_order").order("created_at")).data as Row[] | null) ?? [],
  })
  const [draft, setDraft] = useState<Draft | null>(null)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["order-items", ws] })

  if (workspace && workspace.type !== "BUSINESS") return <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">ទំព័រនេះសម្រាប់គណនីអាជីវកម្មប៉ុណ្ណោះ</p>

  const save = async () => {
    if (!draft || !ws) return
    const price = roundMoney(parseAmount(draft.price), draft.currency)
    if (!draft.name.trim() || !(price > 0)) return toast.error("សូមដាក់ឈ្មោះ និងតម្លៃ")
    const row = { workspace_id: ws, name: draft.name.trim().slice(0, 80), description: draft.description.trim().slice(0, 200) || null, price, currency: draft.currency, options: parseOptions(draft.options), available: draft.available }
    const { error } = draft.id ? await db!.from("order_items").update(row).eq("id", draft.id) : await db!.from("order_items").insert({ ...row, sort_order: (items.data?.length ?? 0) * 10 })
    if (error) return toast.error("រក្សាទុកមិនបានទេ")
    toast.success("បានរក្សាទុក")
    setDraft(null)
    refresh()
  }

  const toggle = async (r: Row, available: boolean) => {
    const { error } = await db!.from("order_items").update({ available }).eq("id", r.id)
    if (error) toast.error("ប្តូរមិនបានទេ")
    refresh()
  }

  const remove = async () => {
    if (!draft?.id || !window.confirm(`លុប «${draft.name}»?`)) return
    const { error } = await db!.from("order_items").delete().eq("id", draft.id)
    if (error) return toast.error("លុបមិនបានទេ")
    setDraft(null)
    refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Link href="/business/orders" aria-label="ត្រឡប់" className="grid size-9 place-items-center rounded-full hover:bg-muted">
            <ArrowLeftIcon className="size-5" />
          </Link>
          Menu
        </h1>
        {editable && (
          <Button size="sm" onClick={() => setDraft(EMPTY)}>
            <PlusIcon /> បន្ថែម
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">បិទ «មាន» ពេលអស់ — អតិថិជនលែងឃើញភ្លាម</p>

      {items.data && items.data.length === 0 && <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">មិនទាន់មានមុខម្ហូបទេ — ចុច «បន្ថែម»</p>}
      <Card className="gap-0 divide-y py-0">
        {(items.data ?? []).map((r) => (
          <div key={r.id} className={cn("flex items-center gap-3 px-4 py-3", !r.available && "opacity-60")}>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => editable && setDraft({ id: r.id, name: r.name, description: r.description ?? "", price: String(r.price), currency: r.currency, options: optionsText(r.options), available: r.available })}>
              <span className="block truncate font-medium">{r.name}</span>
              <span className="block text-xs text-muted-foreground tabular-nums">
                {formatMoney(Number(r.price), r.currency)}
                {r.options.length ? ` · ${r.options.map((o) => o.name).join(", ")}` : ""}
              </span>
            </button>
            <Switch checked={r.available} disabled={!editable} onCheckedChange={(v) => void toggle(r, v)} aria-label={`${r.name} មាន`} />
          </div>
        ))}
      </Card>

      <BottomSheet open={Boolean(draft)} onOpenChange={(o) => !o && setDraft(null)} title={draft?.id ? "កែមុខម្ហូប" : "មុខម្ហូបថ្មី"}>
        {draft && (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-sm">ឈ្មោះ</span>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} className="h-11 w-full rounded-lg border bg-background px-3" />
            </label>
            <div className="flex gap-2">
              <label className="block flex-1 space-y-1">
                <span className="text-sm">តម្លៃ</span>
                <input value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} inputMode="decimal" className="h-11 w-full rounded-lg border bg-background px-3 tabular-nums" />
              </label>
              <div className="space-y-1">
                <span className="text-sm">រូបិយប័ណ្ណ</span>
                <Segmented value={draft.currency} onChange={(currency) => setDraft({ ...draft, currency })} options={[{ value: "USD", label: "$" }, { value: "KHR", label: "៛" }]} aria-label="រូបិយប័ណ្ណ" />
              </div>
            </div>
            <label className="block space-y-1">
              <span className="text-sm">ពិពណ៌នាខ្លី (បើមាន)</span>
              <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={200} className="h-11 w-full rounded-lg border bg-background px-3" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">ជម្រើស (មួយបន្ទាត់មួយ)</span>
              <textarea value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} rows={3} placeholder={"ស្ករ: 0%, 50%, 100%\nទឹកកក: ធម្មតា, តិច, គ្មាន"} className="w-full rounded-lg border bg-background px-3 py-2" />
            </label>
            <div className="flex items-center justify-between">
              <span className="text-sm">មាន (អតិថិជនឃើញ)</span>
              <Switch checked={draft.available} onCheckedChange={(available) => setDraft({ ...draft, available })} aria-label="មាន" />
            </div>
            <div className="flex gap-2">
              {draft.id && (
                <Button type="button" variant="outline" aria-label="លុប" onClick={() => void remove()}>
                  <Trash2Icon />
                </Button>
              )}
              <Button type="button" className="flex-1" onClick={() => void save()}>
                រក្សាទុក
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}

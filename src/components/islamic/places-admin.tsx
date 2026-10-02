"use client"

import { CheckIcon, LandmarkIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useT } from "@/lib/i18n/use-t"
import { usePlaceMutations, usePlaces, type IslamicPlace } from "@/lib/places"

import { PlaceFormSheet } from "./place-form-sheet"

/** /admin: review suggested places (approve / edit / delete) and add places directly. */
export function PlacesAdmin() {
  const t = useT()
  const { data } = usePlaces()
  const { update, remove } = usePlaceMutations()
  const [editing, setEditing] = useState<IslamicPlace | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const pending = (data ?? []).filter((p) => !p.approved)
  const listed = (data ?? []).filter((p) => p.approved)

  const open = (p: IslamicPlace | null) => {
    setEditing(p)
    setFormOpen(true)
  }
  const del = (p: IslamicPlace) => {
    if (!window.confirm(t("places.deleteConfirm", { name: p.name }))) return
    remove.mutate(p.id, { onError: () => toast.error(t("common.error")) })
  }
  const row = (p: IslamicPlace) => (
    <li key={p.id} className="flex items-center gap-2 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{p.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {t(`places.kind.${p.kind}`)}
          {p.province ? ` · ${p.province}` : ""}
          {p.halal_certified ? ` · ${t("places.certified")}` : ""}
          {p.lat == null ? ` · ${t("places.noPin")}` : ""}
        </p>
      </div>
      {!p.approved && (
        <Button
          size="icon-sm"
          variant="outline"
          className="text-emerald-600"
          aria-label={t("places.approve")}
          onClick={() => update.mutate({ id: p.id, patch: { approved: true } }, { onSuccess: () => toast.success(t("places.approved")) })}
        >
          <CheckIcon />
        </Button>
      )}
      <Button size="icon-sm" variant="ghost" aria-label={t("places.edit")} onClick={() => open(p)}>
        <PencilIcon />
      </Button>
      <Button size="icon-sm" variant="ghost" className="text-destructive" aria-label={t("common.delete")} onClick={() => del(p)}>
        <Trash2Icon />
      </Button>
    </li>
  )

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <LandmarkIcon className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="flex-1 text-sm font-medium text-muted-foreground">{t("places.adminTitle")}</h2>
        <Button size="sm" variant="ghost" onClick={() => open(null)}>
          <PlusIcon />
          {t("places.add")}
        </Button>
      </div>
      <Card className="gap-0 py-0">
        {pending.length > 0 && (
          <>
            <p className="border-b bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">{t("places.pendingCount", { count: pending.length })}</p>
            <ul className="divide-y border-b">{pending.map(row)}</ul>
          </>
        )}
        {listed.length ? <ul className="divide-y">{listed.map(row)}</ul> : <p className="px-3 py-4 text-center text-sm text-muted-foreground">{t("places.empty")}</p>}
      </Card>
      <PlaceFormSheet open={formOpen} onOpenChange={setFormOpen} admin place={editing} />
    </section>
  )
}

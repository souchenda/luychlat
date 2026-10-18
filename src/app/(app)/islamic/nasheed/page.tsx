"use client"

import { ExternalLinkIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { PlayButton } from "@/components/islamic/audio-player"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/lib/i18n/use-t"
import { nasheedQueue, useNasheedMutations, useNasheedTracks, type NasheedTrack } from "@/lib/nasheed-data"
import { usePlan } from "@/lib/plan"
import { useLocaleStore } from "@/stores/locale-store"

/**
 * /islamic/nasheed — «កសាដះ និងណាស្សីដ (قصائد وأناشيد)» (founder, 18/10/2026): recordings we hold the rights to
 * play here (the shared player: ⏮︎ ⏯︎ ⏭︎, sleep timer, car / lock-screen controls); commercial artists open
 * on their official channels. The super admin adds entries — a streamed one only with its rights note.
 */
export default function NasheedPage() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { plan } = usePlan()
  const owner = plan.staff_role === "super_admin"
  const tracks = useNasheedTracks()
  const { remove } = useNasheedMutations()
  const [adding, setAdding] = useState(false)
  const list = tracks.data ?? []
  const streamed = list.filter((x) => x.kind === "STREAM")
  const links = list.filter((x) => x.kind === "LINK")
  const queue = () => nasheedQueue(list, locale)
  const title = (x: NasheedTrack) => (locale === "km" ? x.title_km : (x.title_en ?? x.title_km))

  const removeButton = (x: NasheedTrack) =>
    owner && (
      <button
        type="button"
        aria-label={t("common.delete")}
        className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
        onClick={() => {
          if (!window.confirm(t("nasheed.removeConfirm"))) return
          remove.mutate(x, { onError: () => toast.error(t("common.error")) })
        }}
      >
        <Trash2Icon className="size-4" />
      </button>
    )

  return (
    <div className="space-y-4">
      <p className="px-1 text-sm text-muted-foreground">{t("nasheed.intro")}</p>

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("nasheed.inApp")}</h2>
        {tracks.isLoading ? (
          <Loader2Icon className="mx-auto size-5 animate-spin text-muted-foreground" />
        ) : streamed.length === 0 ? (
          <Card className="px-4 py-3">
            <p className="text-sm text-muted-foreground">{t("nasheed.noneYet")}</p>
          </Card>
        ) : (
          <Card className="gap-0 divide-y py-0">
            {streamed.map((x) => (
              <div key={x.id} className="flex items-center gap-3 px-4 py-2.5">
                <PlayButton kind="nasheed" queue={queue} index={queue().findIndex((q) => q.key === `nasheed:${x.id}`)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{title(x)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{x.artist}</span>
                </span>
                {removeButton(x)}
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("nasheed.official")}</h2>
        <Card className="gap-0 divide-y py-0">
          {links.map((x) => (
            <div key={x.id} className="flex items-center gap-3 px-4 py-2.5">
              <a href={x.url ?? "#"} target="_blank" rel="noopener noreferrer" className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
                <ExternalLinkIcon className="size-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{title(x)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{x.artist}</span>
                </span>
              </a>
              {removeButton(x)}
            </div>
          ))}
          {links.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">—</p>}
        </Card>
        <p className="px-1 text-[11px] text-muted-foreground">{t("nasheed.linksNote")}</p>
      </section>

      {owner && (
        <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setAdding(true)}>
          <PlusIcon />
          {t("nasheed.add")}
        </Button>
      )}
      {owner && <AddSheet open={adding} onOpenChange={setAdding} />}
    </div>
  )
}

/** The super admin's form: a cleared recording (file + who granted the rights) or an official link. */
function AddSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT()
  const { add } = useNasheedMutations()
  const [kind, setKind] = useState<"STREAM" | "LINK">("STREAM")
  const [titleKm, setTitleKm] = useState("")
  const [titleEn, setTitleEn] = useState("")
  const [artist, setArtist] = useState("")
  const [url, setUrl] = useState("")
  const [rights, setRights] = useState("")
  const [file, setFile] = useState<File | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!titleKm.trim() || !artist.trim()) return void toast.error(t("nasheed.required"))
    if (kind === "STREAM" && (!file || rights.trim().length < 5)) return void toast.error(t("nasheed.rightsRequired"))
    if (kind === "LINK" && !/^https:\/\//.test(url.trim())) return void toast.error(t("nasheed.urlRequired"))
    add.mutate(
      { kind, title_km: titleKm.trim(), title_en: titleEn.trim() || null, artist: artist.trim(), url: kind === "LINK" ? url.trim() : null, rights_note: rights.trim() || null, file },
      {
        onSuccess: () => {
          toast.success(t("nasheed.added"))
          setTitleKm("")
          setTitleEn("")
          setArtist("")
          setUrl("")
          setRights("")
          setFile(null)
          onOpenChange(false)
        },
        onError: () => toast.error(t("common.error")),
      },
    )
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("nasheed.add")}>
      <form onSubmit={submit} className="space-y-3">
        <Segmented
          aria-label={t("nasheed.add")}
          value={kind}
          onChange={setKind}
          options={[
            { value: "STREAM", label: t("nasheed.kindStream") },
            { value: "LINK", label: t("nasheed.kindLink") },
          ]}
        />
        <div className="space-y-1.5">
          <Label htmlFor="n-title">{t("nasheed.titleKm")}</Label>
          <Input id="n-title" value={titleKm} onChange={(e) => setTitleKm(e.target.value)} maxLength={120} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="n-title-en">{t("nasheed.titleEn")}</Label>
          <Input id="n-title-en" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} maxLength={120} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="n-artist">{t("nasheed.artist")}</Label>
          <Input id="n-artist" value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={120} className="h-11" />
        </div>
        {kind === "STREAM" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="n-file">{t("nasheed.file")}</Label>
              <Input id="n-file" type="file" accept="audio/mpeg,audio/mp4,audio/aac,audio/x-m4a,.mp3,.m4a" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-rights">{t("nasheed.rights")}</Label>
              <Input id="n-rights" value={rights} onChange={(e) => setRights(e.target.value)} maxLength={500} placeholder={t("nasheed.rightsPlaceholder")} className="h-11" />
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="n-url">{t("nasheed.url")}</Label>
            <Input id="n-url" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" placeholder="https://www.youtube.com/@…" className="h-11" />
          </div>
        )}
        <Button type="submit" className="h-11 w-full" disabled={add.isPending}>
          {add.isPending && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>
      </form>
    </BottomSheet>
  )
}

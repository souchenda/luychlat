"use client"

import { Loader2Icon, LocateFixedIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { locateDevice, useIslamicLocation } from "@/components/islamic/location-picker"
import { OsmMap } from "@/components/islamic/osm-map"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { submittedThanks } from "@/lib/contributor-thanks"
import { useKhmerT } from "@/lib/i18n/use-t"
import { useIslamicEnabled } from "@/lib/islamic-settings"
import { PLACE_KINDS, usePlaceMutations, type PlaceKind } from "@/lib/places"
import { PROVINCES } from "@/lib/prayer"

/**
 * «ស្នើសុំបន្ថែមទីតាំង» (founder, 19/10/2026): a light suggestion for a place the finder is missing — the kind, the
 * name, the province (and an optional address), the position taken from the phone's location at once (adjustable
 * on one small map). Always in Khmer. Listed only after an admin approves it.
 */
export function SuggestPlaceSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useKhmerT()
  // Thanks in the member's own words: Islamic blessings only in Islamic Mode (lib/contributor-thanks.ts).
  const islamic = useIslamicEnabled()
  const around = useIslamicLocation()
  const { add } = usePlaceMutations()
  const [kind, setKind] = useState<PlaceKind>("MOSQUE")
  const [name, setName] = useState("")
  const [province, setProvince] = useState("")
  const [address, setAddress] = useState("")
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)

  const locate = async () => {
    setLocating(true)
    const result = await locateDevice()
    setLocating(false)
    if (result.ok) setPoint({ lat: Math.round(result.lat * 1e5) / 1e5, lng: Math.round(result.lng * 1e5) / 1e5 })
    else toast.error(t(result.reason === "denied" ? "finder.gpsDenied" : "finder.gpsFailed"))
  }

  // Opened: a fresh form, and the phone's position straight away (no fiddling with the map).
  useEffect(() => {
    if (!open) return
    setKind("MOSQUE")
    setName("")
    setProvince("")
    setAddress("")
    setPoint(null)
    void locate()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [open])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return void toast.error(t("suggest.nameRequired"))
    if (!point) return void toast.error(t("suggest.pinRequired"))
    add.mutate(
      { kind, name: name.trim(), province: province || null, address: address.trim() || null, lat: point.lat, lng: point.lng, phone: null, note: null, photo_path: null },
      {
        onSuccess: () => {
          toast.success(submittedThanks(islamic), { duration: 8_000 })
          onOpenChange(false)
        },
        onError: (error) => toast.error(t(error.message.includes("too many") ? "suggest.tooMany" : "suggest.failed")),
      },
    )
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("suggest.title")} description={t("suggest.intro")}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t("suggest.kind")}</Label>
          <Segmented aria-label={t("suggest.kind")} value={kind} onChange={(v) => setKind(v as PlaceKind)} options={PLACE_KINDS.map((k) => ({ value: k, label: t(`suggest.kind.${k}`) }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="suggest-name">{t("suggest.name")}</Label>
          <Input id="suggest-name" className="h-11" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("suggest.namePlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("suggest.province")}</Label>
          <Select value={province} onValueChange={setProvince}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue placeholder={t("suggest.provincePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {PROVINCES.map((p) => (
                <SelectItem key={p.key} value={p.km}>
                  {p.km}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="suggest-address">{t("suggest.address")}</Label>
          <Input id="suggest-address" className="h-11" maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("suggest.addressPlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label>{t("suggest.map")}</Label>
            <Button type="button" size="sm" variant="outline" onClick={() => void locate()} disabled={locating}>
              {locating ? <Loader2Icon className="animate-spin" /> : <LocateFixedIcon />}
              {locating ? t("suggest.locating") : t("suggest.gps")}
            </Button>
          </div>
          {/* One small map with a fixed height; `isolate` keeps Leaflet's layers inside it (never over the sheet). */}
          <div className="isolate h-56 overflow-hidden rounded-xl border">
            <OsmMap
              className="h-full w-full"
              center={point ?? { lat: around.lat, lng: around.lng }}
              zoom={point ? 16 : 12}
              markers={point ? [{ id: "pin", lat: point.lat, lng: point.lng, tone: "PIN", title: name || t("suggest.map") }] : []}
              onPick={(p) => setPoint({ lat: Math.round(p.lat * 1e5) / 1e5, lng: Math.round(p.lng * 1e5) / 1e5 })}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("suggest.pinHint")}</p>
        </div>
        <Button type="submit" className="h-12 w-full text-base" disabled={add.isPending}>
          {add.isPending && <Loader2Icon className="animate-spin" />}
          {t("suggest.submit")}
        </Button>
      </form>
    </BottomSheet>
  )
}

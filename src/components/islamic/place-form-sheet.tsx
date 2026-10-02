"use client"

import { Loader2Icon, LocateFixedIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/lib/i18n/use-t"
import { parseLatLng, PLACE_KINDS, usePlaceMutations, type IslamicPlace, type PlaceKind } from "@/lib/places"
import { PROVINCES } from "@/lib/prayer"
import { useLocaleStore } from "@/stores/locale-store"

/**
 * Suggest a place (users: waits for an admin) or add / edit one (admins:
 * listed at once, may mark it halal-certified).
 */
export function PlaceFormSheet({
  open,
  onOpenChange,
  admin,
  place,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  admin?: boolean
  /** Edit this place (admin only). */
  place?: IslamicPlace | null
}) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { add, update } = usePlaceMutations()
  const [kind, setKind] = useState<PlaceKind>("MOSQUE")
  const [name, setName] = useState("")
  const [province, setProvince] = useState("")
  const [address, setAddress] = useState("")
  const [coords, setCoords] = useState("")
  const [phone, setPhone] = useState("")
  const [note, setNote] = useState("")
  const [certified, setCertified] = useState(false)
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    if (!open) return
    setKind(place?.kind ?? "MOSQUE")
    setName(place?.name ?? "")
    setProvince(place?.province ?? "")
    setAddress(place?.address ?? "")
    setCoords(place?.lat != null && place.lng != null ? `${place.lat}, ${place.lng}` : "")
    setPhone(place?.phone ?? "")
    setNote(place?.note ?? "")
    setCertified(place?.halal_certified ?? false)
  }, [open, place])

  const here = () => {
    if (!("geolocation" in navigator)) return void toast.error(t("prayer.gpsUnavailable"))
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`)
        setLocating(false)
      },
      () => {
        setLocating(false)
        toast.error(t("prayer.gpsDenied"))
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    )
  }

  const busy = add.isPending || update.isPending
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return void toast.error(t("places.nameRequired"))
    const point = coords.trim() ? parseLatLng(coords) : null
    if (coords.trim() && !point) return void toast.error(t("places.coordsInvalid"))
    const input = {
      kind,
      name: name.trim(),
      province: province || null,
      address: address.trim() || null,
      lat: point?.lat ?? null,
      lng: point?.lng ?? null,
      phone: phone.trim() || null,
      note: note.trim() || null,
      ...(admin ? { halal_certified: kind === "HALAL" && certified, approved: true } : {}),
    }
    const onSuccess = () => {
      toast.success(t(admin ? "places.saved" : "places.suggested"))
      onOpenChange(false)
    }
    const onError = (error: Error) => toast.error(error.message.includes("too many") ? t("places.tooMany") : t("common.error"))
    if (place) update.mutate({ id: place.id, patch: input }, { onSuccess, onError })
    else add.mutate(input, { onSuccess, onError })
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t(place ? "places.edit" : admin ? "places.add" : "places.suggest")} description={admin ? undefined : t("places.suggestHint")}>
      <form onSubmit={submit} className="space-y-4">
        <Segmented
          aria-label={t("places.kind")}
          value={kind}
          onChange={(v) => setKind(v as PlaceKind)}
          options={PLACE_KINDS.map((k) => ({ value: k, label: t(`places.kind.${k}`) }))}
        />
        <div className="space-y-1.5">
          <Label htmlFor="place-name">{t("places.name")}</Label>
          <Input id="place-name" className="h-11" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("places.province")}</Label>
          <Select value={province || undefined} onValueChange={setProvince}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue placeholder={t("places.provincePick")} />
            </SelectTrigger>
            <SelectContent>
              {PROVINCES.map((p) => (
                <SelectItem key={p.key} value={p.km}>
                  {p[locale]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="place-address">{t("places.address")}</Label>
          <Textarea id="place-address" rows={2} maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="place-coords">{t("places.coords")}</Label>
          <div className="flex gap-2">
            <Input id="place-coords" className="h-11 min-w-0 flex-1" placeholder="11.5564, 104.9282" value={coords} onChange={(e) => setCoords(e.target.value)} />
            <Button type="button" variant="outline" className="h-11 shrink-0" onClick={here} disabled={locating} aria-label={t("places.useHere")}>
              {locating ? <Loader2Icon className="animate-spin" /> : <LocateFixedIcon />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("places.coordsHint")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="place-phone">{t("places.phone")}</Label>
          <Input id="place-phone" className="h-11" type="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="place-note">{t("places.note")}</Label>
          <Textarea id="place-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {admin && kind === "HALAL" && (
          <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
            {t("places.certified")}
            <Switch checked={certified} onCheckedChange={setCertified} />
          </label>
        )}
        <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
          {busy && <Loader2Icon className="animate-spin" />}
          {t(admin || place ? "common.save" : "places.send")}
        </Button>
      </form>
    </BottomSheet>
  )
}

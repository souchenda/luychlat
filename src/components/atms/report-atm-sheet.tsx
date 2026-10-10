"use client"

import { Loader2Icon, LocateFixedIcon, SendIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BANKS, type BankCode } from "@/lib/atm"
import { useT } from "@/lib/i18n/use-t"

type Fix = { lat: number; lng: number; accuracy: number }

/** A fresh, high-accuracy GPS fix (never a cached or network one: the point must be the ATM's). */
function gpsFix(): Promise<Fix | "denied" | "failed"> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation || !window.isSecureContext) return resolve("failed")
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      (e) => resolve(e.code === 1 ? "denied" : "failed"),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    )
  })
}

/** «ប្រាប់ទូ ATM ដែលខ្វះ»: standing at the ATM — its GPS point, the bank, a short note; an admin approves it. */
export function ReportAtmSheet({ open, onOpenChange, defaultBank }: { open: boolean; onOpenChange: (v: boolean) => void; defaultBank: BankCode | null }) {
  const t = useT()
  const [fix, setFix] = useState<Fix | null>(null)
  const [locating, setLocating] = useState(false)
  const [bank, setBank] = useState<BankCode | "">(defaultBank ?? "")
  const [note, setNote] = useState("")
  const [sending, setSending] = useState(false)

  const locate = async () => {
    setLocating(true)
    const r = await gpsFix()
    setLocating(false)
    if (r === "denied") return void toast.error(t("atm.locationDenied"))
    if (r === "failed") return void toast.error(t("atm.report.gpsFailed"))
    setFix(r)
  }

  const send = async () => {
    if (!fix || !bank) return
    setSending(true)
    try {
      const res = await fetch("/api/atms/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bank, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, note: note.trim() || null }),
      })
      if (res.status === 429) return void toast.error(t("atm.report.tooMany"))
      if (!res.ok) return void toast.error(t("common.error"))
      toast.success(t("atm.report.sent"))
      setFix(null)
      setNote("")
      onOpenChange(false)
    } finally {
      setSending(false)
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("atm.report.title")} description={t("atm.report.hint")}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Button type="button" variant={fix ? "outline" : "default"} className="h-11 w-full" onClick={() => void locate()} disabled={locating}>
            {locating ? <Loader2Icon className="animate-spin" /> : <LocateFixedIcon />}
            {t(fix ? "atm.report.relocate" : "atm.report.locate")}
          </Button>
          {fix && (
            <p className="text-center text-xs text-muted-foreground tabular-nums">
              {fix.lat.toFixed(6)}, {fix.lng.toFixed(6)} · ±{fix.accuracy} m{fix.accuracy > 50 ? ` — ${t("atm.report.weak")}` : ""}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label>{t("atm.bank")}</Label>
          <Select value={bank} onValueChange={(v) => setBank(v as BankCode)}>
            <SelectTrigger aria-label={t("atm.bank")} className="h-11 w-full">
              <SelectValue placeholder={t("atm.report.pickBank")} />
            </SelectTrigger>
            <SelectContent>
              {BANKS.map((b) => (
                <SelectItem key={b.code} value={b.code}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="atm-note">{t("atm.report.note")}</Label>
          <Input id="atm-note" value={note} maxLength={120} placeholder={t("atm.report.notePlaceholder")} onChange={(e) => setNote(e.target.value)} className="h-11" />
        </div>
        <Button type="button" className="h-12 w-full text-base" disabled={!fix || !bank || sending} onClick={() => void send()}>
          {sending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
          {t("atm.report.send")}
        </Button>
      </div>
    </BottomSheet>
  )
}

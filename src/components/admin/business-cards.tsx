"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CrownIcon, GiftIcon, Loader2Icon, QrCodeIcon, UploadIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { rpc, Section, Stat, who } from "@/components/admin/ui"
import type { PaymentInstructions } from "@/components/billing/upgrade-sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

// Super Admin: referral results and the payment details shown in the upgrade sheet (moved from /admin).

type ReferralStats = {
  total: number
  last_30d: number
  days_granted: number
  top: { user_id: string; email: string | null; display_name: string | null; invited: number; days_earned: number }[]
}

export function ReferralStatsCard() {
  const t = useT()
  const { data } = useQuery({ queryKey: ["admin", "referrals"], queryFn: () => rpc<ReferralStats>("admin_referral_stats") })
  if (!data) return null
  return (
    <Section title={t("referral.title")} icon={<GiftIcon />}>
      <Card className="gap-3 px-4 py-4">
        <div className="grid grid-cols-3 gap-2">
          <Stat label={t("admin.refTotal")} value={data.total} />
          <Stat label={t("admin.last30d")} value={data.last_30d} />
          <Stat label={t("admin.refDays")} value={data.days_granted} />
        </div>
        {data.top.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("admin.topReferrers")}</p>
            <ol className="divide-y text-sm">
              {data.top.map((r, i) => (
                <li key={r.user_id} className="flex items-center gap-2 py-1.5">
                  <span className="w-5 text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{who(r)}</span>
                  <span className="tabular-nums font-medium">{r.invited}</span>
                  <span className="w-14 text-right text-xs text-muted-foreground tabular-nums">+{r.days_earned}d</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Card>
    </Section>
  )
}

type Instructions = PaymentInstructions

const QR_BUCKET = "payment-qr"
const MAX_QR_BYTES = 2 * 1024 * 1024

/** Big screenshots are scaled down (PNG keeps the QR sharp); small ones upload as they are. */
async function prepareQrImage(file: File): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("type")
  const bitmap = await createImageBitmap(file)
  const longest = Math.max(bitmap.width, bitmap.height)
  if (longest <= 1600 && file.size <= MAX_QR_BYTES) return file
  const scale = Math.min(1, 1600 / longest)
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext("2d")!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
  if (!blob || blob.size > MAX_QR_BYTES) throw new Error("size")
  return blob
}

export function PaymentInstructionsForm() {
  const t = useT()
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ["payment-instructions"],
    queryFn: async () => {
      const { data } = await getSupabaseBrowserClient()!.from("app_settings").select("value").eq("key", "payment_instructions").maybeSingle()
      return (data?.value ?? {}) as Instructions
    },
  })
  const [form, setForm] = useState<Instructions>({})
  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const save = useMutation({
    mutationFn: () => rpc("admin_set_payment_instructions", { p_value: form }),
    onSuccess: () => {
      toast.success(t("admin.saved"))
      void queryClient.invalidateQueries({ queryKey: ["payment-instructions"] })
    },
    onError: () => toast.error(t("common.error")),
  })
  const field = (key: keyof Instructions) => ({
    value: form[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  })

  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : ""
  const qr = form.khqr_image_url?.trim() ?? ""
  // The app's security policy only shows images from this site or our Supabase.
  const qrAllowed = !qr || (qr.startsWith("https://") && (qr.startsWith(`${supabaseOrigin}/`) || (typeof window !== "undefined" && qr.startsWith(`${window.location.origin}/`))))

  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const blob = await prepareQrImage(file)
      const ext = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png"
      const path = `khqr-${Date.now()}.${ext}`
      const supabase = getSupabaseBrowserClient()!
      const { error } = await supabase.storage.from(QR_BUCKET).upload(path, blob, { contentType: blob.type || "image/png", cacheControl: "31536000", upsert: false })
      if (error) throw error
      const url = supabase.storage.from(QR_BUCKET).getPublicUrl(path).data.publicUrl
      setForm((f) => ({ ...f, khqr_image_url: url }))
      toast.success(t("admin.qrUploaded"))
    } catch (error) {
      toast.error(/type|size/.test(String((error as Error).message)) ? t("admin.qrInvalid") : t("common.error"))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <Section title={t("admin.paymentInstructions")} icon={<CrownIcon />}>
      <Card className="px-4 py-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          {/* Static KHQR image */}
          <div className="space-y-2">
            <Label>{t("admin.qrImage")}</Label>
            <div className="flex items-start gap-3">
              <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white">
                {qr && qrAllowed ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded image on Supabase Storage
                  <img src={qr} alt="KHQR" className="size-full object-contain" />
                ) : (
                  <QrCodeIcon className="size-8 text-neutral-300" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} aria-label={t("admin.qrUpload")} />
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
                  {t("admin.qrUpload")}
                </Button>
                {qr && (
                  <Button type="button" variant="ghost" size="sm" className="w-full text-destructive" onClick={() => setForm((f) => ({ ...f, khqr_image_url: "" }))}>
                    {t("admin.qrRemove")}
                  </Button>
                )}
                <p className="text-[11px] text-muted-foreground">{t("admin.qrHint")}</p>
              </div>
            </div>
            <Input placeholder="https://…/payment-qr/khqr.png" inputMode="url" maxLength={500} aria-label={t("admin.qrUrl")} {...field("khqr_image_url")} />
            {!qrAllowed && <p className="text-xs text-[#F43F5E]">{t("admin.qrUrlBlocked")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pi-bank">{t("admin.bank")}</Label>
            <Input id="pi-bank" placeholder="ABA Bank" maxLength={80} {...field("bank")} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="pi-name">{t("admin.accountName")}</Label>
              <Input id="pi-name" maxLength={80} {...field("account_name")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pi-number">{t("admin.accountNumber")}</Label>
              <Input id="pi-number" inputMode="numeric" maxLength={40} className="font-mono" {...field("account_number")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pi-km">{t("admin.noteKm")}</Label>
            <Textarea id="pi-km" rows={2} maxLength={500} {...field("note_km")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pi-en">{t("admin.noteEn")}</Label>
            <Textarea id="pi-en" rows={2} maxLength={500} {...field("note_en")} />
          </div>
          <Button type="submit" className="w-full" disabled={save.isPending || uploading || !qrAllowed}>
            {t("common.save")}
          </Button>
        </form>
      </Card>
    </Section>
  )
}


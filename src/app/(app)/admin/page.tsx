"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format, formatDistanceToNowStrict } from "date-fns"
import {
  ActivityIcon,
  CheckIcon,
  CrownIcon,
  GiftIcon,
  InfoIcon,
  LifeBuoyIcon,
  QrCodeIcon,
  Loader2Icon,
  SearchIcon,
  ShieldAlertIcon,
  UploadIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { paymentCode, type PaymentInstructions } from "@/components/billing/upgrade-sheet"
import { DEFAULT_ABOUT, type AboutInfo } from "@/lib/app-info"
import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Currency } from "@/lib/data/types"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { usePlan } from "@/lib/plan"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

/**
 * Owner/admin console. Every call is an admin_* RPC that re-checks
 * public.is_admin() in the database, so hiding this page is only cosmetic.
 */

type Overview = {
  users: number
  dau: number
  mau: number
  new_7d: number
  pro_active: number
  free_users: number
  expiring_7d: number
  pending_payments: number
  paid_30d_usd: number
  paid_30d_khr: number
}
type Subscriber = {
  user_id: string
  email: string | null
  display_name: string | null
  joined_at: string
  plan_code: string | null
  tier: "PRO" | "FREE"
  status: string | null
  period_end: string | null
  pending_payments: number
  last_paid_at: string | null
  last_active_at: string | null
  total: number
}
type AdminPayment = {
  id: string
  user_id: string
  email: string | null
  display_name: string | null
  plan_code: string
  amount: number
  currency: Currency
  method: string
  reference: string | null
  status: string
  note: string | null
  created_at: string
}
type SubEvent = { id: number; kind: string; plan_code: string | null; period_end: string | null; note: string | null; created_at: string }
type ReferralStats = {
  total: number
  last_30d: number
  days_granted: number
  top: { user_id: string; email: string | null; display_name: string | null; invited: number; days_earned: number }[]
}

const FILTERS = ["all", "pro", "free", "expiring", "expired", "pending"] as const
type Filter = (typeof FILTERS)[number]

const rpc = async <T,>(name: string, args?: Record<string, unknown>) => {
  const { data, error } = await getSupabaseBrowserClient()!.rpc(name, args)
  if (error) throw error
  return data as T
}

const who = (u: { display_name: string | null; email: string | null }) => u.display_name || u.email || "—"
const ago = (iso: string | null) => (iso ? formatDistanceToNowStrict(new Date(iso), { addSuffix: true }) : "—")

function useInvalidateAdmin() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ["admin"] })
}

function Section({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
        <h2 className="flex-1 text-sm font-medium text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl px-3 py-2.5", accent ? "bg-primary/10" : "bg-muted/60")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-bold tabular-nums", accent && "text-primary")}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function AnalyticsCard() {
  const t = useT()
  const { data: o } = useQuery({ queryKey: ["admin", "overview"], queryFn: () => rpc<Overview>("admin_overview"), refetchInterval: 60_000 })
  if (!o) return <Card className="h-56 animate-pulse" />
  const proShare = o.users ? Math.round((o.pro_active / o.users) * 100) : 0

  return (
    <Section title={t("admin.analytics")} icon={<ActivityIcon />}>
      <Card className="gap-3 px-4 py-4">
        <div className="grid grid-cols-3 gap-2">
          <Stat label={t("admin.users")} value={o.users} hint={t("admin.new7d", { count: o.new_7d })} />
          <Stat label="DAU" value={o.dau} hint={t("admin.last24h")} />
          <Stat label="MAU" value={o.mau} hint={t("admin.last30d")} />
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <CrownIcon className="size-4 text-primary" aria-hidden />
              PRO {o.pro_active}
            </span>
            <span className="text-muted-foreground">
              {t("plan.free")} {o.free_users}
            </span>
          </div>
          <div
            className="flex h-2 gap-0.5 overflow-hidden rounded-full"
            role="img"
            aria-label={`PRO ${o.pro_active} / ${t("plan.free")} ${o.free_users}`}
          >
            <div className="rounded-full bg-primary" style={{ width: `${proShare}%` }} />
            <div className="flex-1 rounded-full bg-muted" />
          </div>
          <p className="text-xs text-muted-foreground">{t("admin.proShare", { percent: proShare })}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label={t("admin.pending")} value={o.pending_payments} accent={o.pending_payments > 0} />
          <Stat label={t("admin.expiring")} value={o.expiring_7d} hint={t("admin.next7d")} />
          <Stat
            label={t("admin.revenue30d")}
            value={<span className="text-base">{formatMoney(Number(o.paid_30d_usd), "USD")}</span>}
            hint={Number(o.paid_30d_khr) ? `+ ${formatMoney(Number(o.paid_30d_khr), "KHR")}` : undefined}
          />
        </div>
      </Card>
    </Section>
  )
}

function PendingPayments() {
  const t = useT()
  const invalidate = useInvalidateAdmin()
  const { data } = useQuery({
    queryKey: ["admin", "payments", "PENDING"],
    queryFn: async () => (await rpc<AdminPayment[]>("admin_list_payments", { p_status: "PENDING", p_limit: 50 })).map((p) => ({ ...p, amount: Number(p.amount) })),
    refetchInterval: 30_000,
  })
  const review = useMutation({
    mutationFn: (v: { id: string; approve: boolean; note: string | null }) =>
      rpc("admin_review_payment", { p_payment_id: v.id, p_approve: v.approve, p_note: v.note }),
    onSuccess: (_, v) => {
      toast.success(t(v.approve ? "admin.approved" : "admin.rejected"))
      void invalidate()
    },
    onError: () => toast.error(t("common.error")),
  })

  const decide = (p: AdminPayment, approve: boolean) => {
    if (approve) {
      if (!window.confirm(t("admin.approveConfirm", { name: who(p), amount: formatMoney(p.amount, p.currency) }))) return
      review.mutate({ id: p.id, approve, note: null })
    } else {
      const note = window.prompt(t("admin.rejectReason"))
      if (note === null) return
      review.mutate({ id: p.id, approve, note: note.trim() || null })
    }
  }

  return (
    <Section title={t("admin.pendingPayments")} icon={<CrownIcon />}>
      <Card className="gap-0 divide-y py-0">
        {!data?.length ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t("admin.noPending")}</p>
        ) : (
          data.map((p) => (
            <div key={p.id} className="space-y-2 px-4 py-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{who(p)}</p>
                  {p.display_name && <p className="truncate text-xs text-muted-foreground">{p.email}</p>}
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{formatMoney(p.amount, p.currency)}</p>
                  <p className="text-xs text-muted-foreground">{t(p.plan_code === "PRO_YEARLY" ? "upgrade.yearly" : "upgrade.monthly")}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono font-semibold text-foreground">#{paymentCode(p.id)}</span> · {t(`upgrade.method.${p.method}` as MessageKey)}
                {p.reference && <span className="font-mono"> · {p.reference}</span>} · {ago(p.created_at)}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" className="text-destructive" onClick={() => decide(p, false)} disabled={review.isPending}>
                  <XIcon />
                  {t("admin.reject")}
                </Button>
                <Button size="sm" onClick={() => decide(p, true)} disabled={review.isPending}>
                  <CheckIcon />
                  {t("admin.approve")}
                </Button>
              </div>
            </div>
          ))
        )}
      </Card>
    </Section>
  )
}

function SubscriberSheet({ user, onClose }: { user: Subscriber | null; onClose: () => void }) {
  const t = useT()
  const invalidate = useInvalidateAdmin()
  const [endDate, setEndDate] = useState("")
  const events = useQuery({
    queryKey: ["admin", "events", user?.user_id],
    enabled: Boolean(user),
    queryFn: () => rpc<SubEvent[]>("admin_user_events", { p_user_id: user!.user_id }),
  })

  useEffect(() => {
    setEndDate(user?.period_end ? format(new Date(user.period_end), "yyyy-MM-dd") : "")
  }, [user])

  const act = useMutation({
    mutationFn: ({ name, args }: { name: string; args: Record<string, unknown> }) => rpc(name, args),
    onSuccess: () => {
      toast.success(t("admin.saved"))
      void invalidate()
      onClose()
    },
    onError: () => toast.error(t("common.error")),
  })

  if (!user) return null
  const planCode = user.plan_code && user.plan_code !== "FREE" ? user.plan_code : "PRO_MONTHLY"
  const extend = (days: number, code: string) =>
    act.mutate({ name: "admin_extend_subscription", args: { p_user_id: user.user_id, p_plan_code: code, p_days: days, p_note: null } })

  return (
    <BottomSheet open onOpenChange={(v) => !v && onClose()} title={who(user)} description={user.email ?? undefined}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label={t("admin.plan")}
            value={<span className="text-base">{user.tier}</span>}
            hint={user.period_end ? format(new Date(user.period_end), "dd/MM/yyyy") : undefined}
            accent={user.tier === "PRO"}
          />
          <Stat label={t("admin.lastActive")} value={<span className="text-base">{ago(user.last_active_at)}</span>} hint={t("admin.joined", { date: format(new Date(user.joined_at), "dd/MM/yyyy") })} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => extend(30, "PRO_MONTHLY")} disabled={act.isPending}>
            +30 {t("admin.days")}
          </Button>
          <Button variant="outline" onClick={() => extend(365, "PRO_YEARLY")} disabled={act.isPending}>
            +365 {t("admin.days")}
          </Button>
        </div>

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!endDate) return
            act.mutate({
              name: "admin_set_subscription_end",
              args: { p_user_id: user.user_id, p_plan_code: planCode, p_period_end: new Date(`${endDate}T23:59:59`).toISOString(), p_note: null },
            })
          }}
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="sub-end">{t("admin.setEnd")}</Label>
            <Input id="sub-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <Button type="submit" variant="secondary" disabled={act.isPending || !endDate}>
            {t("common.save")}
          </Button>
        </form>

        {user.tier === "PRO" && (
          <Button
            variant="ghost"
            className="w-full text-destructive"
            disabled={act.isPending}
            onClick={() => {
              if (window.confirm(t("admin.cancelConfirm", { name: who(user) })))
                act.mutate({ name: "admin_cancel_subscription", args: { p_user_id: user.user_id, p_note: null } })
            }}
          >
            {t("admin.cancelSub")}
          </Button>
        )}

        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t("admin.history")}</p>
          {!events.data?.length ? (
            <p className="text-xs text-muted-foreground">—</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {events.data.map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="w-20 shrink-0 text-muted-foreground tabular-nums">{format(new Date(e.created_at), "dd/MM/yy")}</span>
                  <span className="flex-1">
                    <span className="font-medium">{e.kind}</span>
                    {e.period_end && <span className="text-muted-foreground"> → {format(new Date(e.period_end), "dd/MM/yyyy")}</span>}
                    {e.note && <span className="block text-muted-foreground">{e.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}

const PAGE_SIZE = 30

function Subscribers() {
  const t = useT()
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [selected, setSelected] = useState<Subscriber | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const { data, isFetching } = useQuery({
    queryKey: ["admin", "subscribers", debounced, filter, limit],
    queryFn: () => rpc<Subscriber[]>("admin_list_subscribers", { p_search: debounced, p_filter: filter, p_limit: limit, p_offset: 0 }),
    placeholderData: (prev) => prev,
  })
  const total = data?.[0]?.total ?? 0

  return (
    <Section title={t("admin.subscribers")} icon={<UsersIcon />} action={isFetching ? <Loader2Icon className="size-4 animate-spin text-muted-foreground" /> : null}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("admin.search")} className="pl-8" aria-label={t("admin.search")} />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => (
              <SelectItem key={f} value={f}>
                {t(`admin.filter.${f}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Card className="gap-0 divide-y py-0">
        {!data?.length ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t("admin.noUsers")}</p>
        ) : (
          data.map((u) => (
            <button key={u.user_id} type="button" onClick={() => setSelected(u)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{who(u)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {t("admin.lastActive")}: {ago(u.last_active_at)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    u.tier === "PRO" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {u.tier}
                </span>
                {u.period_end && <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{format(new Date(u.period_end), "dd/MM/yy")}</p>}
                {u.pending_payments > 0 && <p className="mt-0.5 text-[11px] font-medium text-amber-600">{t("admin.pendingCount", { count: u.pending_payments })}</p>}
              </div>
            </button>
          ))
        )}
      </Card>
      {data && total > data.length && (
        <Button variant="ghost" className="w-full" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
          {t("admin.more", { shown: data.length, total })}
        </Button>
      )}
      <SubscriberSheet user={selected} onClose={() => setSelected(null)} />
    </Section>
  )
}

function ReferralStatsCard() {
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

function PaymentInstructionsForm() {
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

type AdminTicket = {
  id: string
  user_id: string
  email: string | null
  display_name: string | null
  plan_code: string
  category: string
  message: string
  contact: string | null
  context: Record<string, unknown>
  status: string
  admin_reply: string | null
  created_at: string
}

function TicketRow({ ticket }: { ticket: AdminTicket }) {
  const t = useT()
  const invalidate = useInvalidateAdmin()
  const [reply, setReply] = useState("")
  const update = useMutation({
    mutationFn: (status: string) => rpc("admin_update_ticket", { p_ticket_id: ticket.id, p_status: status, p_reply: reply }),
    onSuccess: () => {
      setReply("")
      toast.success(t("admin.saved"))
      void invalidate()
    },
    onError: () => toast.error(t("common.error")),
  })
  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold">{t(`support.category.${ticket.category}` as MessageKey)}</span>
        <span className="text-muted-foreground">{ago(ticket.created_at)}</span>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5">{t(`support.status.${ticket.status}` as MessageKey)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {who(ticket)} · {ticket.plan_code}
        {ticket.contact && <span className="font-medium text-foreground"> · {ticket.contact}</span>}
        {typeof ticket.context?.from === "string" && <span> · {ticket.context.from}</span>}
      </p>
      <p className="text-sm whitespace-pre-line">{ticket.message}</p>
      {ticket.admin_reply && <p className="rounded-lg bg-primary/5 p-2 text-xs whitespace-pre-line">↳ {ticket.admin_reply}</p>}
      <Textarea rows={2} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("admin.replyPlaceholder")} aria-label={t("admin.replyPlaceholder")} />
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate("IN_PROGRESS")}>
          {t("admin.ticketWorking")}
        </Button>
        <Button size="sm" disabled={update.isPending} onClick={() => update.mutate("RESOLVED")}>
          <CheckIcon />
          {t("admin.ticketResolve")}
        </Button>
      </div>
    </div>
  )
}

function SupportTickets() {
  const t = useT()
  const [status, setStatus] = useState("active")
  const { data } = useQuery({
    queryKey: ["admin", "tickets", status],
    queryFn: () => rpc<AdminTicket[]>("admin_list_tickets", { p_status: status, p_limit: 50 }),
    refetchInterval: 60_000,
  })
  return (
    <Section
      title={t("admin.tickets")}
      icon={<LifeBuoyIcon />}
      action={
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["active", "RESOLVED", "CLOSED", "all"].map((s) => (
              <SelectItem key={s} value={s}>
                {t(`admin.ticketFilter.${s}` as MessageKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <Card className="gap-0 divide-y py-0">
        {!data?.length ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t("admin.noTickets")}</p>
        ) : (
          data.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)
        )}
      </Card>
    </Section>
  )
}

type Contacts = { telegram_url?: string; community_url?: string; phone?: string; hours?: string }

function SupportContactsForm() {
  const t = useT()
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ["support-contacts"], queryFn: () => rpc<Contacts>("support_contacts") })
  const [form, setForm] = useState<Contacts>({})
  useEffect(() => {
    if (data) setForm(data)
  }, [data])
  const save = useMutation({
    mutationFn: () => rpc("admin_set_support_contacts", { p_value: form }),
    onSuccess: () => {
      toast.success(t("admin.saved"))
      void queryClient.invalidateQueries({ queryKey: ["support-contacts"] })
    },
    onError: () => toast.error(t("admin.contactsInvalid")),
  })
  const field = (key: keyof Contacts) => ({
    value: form[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  })
  return (
    <Section title={t("admin.supportContacts")} icon={<LifeBuoyIcon />}>
      <Card className="px-4 py-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="sc-tg">{t("admin.supportTelegram")}</Label>
            <Input id="sc-tg" placeholder="https://t.me/luysmart_support" inputMode="url" {...field("telegram_url")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sc-community">{t("admin.supportCommunity")}</Label>
            <Input id="sc-community" placeholder="https://t.me/+xxxxxxxx" inputMode="url" {...field("community_url")} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="sc-phone">{t("admin.supportPhone")}</Label>
              <Input id="sc-phone" placeholder="+855 12 345 678" inputMode="tel" {...field("phone")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sc-hours">{t("admin.supportHours")}</Label>
              <Input id="sc-hours" placeholder="8:00–20:00" maxLength={80} {...field("hours")} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("admin.supportNotifyHint")}</p>
          <Button type="submit" className="w-full" disabled={save.isPending}>
            {t("common.save")}
          </Button>
        </form>
      </Card>
    </Section>
  )
}


/** Settings › About LuySmart and the Settings footer (empty fields use the defaults in src/lib/app-info.ts). */
function AboutInfoForm() {
  const t = useT()
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ["about-info-admin"],
    queryFn: async () => {
      const { data } = await getSupabaseBrowserClient()!.from("app_settings").select("value").eq("key", "about_info").maybeSingle()
      return (data?.value ?? {}) as Partial<AboutInfo>
    },
  })
  const [form, setForm] = useState<Partial<AboutInfo>>({})
  useEffect(() => {
    if (data) setForm(data)
  }, [data])
  const save = useMutation({
    mutationFn: () => rpc("admin_set_about_info", { p_value: form }),
    onSuccess: () => {
      toast.success(t("admin.saved"))
      void queryClient.invalidateQueries({ queryKey: ["about-info"] })
      void queryClient.invalidateQueries({ queryKey: ["about-info-admin"] })
    },
    onError: (error) => toast.error(/https|email/.test(String((error as Error).message)) ? t("admin.aboutInvalid") : t("common.error")),
  })
  const field = (key: keyof AboutInfo) => ({
    value: form[key] ?? "",
    placeholder: DEFAULT_ABOUT[key] || undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  })
  return (
    <Section title={t("about.title")} icon={<InfoIcon />}>
      <Card className="px-4 py-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ab-dev">{t("admin.aboutDeveloper")}</Label>
            <Input id="ab-dev" maxLength={80} {...field("developer")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ab-credits">{t("admin.aboutCredits")}</Label>
            <Textarea id="ab-credits" rows={3} maxLength={1000} {...field("credits")} placeholder={t("admin.aboutCreditsHint")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ab-mkm">{t("admin.aboutMissionKm")}</Label>
            <Textarea id="ab-mkm" rows={2} maxLength={500} {...field("mission_km")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ab-men">{t("admin.aboutMissionEn")}</Label>
            <Textarea id="ab-men" rows={2} maxLength={500} {...field("mission_en")} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="ab-web">{t("admin.aboutWebsite")}</Label>
              <Input id="ab-web" inputMode="url" maxLength={200} {...field("website")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ab-email">{t("admin.aboutEmail")}</Label>
              <Input id="ab-email" inputMode="email" maxLength={120} {...field("email")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ab-fb">Facebook</Label>
            <Input id="ab-fb" inputMode="url" maxLength={200} {...field("facebook")} placeholder="https://facebook.com/…" />
          </div>
          <Button type="submit" className="w-full" disabled={save.isPending}>
            {t("common.save")}
          </Button>
        </form>
      </Card>
    </Section>
  )
}

export default function AdminPage() {
  const t = useT()
  const { plan, loading } = usePlan()

  if (loading) return <Loader2Icon className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" />
  if (!plan.is_admin) {
    return (
      <Card className="items-center gap-2 px-6 py-10 text-center">
        <ShieldAlertIcon className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-semibold">{t("admin.forbidden")}</p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("admin.title")}</h1>
      <AnalyticsCard />
      <PendingPayments />
      <SupportTickets />
      <Subscribers />
      <ReferralStatsCard />
      <PaymentInstructionsForm />
      <SupportContactsForm />
      <AboutInfoForm />
    </div>
  )
}

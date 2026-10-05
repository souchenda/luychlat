"use client"

import { formatPhoneDisplay } from "@/lib/phone"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { ArrowLeftIcon, BookOpenIcon, ChevronRightIcon, Loader2Icon, MessageCircleReplyIcon, PhoneIcon, SendIcon, UsersIcon } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/lib/i18n/use-t"
import { usePlan } from "@/lib/plan"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { telHref, TICKET_CATEGORIES, useSupportContacts, type SupportTicket, type TicketCategory } from "@/lib/support"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"
import { useSessionStore } from "@/stores/session-store"

const STATUS_TONE: Record<SupportTicket["status"], string> = {
  OPEN: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  IN_PROGRESS: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  RESOLVED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  CLOSED: "bg-muted text-muted-foreground",
}

function TelegramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M21.9 4.3 18.6 20c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.2L6 13.5 1.1 12c-1.1-.3-1.1-1.1.2-1.6L20.5 3c.9-.3 1.7.2 1.4 1.3Z" />
    </svg>
  )
}

function Channels() {
  const t = useT()
  const { data: c, isLoading } = useSupportContacts()
  if (isLoading) return <Card className="h-32 animate-pulse" />
  const none = !c?.telegram_url && !c?.phone && !c?.community_url
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("support.channels")}</h2>
      {none ? (
        <Card className="px-4 py-4 text-sm text-muted-foreground">{t("support.noChannels")}</Card>
      ) : (
        <div className="space-y-2">
          {c?.telegram_url && (
            <a
              href={c.telegram_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl bg-[#229ED9] px-4 py-3.5 text-white shadow-sm transition-opacity hover:opacity-90"
            >
              <TelegramGlyph className="size-6 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{t("support.telegram")}</span>
                <span className="block truncate text-xs text-white/85">{c.telegram_url.replace("https://", "")}</span>
              </span>
              <ChevronRightIcon className="size-4" aria-hidden />
            </a>
          )}
          <div className="grid grid-cols-2 gap-2">
            {c?.phone && (
              <a href={telHref(c.phone)} className="flex flex-col gap-1 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/60">
                <PhoneIcon className="size-5 text-primary" aria-hidden />
                <span className="text-sm font-medium">{t("support.call")}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{formatPhoneDisplay(c.phone)}</span>
              </a>
            )}
            {c?.community_url && (
              <a
                href={c.community_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col gap-1 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/60"
              >
                <UsersIcon className="size-5 text-[#229ED9]" aria-hidden />
                <span className="text-sm font-medium">{t("support.community")}</span>
                <span className="text-xs text-muted-foreground">{t("support.communityHint")}</span>
              </a>
            )}
          </div>
          {c?.hours && <p className="px-1 text-xs text-muted-foreground">{t("support.hours", { hours: c.hours })}</p>}
        </div>
      )}
    </section>
  )
}

function TicketForm() {
  const t = useT()
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  const locale = useLocaleStore((s) => s.locale)
  const { plan } = usePlan()
  const signedIn = useSessionStore((s) => Boolean(s.user))
  const preset = params.get("category")?.toUpperCase() as TicketCategory | undefined
  const [category, setCategory] = useState<TicketCategory>(preset && TICKET_CATEGORIES.includes(preset) ? preset : "BUG")
  const [message, setMessage] = useState("")
  const [contact, setContact] = useState("")

  useEffect(() => {
    if (preset && TICKET_CATEGORIES.includes(preset)) setCategory(preset)
  }, [preset])

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabaseBrowserClient()!.rpc("submit_support_ticket", {
        p_category: category,
        p_message: message,
        p_contact: contact,
        // No personal data: just enough to reproduce the problem.
        p_context: { from: params.get("from") ?? pathname, locale, plan: plan.plan_code, ua: navigator.userAgent.slice(0, 160) },
      })
      if (error) throw error
    },
    onSuccess: () => {
      setMessage("")
      toast.success(t("support.sent"))
      void queryClient.invalidateQueries({ queryKey: ["my-tickets"] })
      router.replace("/support")
    },
    onError: (error) => toast.error(/too_many_tickets/.test(String((error as Error).message)) ? t("support.tooMany") : t("common.error")),
  })

  if (!signedIn) {
    return (
      <Card className="gap-2 px-4 py-4 text-sm text-muted-foreground">
        <p>{t("support.signInToSend")}</p>
      </Card>
    )
  }

  const valid = message.trim().length >= 5
  return (
    <Card className="px-4 py-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) submit.mutate()
        }}
      >
        <div role="radiogroup" aria-label={t("support.category")} className="grid grid-cols-2 gap-2">
          {TICKET_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                category === c ? "border-primary bg-primary/5 font-medium text-primary ring-1 ring-primary" : "hover:bg-muted",
              )}
            >
              {t(`support.category.${c}`)}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ticket-message">{t("support.message")}</Label>
          <Textarea
            id="ticket-message"
            rows={5}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t(`support.placeholder.${category}`)}
          />
          {category === "PAYMENT" && <p className="text-xs text-muted-foreground">{t("support.paymentTip")}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ticket-contact">{t("support.contact")}</Label>
          <Input id="ticket-contact" maxLength={80} value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t("support.contactPlaceholder")} />
        </div>
        <Button type="submit" className="h-12 w-full text-base" disabled={!valid || submit.isPending}>
          {submit.isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
          {t("support.send")}
        </Button>
      </form>
    </Card>
  )
}

function MyTickets() {
  const t = useT()
  const queryClient = useQueryClient()
  const userId = useSessionStore((s) => s.user?.id)
  const { data } = useQuery({
    queryKey: ["my-tickets", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()!.from("support_tickets").select("*").order("created_at", { ascending: false }).limit(20)
      if (error) throw error
      return data as SupportTicket[]
    },
  })
  const close = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabaseBrowserClient()!.rpc("close_my_ticket", { p_ticket_id: id })
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["my-tickets"] }),
  })
  if (!data?.length) return null
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("support.myTickets")}</h2>
      <Card className="gap-0 divide-y py-0">
        {data.map((ticket) => (
          <div key={ticket.id} className="space-y-2 px-4 py-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium">{t(`support.category.${ticket.category}`)}</span>
              <span className="text-muted-foreground tabular-nums">{format(new Date(ticket.created_at), "dd/MM HH:mm")}</span>
              <span className={cn("ml-auto rounded-full px-2 py-0.5 font-medium", STATUS_TONE[ticket.status])}>{t(`support.status.${ticket.status}`)}</span>
            </div>
            <p className="line-clamp-3 text-sm whitespace-pre-line">{ticket.message}</p>
            {ticket.admin_reply && (
              <div className="flex gap-2 rounded-lg bg-primary/5 p-3 text-sm">
                <MessageCircleReplyIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <p className="whitespace-pre-line">{ticket.admin_reply}</p>
              </div>
            )}
            {ticket.status !== "CLOSED" && ticket.status !== "RESOLVED" && (
              <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={() => close.mutate(ticket.id)}>
                {t("support.closeTicket")}
              </Button>
            )}
          </div>
        ))}
      </Card>
    </section>
  )
}

/** ជំនួយ និងទំនាក់ទំនង: channels, report form, my tickets. ?category=PAYMENT preselects. */
export default function SupportPage() {
  const t = useT()
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1">
        <Button asChild size="icon" variant="ghost" aria-label={t("common.back")}>
          <Link href="/settings">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{t("support.title")}</h1>
      </div>

      <Channels />

      <Link href="/guide" className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/60">
        <BookOpenIcon className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="flex-1 text-sm">{t("support.tryGuide")}</span>
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </Link>

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("support.report")}</h2>
        <Suspense>
          <TicketForm />
        </Suspense>
      </section>

      <MyTickets />
    </div>
  )
}

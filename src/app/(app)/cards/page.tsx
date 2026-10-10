"use client"

import { CarFrontIcon, ChevronRightIcon, CreditCardIcon, IdCardIcon, type LucideIcon, PlusIcon, QrCodeIcon, ShieldPlusIcon, SquareUserIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { CardLightbox, type CardSide } from "@/components/cards/card-lightbox"
import { IdCardSheet } from "@/components/cards/id-card-sheet"
import { UnverifiedMark } from "@/components/cards/verify-panel"
import { SettingsSubHeader } from "@/components/settings/settings-ui"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useNssfMembers } from "@/lib/bills"
import { CARD_KINDS, expiryState, KIND_SPECS, type CardKind } from "@/lib/id-card"
import { useCardPhotoUrl, useIdCardMutations, useIdCards, type IdCard } from "@/lib/id-cards"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"
import { usePrefsStore } from "@/stores/prefs-store"

const ICONS: Record<CardKind, LucideIcon> = {
  NATIONAL_ID: SquareUserIcon,
  DRIVER_LICENSE: IdCardIcon,
  VEHICLE_REG: CarFrontIcon,
  INSURANCE: ShieldPlusIcon,
  BANK_CARD: CreditCardIcon,
}

function Thumb({ path, label, onOpen }: { path: string; label: string; onOpen: () => void }) {
  const url = useCardPhotoUrl("id-cards", path).data
  return (
    <button type="button" onClick={onOpen} className="h-14 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted" aria-label={label}>
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
      {url ? <img src={url} alt={label} className="h-full w-full object-cover" /> : null}
    </button>
  )
}

/** /cards — the card & document vault: the physical photo is the ground truth, the fields its index. */
export default function CardsPage() {
  const t = useT()
  const hidden = usePrefsStore((s) => s.hideBalances)
  const { data: cards, isLoading } = useIdCards()
  const nssf = useNssfMembers().data ?? []
  const { save } = useIdCardMutations()
  const [editing, setEditing] = useState<{ kind: CardKind; card: IdCard | null } | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [viewing, setViewing] = useState<{ id: string; side: CardSide } | null>(null)
  const viewed = viewing ? cards?.find((c) => c.id === viewing.id) : undefined
  const today = new Date().toISOString().slice(0, 10)

  const nameOf = (c: IdCard) => c.holder_kh ?? c.holder_en ?? c.issuer ?? t(`cards.kind.${c.kind}` as MessageKey)
  const numberOf = (c: IdCard) => {
    const n = c.kind === "BANK_CARD" ? (c.details.last4 ? `•••• ${c.details.last4}` : null) : c.kind === "VEHICLE_REG" ? (c.details.plate ?? c.doc_number) : c.doc_number
    return n && hidden && c.kind !== "BANK_CARD" ? `•••• ${n.slice(-4)}` : n
  }

  return (
    <div className="space-y-4">
      <SettingsSubHeader title={t("cards.title")} back="/home" />
      <p className="px-1 text-sm text-muted-foreground">{t("cards.hint")}</p>

      <Button type="button" className="h-11 w-full" onClick={() => setChoosing(true)}>
        <PlusIcon />
        {t("cards.add")}
      </Button>
      {choosing && (
        <Card className="grid grid-cols-2 gap-2 p-3">
          {CARD_KINDS.map((kind) => {
            const Icon = ICONS[kind]
            return (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  setChoosing(false)
                  setEditing({ kind, card: null })
                }}
                className="flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-medium hover:bg-muted"
              >
                <Icon className="size-5 shrink-0 text-primary" aria-hidden />
                {t(`cards.kind.${kind}` as MessageKey)}
              </button>
            )
          })}
        </Card>
      )}

      {/* NSSF cards keep their own vault on /bills (they drive the NSSF bill). */}
      <Link href="/bills" className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
        <IdCardIcon className="size-5 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t("nssf.vaultTitle")}</span>
          <span className="block text-xs text-muted-foreground">{t("cards.nssfCount", { count: nssf.length })}</span>
        </span>
        <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
      </Link>

      {isLoading ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : !cards?.length ? (
        <Card className="items-center gap-2 px-6 py-8 text-center">
          <IdCardIcon className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">{t("cards.empty")}</p>
        </Card>
      ) : (
        <Card className="gap-0 divide-y py-0">
          {cards.map((c) => {
            const Icon = ICONS[c.kind]
            const expiry = expiryState(c.expires_on, today)
            const number = numberOf(c)
            return (
              <div key={c.id} className="space-y-2 px-4 py-3">
                <button type="button" onClick={() => setEditing({ kind: c.kind, card: c })} className="flex w-full items-center gap-3 text-left">
                  <Icon className="size-5 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{nameOf(c)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t(`cards.kind.${c.kind}` as MessageKey)}
                      {number ? ` · ${number}` : ""}
                    </span>
                    {expiry && (
                      <span className={cn("block text-xs font-medium", expiry === "expired" ? "text-rose-600 dark:text-rose-400" : "text-amber-600")}>
                        {t(expiry === "expired" ? "cards.expired" : "cards.expiresSoon", { date: (c.expires_on ?? "").split("-").reverse().join("/") })}
                      </span>
                    )}
                  </span>
                  {!c.verified_by_user && <UnverifiedMark />}
                </button>
                {KIND_SPECS[c.kind].storesPhotos && (c.front_path || c.back_path || c.qr_text) && (
                  <div className="flex items-center gap-2">
                    {c.front_path && <Thumb path={c.front_path} label={t("cards.front")} onOpen={() => setViewing({ id: c.id, side: "FRONT" })} />}
                    {c.back_path && <Thumb path={c.back_path} label={t("cards.back")} onOpen={() => setViewing({ id: c.id, side: "BACK" })} />}
                    <Button type="button" variant="outline" className="h-14 flex-1 flex-col gap-0.5 text-xs" onClick={() => setViewing({ id: c.id, side: "QR" })}>
                      <QrCodeIcon className="size-5" />
                      {t("nssf.showQr")}
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </Card>
      )}

      {editing && <IdCardSheet kind={editing.kind} card={editing.card} onClose={() => setEditing(null)} />}
      {viewing && viewed && (
        <CardLightbox
          card={{ id: viewed.id, title: nameOf(viewed), number: viewed.doc_number, bucket: "id-cards", front: viewed.front_path, back: viewed.back_path, qrText: viewed.qr_text }}
          side={viewing.side}
          onSide={(side) => setViewing({ id: viewed.id, side })}
          onClose={() => setViewing(null)}
          onQrFound={(qr) => void save.mutateAsync({ id: viewed.id, input: { qr_text: qr.slice(0, 2000) } })}
        />
      )}
    </div>
  )
}

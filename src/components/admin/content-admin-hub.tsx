"use client"

import { BellRingIcon, BookHeartIcon, MapPinIcon, Music2Icon, ShieldCheckIcon, type LucideIcon } from "lucide-react"
import Link from "next/link"

import { Card } from "@/components/ui/card"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"

/**
 * /admin for a content admin (founder, 19/10/2026): community content only — Islamic places, qasidah, du'a recordings,
 * Adhans. Nothing about revenue, payments, subscriptions, members, staff or settings is rendered here, and the database
 * refuses every admin_* function to this role anyway.
 */
const LINKS: { href: string; label: MessageKey; icon: LucideIcon }[] = [
  { href: "/islamic/places", label: "adminPortal.places", icon: MapPinIcon },
  { href: "/islamic/nasheed", label: "adminPortal.qasidah", icon: Music2Icon },
  { href: "/islamic/duas", label: "adminPortal.duas", icon: BookHeartIcon },
  { href: "/islamic/prayer", label: "contentHub.adhan", icon: BellRingIcon },
]

export function ContentAdminHub() {
  const t = useT()
  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <ShieldCheckIcon className="size-6 text-emerald-600" aria-hidden />
        {t("contentHub.title")}
      </h1>
      <p className="text-sm text-muted-foreground">{t("contentHub.hint")}</p>
      <div className="grid grid-cols-2 gap-3">
        {LINKS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}>
            <Card className="items-center gap-2 px-3 py-5 text-center transition-transform active:scale-[0.98]">
              <Icon className="size-6 text-emerald-700 dark:text-emerald-300" aria-hidden />
              <span className="text-sm font-medium">{t(label)}</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

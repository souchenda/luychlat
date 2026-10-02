"use client"

import { GlobeIcon, MailIcon, SendIcon, UsersIcon } from "lucide-react"

import { BrandMark } from "@/components/brand-mark"
import { BottomSheet } from "@/components/common/bottom-sheet"
import { APP_VERSION, copyrightYears, useAboutInfo } from "@/lib/app-info"
import { useT } from "@/lib/i18n/use-t"
import { useSupportContacts } from "@/lib/support"
import { useLocaleStore } from "@/stores/locale-store"

function FacebookGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M13.5 21v-7.5h2.53l.38-2.94H13.5V8.69c0-.85.24-1.43 1.46-1.43h1.56V4.63a20.9 20.9 0 0 0-2.27-.12c-2.25 0-3.79 1.37-3.79 3.9v2.15H7.92v2.94h2.54V21z" />
    </svg>
  )
}

/** Bottom of Settings: logo, version, "Powered by", copyright. */
export function SettingsFooter() {
  const t = useT()
  const about = useAboutInfo()
  return (
    <footer className="flex flex-col items-center gap-1.5 pt-2 pb-4 text-center text-xs text-muted-foreground">
      <BrandMark className="size-9 rounded-xl text-base" />
      <p className="font-medium text-foreground">
        {t("app.name")} · v{APP_VERSION}
      </p>
      <p>{t("about.poweredBy", { name: about.developer })}</p>
      <p>{t("about.copyright", { year: copyrightYears() })}</p>
    </footer>
  )
}

/** Settings › About LuyChlat: mission, credits and official links. */
export function AboutSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const about = useAboutInfo()
  const telegram = useSupportContacts().data?.telegram_url
  const credits = about.credits.split("\n").map((l) => l.trim()).filter(Boolean)
  const links = [
    about.website && { href: about.website, label: about.website.replace(/^https:\/\//, "").replace(/\/$/, ""), icon: <GlobeIcon className="size-4" aria-hidden /> },
    about.email && { href: `mailto:${about.email}`, label: about.email, icon: <MailIcon className="size-4" aria-hidden /> },
    telegram && { href: telegram, label: telegram.replace(/^https:\/\//, ""), icon: <SendIcon className="size-4" aria-hidden /> },
    about.facebook && { href: about.facebook, label: "Facebook", icon: <FacebookGlyph className="size-4" /> },
  ].filter(Boolean) as { href: string; label: string; icon: React.ReactNode }[]

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("about.title")}>
      <div className="space-y-5 pb-2">
        <div className="flex flex-col items-center gap-2 text-center">
          <BrandMark className="size-16 text-3xl" />
          <div>
            <p className="text-lg font-bold">{t("app.name")}</p>
            <p className="text-xs text-muted-foreground">
              {t("app.tagline")} · v{APP_VERSION}
            </p>
          </div>
        </div>

        <section className="space-y-1.5">
          <h3 className="text-sm font-semibold">{t("about.mission")}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{locale === "km" ? about.mission_km : about.mission_en}</p>
        </section>

        <section className="space-y-1.5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <UsersIcon className="size-4 text-primary" aria-hidden />
            {t("about.team")}
          </h3>
          {credits.length > 0 ? (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {credits.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{about.developer}</p>
          )}
        </section>

        {links.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold">{t("about.contact")}</h3>
            <ul className="divide-y overflow-hidden rounded-xl border">
              {links.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    target={l.href.startsWith("mailto:") ? undefined : "_blank"}
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/60"
                  >
                    <span className="text-primary">{l.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{l.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-center text-xs text-muted-foreground">
          {t("about.poweredBy", { name: about.developer })}
          <br />
          {t("about.copyright", { year: copyrightYears() })}
        </p>
      </div>
    </BottomSheet>
  )
}

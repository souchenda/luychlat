"use client"

import Link from "next/link"

import { BrandMark } from "@/components/brand-mark"
import { APP_VERSION, copyrightYears, useAboutInfo } from "@/lib/app-info"
import { useT } from "@/lib/i18n/use-t"
import { useSupportContacts } from "@/lib/support"

/** Login page footer: trust pill, app credits and quick links (Support only when a Telegram link is set in /admin). */
export function LoginFooter() {
  const t = useT()
  const about = useAboutInfo()
  const telegram = useSupportContacts().data?.telegram_url

  return (
    <footer className="mt-auto pt-8 pb-2">
      <div className="flex flex-col items-center gap-3 border-t border-border/60 pt-6 text-center">
        <p className="inline-flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground">
          <span>{t("login.trustSecure")}</span>
          <span aria-hidden>•</span>
          <span>{t("login.trustLocal")}</span>
        </p>

        <div className="space-y-0.5 text-[11px] text-muted-foreground">
          <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-foreground/80">
            <BrandMark className="size-5 rounded-md text-[11px] shadow-none" />
            លុយឆ្លាត · LuyChlat <span className="font-normal text-muted-foreground">v{APP_VERSION}</span>
          </div>
          <p>{t("about.poweredBy", { name: about.developer })}</p>
          <p>{t("about.copyright", { year: copyrightYears() })}</p>
        </div>

        <nav className="flex items-center gap-2 text-[11px]">
          {telegram && (
            <>
              <a href={telegram} target="_blank" rel="noopener noreferrer" className="text-muted-foreground underline-offset-4 hover:text-primary hover:underline">
                {t("login.support")}
              </a>
              <span aria-hidden className="text-muted-foreground/50">
                ·
              </span>
            </>
          )}
          <Link href="/legal" className="text-muted-foreground underline-offset-4 hover:text-primary hover:underline">
            {t("legal.link")}
          </Link>
        </nav>
      </div>
    </footer>
  )
}

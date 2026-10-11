"use client"

import Link from "next/link"

import { KeepTogether } from "@/components/keep-together"
import { APP_VERSION, copyrightYears } from "@/lib/app-info"
import { useT } from "@/lib/i18n/use-t"
import { useSupportContacts } from "@/lib/support"

/** Login page footer: the links, then the copyright and version (Support only when a Telegram link is set in /admin). */
export function LoginFooter() {
  const t = useT()
  const telegram = useSupportContacts().data?.telegram_url

  // Android draws under the navigation bar (viewport-fit=cover) and often reports no inset: keep some room.
  return (
    <footer className="pt-3 pb-[max(env(safe-area-inset-bottom),0.25rem)] text-center text-xs">
      {/* Line 1: the links. Line 2: the copyright with the version, kept together (never «v1.0.0» alone). */}
      <nav className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-zinc-500 dark:text-zinc-400">
        {telegram && (
          <>
            <a href={telegram} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:text-zinc-800 hover:underline dark:hover:text-zinc-200">
              {t("login.support")}
            </a>
            <span aria-hidden>·</span>
          </>
        )}
        <Link href="/legal" className="underline-offset-4 hover:text-zinc-800 hover:underline dark:hover:text-zinc-200">
          {t("legal.link")}
        </Link>
      </nav>
      <p className="mt-1 text-zinc-400 dark:text-zinc-500">
        <KeepTogether text={t("about.copyright", { year: copyrightYears() })} />
        <span className="whitespace-nowrap tabular-nums"> · v{APP_VERSION}</span>
      </p>
    </footer>
  )
}

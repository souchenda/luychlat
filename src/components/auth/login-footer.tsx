"use client"

import Link from "next/link"

import { APP_VERSION, copyrightYears } from "@/lib/app-info"
import { useT } from "@/lib/i18n/use-t"
import { useSupportContacts } from "@/lib/support"

/** Login page footer: one quiet security line with the version, and the links (Support only when a Telegram link is set in /admin). */
export function LoginFooter() {
  const t = useT()
  const telegram = useSupportContacts().data?.telegram_url

  // Android draws under the navigation bar (viewport-fit=cover) and often reports no inset: keep some room.
  return (
    <footer className="pt-10 pb-[max(env(safe-area-inset-bottom),0.5rem)] text-center text-xs text-neutral-400 dark:text-neutral-500">
      <p>
        🔒 {t("login.secureLine")} · v{APP_VERSION}
      </p>
      <nav className="mt-2 flex items-center justify-center gap-2">
        {telegram && (
          <>
            <a href={telegram} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:text-neutral-700 hover:underline dark:hover:text-neutral-300">
              {t("login.support")}
            </a>
            <span aria-hidden>·</span>
          </>
        )}
        <Link href="/legal" className="underline-offset-4 hover:text-neutral-700 hover:underline dark:hover:text-neutral-300">
          {t("legal.link")}
        </Link>
        <span aria-hidden>·</span>
        <span>{t("about.copyright", { year: copyrightYears() })}</span>
      </nav>
    </footer>
  )
}

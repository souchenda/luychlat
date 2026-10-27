"use client"

import { DownloadIcon, ExternalLinkIcon, SendIcon } from "lucide-react"

import { BrandMark } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useHydrated } from "@/hooks/use-hydrated"
import { contentLocale } from "@/lib/i18n/dictionaries"
import { ANDROID_APK_PATH, BOT_URL, DOWNLOAD_COPY, WEB_APP_URL } from "@/lib/download-links"
import { useLocaleStore } from "@/stores/locale-store"

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
      {steps.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ol>
  )
}

export function DownloadView({ qrSvg }: { qrSvg: string }) {
  const hydrated = useHydrated()
  const locale = useLocaleStore((s) => s.locale)
  const c = DOWNLOAD_COPY[contentLocale(hydrated ? locale : "km")]

  return (
    <main className="app-frame mx-auto min-h-dvh w-full max-w-md space-y-4 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-3">
        <BrandMark className="size-14" priority />
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{c.title}</h1>
          <p className="text-sm text-muted-foreground">{c.lead}</p>
        </div>
      </div>

      <Card className="gap-3 px-4 py-4">
        <h2 className="font-semibold">{c.android.title}</h2>
        <Button asChild className="h-12 w-full gap-2 rounded-xl text-base">
          <a href={ANDROID_APK_PATH} download>
            <DownloadIcon className="size-5" aria-hidden />
            {c.android.button}
          </a>
        </Button>
        <Steps steps={c.android.steps} />
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">{c.android.note}</p>
      </Card>

      <Card className="gap-3 px-4 py-4">
        <h2 className="font-semibold">{c.iphone.title}</h2>
        <Steps steps={c.iphone.steps} />
        <Button asChild variant="outline" className="h-12 w-full gap-2 rounded-xl">
          <a href={WEB_APP_URL}>
            <ExternalLinkIcon className="size-4" aria-hidden />
            {c.iphone.button}
          </a>
        </Button>
      </Card>

      <Card className="gap-3 px-4 py-4">
        <h2 className="font-semibold">{c.bot.title}</h2>
        <p className="text-sm text-muted-foreground">{c.bot.text}</p>
        <Button asChild variant="outline" className="h-12 w-full gap-2 rounded-xl">
          <a href={BOT_URL} target="_blank" rel="noopener noreferrer">
            <SendIcon className="size-4" aria-hidden />
            {c.bot.button}
          </a>
        </Button>
      </Card>

      <Card className="items-center gap-2 px-4 py-4">
        {/* The page's own address as a QR code (generated on the server): for posters and sharing phone to phone. */}
        <div className="size-44 rounded-xl bg-white p-2 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <p className="text-xs text-muted-foreground">{c.qr}</p>
        <p className="text-sm font-medium">app.luychlat.com/download</p>
      </Card>
    </main>
  )
}

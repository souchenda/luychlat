"use client"

import { ArrowLeftRightIcon, ChevronRightIcon, CloudOffIcon, PlusIcon, ShieldCheckIcon, WalletIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { PinSetupDialog } from "@/components/lock/pin-setup-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { NetWorthCard } from "@/components/wallets/net-worth-card"
import { TransferSheet } from "@/components/wallets/transfer-sheet"
import { WalletFormSheet } from "@/components/wallets/wallet-form-sheet"
import { WalletList } from "@/components/wallets/wallet-list"
import { useActiveWorkspace, useWallets } from "@/lib/data/hooks"
import { useT } from "@/lib/i18n/use-t"
import { useLockStore } from "@/stores/lock-store"
import { useSessionStore } from "@/stores/session-store"

const PREVIEW_COUNT = 4

export default function HomePage() {
  const t = useT()
  const router = useRouter()
  const { user, isGuest, endGuest } = useSessionStore()
  const hasPin = useLockStore((s) => Boolean(s.pinHash))
  const { workspace } = useActiveWorkspace()
  const walletsQuery = useWallets(workspace?.id)
  const [pinOpen, setPinOpen] = useState(false)
  const [walletFormOpen, setWalletFormOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)

  const active = walletsQuery.data?.filter((w) => !w.archived_at) ?? []
  const identity = user?.phone ? `+${user.phone}` : (user?.email ?? null)

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">{t("home.greeting")}</h1>
        {identity && <p className="text-sm text-muted-foreground">{identity}</p>}
      </header>

      <NetWorthCard wallets={walletsQuery.data} loading={walletsQuery.isLoading} />

      <div className="grid grid-cols-2 gap-2">
        <Button className="h-11" variant="secondary" onClick={() => setWalletFormOpen(true)}>
          <PlusIcon />
          {t("wallets.add")}
        </Button>
        <Button className="h-11" variant="secondary" onClick={() => setTransferOpen(true)} disabled={active.length < 2}>
          <ArrowLeftRightIcon />
          {t("transfer.title")}
        </Button>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-medium text-muted-foreground">{t("nav.wallets")}</h2>
          {active.length > 0 && (
            <Link href="/wallets" className="flex items-center text-sm text-primary">
              {t("wallets.seeAll")}
              <ChevronRightIcon className="size-4" />
            </Link>
          )}
        </div>
        {walletsQuery.isLoading ? (
          <Skeleton className="h-36 w-full rounded-xl" />
        ) : active.length === 0 ? (
          <button
            type="button"
            onClick={() => setWalletFormOpen(true)}
            className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center hover:bg-muted/50"
          >
            <WalletIcon className="size-8 text-muted-foreground" />
            <span className="font-medium">{t("wallets.empty")}</span>
            <span className="text-sm text-muted-foreground">{t("wallets.emptyHint")}</span>
          </button>
        ) : (
          <WalletList wallets={active.slice(0, PREVIEW_COUNT)} onSelect={() => router.push("/wallets")} />
        )}
      </section>

      {isGuest && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CloudOffIcon className="size-5 text-amber-600" />
              {t("home.guestBanner")}
            </CardTitle>
            <CardDescription>{t("home.guestBannerHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              size="sm"
              onClick={() => {
                endGuest()
                router.replace("/login")
              }}
            >
              {t("home.createAccount")}
            </Button>
          </CardContent>
        </Card>
      )}

      {!hasPin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheckIcon className="size-5 text-primary" />
              {t("home.secureTitle")}
            </CardTitle>
            <CardDescription>{t("home.secureHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" onClick={() => setPinOpen(true)}>
              {t("home.setPin")}
            </Button>
          </CardContent>
        </Card>
      )}

      <PinSetupDialog open={pinOpen} onOpenChange={setPinOpen} />
      <WalletFormSheet open={walletFormOpen} onOpenChange={setWalletFormOpen} workspaceId={workspace?.id} />
      <TransferSheet open={transferOpen} onOpenChange={setTransferOpen} workspaceId={workspace?.id} wallets={active} />
    </div>
  )
}

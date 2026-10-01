"use client"

import { Loader2Icon, LogInIcon, UsersIcon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { BrandMark } from "@/components/brand-mark"
import { readPendingInvite, savePendingInvite } from "@/components/family/pending-invite"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useHydrated } from "@/hooks/use-hydrated"
import { useFamilyMutations } from "@/lib/data/hooks"
import { formatCode, normalizeCode } from "@/lib/family/invite-code"
import type { InviteLookup } from "@/lib/data/types"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { usePrefsStore } from "@/stores/prefs-store"
import { useSessionStore } from "@/stores/session-store"

function JoinFlow() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const { user, isGuest, authReady, endGuest } = useSessionStore()
  const setActive = usePrefsStore((s) => s.setActiveWorkspace)
  const { lookupInvite } = useFamilyMutations()
  const [code, setCode] = useState(() => normalizeCode(params.get("code") ?? ""))
  const [preview, setPreview] = useState<InviteLookup | null>(null)
  const checked = useRef<string | null>(null)

  // Remember the code so it survives the sign-in round trip.
  useEffect(() => {
    if (code.length === 6) savePendingInvite(code)
  }, [code])

  const check = async (value: string) => {
    checked.current = value
    setPreview(await lookupInvite.mutateAsync({ code: value, accept: false }))
  }

  useEffect(() => {
    if (user && code.length === 6 && checked.current !== code) void check(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per complete code
  }, [user, code])

  const leave = (path: string) => {
    savePendingInvite(null)
    router.replace(path)
  }

  const open = (workspaceId: string) => {
    setActive("FAMILY", workspaceId)
    leave("/home")
  }

  const accept = async () => {
    const result = await lookupInvite.mutateAsync({ code, accept: true })
    setPreview(result)
    if (result.status === "ok" || result.status === "already_member") {
      toast.success(t("join.joined", { name: result.workspace_name }))
      open(result.workspace_id)
    }
  }

  const signIn = () => {
    if (code.length === 6) savePendingInvite(code)
    if (isGuest) endGuest()
    router.push("/login")
  }

  if (!authReady && !isGuest) {
    return <Loader2Icon className="mx-auto size-6 animate-spin text-muted-foreground" />
  }

  const status = preview?.status
  const errorKey: MessageKey | null =
    status === "invalid" || status === "expired" || status === "used" || status === "rate_limited" ? `join.${status}` : null

  return (
    <Card className="gap-4 px-5 py-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <UsersIcon className="size-7" aria-hidden />
        </span>
        <h1 className="text-xl font-bold">{t("join.title")}</h1>
        {preview?.status === "ok" ? (
          <p className="text-sm text-muted-foreground">
            {t("join.invitedBy", { name: preview.inviter_name || t("family.someone"), workspace: preview.workspace_name })}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t("join.subtitle")}</p>
        )}
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.length === 6 && user) void check(code)
        }}
      >
        <Input
          value={formatCode(code)}
          onChange={(e) => {
            setCode(normalizeCode(e.target.value))
            setPreview(null)
          }}
          placeholder="ABC-123"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label={t("join.code")}
          className="h-14 text-center font-mono text-2xl tracking-[0.3em] uppercase"
        />
        {errorKey && <p className="text-center text-sm text-destructive">{t(errorKey)}</p>}

        {!user ? (
          <>
            <p className="text-center text-sm text-muted-foreground">{t(isGuest ? "join.guestNeedsAccount" : "join.signInFirst")}</p>
            <Button type="button" className="h-12 w-full text-base" onClick={signIn}>
              <LogInIcon />
              {t("join.signIn")}
            </Button>
          </>
        ) : preview?.status === "ok" ? (
          <>
            <p className="rounded-xl bg-muted px-3 py-2 text-center text-sm">
              {t("join.role", { role: t(`family.role.${preview.role}`) })}
            </p>
            <Button type="button" className="h-12 w-full text-base" onClick={accept} disabled={lookupInvite.isPending}>
              {lookupInvite.isPending && <Loader2Icon className="animate-spin" />}
              {t("join.accept")}
            </Button>
          </>
        ) : preview?.status === "already_member" ? (
          <Button type="button" className="h-12 w-full text-base" onClick={() => open(preview.workspace_id)}>
            {t("join.open", { name: preview.workspace_name })}
          </Button>
        ) : (
          <Button type="submit" className="h-12 w-full text-base" disabled={code.length !== 6 || lookupInvite.isPending}>
            {lookupInvite.isPending && <Loader2Icon className="animate-spin" />}
            {t("join.check")}
          </Button>
        )}
        <Button type="button" variant="ghost" className="w-full" onClick={() => leave(user || isGuest ? "/home" : "/login")}>
          {t("join.notNow")}
        </Button>
      </form>
    </Card>
  )
}

/** Target of invitation links: /join?code=ABC123 */
export default function JoinPage() {
  const hydrated = useHydrated()
  // A code typed or opened earlier (before signing in) is resumed here too.
  const [fallback] = useState(() => (typeof window === "undefined" ? null : readPendingInvite()))
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-8">
      <BrandMark className="mx-auto size-12 text-2xl" />
      {hydrated ? (
        <Suspense>
          <JoinFlowWithFallback fallback={fallback} />
        </Suspense>
      ) : (
        <Loader2Icon className="mx-auto size-6 animate-spin text-muted-foreground" />
      )}
    </main>
  )
}

function JoinFlowWithFallback({ fallback }: { fallback: string | null }) {
  const params = useSearchParams()
  const router = useRouter()
  useEffect(() => {
    if (!params.get("code") && fallback) router.replace(`/join?code=${encodeURIComponent(fallback)}`)
  }, [params, fallback, router])
  return <JoinFlow key={params.get("code") ?? ""} />
}

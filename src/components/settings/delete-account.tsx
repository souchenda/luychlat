"use client"

import { EyeIcon, EyeOffIcon, Loader2Icon, Trash2Icon, TriangleAlertIcon } from "lucide-react"
import { useState } from "react"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { stepUp } from "@/components/security/step-up"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { loginLabel } from "@/lib/auth-identifier"
import { deleteMyAccount } from "@/lib/auth/delete-account"
import { signOutEverywhere } from "@/lib/auth/sign-out"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useSessionStore } from "@/stores/session-store"

const REASONS: Record<string, MessageKey> = {
  staff_account: "deleteAccount.staff",
  shared_workspaces: "deleteAccount.shared",
  reauth_required: "deleteAccount.reauth",
}

/**
 * Settings › Danger zone › Delete account: a warning, "I understand", the
 * password (checked again with Supabase, which the database requires within
 * 5 minutes), 2FA when it's on — then everything goes.
 */
export function DeleteAccountSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT()
  const user = useSessionStore((s) => s.user)
  const [understood, setUnderstood] = useState(false)
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const run = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(undefined)
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !user?.email) return setError(t("deleteAccount.noPassword"))
    if (!understood) return setError(t("deleteAccount.tickFirst"))
    setBusy(true)
    try {
      // Proves it's really them, and gives the session the fresh password time the database checks.
      const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password })
      if (authError) {
        setBusy(false)
        return setError(t("deleteAccount.wrongPassword"))
      }
      try {
        await deleteMyAccount(supabase, user.id)
      } catch (err) {
        const reason = (err as Error).message
        // Accounts with 2FA confirm with their code too, then try once more.
        if (/mfa_required/.test(reason) && (await stepUp(t("deleteAccount.title")))) await deleteMyAccount(supabase, user.id)
        else throw err
      }
      await signOutEverywhere("local").catch(() => {})
      window.location.replace("/login?deleted=1")
    } catch (err) {
      const reason = Object.keys(REASONS).find((k) => (err as Error).message.includes(k))
      setError(t(reason ? REASONS[reason] : "common.error"))
      setBusy(false)
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={(v) => !busy && onOpenChange(v)} title={t("deleteAccount.title")}>
      <form onSubmit={run} className="space-y-4">
        <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-500/10 dark:text-red-200">
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlertIcon className="size-4 shrink-0" aria-hidden />
            {t("deleteAccount.warningTitle")}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed">
            <li>{t("deleteAccount.item.money")}</li>
            <li>{t("deleteAccount.item.workspaces")}</li>
            <li>{t("deleteAccount.item.files")}</li>
            <li>{t("deleteAccount.item.plan")}</li>
          </ul>
          <p className="text-[13px] font-medium">{t("deleteAccount.noUndo")}</p>
        </div>
        <p className="text-xs text-muted-foreground">{t("deleteAccount.exportHint")}</p>

        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-red-600" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
          <span>{t("deleteAccount.understand")}</span>
        </label>

        <div className="space-y-1.5">
          <Label htmlFor="delete-password">{t("deleteAccount.password", { account: loginLabel(user?.email) })}</Label>
          <div className="relative">
            <Input
              id="delete-password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              className="h-11 pr-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground"
              aria-label={show ? t("login.hidePassword") : t("login.showPassword")}
            >
              {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <Button type="submit" variant="destructive" className="h-12 w-full text-base" disabled={busy || !understood || !password}>
          {busy ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
          {t("deleteAccount.confirm")}
        </Button>
      </form>
    </BottomSheet>
  )
}

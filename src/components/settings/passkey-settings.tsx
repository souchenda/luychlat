"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { KeySquareIcon, Loader2Icon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { BiometricIcon } from "@/components/lock/biometric-icon"
import { stepUp } from "@/components/security/step-up"
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui"
import { Button } from "@/components/ui/button"
import { passkeySupported, registerPasskey } from "@/lib/auth/passkey"
import { dayDate } from "@/lib/dates"
import { useT } from "@/lib/i18n/use-t"
import { deviceLabel } from "@/lib/passkey-rp"
import { detectBiometricKind } from "@/lib/security/biometric"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useLocaleStore } from "@/stores/locale-store"
import { useSessionStore } from "@/stores/session-store"

type Passkey = { id: string; device_label: string | null; created_at: string; last_used_at: string | null }

/**
 * Settings › Security: «ចូលដោយ Face ID / ស្នាមម្រាមដៃ» — this device's passkey (W3C WebAuthn), so the
 * next sign-in needs no password. Where the device has no Face ID / fingerprint, it says so and the
 * password stays the way in.
 */
export function PasskeySettings() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const userId = useSessionStore((s) => s.user?.id ?? null)
  const queryClient = useQueryClient()
  const supported = useQuery({ queryKey: ["auth-passkey"], staleTime: 10 * 60_000, queryFn: passkeySupported }).data === true
  const list = useQuery({
    queryKey: ["passkeys", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()!.from("passkeys").select("id, device_label, created_at, last_used_at").order("created_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as Passkey[]
    },
  })
  const add = useMutation({
    mutationFn: () => registerPasskey(deviceLabel(navigator.userAgent)),
    onSuccess: (r) => {
      if (r === "ok") toast.success(t("passkey.added"))
      else if (r === "duplicate") toast.info(t("passkey.duplicate"))
      else if (r === "failed") toast.error(t("passkey.failed"))
      void queryClient.invalidateQueries({ queryKey: ["passkeys", userId] })
    },
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabaseBrowserClient()!.from("passkeys").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t("passkey.removed"))
      void queryClient.invalidateQueries({ queryKey: ["passkeys", userId] })
    },
    onError: () => toast.error(t("common.error")),
  })
  if (!userId) return null
  const keys = list.data ?? []

  return (
    <SettingsGroup title={t("passkey.group")}>
      <SettingsRow icon={<BiometricIcon kind={detectBiometricKind()} className="size-5" />} tile="emerald" title={t("passkey.title")} hint={supported ? t("passkey.hint") : t("passkey.unsupported")}>
        <Button size="sm" variant="outline" onClick={() => add.mutate()} disabled={!supported || add.isPending}>
          {add.isPending && <Loader2Icon className="animate-spin" />}
          {t("passkey.add")}
        </Button>
      </SettingsRow>
      {keys.map((k) => (
        <SettingsRow
          key={k.id}
          icon={<KeySquareIcon />}
          tile="slate"
          title={k.device_label ?? t("passkey.device")}
          hint={t("passkey.addedOn", { date: dayDate(new Date(k.created_at), locale) })}
        >
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("passkey.remove")}
            disabled={remove.isPending}
            onClick={async () => {
              // Removing a way in needs the PIN / Face ID first (as turning the App Lock off).
              if (!(await stepUp(t("passkey.removeConfirm")))) return
              remove.mutate(k.id)
            }}
          >
            <Trash2Icon className="text-destructive" />
          </Button>
        </SettingsRow>
      ))}
    </SettingsGroup>
  )
}

"use client"

import { BellRingIcon, XIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { SettingsRow } from "@/components/settings/settings-ui"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useT } from "@/lib/i18n/use-t"
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push"

function usePushState() {
  const [state, setState] = useState<PushState | null>(null)
  useEffect(() => {
    let alive = true
    void pushState().then((s) => alive && setState(s))
    return () => {
      alive = false
    }
  }, [])
  return [state, setState] as const
}

async function turnOn(t: ReturnType<typeof useT>): Promise<PushState> {
  try {
    const s = await enablePush()
    if (s === "on") toast.success(t("push.enabled"))
    else if (s === "denied") toast.error(t("push.denied"))
    return s
  } catch {
    toast.error(t("common.error"))
    return "off"
  }
}

/** Settings › 07:00 morning notification on this phone. */
export function PushSettingsRow() {
  const t = useT()
  const [state, setState] = usePushState()
  const [busy, setBusy] = useState(false)
  if (!state || state === "not_configured" || state === "unsupported") return null
  const hint = state === "ios_install" ? t("push.iosInstall") : state === "denied" ? t("push.deniedHint") : t("push.hint")
  return (
    <SettingsRow icon={<BellRingIcon />} tile="amber" title={t("push.title")} hint={hint}>
      <Switch
        checked={state === "on"}
        disabled={busy || state === "ios_install" || state === "denied"}
        aria-label={t("push.title")}
        onCheckedChange={async (on) => {
          setBusy(true)
          setState(on ? await turnOn(t) : await disablePush())
          setBusy(false)
        }}
      />
    </SettingsRow>
  )
}

const DISMISSED = "luychlat.push-prompt-dismissed"

/** Home: a one-time, dismissible invitation for phones that haven't turned notifications on. */
export function PushInviteCard() {
  const t = useT()
  const [state, setState] = usePushState()
  const [hidden, setHidden] = useState(true)
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(DISMISSED) === "1")
    } catch {
      setHidden(false)
    }
  }, [])
  if (hidden || state !== "off") return null
  const dismiss = () => {
    setHidden(true)
    try {
      localStorage.setItem(DISMISSED, "1")
    } catch {}
  }
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-3">
      <span className="text-xl leading-none" aria-hidden>
        ☀️
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium">{t("push.inviteTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("push.inviteBody")}</p>
        <Button
          size="sm"
          onClick={async () => {
            const s = await turnOn(t)
            setState(s)
            if (s === "on" || s === "denied") dismiss()
          }}
        >
          {t("push.inviteButton")}
        </Button>
      </div>
      <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label={t("common.close")} onClick={dismiss}>
        <XIcon className="size-4" />
      </button>
    </div>
  )
}

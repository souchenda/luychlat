"use client"

import { CircleHelpIcon, EyeIcon, EyeOffIcon, Loader2Icon, SearchIcon, SendIcon, Trash2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useSaveTelegramSettings, useTelegramSettings } from "@/lib/data/hooks"
import { useT } from "@/lib/i18n/use-t"
import { BOT_TOKEN_PATTERN, CHAT_ID_PATTERN, findTelegramChats, sendTelegram } from "@/lib/telegram"
import { useLocaleStore } from "@/stores/locale-store"
import { useSessionStore } from "@/stores/session-store"

function HelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT()
  const steps = ["telegram.help1", "telegram.help2", "telegram.help3", "telegram.help4"] as const
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("telegram.helpTitle")}</DialogTitle>
          <DialogDescription>{t("telegram.helpIntro")}</DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {steps.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ol>
        <Button asChild variant="outline">
          <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">
            <SendIcon />
            @BotFather
          </a>
        </Button>
      </DialogContent>
    </Dialog>
  )
}

/** "ការរំលឹកតាម Telegram": bot token + chat ID, test message, on/off and message language. */
export function TelegramSettingsCard() {
  const t = useT()
  const uiLocale = useLocaleStore((s) => s.locale)
  const isCloud = useSessionStore((s) => Boolean(s.user))
  const settingsQuery = useTelegramSettings()
  const save = useSaveTelegramSettings()

  const [token, setToken] = useState("")
  const [chatId, setChatId] = useState("")
  const [enabled, setEnabled] = useState(true)
  const [language, setLanguage] = useState<"km" | "en">(uiLocale)
  const [showToken, setShowToken] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [busy, setBusy] = useState<"test" | "find" | null>(null)
  const [chats, setChats] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    const s = settingsQuery.data
    if (!s) return
    setToken(s.bot_token)
    setChatId(s.chat_id)
    setEnabled(s.enabled)
    setLanguage(s.language)
  }, [settingsQuery.data])

  const tokenValid = BOT_TOKEN_PATTERN.test(token.trim())
  const chatValid = CHAT_ID_PATTERN.test(chatId.trim())
  const configured = Boolean(settingsQuery.data)

  const persist = async () => {
    if (!tokenValid || !chatValid) return toast.error(t("telegram.invalid"))
    await save.mutateAsync({ bot_token: token.trim(), chat_id: chatId.trim(), enabled, language })
    toast.success(t("telegram.saved"))
  }

  const test = async () => {
    if (!tokenValid || !chatValid) return toast.error(t("telegram.invalid"))
    setBusy("test")
    const res = await sendTelegram({ bot_token: token.trim(), chat_id: chatId.trim() }, t("telegram.testMessage"))
    setBusy(null)
    if (res.ok) toast.success(t("telegram.testSent"))
    else toast.error(t("telegram.testFailed", { error: res.error ?? "" }))
  }

  const findChats = async () => {
    if (!tokenValid) return toast.error(t("telegram.invalid"))
    setBusy("find")
    const res = await findTelegramChats(token.trim())
    setBusy(null)
    if (!res.ok) return toast.error(t("telegram.testFailed", { error: res.error ?? "" }))
    setChats(res.chats ?? [])
    if (!res.chats?.length) toast.info(t("telegram.noChats"))
    else if (res.chats.length === 1) setChatId(res.chats[0].id)
  }

  const remove = async () => {
    await save.mutateAsync(null)
    setToken("")
    setChatId("")
    setChats([])
    toast.success(t("telegram.removed"))
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-medium text-muted-foreground">{t("telegram.title")}</h2>
        <Button size="sm" variant="ghost" onClick={() => setHelpOpen(true)}>
          <CircleHelpIcon />
          {t("telegram.howTo")}
        </Button>
      </div>
      <Card className="gap-4 px-4 py-4">
        <p className="text-xs text-muted-foreground">{isCloud ? t("telegram.scheduleCloud") : t("telegram.scheduleGuest")}</p>

        <div className="space-y-2">
          <Label htmlFor="tg-token">Bot Token</Label>
          <div className="flex gap-2">
            <Input
              id="tg-token"
              type={showToken ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder="123456789:AA..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              aria-invalid={Boolean(token) && !tokenValid}
              className="font-mono text-xs"
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => setShowToken((v) => !v)}
              aria-label={showToken ? t("telegram.hideToken") : t("telegram.showToken")}
            >
              {showToken ? <EyeOffIcon /> : <EyeIcon />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tg-chat">Chat ID</Label>
          <div className="flex gap-2">
            <Input
              id="tg-chat"
              inputMode="numeric"
              autoComplete="off"
              placeholder="123456789"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              aria-invalid={Boolean(chatId) && !chatValid}
              className="font-mono text-xs"
            />
            <Button type="button" variant="outline" onClick={findChats} disabled={!tokenValid || busy !== null}>
              {busy === "find" ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}
              {t("telegram.find")}
            </Button>
          </div>
          {chats.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {chats.map((c) => (
                <Button key={c.id} type="button" size="sm" variant={chatId === c.id ? "default" : "secondary"} onClick={() => setChatId(c.id)}>
                  {c.name} · {c.id}
                </Button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Label>{t("telegram.language")}</Label>
          </div>
          <div className="w-40">
            <Segmented
              aria-label={t("telegram.language")}
              value={language}
              onChange={setLanguage}
              options={[
                { value: "km", label: "ខ្មែរ" },
                { value: "en", label: "English" },
              ]}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="tg-enabled">{t("telegram.enabled")}</Label>
          <Switch id="tg-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={test} disabled={busy !== null || !tokenValid || !chatValid}>
            {busy === "test" ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
            {t("telegram.test")}
          </Button>
          <Button type="button" onClick={persist} disabled={save.isPending || !tokenValid || !chatValid}>
            {save.isPending && <Loader2Icon className="animate-spin" />}
            {t("common.save")}
          </Button>
        </div>
        {configured && (
          <Button type="button" variant="ghost" className="text-destructive" onClick={remove}>
            <Trash2Icon />
            {t("telegram.remove")}
          </Button>
        )}
      </Card>
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </section>
  )
}

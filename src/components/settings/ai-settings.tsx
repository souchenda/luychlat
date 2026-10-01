"use client"

import { EyeIcon, EyeOffIcon, ShieldCheckIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/lib/i18n/use-t"
import { DEFAULT_OPENAI_MODEL, useAiStore, type AiProvider } from "@/stores/ai-store"

/** Choose the offline advisor or a live model with the user's own API key (kept on this device). */
export function AiSettingsCard() {
  const t = useT()
  const { provider, anthropicKey, openaiKey, openaiModel, setProvider, setKey, setOpenaiModel, clearKeys } = useAiStore()
  const [show, setShow] = useState(false)
  const keyed = provider === "anthropic" || provider === "openai"
  const key = provider === "anthropic" ? anthropicKey : openaiKey

  return (
    <section id="ai" className="scroll-mt-20 space-y-2">
      <h2 className="flex items-center gap-1.5 px-1 text-sm font-medium text-muted-foreground">
        <SparklesIcon className="size-4" aria-hidden />
        {t("aiSettings.title")}
      </h2>
      <Card className="gap-4 px-4 py-4">
        <Segmented<AiProvider>
          aria-label={t("aiSettings.title")}
          value={provider}
          onChange={setProvider}
          options={[
            { value: "simulated", label: t("aiSettings.offline") },
            { value: "anthropic", label: "Claude" },
            { value: "openai", label: "OpenAI" },
          ]}
        />

        {keyed ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="ai-key">{provider === "anthropic" ? "Anthropic API Key" : "OpenAI API Key"}</Label>
              <div className="flex gap-2">
                <Input
                  id="ai-key"
                  type={show ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
                  value={key}
                  onChange={(e) => setKey(provider, e.target.value.trim())}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? t("telegram.hideToken") : t("telegram.showToken")}
                >
                  {show ? <EyeOffIcon /> : <EyeIcon />}
                </Button>
              </div>
              {provider === "anthropic" && <p className="text-xs text-muted-foreground">{t("aiSettings.claudeModel")}</p>}
            </div>
            {provider === "openai" && (
              <div className="space-y-2">
                <Label htmlFor="ai-model">{t("aiSettings.model")}</Label>
                <Input
                  id="ai-model"
                  value={openaiModel}
                  onChange={(e) => setOpenaiModel(e.target.value.trim() || DEFAULT_OPENAI_MODEL)}
                  className="font-mono text-xs"
                />
              </div>
            )}
            {!key && <p className="text-xs text-amber-700 dark:text-amber-400">{t("aiSettings.noKey")}</p>}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{t("aiSettings.offlineHint")}</p>
        )}

        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
          {t("aiSettings.privacy")}
        </p>

        {(anthropicKey || openaiKey) && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              clearKeys()
              toast.success(t("aiSettings.cleared"))
            }}
          >
            <Trash2Icon />
            {t("aiSettings.clear")}
          </Button>
        )}
      </Card>
    </section>
  )
}

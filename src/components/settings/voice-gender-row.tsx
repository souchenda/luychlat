"use client"

import { MicIcon, Volume2Icon } from "lucide-react"
import { useEffect, useState } from "react"

import { Segmented } from "@/components/common/segmented"
import { previewVoice } from "@/components/payments/payment-chime-listener"
import { SettingsRow } from "@/components/settings/settings-ui"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/use-t"
import { DEFAULT_VOICE_GENDER, MALE_VOICE_READY, readVoiceGender, VOICE_GENDERS, writeVoiceGender, type VoiceGender } from "@/lib/soundbox"

/**
 * «សំឡេងអ្នកនិយាយ» (founder, 26/10/2026 — Task #509): 👩 សំឡេងស្រី (the default) or 👨 សំឡេងប្រុស, on this phone only, with
 * «សាកល្បង» under each — «ទទួលបានប្រាក់ មួយម៉ឺនរៀល» in that voice. Until the male clips exist (MALE_VOICE_READY) its
 * preview is off and the row says the female voice speaks meanwhile — the choice is kept and takes effect by itself.
 */
export function VoiceGenderPicker() {
  const t = useT()
  const [gender, setGender] = useState<VoiceGender>(DEFAULT_VOICE_GENDER)
  useEffect(() => setGender(readVoiceGender(localStorage)), [])
  const label = (g: VoiceGender) => t(g === "male" ? "settings.voiceMale" : "settings.voiceFemale")
  return (
    <>
      <SettingsRow icon={<MicIcon />} tile="emerald" title={t("settings.voiceGender")} hint={gender === "male" && !MALE_VOICE_READY ? t("settings.voiceMalePending") : undefined} />
      <div className="space-y-2 px-4 pb-3">
        <Segmented
          aria-label={t("settings.voiceGender")}
          value={gender}
          onChange={(v) => {
            const next = VOICE_GENDERS.find((g) => g === v) ?? DEFAULT_VOICE_GENDER
            setGender(next)
            writeVoiceGender(localStorage, next)
          }}
          options={VOICE_GENDERS.map((g) => ({ value: g, label: label(g) }))}
        />
        <div className="grid grid-cols-2 gap-2">
          {VOICE_GENDERS.map((g) => (
            <Button
              key={g}
              type="button"
              size="sm"
              variant="outline"
              className="h-11 gap-1.5 rounded-xl"
              disabled={g === "male" && !MALE_VOICE_READY}
              aria-label={t("settings.voicePreviewOf", { voice: label(g) })}
              onClick={() => previewVoice(g)}
            >
              <Volume2Icon className="size-4" aria-hidden />
              {t("settings.voicePreview")}
            </Button>
          ))}
        </div>
      </div>
    </>
  )
}

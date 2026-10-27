"use client"

import { useEffect, useState } from "react"

import { useT } from "@/lib/i18n/use-t"
import { phoneQuiet } from "@/lib/native-keepalive"
import { readVoiceGender } from "@/lib/soundbox"
import { cambodiaHour } from "@/lib/islamic-expressions"
import { cambodiaDay, firstOfLaunch, GREETING_CLIPS_READY, greetingClipUrl, readWelcomeVoice, shouldSpeakWelcome, welcomeDuaText, welcomeGreeting, type WelcomeGreeting } from "@/lib/welcome-greeting"
import { useLocaleStore } from "@/stores/locale-store"

const SHOWN_MS = 5_200
/** The browser lets a page sound only after a first touch: the greeting waits for one this long, never later. */
export const FIRST_TOUCH_MS = 15_000

/**
 * The spoken greeting (Task #522): played at once when the browser allows it (an APK, a page already touched); refused
 * (autoplay — NotAllowedError) → played at the first touch or key within FIRST_TOUCH_MS, once. Returns the clean-up.
 */
function speakOnLaunch(url: string): () => void {
  const audio = new Audio(url)
  let done = false
  let wait = 0
  const off = () => {
    window.removeEventListener("pointerdown", retry)
    window.removeEventListener("keydown", retry)
    window.clearTimeout(wait)
  }
  function retry() {
    if (done) return
    done = true
    off()
    void audio.play().catch(() => null)
  }
  audio.play().then(
    () => {
      done = true
    },
    (error: unknown) => {
      if (done || (error as { name?: string } | null)?.name !== "NotAllowedError") return
      window.addEventListener("pointerdown", retry, { once: true })
      window.addEventListener("keydown", retry, { once: true })
      wait = window.setTimeout(() => {
        done = true
        off()
      }, FIRST_TOUCH_MS)
    },
  )
  return () => {
    done = true
    off()
  }
}

/**
 * The welcome greeting as the app opens (founder, 26/10/2026 — Task #518): a pill that fades in over the top of Home —
 * «ជម្រាបសួរ ចិន្ដា! 🙏 · អរុណសួស្តី», or in Islamic Mode «អាស្សាឡាមុអាឡៃកុម ចិន្ដា 🤲» with the day's du'a — once per
 * launch, gone by itself (or at a tap). Outside the hero card: an overlay, never part of the dashboard's layout
 * (CLAUDE.md › dashboard layout). Spoken only when this device asked for it and the phone is not on Silent / Vibrate.
 */
export function WelcomeGreetingPill({ islamic, name }: { islamic: boolean; name: string | null | undefined }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const [greeting, setGreeting] = useState<WelcomeGreeting | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let session: Storage | null = null
    try {
      session = window.sessionStorage
    } catch {}
    if (!firstOfLaunch(session)) return
    const g = welcomeGreeting({ islamic, name, hour: cambodiaHour(), day: cambodiaDay() })
    setGreeting(g)
    const show = window.setTimeout(() => setVisible(true), 60)
    const hide = window.setTimeout(() => setVisible(false), SHOWN_MS)
    let local: Storage | null = null
    try {
      local = window.localStorage
    } catch {}
    // The spoken greeting: asked for on this device, recorded, and the phone not quiet — else silent, never an error.
    let stopSpeaking = () => {}
    let gone = false
    if (readWelcomeVoice(local) && GREETING_CLIPS_READY) {
      void phoneQuiet().then((quiet) => {
        if (gone || !shouldSpeakWelcome({ enabled: true, ready: GREETING_CLIPS_READY, quiet })) return
        stopSpeaking = speakOnLaunch(greetingClipUrl(g.kind, readVoiceGender(local)))
      })
    }
    return () => {
      gone = true
      stopSpeaking()
      window.clearTimeout(show)
      window.clearTimeout(hide)
    }
    // Once per mount: the greeting is the launch's, not re-run when the profile loads its name later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!greeting) return null
  const title = greeting.kind === "islamic" ? greeting.title : t(greeting.title, greeting.params)
  const subtitle = greeting.kind === "islamic" ? welcomeDuaText(greeting.dua, locale) : t(greeting.subtitle)
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
      <button
        type="button"
        role="status"
        aria-live="polite"
        onClick={() => setVisible(false)}
        className={`pointer-events-auto max-w-md rounded-3xl border border-emerald-200/70 bg-white/95 px-5 py-3 text-center shadow-lg shadow-emerald-900/10 backdrop-blur transition-all duration-500 ease-out motion-reduce:transition-none dark:border-emerald-800/60 dark:bg-slate-900/95 ${
          visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0"
        }`}
      >
        <span className="block text-base font-semibold text-slate-900 dark:text-white">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-6 text-emerald-800 dark:text-emerald-200">{subtitle}</span>
        {greeting.kind === "islamic" && <span className="mt-0.5 block text-[11px] text-muted-foreground">{greeting.dua.source}</span>}
      </button>
    </div>
  )
}

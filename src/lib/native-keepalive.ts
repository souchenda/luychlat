"use client"

/**
 * The SoundBox kept awake with the screen locked (founder, 23/10/2026 — Task #473): in the Android app (from 1.6), a
 * foreground service with a quiet notification «លុយឆ្លាត SoundBox កំពុងដំណើរការ» and a partial wake lock, while the
 * SoundBox page or the counter mode is on — Android froze the app's process with the screen locked, holding the payment
 * events up to 20 minutes. Several parts may ask (the page, the counter mode): the service runs while any of them does.
 * In a browser, or an APK before 1.6 (no plugin), nothing happens — never an error.
 *
 * Imports nothing of the app beyond the native check: it carries no payment, balance or sign-in data.
 */
import { registerPlugin } from "@capacitor/core"

import { isNativeApp } from "@/lib/native-bridge"

type KeepAlivePlugin = {
  startFeed(o: { title: string; body: string; feedUrl: string; device: string; token: string; speed: string }): Promise<{ feed?: boolean }>
  stopFeed(): Promise<void>
  ringerMode(): Promise<{ mode: "normal" | "vibrate" | "silent" }>
  start(o: { title: string; body: string }): Promise<void>
  stop(): Promise<void>
  batteryStatus(): Promise<{ ignoring: boolean }>
  requestBatteryExemption(): Promise<void>
}

const KeepAlive = registerPlugin<KeepAlivePlugin>("SoundboxKeepAlive")

/** The parts that want the SoundBox awake (pure: the set decides start / stop). */
export function keepAliveChange(sources: ReadonlySet<string>, source: string, on: boolean): { sources: Set<string>; action: "start" | "stop" | null } {
  const next = new Set(sources)
  const before = next.size > 0
  if (on) next.add(source)
  else next.delete(source)
  const after = next.size > 0
  return { sources: next, action: before === after ? null : after ? "start" : "stop" }
}

let sources: Set<string> = new Set()
let running = false

export const KEEPALIVE_TEXT = { title: "លុយឆ្លាត SoundBox កំពុងដំណើរការ", body: "កំពុងរង់ចាំទទួលដំណឹងទូទាត់ប្រាក់..." } as const

/** `source` («page», «counter») wants the SoundBox awake, or no longer does. */
export function keepSoundboxAwake(source: string, on: boolean): void {
  if (!isNativeApp()) return
  const change = keepAliveChange(sources, source, on)
  sources = change.sources
  if (change.action === "start") {
    void KeepAlive.start(KEEPALIVE_TEXT).then(
      () => (running = true),
      () => (running = false), // an APK before 1.6: no plugin
    )
  } else if (change.action === "stop") {
    running = false
    void KeepAlive.stop().catch(() => null)
  }
}

/** The service is running: the app may speak with the screen locked (the process is not frozen). */
export const soundboxAwake = () => running

let feedOn = false
/**
 * The SoundBox announced by the phone itself (founder, 24/10/2026 — Task #487, APK 1.9+): the foreground service asks the
 * server for new sales and plays them natively — no WebView, which a Huawei froze with the screen off. While it runs the
 * page and the app-wide voice stay quiet (never twice). An older APK has no such method: false, the page plays as before.
 */
export async function startNativeFeed(o: { device: string; token: string; speed: string }): Promise<boolean> {
  if (!isNativeApp()) return false
  feedOn = await KeepAlive.startFeed({ ...KEEPALIVE_TEXT, feedUrl: `${FEED_ORIGIN}/api/soundbox/feed`, ...o }).then(
    (r) => r.feed === true,
    () => false,
  )
  return feedOn
}
export function stopNativeFeed(): void {
  if (!feedOn) return
  feedOn = false
  void KeepAlive.stopFeed().catch(() => null)
}
/** The phone announces the sales itself: the page and the app-wide voice stay quiet. */
export const nativeFeedActive = () => feedOn
const FEED_ORIGIN = "https://app.luychlat.com"

/**
 * The phone's quiet mode (founder, 23/10/2026 — Task #476): «silent» (the ringer on silent, or Do Not Disturb),
 * «vibrate» or «normal». The SoundBox speaks only on normal — the app always respects Silent and Vibrate. Null in a
 * browser or an APK before 1.6 (no way to know: as before).
 */
export async function phoneQuiet(): Promise<"normal" | "vibrate" | "silent" | null> {
  if (!isNativeApp()) return null
  // Never holds a payment up (founder, 23/10/2026 — Task #482): no answer in 200 ms → unknown, spoken as before.
  return Promise.race([
    KeepAlive.ringerMode().then(
      (r) => r.mode,
      () => null,
    ),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), QUIET_ANSWER_MS)),
  ])
}

/** How long the SoundBox waits for the phone's quiet mode before speaking anyway. */
export const QUIET_ANSWER_MS = 200

/** A known quiet phone (silent / vibrate): no sound. */
export const isQuiet = (mode: "normal" | "vibrate" | "silent" | null) => mode === "silent" || mode === "vibrate"

/** Whether Android exempts the app from battery optimisation; null in a browser or an APK before 1.6. */
export async function batteryExempt(): Promise<boolean | null> {
  if (!isNativeApp()) return null
  return KeepAlive.batteryStatus().then(
    (r) => r.ignoring,
    () => null,
  )
}

/** Android's «Allow unrestricted background battery» prompt (or its settings list). */
export async function requestBatteryExemption(): Promise<void> {
  if (!isNativeApp()) return
  await KeepAlive.requestBatteryExemption().catch(() => null)
}

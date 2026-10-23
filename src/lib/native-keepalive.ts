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

/**
 * The phone's quiet mode (founder, 23/10/2026 — Task #476): «silent» (the ringer on silent, or Do Not Disturb),
 * «vibrate» or «normal». The SoundBox speaks only on normal — the app always respects Silent and Vibrate. Null in a
 * browser or an APK before 1.6 (no way to know: as before).
 */
export async function phoneQuiet(): Promise<"normal" | "vibrate" | "silent" | null> {
  if (!isNativeApp()) return null
  return KeepAlive.ringerMode().then(
    (r) => r.mode,
    () => null,
  )
}

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

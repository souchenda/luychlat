// Server only: the one exception to «0-9 everywhere» (founder, 21/10/2026 — Task #440, lib/numerals.ts): an official
// royal or national commemoration keeps the traditional Khmer numerals. Its preview, card, reminders and publishing run
// inside `withKhmerDigits`; every Telegram call and Facebook post outside it is converted to 0-9 as it leaves.
import { AsyncLocalStorage } from "node:async_hooks"

import { latinDigits } from "@/lib/dates"
import { latinForm, latinPayload } from "@/lib/numerals"

const keep = new AsyncLocalStorage<true>()

/** Runs `fn` (and everything it awaits) with the Khmer numerals kept — the royal and national commemorations only. */
export const withKhmerDigits = <T>(fn: () => T): T => keep.run(true, fn)
export const keepsKhmerDigits = () => keep.getStore() === true

/** Outgoing text, a Telegram payload, a multipart upload: 0-9, unless inside `withKhmerDigits`. */
export const outgoingText = (text: string) => (keepsKhmerDigits() ? text : latinDigits(text))
export const outgoingPayload = <T extends Record<string, unknown>>(payload: T): T => (keepsKhmerDigits() ? payload : latinPayload(payload))
export const outgoingForm = (form: FormData): FormData => (keepsKhmerDigits() ? form : latinForm(form))

"use client"

import jsQR from "jsqr"

import { isKhqr } from "@/lib/khqr"

/**
 * Reads the KHQR text out of a picture of the code (a screenshot from a bank
 * app, or a photo). Tries the full image and a couple of smaller sizes, since
 * very large photos decode less reliably. Null when no valid KHQR is found.
 */
export async function decodeKhqr(image: Blob): Promise<string | null> {
  return decodeQrText(image, isKhqr)
}

/** Any QR code's text in a picture (e.g. the "VERIFY" QR on an NSSF card), optionally only one that passes `accept`. */
export async function decodeQrText(image: Blob, accept: (text: string) => boolean = () => true): Promise<string | null> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(image)
  } catch {
    return null
  }
  try {
    for (const max of [1200, 800, 1800]) {
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
      const w = Math.max(1, Math.round(bitmap.width * scale))
      const h = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d", { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(bitmap, 0, 0, w, h)
      const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h)?.data
      if (found && accept(found)) return found
    }
    return null
  } finally {
    bitmap.close()
  }
}

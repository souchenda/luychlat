"use client"

import { CARD_H, CARD_W, cleanCorners, loosen, sharpen, warpCard } from "@/lib/card-crop"

/**
 * The card cut out of a photo, flat and sharpened, as a JPEG — or null when the corners
 * don't describe a card clearly (then the original photo is kept instead of a bad crop).
 */
export async function cropCardImage(image: Blob, corners: unknown): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(image)
    const { width, height } = bitmap
    const quad = cleanCorners(corners, width, height)
    if (!quad) {
      bitmap.close()
      return null
    }
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const src = ctx.getImageData(0, 0, width, height)
    const flat = sharpen(warpCard(src.data, width, height, loosen(quad, width, height)), CARD_W, CARD_H)
    const out = document.createElement("canvas")
    out.width = CARD_W
    out.height = CARD_H
    out.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(flat), CARD_W, CARD_H), 0, 0)
    return await new Promise<Blob | null>((resolve) => out.toBlob((b) => resolve(b), "image/jpeg", 0.92))
  } catch {
    return null
  }
}

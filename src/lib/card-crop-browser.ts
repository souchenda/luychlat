"use client"

import { CARD_H, CARD_W, cleanBox, cleanCorners, cropBox, loosen, sharpen, warpCard } from "@/lib/card-crop"

export type CropResult = { blob: Blob; how: "warp" | "box" } | { blob: null; why: string }

/**
 * The card cut out of a photo as a JPEG: straightened from its 4 corners when they are clear,
 * else cropped to its bounding box — the table and background are never kept when Vision found
 * the card. Null (with the reason) only when Vision gave neither.
 */
export async function cropCardImage(image: Blob, corners: unknown, box?: unknown): Promise<CropResult> {
  try {
    const bitmap = await createImageBitmap(image)
    const { width, height } = bitmap
    const boxPx = cleanBox(box, width, height)
    const quad = cleanCorners(corners, width, height, boxPx)
    const rect = quad ? null : boxPx
    if (!quad && !rect) {
      bitmap.close()
      return { blob: null, why: `no usable corners${corners ? "" : " (none)"} / box${box ? "" : " (none)"} on ${width}x${height}` }
    }
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return { blob: null, why: "no canvas" }
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const src = ctx.getImageData(0, 0, width, height)
    const [px, w, h] = quad
      ? [sharpen(warpCard(src.data, width, height, loosen(quad, width, height)), CARD_W, CARD_H), CARD_W, CARD_H]
      : [sharpen(cropBox(src.data, width, rect!), rect!.w, rect!.h), rect!.w, rect!.h]
    const out = document.createElement("canvas")
    out.width = w
    out.height = h
    out.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(px), w, h), 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob((b) => resolve(b), "image/jpeg", 0.92))
    return blob ? { blob, how: quad ? "warp" : "box" } : { blob: null, why: "encode failed" }
  } catch (e) {
    return { blob: null, why: (e as Error).message?.slice(0, 80) || "crop failed" }
  }
}

/** A crop that couldn't be made goes to the admin log (the reason only — never the image). */
export function reportCrop(side: string, why: string) {
  void fetch("/api/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "nssf-crop", message: `${side}: ${why}` }) }).catch(() => null)
}

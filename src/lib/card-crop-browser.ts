"use client"

import { CARD_H, CARD_W, centerCardBox, cleanBox, cleanCorners, cropBox, isCardFrame, isSideways, localCardBox, loosen, rotate90, sharpen, warpCard } from "@/lib/card-crop"
import { compressImage, decodeOriented } from "@/lib/image"

/** "center": nothing found the card — a centred standard-size crop (the user can crop again or retake). */
export type CropResult = { blob: Blob; how: "warp" | "box" | "local" | "already" | "center"; why?: string } | { blob: null; why: string }

/**
 * The card cut out of a photo as a JPEG: straightened from its 4 corners when they are clear,
 * else cropped to its bounding box (Vision's, or found on the phone) and turned to landscape when
 * it was shot sideways. When nothing found the card, a centred card-sized crop — the user is never
 * blocked (`approx: false` gives null instead, for re-crops of a photo already kept). The photo is
 * decoded upright first (EXIF orientation), the same pixels Vision measured.
 */
export async function cropCardImage(image: Blob, corners: unknown, box?: unknown, opts: { approx?: boolean } = {}): Promise<CropResult> {
  try {
    const bitmap = await decodeOriented(image)
    const { width, height } = bitmap
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return { blob: null, why: "no canvas" }
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const src = ctx.getImageData(0, 0, width, height)
    const boxPx = cleanBox(box, width, height)
    const quad = cleanCorners(corners, width, height, boxPx)
    // Vision's box; else (Vision busy, or no box) the card found on the phone from the background's colour.
    const local = quad || boxPx ? null : localCardBox(src.data, width, height)
    const rect = quad ? null : (boxPx ?? local)
    // Nothing found inside, but the photo itself is card-shaped: it is already just the card.
    if (!quad && !rect && isCardFrame(width, height)) return { blob: image, how: "already" }
    const why = `no usable corners${corners ? "" : " (none)"} / box${box ? "" : " (none)"} / no card found locally on ${width}x${height}`
    if (!quad && !rect && opts.approx === false) return { blob: null, why }
    const cut = quad ? null : (rect ?? centerCardBox(width, height))
    let [px, w, h] = quad
      ? [sharpen(warpCard(src.data, width, height, loosen(quad, width, height)), CARD_W, CARD_H), CARD_W, CARD_H]
      : [sharpen(cropBox(src.data, width, cut!), cut!.w, cut!.h), cut!.w, cut!.h]
    // A box taller than wide: the card was shot sideways — turned, like the corner path does.
    if (!quad && isSideways(w, h)) [px, w, h] = [rotate90(px, w, h), h, w]
    const out = document.createElement("canvas")
    out.width = w
    out.height = h
    out.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(px), w, h), 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob((b) => resolve(b), "image/jpeg", 0.95))
    if (!blob) return { blob: null, why: "encode failed" }
    return quad || rect ? { blob, how: quad ? "warp" : local ? "local" : "box" } : { blob, how: "center", why }
  } catch (e) {
    return { blob: null, why: (e as Error).message?.slice(0, 80) || "crop failed" }
  }
}

/** A crop that couldn't be made goes to the admin log (the reason only — never the image). */
export function reportCrop(side: string, why: string) {
  void fetch("/api/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "nssf-crop", message: `${side}: ${why}` }) }).catch(() => null)
}

/**
 * Vision finds the card in the photo (no reading of its text), then it is cut out. Vision gets a
 * 1600 px copy (its corners are on a 0–1000 scale, so the full photo is cut from them): a full
 * 3200 px photo made it time out. `onApprox` runs when the centred fallback was used.
 */
export async function cropCardPhoto(image: Blob, side: "back" | "crop", opts: { approx?: boolean; onApprox?: () => void } = {}): Promise<Blob | null> {
  const body = new FormData()
  const light = await compressImage(new File([image], "card.jpg", { type: "image/jpeg" }), 1600, 0.88).catch(() => image)
  body.append("image", light, "card.jpg")
  body.append("side", side)
  const res = await fetch("/api/nssf/ocr", { method: "POST", body }).catch(() => null)
  const json = (await res?.json().catch(() => null)) as { corners?: unknown; box?: unknown } | null
  const crop = await cropCardImage(image, json?.corners, json?.box, { approx: opts.approx })
  if (!crop.blob) reportCrop(side, crop.why)
  else if (crop.how === "center") {
    reportCrop(side, `centred fallback — ${crop.why}`)
    opts.onApprox?.()
  }
  return crop.blob
}

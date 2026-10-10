"use client"

import { decodeQrText } from "@/lib/khqr-decode"

type Detector = { detect: (image: ImageBitmapSource) => Promise<{ rawValue: string; format: string }[]> }
type DetectorClass = { new (options: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> }

/** QR and the 2D / 1D barcodes found on Cambodian cards (driving licences carry PDF417). */
const WANTED = ["qr_code", "pdf417", "data_matrix", "aztec", "code_128", "code_39"]

/**
 * The card's own code, read on the phone before any AI: the platform's BarcodeDetector (QR,
 * PDF417, Data Matrix, Aztec, Code 128/39 — Chrome on Android and the Android app) when there is
 * one, else jsQR (QR only). Null when the photo carries no readable code.
 */
export async function decodeCardCode(image: Blob): Promise<string | null> {
  const Native = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector
  if (Native) {
    try {
      const supported = (await Native.getSupportedFormats?.()) ?? WANTED
      const formats = WANTED.filter((f) => supported.includes(f))
      if (formats.length) {
        const bitmap = await createImageBitmap(image)
        try {
          const found = await new Native({ formats }).detect(bitmap)
          const text = found.find((c) => c.rawValue?.trim())?.rawValue
          if (text) return text
        } finally {
          bitmap.close()
        }
      }
    } catch {
      // fall back to jsQR
    }
  }
  return decodeQrText(image).catch(() => null)
}

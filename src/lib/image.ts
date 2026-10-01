export const MAX_RECEIPT_INPUT_BYTES = 15 * 1024 * 1024

/**
 * Downscales a photo to JPEG (max `maxSide` px). Re-encoding through a canvas
 * also drops EXIF metadata such as GPS location.
 */
export async function compressImage(file: File, maxSide = 1280, quality = 0.75): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Not an image")
  if (file.size > MAX_RECEIPT_INPUT_BYTES) throw new Error("Image too large")

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas unavailable")
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed"))), "image/jpeg", quality),
  )
}

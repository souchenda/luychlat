export const MAX_RECEIPT_INPUT_BYTES = 15 * 1024 * 1024

/**
 * Downscales a photo to JPEG (max `maxSide` px). Re-encoding through a canvas
 * also drops EXIF metadata such as GPS location.
 */
export async function compressImage(file: File, maxSide = 1280, quality = 0.75): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Not an image")
  if (file.size > MAX_RECEIPT_INPUT_BYTES) throw new Error("Image too large")

  const bitmap = await decodeOriented(file)
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

/**
 * The photo decoded upright: a phone's portrait shot carries its rotation in EXIF, and reading the
 * raw pixels swaps width and height (a card cropped from the wrong axes → a thin strip). Browsers
 * apply EXIF with imageOrientation "from-image" (the default in current ones; set explicitly for
 * older WebViews), and an <img> decode applies it everywhere as the last resort.
 */
export async function decodeOriented(image: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(image, { imageOrientation: "from-image" })
  } catch {
    const url = URL.createObjectURL(image)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return await createImageBitmap(img)
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

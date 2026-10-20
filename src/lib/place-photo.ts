/**
 * The photo a member attaches to a place suggestion (founder, 20/10/2026): an image of up to 5 MB as picked; it is
 * compressed on the phone (≤ 1280 px JPEG) before the upload to the private bucket place-photos. Pure (place-photo.test.ts).
 */
export const PLACE_PHOTO_MAX_BYTES = 5 * 1024 * 1024

export function placePhotoError(file: { type: string; size: number }): "suggest.photoNotImage" | "suggest.photoTooBig" | null {
  if (!file.type.startsWith("image/")) return "suggest.photoNotImage"
  if (file.size > PLACE_PHOTO_MAX_BYTES) return "suggest.photoTooBig"
  return null
}

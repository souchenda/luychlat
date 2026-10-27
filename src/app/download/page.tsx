import type { Metadata } from "next"
import QRCode from "qrcode"

import { DOWNLOAD_PAGE_URL } from "@/lib/download-links"

import { DownloadView } from "./download-view"

export const metadata: Metadata = {
  title: "ទាញយក អេប លុយឆ្លាត · Get App Luy Chlat",
  description: "Android (APK), iPhone / Web and the Telegram bot of App Luy Chlat.",
}

/** Task #527: the public download page (lib/download-links.ts) — no sign-in, its own QR code for posters. */
export default async function DownloadPage() {
  const qrSvg = await QRCode.toString(DOWNLOAD_PAGE_URL, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
  return <DownloadView qrSvg={qrSvg} />
}

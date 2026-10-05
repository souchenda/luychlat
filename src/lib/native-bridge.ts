"use client"

/**
 * Android app (Capacitor, see capacitor.config.ts): the WebView has no Web
 * Share API and ignores <a download>, so sharing a receipt, invoice, KHQR or
 * loan document — and downloading a backup or export — would silently do
 * nothing. Inside the app only, both are routed to Android's share sheet
 * (save to Files / Drive, or send to Telegram). In a browser this is a no-op.
 */

type CapacitorGlobal = { isNativePlatform?: () => boolean }

export const isNativeApp = () =>
  typeof window !== "undefined" && Boolean((window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor?.isNativePlatform?.())

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "")
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "_").slice(-120) || "file"

/** Files are written to the app's cache, then handed to the share sheet. */
async function shareNative(data: { title?: string; text?: string; url?: string; files?: File[] }) {
  const [{ Share }, { Filesystem, Directory }] = await Promise.all([import("@capacitor/share"), import("@capacitor/filesystem")])
  const files: string[] = []
  for (const file of data.files ?? []) {
    const written = await Filesystem.writeFile({
      path: `share/${Date.now()}-${safeName(file.name)}`,
      data: await toBase64(file),
      directory: Directory.Cache,
      recursive: true,
    })
    files.push(written.uri)
  }
  await Share.share({ title: data.title, text: data.text, url: data.url, files: files.length ? files : undefined, dialogTitle: data.title })
}

let installed = false

export function installNativeBridge() {
  if (installed || !isNativeApp()) return
  installed = true

  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void>; canShare?: (d?: ShareData) => boolean }
  nav.share = async (d: ShareData) => {
    try {
      await shareNative({ title: d.title, text: d.text, url: d.url, files: d.files ? Array.from(d.files) : undefined })
    } catch (error) {
      // Same as the browser: closing the sheet is an AbortError.
      if (/cancel/i.test(String((error as Error)?.message))) throw new DOMException("Share canceled", "AbortError")
      throw error
    }
  }
  nav.canShare = () => true

  // <a download> (backups, exports, slips): fetch the file and offer the share sheet instead.
  const offer = (a: HTMLAnchorElement) => {
    const name = a.getAttribute("download") || a.href.split("/").pop()?.split("?")[0] || "file"
    void fetch(a.href)
      .then((res) => res.blob())
      .then((blob) => shareNative({ title: name, files: [new File([blob], name, { type: blob.type })] }))
      .catch(() => {})
  }
  // Links the user taps…
  document.addEventListener(
    "click",
    (event) => {
      const a = (event.target as Element | null)?.closest?.("a[download]") as HTMLAnchorElement | null
      if (!a?.href) return
      event.preventDefault()
      offer(a)
    },
    true,
  )
  // …and links the code clicks without adding them to the page (no event reaches the document then).
  const click = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (this.hasAttribute("download") && this.href && !this.isConnected) return offer(this)
    return click.call(this)
  }
}

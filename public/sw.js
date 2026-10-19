// LuyChlat service worker: offline shell + cache-first static assets.
// Never caches API traffic (Supabase), so financial data is not stored here.
const CACHE = "luysmart-v5" // bump to drop old caches (v5: the mascot icons, 11/10/2026)
// Quran recitations kept for offline listening (founder, 19/10/2026 — lib/audio-cache.ts): never dropped by an
// update, only by the person («សម្អាតទំហំចម្រៀង/គួរអាន» in Settings). Public recitations only.
const AUDIO_CACHE = "luysmart-quran-audio-v1"
const AUDIO_HOST = "https://cdn.mp3quran.net/audio/"
const SHELL = [
  "/",
  "/login",
  "/home",
  "/transactions",
  "/debts",
  "/debts/calculator",
  "/advisor",
  "/wallets",
  "/reports",
  "/settings",
  "/logo.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.webmanifest",
]

self.addEventListener("install", (event) => {
  // allSettled: one missing page must not block installing the worker.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((path) => cache.add(path))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== AUDIO_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Push notifications (the 07:00 morning message, a SoundBox payment): shown as sent; a tap opens LuyChlat
// (an open window is focused instead of opening a second one).
self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : "" }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "លុយឆ្លាត · LuyChlat", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "luychlat",
      // A payment alert buzzes the phone each time (SoundBox with the screen locked).
      renotify: Boolean(data.renotify),
      vibrate: Array.isArray(data.vibrate) ? data.vibrate : undefined,
      data: { url: data.url || "/" },
    }),
  )
})

// 🔇 «បិទសំឡេង» on a prayer notification (lib/prayer-alerts.ts): tell every open window to stop the Adhan.
const stopAdhan = () =>
  self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => windows.forEach((w) => w.postMessage({ type: "luychlat-stop-adhan" })))

self.addEventListener("notificationclose", (event) => {
  if (event.notification.data && event.notification.data.adhan) event.waitUntil(stopAdhan())
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  if (event.action === "stop-adhan") return event.waitUntil(stopAdhan())
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin)
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === target.origin)
      if (open) return open.focus().then((w) => (w && w.navigate && target.href !== w.url ? w.navigate(target.href) : w))
      return self.clients.openWindow(target.href)
    }),
  )
})

/** «bytes=0-» / «bytes=100-199» / «bytes=-500» → the span within size (lib/audio-cache.ts parseRange). */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header || "").trim())
  if (!m || (!m[1] && !m[2]) || size <= 0) return null
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
  const end = m[1] ? (m[2] ? Math.min(Number(m[2]), size - 1) : size - 1) : size - 1
  return start <= end && start < size ? { start, end } : null
}

/** A whole file: a 200, or a 206 from byte 0 to the last (lib/audio-cache.ts isWholeBody). */
function isWholeBody(res) {
  if (res.status === 200) return true
  const m = res.status === 206 && /^bytes 0-(\d+)\/(\d+)$/.exec((res.headers.get("Content-Range") || "").trim())
  return Boolean(m && Number(m[1]) + 1 === Number(m[2]))
}

/**
 * A recitation: a kept one is played from the phone (the byte range the player asks for); otherwise streamed, and
 * kept when the whole file came through (listened to the end, or downloaded) — never a second download.
 */
async function recitation(request) {
  const cache = await caches.open(AUDIO_CACHE)
  const hit = await cache.match(request.url)
  if (hit) {
    const blob = await hit.blob()
    const span = parseRange(request.headers.get("Range"), blob.size)
    if (!span) return new Response(blob, { status: 200, headers: { "Content-Type": "audio/mpeg", "Content-Length": String(blob.size), "Accept-Ranges": "bytes" } })
    const part = blob.slice(span.start, span.end + 1)
    return new Response(part, {
      status: 206,
      headers: { "Content-Type": "audio/mpeg", "Content-Length": String(part.size), "Content-Range": `bytes ${span.start}-${span.end}/${blob.size}`, "Accept-Ranges": "bytes" },
    })
  }
  const res = await fetch(request)
  // Readable (the player asks the CDN with CORS) and whole: keep a copy as it streams.
  if (res.type !== "opaque" && isWholeBody(res)) {
    res
      .clone()
      .blob()
      .then((blob) => blob.size > 0 && cache.put(request.url, new Response(blob, { headers: { "Content-Type": "audio/mpeg", "Content-Length": String(blob.size) } })))
      .catch(() => null) // stopped or skipped halfway: nothing half-kept
  }
  return res
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)
  // Recitations: the Quran from the CDN, and the du'a recordings of our own (/audio/duas/ — founder, 19/10/2026),
  // also the admin's uploads in Supabase Storage (the public buckets «dua-audio» and «adhan-audio» — Adhans published for everyone).
  const duaAudio =
    (url.origin === self.location.origin && url.pathname.startsWith("/audio/duas/")) || url.pathname.startsWith("/storage/v1/object/public/dua-audio/") ||
    url.pathname.startsWith("/storage/v1/object/public/adhan-audio/")
  if (request.method === "GET" && (request.url.startsWith(AUDIO_HOST) || duaAudio) && /\.(mp3|m4a)$/i.test(url.pathname)) {
    event.respondWith(recitation(request))
    return
  }
  if (request.method !== "GET" || url.origin !== self.location.origin) return
  // Quran text (public, no personal data): served from the cache and refreshed
  // in the background, so surahs read once stay readable offline.
  if (url.pathname.startsWith("/api/quran/")) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then((hit) => {
          const fresh = fetch(request)
            .then((res) => {
              if (res.ok) cache.put(request, res.clone())
              return res
            })
            .catch(() => hit)
          return hit || fresh
        }),
      ),
    )
    return
  }
  if (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/api/")) return

  // Adhan recordings: kept after the first play so prayer alerts sound offline.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/adhan/") || url.pathname === "/icon.svg") {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
            return res
          }),
      ),
    )
    return
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
          return res
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("/"))),
    )
  }
})

// Prayer-time alerts (lib/prayer-alerts.ts) open their page (data.url) through the click handler above.

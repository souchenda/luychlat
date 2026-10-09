// LuyChlat service worker: offline shell + cache-first static assets.
// Never caches API traffic (Supabase), so financial data is not stored here.
const CACHE = "luysmart-v4" // bump to drop caches from before the LuyChlat rename
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
  "/icon.svg",
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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Push notifications (the 07:00 morning message): shown as sent; a tap opens LuyChlat
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
      renotify: false,
      data: { url: data.url || "/" },
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin)
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === target.origin)
      if (open) return open.focus().then((w) => (w && w.navigate && target.href !== w.url ? w.navigate(target.href) : w))
      return self.clients.openWindow(target.href)
    }),
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)
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

// Prayer-time alerts (lib/prayer-alerts.ts): tapping one opens or focuses the prayer page.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/home"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin)
      if (open) return open.focus().then((c) => c && "navigate" in c ? c.navigate(url) : undefined)
      return self.clients.openWindow(url)
    }),
  )
})

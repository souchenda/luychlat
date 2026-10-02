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

self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== "GET" || url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/api/")) return

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/icon.svg") {
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

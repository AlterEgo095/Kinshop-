/* KinShop — Service Worker (PWA V4)
 * Stratégies :
 *  - Navigations : network-first → cache → offline.html
 *  - Icônes/images locales : cache-first
 *  - API GET : network-first → cache (la boutique reste consultable hors ligne)
 *  - Autres assets : network-first → cache
 */

const VERSION = "kinshop-v4"
const STATIC_CACHE = `${VERSION}-static`
const PAGE_CACHE = `${VERSION}-pages`
const API_CACHE = `${VERSION}-api`
const IMG_CACHE = `${VERSION}-img`

const PRECACHE = ["/", "/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/logo.svg"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  const path = url.pathname

  // Jamais HMR / websockets dev
  if (path.includes("webpack-hmr") || path.startsWith("/_next/webpack")) return

  // 1) Navigations (pages)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(PAGE_CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() =>
          caches
            .match(req)
            .then((hit) => hit || caches.match("/"))
            .then((hit) => hit || caches.match("/offline.html"))
            .then((hit) => hit || caches.match("/offline.html"))
        )
    )
    return
  }

  // 2) Icônes & images locales : cache-first
  if (path.startsWith("/icons/") || path.startsWith("/images/") || path.startsWith("/status/") || path === "/logo.svg") {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone()
            caches.open(IMG_CACHE).then((c) => c.put(req, copy))
            return res
          })
      )
    )
    return
  }

  // 3) API GET : network-first + repli cache (consultation hors ligne)
  if (path.startsWith("/api/")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(API_CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(
          () =>
            caches.match(req).then(
              (hit) =>
                hit ||
                new Response(JSON.stringify({ offline: true }), {
                  status: 503,
                  headers: { "Content-Type": "application/json" },
                })
            )
        )
    )
    return
  }

  // 4) Reste (assets _next, etc.) : network-first → cache
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => hit)
      return hit || network
    })
  )
})

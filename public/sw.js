// Service Worker for Rebuttal Generator PWA
const VERSION = 'v2'
const PRECACHE = `rebuttal-precache-${VERSION}`
const RUNTIME_CACHE = `rebuttal-runtime-${VERSION}`

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
]

// Install event - precache the app shell. Assets are cached individually so one
// failure doesn't void the whole precache. The worker then WAITS (no skipWaiting
// here) so the in-app update banner controls when it takes over.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => Promise.allSettled(STATIC_ASSETS.map((url) => cache.add(url))))
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== PRECACHE && cacheName !== RUNTIME_CACHE)
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  )
})

// Fetch event - network first, fall back to cache, then to the app shell for
// navigations. Cross-origin requests (including Anthropic API calls) are never
// intercepted.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  if (new URL(event.request.url).origin !== self.location.origin) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          // Clone synchronously, before the page starts consuming the body
          const copy = response.clone()
          event.waitUntil(
            caches
              .open(RUNTIME_CACHE)
              .then((cache) => cache.put(event.request, copy))
              .catch(() => {})
          )
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(event.request)
        if (cached) return cached
        if (event.request.mode === 'navigate') {
          const shell = (await caches.match('/index.html')) || (await caches.match('/'))
          if (shell) return shell
        }
        return new Response('Offline - resource not available', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain' }),
        })
      })
  )
})

// The update banner posts SKIP_WAITING when the user opts in to the new version
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Service Worker for Rebuttal Generator PWA
//
// Bump VERSION on any change to the caching strategy. activate() deletes every
// cache whose name does not match the current VERSION, so bumping it is what
// actually evicts a bad cache from browsers that already have one — editing the
// logic alone leaves existing users on their old entries indefinitely.
//
// v3: stopped serving a synthesized 503 in place of a build asset. See the fetch
// handler for why that one line could blank the whole app after a deploy.
const VERSION = 'v3'
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
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  // Build assets are CACHE-FIRST, and must never fall through to the synthesized
  // 503 below. They are content-hashed and immutable, so a cache hit is always
  // correct and cheaper than revalidating.
  //
  // This is not a performance tweak — it is the fix for a blank-page bug. These
  // files were previously network-first like everything else, so during the
  // minutes a Pages deploy takes to propagate, a request for a freshly-built
  // hash could fail against an edge still serving the old build. The catch below
  // then answered with a 503 `text/plain`. Handing a 503 to `<script type=module>`
  // is not a soft failure: the browser records the module as permanently failed
  // ("Failed to fetch dynamically imported module"), React never mounts, and the
  // user gets a white page that survives reloads until the cache is cleared by
  // hand. Answering a script request with something that is not the script is
  // always worse than letting the request fail honestly, which is why the network
  // path here is left to reject on its own.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((response) => {
            if (response.ok) {
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
      )
    )
    return
  }

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

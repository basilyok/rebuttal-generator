// Service Worker for Rebuttal Generator PWA
const CACHE_NAME = 'rebuttal-generator-v1'
const RUNTIME_CACHE = 'rebuttal-runtime-v1'

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
]

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(STATIC_ASSETS).catch(() => {
          // If some assets fail to cache, continue anyway
          console.log('Some static assets failed to cache')
        })
      })
      .then(() => self.skipWaiting())
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE)
            .map((cacheName) => caches.delete(cacheName))
        )
      })
      .then(() => self.clients.claim())
  )
})

// Fetch event - network first, fall back to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and API calls to external services
  if (event.request.method !== 'GET' || event.request.url.includes('anthropic')) {
    return
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const cache = caches.open(RUNTIME_CACHE)
          cache.then((c) => c.put(event.request, response.clone()))
        }
        return response
      })
      .catch(() => {
        // Fall back to cache
        return caches.match(event.request).then((cachedResponse) => {
          return (
            cachedResponse ||
            new Response('Offline - resource not available', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain',
              }),
            })
          )
        })
      })
  )
})

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

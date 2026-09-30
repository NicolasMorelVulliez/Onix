/// <reference lib="webworker" />
import { createHandlerBoundToURL, precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

self.skipWaiting()
self.addEventListener('activate', () => self.clients.claim())

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// SPA: navigations are served by index.html so the app opens offline — except Firebase's
// own pages (/__/auth/handler finishes the Google sign-in) and the API.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/__\//, /^\/api\//] }))

// Recordings: <video src="/drive-stream/<fileId>?t=<token>"> is served from Google Drive with the
// account's token, forwarding Range requests so the player can seek without downloading everything.
// The token never leaves the device: this request is answered here, not sent to the network.
const streamTokens = new Map<string, string>()
self.addEventListener('message', (event) => {
  const { type, fileId, token } = (event.data ?? {}) as { type?: string; fileId?: string; token?: string }
  if (type === 'drive-token' && fileId && token) streamTokens.set(fileId, token)
})
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/drive-stream/')) return
  const fileId = url.pathname.split('/').pop()!
  const token = streamTokens.get(fileId) ?? url.searchParams.get('t') ?? ''
  const headers: Record<string, string> = { authorization: `Bearer ${token}` }
  const range = event.request.headers.get('range')
  if (range) headers.range = range
  event.respondWith(fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers }))
})

// Web Push: reminders and the morning summary sent by /api/cron/tick.
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Onix', {
      body: data.body,
      tag: data.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url ?? '/' },
    }),
  )
})

// Tapping a notification focuses Onix (or opens it) on the right screen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string })?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows[0] as WindowClient | undefined
      if (open) return open.focus().then((w) => w.navigate(url))
      return self.clients.openWindow(url)
    }),
  )
})

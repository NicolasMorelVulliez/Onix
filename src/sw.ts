/// <reference lib="webworker" />
import { createHandlerBoundToURL, precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

self.skipWaiting()
self.addEventListener('activate', () => self.clients.claim())

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// SPA: every navigation is served by index.html so the app opens offline.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

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

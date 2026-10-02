/* Sportsline service worker: shows Alerts (Web Push) and opens them. */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let alert = { title: 'Sportsline', body: '', url: '/', tag: undefined }
  try {
    alert = { ...alert, ...event.data.json() }
  } catch {
    // Not JSON: show it as text.
    if (event.data) alert.body = event.data.text()
  }
  event.waitUntil(
    self.registration.showNotification(alert.title, {
      body: alert.body,
      tag: alert.tag,
      // A newer Alert for the same Game replaces the older one, but still buzzes.
      renotify: Boolean(alert.tag),
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: alert.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (open) return open.focus().then(() => open.navigate(url))
      return self.clients.openWindow(url)
    }),
  )
})

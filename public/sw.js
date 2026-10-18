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

/**
 * Ask an open tab to route to `url` itself (src/lib/push/serviceWorker.ts),
 * resolving whether it answered: a tab still loading, or on an older build,
 * doesn't.
 */
function askToNavigate(client, url) {
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => resolve(false), 1500)
    channel.port1.onmessage = () => {
      clearTimeout(timer)
      resolve(true)
    }
    client.postMessage({ type: 'sportsline:navigate', url }, [channel.port2])
  })
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open =
        windows.find((w) => w.focused && new URL(w.url).origin === self.location.origin) ??
        windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (!open) return self.clients.openWindow(url)
      try {
        const tab = (await open.focus()) ?? open
        if (await askToNavigate(tab, url)) return
        // navigate() rejects for a tab this worker doesn't control.
        await tab.navigate(url)
      } catch {
        await self.clients.openWindow(url)
      }
    })(),
  )
})

const VERSION = 'momento-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients[0]
      return existing ? existing.focus() : self.clients.openWindow('/')
    }),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'version') event.source?.postMessage(VERSION)
})

// Minimal service worker: only handles Web Push + notification click.
// No caching (the app is served by nginx and is fast enough without it).
// If you add caching here, remember to version the cache and purge on
// release or the app will appear "stuck" on old code.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'WhoareYou', body: event.data.text() };
  }
  const title = payload.title || 'WhoareYou';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/img/icon-192.png',
    badge: payload.badge || '/img/icon-192.png',
    tag: payload.tag,
    data: { url: payload.url || '/' },
    renotify: !!payload.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.endsWith(url) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

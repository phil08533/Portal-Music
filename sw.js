// Portal Music no longer sends push notifications.
// This replaces the old Monetag push worker: it removes any existing push
// subscription and unregisters itself so returning visitors stop getting ads
// as browser notifications.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const sub = await self.registration.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
    } catch (e) { /* ignore */ }
    await self.registration.unregister();
  })());
});

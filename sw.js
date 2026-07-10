const CACHE_NAME = 'vsub-shell-v1';
const SHARED_FILE_CACHE = 'vsub-shared-file-v1';
const SHELL_FILES = ['./index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Handle the video/file arriving from Android's "Share" sheet.
  if (event.request.method === 'POST' && url.pathname.endsWith('/index.html')) {
    event.respondWith(handleShareTarget(event));
    return;
  }

  // Serve the app shell from cache; everything else (CDN models, translate API) goes to network.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});

async function handleShareTarget(event) {
  try {
    const formData = await event.request.formData();
    const file = formData.get('video');
    if (file) {
      const cache = await caches.open(SHARED_FILE_CACHE);
      await cache.put(
        '/shared-video',
        new Response(file, { headers: { 'Content-Type': file.type || 'video/mp4' } })
      );
    }
  } catch (e) {
    console.error('Share target handling failed', e);
  }
  return Response.redirect('./index.html?shared=1', 303);
}

const CACHE_NAME = 'vsub-shell-v2';
const SHARED_FILE_CACHE = 'vsub-shared-file-v1';
const SHELL_FILES = ['./index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME && name !== SHARED_FILE_CACHE)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Handle the video/file arriving from Android's "Share" sheet.
  if (event.request.method === 'POST' && url.pathname.endsWith('/index.html')) {
    event.respondWith(handleShareTarget(event));
    return;
  }

  // App shell: always prefer a fresh copy from the network so updates show up
  // immediately; only fall back to the cached copy if there's no connection.
  if (url.origin === self.location.origin && event.request.method === 'GET') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
          return res;
        })
        .catch(() => caches.match(event.request))
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
        new Response(file, {
          headers: {
            'Content-Type': file.type || 'video/mp4',
            'X-Original-Filename': encodeURIComponent(file.name || 'video.mp4')
          }
        })
      );
    }
  } catch (e) {
    console.error('Share target handling failed', e);
  }
  return Response.redirect('./index.html?shared=1', 303);
}

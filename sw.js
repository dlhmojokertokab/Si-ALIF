const CACHE = "si-alif-07-5-3-server-zip";
const ASSETS = [
  "./",
  "./index.html",
  "./assets/css/style.css?v=0753",
  "./assets/js/config.js?v=0731",
  "./assets/js/app.js?v=0753",
  "./manifest.webmanifest?v=0753",
  "./assets/icons/icon.svg",
  "./assets/icons/icon.png",
  "./assets/brand/si-alif-doodle-logo.png",
  "./assets/icons/favicon.ico",
  "./assets/icons/si-alif-favicon-32.png",
  "./assets/icons/si-alif-favicon-180.png",
  "./assets/icons/si-alif-favicon-192.png",
  "./assets/icons/si-alif-favicon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (
    request.mode === "navigate" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith("sw.js")
  ) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
        return response;
      });
    })
  );
});

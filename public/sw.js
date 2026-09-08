/* Offline support. These visits happen in homes with bad signal, so once the
   board has been opened on a device it should keep opening.

   Navigations and the caseload go network-first so a redeploy is picked up,
   falling back to cache when there is nothing to reach. Hashed build assets
   are immutable, so they are served from cache and refreshed in the
   background. */

const VERSION = "__BUILD_ID__";
const CACHE = `skymo-${VERSION}`;
/* Filled in at build time with the real hashed asset names. Precaching the
   whole bundle is what makes the very first offline open work; caching only
   as requests happen leaves the JS missing exactly when there is no signal. */
const SHELL = __PRECACHE__;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Precached entries are stored by addAll, whose requests carry no Origin
   header. A module script request does carry one, and a server that answers
   with "Vary: Origin" then makes cache.match miss the very file it just
   stored. ignoreVary is what keeps the bundle findable offline; ignoreSearch
   lets "/?date=..." fall back to the cached shell. */
const MATCH = { ignoreVary: true, ignoreSearch: true };

async function networkFirst(request, fallbackPath) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const hit =
      (await cache.match(request, MATCH)) ||
      (fallbackPath && (await cache.match(fallbackPath, MATCH)));
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, MATCH);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await network) || Response.error();
}

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    e.respondWith(networkFirst(request, "/index.html"));
    return;
  }
  if (url.pathname.endsWith("/caseload.enc.json")) {
    e.respondWith(networkFirst(request));
    return;
  }
  e.respondWith(staleWhileRevalidate(request));
});

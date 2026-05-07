// Service worker for lynngame.
//
// Strategy:
// - Navigation requests (HTML) use network-first with cache fallback so a
//   reload always tries to pull the latest page when online; offline
//   reloads still work via the precached shell.
// - Same-origin assets (JS/CSS/images/fonts) use stale-while-revalidate:
//   return the cached copy instantly so the page is fast, but kick off a
//   background fetch to refresh the cache for the next load. Combined with
//   `updateViaCache: 'none'` in the page-side registration, this means a
//   user is never more than one reload behind a deploy.
//
// Bump CACHE_VERSION on every deploy. The activate handler deletes any
// older caches so storage doesn't grow.
var CACHE_VERSION = "lynngame-v10";

var APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "favicon.ico",
  "shared/style/main.css",
  "shared/style/fonts/clear-sans.css",
  "shared/style/fonts/ClearSans-Regular-webfont.woff",
  "shared/style/fonts/ClearSans-Bold-webfont.woff",
  "shared/js/bind_polyfill.js",
  "shared/js/classlist_polyfill.js",
  "shared/js/animframe_polyfill.js",
  "shared/js/idb_mirror.js",
  "shared/js/settings.js",
  "shared/js/haptics.js",
  "shared/js/score_history.js",
  "shared/js/local_storage_manager.js",
  "shared/js/input_manager.js",
  "shared/js/base_actuator.js",
  "shared/js/base_game.js",
  "shared/js/settings_panel.js",
  "bubble/index.html",
  "bubble/style/bubble.css",
  "bubble/js/bubble_game.js",
  "bubble/js/bubble_actuator.js",
  "bubble/js/application.js",
  "drop/index.html",
  "drop/style/drop.css",
  "drop/js/drop_game.js",
  "drop/js/drop_actuator.js",
  "drop/js/application.js",
  "flood/index.html",
  "flood/style/flood.css",
  "flood/js/flood_game.js",
  "flood/js/flood_actuator.js",
  "flood/js/application.js",
  "frenzy/index.html",
  "frenzy/style/frenzy.css",
  "frenzy/js/frenzy_game.js",
  "frenzy/js/frenzy_actuator.js",
  "frenzy/js/application.js",
  "meta/apple-touch-icon-180.png",
  "meta/icon-192.png",
  "meta/icon-512.png",
  "meta/icon-512-maskable.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return Promise.all(APP_SHELL.map(function (url) {
        return cache.add(url).catch(function () {});
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_VERSION) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Allow the page to ping us to swap to a waiting worker immediately.
self.addEventListener("message", function (event) {
  if (event.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: try the network first so a reload always sees the latest
  // HTML when online. Fall back to cache only on failure (offline).
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_VERSION).then(function (cache) {
          cache.put(event.request, copy);
        });
        return response;
      }).catch(function () {
        return caches.match(event.request).then(function (m) {
          return m || caches.match("index.html");
        });
      })
    );
    return;
  }

  // Static assets: stale-while-revalidate. Serve the cached copy if we
  // have one, but always try to refresh it in the background for next time.
  // - { cache: 'no-cache' } on the revalidate fetch bypasses the browser's
  //   HTTP cache, otherwise a stale 304 response can defeat the whole point
  //   of stale-while-revalidate (asset never refreshes between deploys).
  // - event.waitUntil keeps the SW alive until the cache write lands,
  //   otherwise the SW can be terminated before the put resolves.
  event.respondWith(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.match(event.request).then(function (cached) {
        var networkFetch = fetch(event.request, { cache: "no-cache" }).then(function (response) {
          if (response && response.ok && response.type === "basic") {
            return cache.put(event.request, response.clone()).then(function () {
              return response;
            });
          }
          return response;
        }).catch(function () { return cached; });
        event.waitUntil(networkFetch);
        return cached || networkFetch;
      });
    })
  );
});

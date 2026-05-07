// Cache-first service worker for the lynngame app shell. Bump CACHE_VERSION
// on every deploy that ships changed JS/CSS so old clients pick up the new
// bundle on next launch.
var CACHE_VERSION = "lynngame-v1";

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

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (response) {
        if (response && response.status === 200 && response.type === "basic") {
          var copy = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) {
            cache.put(event.request, copy);
          });
        }
        return response;
      }).catch(function () {
        if (event.request.mode === "navigate") {
          return caches.match("index.html");
        }
      });
    })
  );
});

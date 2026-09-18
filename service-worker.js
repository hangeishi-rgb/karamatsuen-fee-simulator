// からまつ苑 利用料金シミュレーター - Service Worker
// オフラインでも料金計算ができるよう、アプリ本体と料金マスタJSONをキャッシュする。
// 料金改定時は CACHE_NAME のバージョンを上げることで、古いキャッシュを破棄して更新する。

const CACHE_NAME = "karamatsuen-fee-simulator-v8";

const APP_SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/calculation/careService.js",
  "./js/calculation/food.js",
  "./js/calculation/room.js",
  "./js/calculation/highCostCare.js",
  "./js/calculation/total.js",
  "./js/calculation/versionSelect.js",
  "./data/karamatsu/versions.json",
  "./data/karamatsu/2026-08-01.json",
  "./data/karamatsu/2026-11-01.json",
  "./data/osaka/high-cost-care/versions.json",
  "./data/osaka/high-cost-care/2026-08-01.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});

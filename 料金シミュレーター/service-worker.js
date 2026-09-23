// からまつ苑 利用料金シミュレーター - Service Worker
// オフラインでも料金計算ができるよう、アプリ本体と料金マスタJSONをキャッシュする。
// 料金改定時は CACHE_NAME のバージョンを上げることで、古いキャッシュを破棄して更新する。

const CACHE_NAME = "karamatsuen-fee-simulator-v9";

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
  // cache: "reload" を付けてブラウザのHTTPキャッシュを迂回する。
  // GitHub Pages は Cache-Control: max-age=600 を返すため、これを付けないと
  // 最大10分間は古いファイルがそのまま新しいキャッシュに保存されてしまい、
  // CACHE_NAME を上げても内容が更新されない(実際に発生した不具合)。
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_FILES.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
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

// 料金マスタ(data/配下のJSON)は「ネットワーク優先」にする。
// 料金・加算が改定されたとき、古い金額をご家族に表示してしまうことを避けるため、
// オンラインなら常に最新を取得し、取得できない場合だけキャッシュを使う。
// アプリ本体(HTML/CSS/JS/アイコン)は表示速度を優先して「キャッシュ優先」のままとする。
function isFeeMaster(url) {
  return url.pathname.includes("/data/") && url.pathname.endsWith(".json");
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (isFeeMaster(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

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

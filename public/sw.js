const CACHE_NAME = "fourcut-shell-v4";
// 상대 경로는 서비스워커 위치(예: /4cut-photo/sw.js)를 기준으로 해석되어
// GitHub Pages 하위 경로에서도 올바르게 캐시됩니다.
const SHELL = ["./", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // 같은 출처의 GET 요청만 처리합니다.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // 페이지(내비게이션)는 항상 네트워크 우선 — 새 버전 배포 후 흰 화면을 방지합니다.
  // 오프라인일 때만 캐시된 셸로 대체합니다.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("./")));
    return;
  }

  // 그 외 정적 자원(해시가 붙은 assets 등)은 캐시 우선, 없으면 네트워크에서 받아 캐시합니다.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          // 실패 응답(404 등)을 캐시하면 배포가 정상화된 뒤에도 영원히 깨진 응답이
          // 서빙되므로, 정상(ok) 응답만 캐시합니다.
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

/* HKIA Flight Board PWA service worker */
var CACHE = "hkia-v82";
var ASSETS = [
  "./hkiaflight.html",
  "./watch.html",
  "./manifest.json",
  "./plane-icon.png",
  "./apple-touch-icon.png",
  "./icon-512.png",
  "./js/10-core.js",
  "./js/20-render.js",
  "./js/30-watch.js",
  "./js/40-ui.js"
];
self.addEventListener("install", function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(ASSETS.map(function(u){
      return fetch(u).then(function(r){
        if(r.ok) return c.put(u, r);
      }).catch(function(){});
    }));
  }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener("fetch", function(e){
  if(e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  // data.json 同 auth.json 永遠行 network（要新鮮）
  if(url.pathname.endsWith("data.json") || url.pathname.endsWith("auth.json")){
    e.respondWith(fetch(e.request).catch(function(){ return caches.match(e.request); }));
    return;
  }
  /* 跨域 API（天文台 warnsum／rhrread、Open-Meteo 等）永遠行 network，唔入 cache：
     caches.match 唔理 fetch 嗰陣嘅 cache:"no-store"，舊寫法會將 CORS 200 回應
     長期快取，令警告 banner／溫度／降雨預報變成舊數據 */
  if(url.origin !== self.location.origin){
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function(hit){
      /* 有 redirect 嘅 cache（舊版留下）唔好 serve，直接去 network */
      if(hit && hit.redirected) hit = null;
      return hit || fetch(e.request).then(function(resp){
        /* 淨係 cache 200 OK，redirect 唔 cache */
        if(resp.ok && !resp.redirected){
          var copy = resp.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
        }
        return resp;
      });
    }).catch(function(){ return caches.match("./hkiaflight.html"); })
  );
});

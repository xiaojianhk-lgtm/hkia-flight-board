/* HKIA Flight Board PWA service worker */
var CACHE = "hkia-v172";
var ASSETS = [
  "./hkiaflight.html",
  "./watch.html",
  "./nld.html",
  "./manifest.json",
  "./manifest-night.json",
  "./plane-icon.png",
  "./apple-touch-icon.png",
  "./apple-touch-icon-night.png",
  "./icon-512-night.png",
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
  // data.json 永遠行 network（要新鮮）；auth.json 已改用 Worker API，唔再經呢度
  if(url.pathname.endsWith("data.json")){
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

/* Web Push：收到 push，去 Worker 攞內容再顯示 */
self.addEventListener("push", function(e){
  e.waitUntil((async function(){
    var title = "航班資訊", body = "有更新", url = "./hkiaflight.html";
    try{
      var r = await fetch("https://hkia-push.xiaojian-hk.workers.dev/push/pending/get");
      var d = await r.json();
      if(d.title) title = d.title;
      if(d.body) body = d.body;
      if(d.url) url = d.url;
    }catch(err){}
    return self.registration.showNotification(title, {
      body: body,
      icon: "./plane-icon.png",
      badge: "./plane-icon.png",
      data: { url: url }
    });
  })());
});
self.addEventListener("notificationclick", function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "./hkiaflight.html";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(list){
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        // 已開咗主頁就 focus 佢，唔開新窗
        if (c.url.indexOf("hkiaflight.html") !== -1 || c.url.indexOf("watch.html") !== -1 || c.url.indexOf("nld.html") !== -1) {
          if ("focus" in c) return c.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

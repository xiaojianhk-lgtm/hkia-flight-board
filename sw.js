/* HKIA Flight Board PWA service worker */
var CACHE = "hkia-v213";
var ASSETS = [
  "./hkiaflight.html",
  "./t1m.html",
  "./t1m-egg.png",
  "./t1m-egg-mate.png",
  "./manifest-t1m.json",
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
        /* 淨係 cache 200 OK，redirect 唔 cache；帶 cache-buster（?t= / ?_=）嘅請求唔入 cache */
        if(resp.ok && !resp.redirected && e.request.url.indexOf("?t=") < 0 && e.request.url.indexOf("?_=") < 0 && e.request.url.indexOf("&t=") < 0 && e.request.url.indexOf("&_=") < 0){
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
      var ep = "";
      try{ var _s = await self.registration.pushManager.getSubscription(); if(_s && _s.endpoint) ep = _s.endpoint; }catch(err){}
      var _u = "https://hkia-push.xiaojian-hk.workers.dev/push/pending/get" + (ep ? "?endpoint=" + encodeURIComponent(ep) : "");
      var r = await fetch(_u);
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
        // 已開咗主頁就唔開新窗，但要先跳去通知條 link（帶 ?highlight=）再 focus，
        // 否則舊頁面冇 highlight 參數，撳推送唔會跳去嗰班機（2026-10-21 修）。
        // navigate 唔得（例如未受控嘅舊窗）就跌返去淨 focus。
        if (c.url.indexOf("hkiaflight.html") !== -1 || c.url.indexOf("watch.html") !== -1 || c.url.indexOf("nld.html") !== -1) {
          if ("navigate" in c) return c.navigate(url).then(function(){ return c.focus(); }).catch(function(){ return c.focus(); });
          if ("focus" in c) return c.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

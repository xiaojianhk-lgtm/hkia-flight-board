/* HKIA flight board - 30-watch.js */
  /* ---------- 事件 ---------- */
  var q = $("q");
  q.addEventListener("input", function(){
    var v = q.value.trim();
    var mBay = /^([A-Za-z]?\d+)\+$/.exec(v);
    if(mBay){
      /* BAY+：淨係 arm 泊位提醒，唔過濾列表 */
      armWatch(mBay[1].toUpperCase());
      q.value = ""; query = "";
      $("qclear").parentElement.classList.remove("hasq");
      expanded = false; render();
      q.blur();
      return;
    }
    var mFlight = /^([A-Za-z]{2,}\d+)\+$/i.exec(v);
    if(mFlight){
      /* FLIGHT+：arm 指定航班泊位提醒，嗰班機一有 Bay 就彈 banner */
      armFlightWatch(mFlight[1].toUpperCase());
      q.value = ""; query = "";
      $("qclear").parentElement.classList.remove("hasq");
      expanded = false; render();
      q.blur();
      return;
    }
    query = q.value;
    $("qclear").parentElement.classList.toggle("hasq", !!q.value);
    expanded = false;
    render();
  });
  /* ---------- 泊位到位提醒（隱藏功能：搜尋欄輸入 BAY+） ---------- */
  var watchBays = {};  /* bay -> {seen:{...}}，可同時 watch 多個 */
  var WB_KEY = "hkia-watchbay-v1";
  function saveBayWatch(){
    try{ localStorage.setItem(WB_KEY, JSON.stringify({bays:watchBays})); }catch(e){}
  }
  function loadWatch(){
    try{
      var wb = JSON.parse(localStorage.getItem(WB_KEY) || "null");
      if(wb){
        if(wb.bays){ watchBays = wb.bays; }
        else if(wb.bay){ watchBays[wb.bay] = {seen:{}}; }  /* 舊單一格式遷移 */
      }
    }catch(e){}
  }
  function watchCount(){ return Object.keys(watchBays).length; }
  function flightsAt(bay){
    /* 注意：唔用 getLists()，因為嗰個會受搜尋 query／filter 影響；
       watch 要睇原始數據，唔理顯示緊咩 */
    var out = [];
    if(!DB || !DB.dates || !DB.days) return out;
    var target = DB.dates[dateIdx];
    var b = (bay || "").toUpperCase();
    Object.keys(DB.days).forEach(function(d){
      var day = DB.days[d];
      (day.arrival || []).forEach(function(f){
        if((effDate(f) || d) !== target) return;
        var st = (manualStand("arrival", f) || f.stand || "").toUpperCase();
        if(st === b || (f.stand_old || "").toUpperCase() === b) out.push({typ:"arrival", f:f});
      });
      (day.departure || []).forEach(function(f){
        if((effDate(f) || d) !== target) return;
        var st = (manualStand("departure", f) || f.stand || "").toUpperCase();
        if(st === b || (f.stand_old || "").toUpperCase() === b) out.push({typ:"departure", f:f});
      });
    });
    return out;
  }
  function armWatch(bay){
    /* arm 即刻拉一次新數據 */
    fetch("data.json?_="+Date.now(), {cache:"no-store"})
      .then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(d){
        if(d && d.generated_at && d.dates && d.days && d.generated_at !== DB.generated_at){
          DB = d;
          var hts = $("headTs"); if(hts) hts.textContent = d.generated_at || "—"; checkStale(d.generated_at);
          if(typeof buildDates==="function") buildDates(); render();
        }
        if(!watchBays[bay]) watchBays[bay] = {seen:{}};
        watchBays[bay].seen = {};
        flightsAt(bay).forEach(function(it){ watchBays[bay].seen[itemKey(it)] = 1; });
        saveBayWatch(); showWatchPill();
      })
      .catch(function(){
        if(!watchBays[bay]) watchBays[bay] = {seen:{}};
        watchBays[bay].seen = {};
        flightsAt(bay).forEach(function(it){ watchBays[bay].seen[itemKey(it)] = 1; });
        saveBayWatch(); showWatchPill();
      });
  }
  function disarmWatch(bay){
    if(bay){ delete watchBays[bay]; }
    else{ watchBays = {}; }
    saveBayWatch(); showWatchPill();
  }
  function showWatchPill(){
    var box = $("watchpills");
    box.innerHTML = "";
    Object.keys(watchBays).sort().forEach(function(bay){
      var d = document.createElement("div");
      d.className = "watchpill";
      d.innerHTML = "已關注 <span>"+esc(bay)+"</span> <button aria-label='取消提醒' data-unwatch='"+esc(bay)+"'>✕</button>";
      box.appendChild(d);
    });
    Object.keys(flightWatches).sort().forEach(function(fid){
      var d = document.createElement("div");
      d.className = "watchpill";
      var w = flightWatches[fid];
      var dateLabel = "";
      if(w.date){
        var parts = w.date.split("-");
        if(parts.length === 3) dateLabel = " " + parts[1] + "/" + parts[2];
      }
      d.innerHTML = "已關注 <span>"+esc(fid)+dateLabel+"</span> <button aria-label='取消提醒' data-unwatchflight='"+esc(fid)+"'>✕</button>";
      box.appendChild(d);
    });
    box.hidden = !(watchCount() || flightWatchCount());
    setBarH();
  }
  function checkBayWatch(){
    if(!watchCount() || !DB) return;
    var allFresh = [];
    Object.keys(watchBays).forEach(function(bay){
      var seen = watchBays[bay].seen || (watchBays[bay].seen = {});
      var cur = flightsAt(bay), curKeys = {}, fresh = [];
      cur.forEach(function(it){
        var k = itemKey(it); curKeys[k] = 1;
        if(!seen[k]) fresh.push({bay:bay, typ:it.typ, f:it.f});
      });
      Object.keys(seen).forEach(function(k){ if(!curKeys[k]) delete seen[k]; });
      cur.forEach(function(it){ seen[itemKey(it)] = 1; });
      if(fresh.length) allFresh = allFresh.concat(fresh);
    });
    saveBayWatch();
    if(allFresh.length) bayAlert(allFresh);
  }
  /* 統一提醒隊列：同一輪檢查有多個觸發，一次過顯示，唔互相覆蓋 */
  var pendingAlerts = [];
  function queueAlert(title, html){
    pendingAlerts.push({title:title, html:html});
  }
  function flushAlerts(){
    if(!pendingAlerts.length) return;
    var html = pendingAlerts.map(function(a){
      return "<div style='margin-bottom:10px'><div style='font-weight:700;color:var(--accent);margin-bottom:4px'>"+a.title+"</div>"+a.html+"</div>";
    }).join("");
    document.querySelector("#watchalert .wa-title").innerHTML = "🔔 提醒";
    $("waList").innerHTML = html;
    $("watchalert").hidden = false;
    pendingAlerts = [];
  }
  function bayAlert(list){
    /* 按 bay 分組顯示；淨彈 banner，唔響唔震；
       每組按時間排序；淨顯示主要航班編號（唔顯示聯合航班號） */
    var byBay = {};
    list.forEach(function(it){
      (byBay[it.bay] = byBay[it.bay] || []).push(it);
    });
    var bayNames = Object.keys(byBay).sort().join("、");
    var html = Object.keys(byBay).sort().map(function(bay){
      var items = byBay[bay].slice().sort(function(a, b){
        return toMin(eff(a.f)) - toMin(eff(b.f));
      });
      return "<div style='margin-bottom:4px'><b>"+esc(bay)+"</b></div>" + items.map(function(it){
        return "<div><b>"+esc(opId(it.f))+"</b> "+(it.typ === "arrival" ? "到港" : "離港")+" · "+esc(eff(it.f))+"</div>";
      }).join("");
    }).join("");
    queueAlert("🅿️ "+esc(bayNames)+" 有航班到位", html);
  }
  $("waOk").addEventListener("click", function(){ $("watchalert").hidden = true; });
  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest("[data-unwatch]");
    if(b){ disarmWatch(b.getAttribute("data-unwatch")); }
    var f = e.target.closest && e.target.closest("[data-unwatchflight]");
    if(f){ disarmFlightWatch(f.getAttribute("data-unwatchflight")); }
  });

  /* ---------- 指定航班泊位提醒（隱藏功能：搜尋欄輸入 FLIGHT@） ---------- */
  var flightWatches = {};  /* flightId -> {seenBay:""} */
  var FW_KEY = "hkia-flightwatch-v1";
  function saveFlightWatch(){
    try{ localStorage.setItem(FW_KEY, JSON.stringify({flights:flightWatches})); }catch(e){}
  }
  function loadFlightWatch(){
    try{
      var fw = JSON.parse(localStorage.getItem(FW_KEY) || "null");
      if(fw && fw.flights) flightWatches = fw.flights;
    }catch(e){}
  }
  function flightWatchCount(){ return Object.keys(flightWatches).length; }
  function findFlight(fid, date){
    /* 喺指定日期搵航班；唔用 getLists()，唔受 filter 影響 */
    if(!DB || !DB.dates || !DB.days) return null;
    var target = date || DB.dates[dateIdx];
    var fidU = (fid || "").toUpperCase();
    var found = null;
    Object.keys(DB.days).forEach(function(d){
      if(found) return;
      var day = DB.days[d];
      [["arrival", day.arrival || []], ["departure", day.departure || []]].forEach(function(pair){
        if(found) return;
        pair[1].forEach(function(f){
          if(found) return;
          if((effDate(f) || d) !== target) return;
          if(opId(f).toUpperCase() === fidU) found = {typ:pair[0], f:f};
        });
      });
    });
    return found;
  }
  function flightBay(f){
    return (manualStand("arrival", f) || manualStand("departure", f) || f.stand || "").toUpperCase();
  }
  function armFlightWatch(fid){
    var target = DB && DB.dates ? DB.dates[dateIdx] : "";
    var it = findFlight(fid, target);
    var bay = it ? flightBay(it.f) : "";
    flightWatches[fid] = { seenBay: bay, date: target };
    saveFlightWatch(); showWatchPill();
  }
  function disarmFlightWatch(fid){
    if(fid){ delete flightWatches[fid]; }
    else{ flightWatches = {}; }
    saveFlightWatch(); showWatchPill();
  }
  function checkFlightWatch(){
    if(!flightWatchCount() || !DB) return;
    var fresh = [];
    Object.keys(flightWatches).forEach(function(fid){
      var w = flightWatches[fid];
      var it = findFlight(fid, w.date);
      if(!it) return;
      var bay = flightBay(it.f);
      if(bay && bay !== "—" && bay !== w.seenBay){
        /* 新有 Bay（或轉咗 Bay） */
        fresh.push({fid:fid, typ:it.typ, f:it.f, bay:bay});
        w.seenBay = bay;
      }else if(!bay || bay === "—"){
        w.seenBay = "";
      }
    });
    saveFlightWatch();
    if(fresh.length) flightAlert(fresh);
  }
  function flightAlert(list){
    var html = list.map(function(it){
      var dateLabel = "";
      var w = flightWatches[it.fid];
      if(w && w.date){
        var parts = w.date.split("-");
        if(parts.length === 3) dateLabel = " (" + parts[1] + "/" + parts[2] + ")";
      }
      return "<div style='margin-bottom:6px'><b>"+esc(it.fid)+"</b>"+esc(dateLabel)+" "+(it.typ === "arrival" ? "到港" : "離港")+"</div>"+
        "<div>時間：<b>"+esc(eff(it.f))+"</b></div>"+
        "<div>泊位：<b>"+esc(it.bay)+"</b></div>";
    }).join("");
    queueAlert("🔔 指定航班已有泊位", html);
  }

  /* ---- 機場降雨提醒 ---- */
  var RAIN_KEY = "hkia-rain-watch-v1";
  var rainWatch = { on:false, alertedAt:"" };
  try{
    var rw = JSON.parse(localStorage.getItem(RAIN_KEY) || "null");
    if(rw && typeof rw.on === "boolean") rainWatch = rw;
  }catch(e){}
  function saveRainWatch(){ try{ localStorage.setItem(RAIN_KEY, JSON.stringify(rainWatch)); }catch(e){} }
  function updateRainBtn(){
    var b = $("rainWatch");
    if(b) b.classList.toggle("on", !!rainWatch.on);
  }
  function checkRainWatch(){
    if(!rainWatch.on) return;
    fetch("https://api.open-meteo.com/v1/forecast?latitude=22.308&longitude=113.915&hourly=precipitation_probability&timezone=Asia%2FHong_Kong&forecast_days=2")
      .then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(d){
        var times = (d.hourly||{}).time || [], probs = (d.hourly||{}).precipitation_probability || [];
        var now = new Date();
        var maxP = 0, maxT = "";
        for(var i=0;i<times.length;i++){
          var t = new Date(times[i]);
          var diffH = (t - now)/3600000;
          if(diffH >= 0 && diffH <= 3){
            if(probs[i] > maxP){ maxP = probs[i]; maxT = times[i]; }
          }
        }
        if(maxP >= 50){
          /* 同一場雨唔重複彈：記住觸發嗰個鐘 */
          if(rainWatch.alertedAt !== maxT){
            rainWatch.alertedAt = maxT; saveRainWatch();
            rainAlert(maxP, maxT); flushAlerts();
          }
        }else{
          if(rainWatch.alertedAt){ rainWatch.alertedAt = ""; saveRainWatch(); }
        }
      })
      .catch(function(){});
  }
  function rainAlert(prob, isoTime){
    var d = new Date(isoTime);
    var hh = ("0"+d.getHours()).slice(-2), mm = ("0"+d.getMinutes()).slice(-2);
    var html = "<div>最高機率 <b>"+prob+"%</b>（約 "+hh+":"+mm+"）</div><div style='color:var(--muted);font-size:12px;margin-top:4px'>資料來源：Open-Meteo 預報</div>";
    queueAlert("🌧 機場未來 3 小時可能有雨", html);
  }
  $("rainWatch").addEventListener("click", function(){
    rainWatch.on = !rainWatch.on;
    if(!rainWatch.on) rainWatch.alertedAt = "";
    saveRainWatch(); updateRainBtn();
    if(rainWatch.on) checkRainWatch();
  });
  updateRainBtn();

  /* ---------- 天文台警告 banner（打風／暴雨先顯示） ---------- */
  function checkHkoWarn(){
    var el = $("hkoWarn");
    fetch("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=tc", {cache:"no-store"})
      .then(function(r){ return r.json(); })
      .then(function(d){
        var show = [];
        Object.keys(d || {}).forEach(function(k){
          var w = d[k] || {};
          var code = (w.code || "").toUpperCase();
          var name = w.name || "";
          /* 打風信號、暴雨警告、雷暴警告先顯示 */
          if(/^TC\d/.test(code) || code.indexOf("WTC") === 0 ||
             code === "WRAINA" || code === "WRAINR" || code === "WRAINB" ||
             code === "WTS"){
            var label = name;
            if(w.type) label += w.type;
            show.push(label);
          }
        });
        if(show.length){
          el.innerHTML = "⚠️ " + show.map(esc).join("、") + " <span style='font-weight:400;opacity:.7'>（航班可能受影響）</span>";
          el.hidden = false;
        }else{
          el.hidden = true;
        }
      })
      .catch(function(){ el.hidden = true; });
  }
  checkHkoWarn();
  setInterval(checkHkoWarn, 15 * 60 * 1000);

  /* ---------- 機場溫度（天文台 rhrread，赤鱲角） ---------- */
  function checkHkoTemp(){
    var el = $("hkoTempTx");
    if(!el) el = $("hkoTemp");
    if(!el) return;
    fetch("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc", {cache:"no-store"})
      .then(function(r){ return r.json(); })
      .then(function(d){
        var found = null;
        (d.temperature && d.temperature.data || []).forEach(function(t){
          if(t.place === "赤鱲角") found = t.value;
        });
        /* 加埋天文台更新時間，等用戶知個數係新鮮嘅 */
        var tm = "";
        try{
          var m = /T(\d{2}):(\d{2})/.exec(d.updateTime || "");
          if(m) tm = " " + m[1] + ":" + m[2];
        }catch(e){}
        el.textContent = "赤鱲角 " + (found !== null ? found + "°C" + tm : "—°C");
      })
      .catch(function(){ el.textContent = "赤鱲角 —°C"; });
  }
  checkHkoTemp();
  setInterval(checkHkoTemp, 15 * 60 * 1000);
  window.__hkiaCheckTemp = checkHkoTemp; /* 俾下拉更新手動觸發 */
  /* PWA 切返嚟（重開）都更新溫度 */
  document.addEventListener("visibilitychange", function(){
    if(!document.hidden) checkHkoTemp();
  });

  /* 密碼版本驗證：開頁嗰陣對一次 auth.json */
  if(window.__hkiaVerifyAuth) window.__hkiaVerifyAuth();

  loadWatch(); loadFlightWatch();

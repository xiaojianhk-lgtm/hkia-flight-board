/* HKIA flight board - 30-watch.js */
  /* ---------- 事件 ---------- */
  var q = $("q");
  q.addEventListener("input", function(){
    var v = q.value.trim();
    /* 暗號入夜班頁 */
    if(v === "Cargo3577"){
      q.value = ""; query = "";
      $("qclear").parentElement.classList.remove("hasq");
      location.href = "nld.html";
      return;
    }
    /* T1M 專頁關閉提醒／推送功能：+/@ 唔 arm，直接提示 */
    if(window.__T1M_NO_WATCH && /^([A-Za-z]?\d+|[A-Za-z0-9]{2,}\d+)[@+]$/i.test(v)){
      showToast("T1M 專頁不設提醒功能");
      q.value = ""; query = "";
      $("qclear").parentElement.classList.remove("hasq");
      expanded = false; render();
      q.blur();
      return;
    }
    /* BAY@：靜默加入 bay 關注（唔顯示 pill，淨係去關注頁睇） */
    var mBayAt = /^([A-Za-z]?\d+)@$/.exec(v);
    if(mBayAt){
      armWatch(mBayAt[1].toUpperCase(), true);
      showToast("已添加 " + mBayAt[1].toUpperCase(), true);
      q.value = ""; query = "";
      $("qclear").parentElement.classList.remove("hasq");
      expanded = false; render();
      q.blur();
      return;
    }
    /* FLIGHT@：靜默加入航班關注 */
    var mFlightAt = /^([A-Za-z0-9]{2,}\d+)@$/i.exec(v);
    if(mFlightAt){
      armFlightWatch(mFlightAt[1].toUpperCase(), true);
      showToast("已添加 " + mFlightAt[1].toUpperCase(), true);
      q.value = ""; query = "";
      $("qclear").parentElement.classList.remove("hasq");
      expanded = false; render();
      q.blur();
      return;
    }
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
    var mFlight = /^([A-Za-z0-9]{2,}\d+)\+$/i.exec(v);
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
    if(window.__T1M_NO_WATCH) return;
    try{
      var wb = JSON.parse(localStorage.getItem(WB_KEY) || "null");
      if(wb){
        if(wb.bays){ watchBays = wb.bays; }
        else if(wb.bay){ watchBays[wb.bay] = {seen:{}}; }  /* 舊單一格式遷移 */
      }
    }catch(e){}
  }
  function watchCount(){ return Object.keys(watchBays).length; }
  /* bay watch seen key：日期釘死 arm 嗰陣嘅日期，唔跟住而家睇緊邊日郁（舊 watch 冇 .date 就跌返現行 tab 日期） */
  function baySeenKey(it, dateStr){ return (dateStr || "") + "|" + it.typ + "|" + opId(it.f); }
  function bayWatchDate(bay){ return (watchBays[bay] && watchBays[bay].date) || (DB && DB.dates ? DB.dates[dateIdx] : ""); }
  function flightsAt(bay, dateOverride){
    /* 注意：唔用 getLists()，因為嗰個會受搜尋 query／filter 影響；
       watch 要睇原始數據，唔理顯示緊咩 */
    var out = [];
    if(!DB || !DB.dates || !DB.days) return out;
    var target = dateOverride || DB.dates[dateIdx];
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
  function armWatch(bay, silent){
    if(window.__T1M_NO_WATCH) return;
    /* arm 即刻拉一次新數據 */
    fetchDataJson()
      .then(function(d){
        if(d && d.generated_at && d.dates && d.days && (!DB || d.generated_at !== DB.generated_at)){
          DB = d;
          var hts = $("headTs"); if(hts) hts.textContent = d.generated_at || "—"; checkStale(d.generated_at);
          if(typeof buildDates==="function") buildDates(); render();
        }
        if(!watchBays[bay]) watchBays[bay] = {seen:{}};
        watchBays[bay].seen = {};
        watchBays[bay].silent = !!silent;
        watchBays[bay].date = (DB && DB.dates) ? DB.dates[dateIdx] : "";
        flightsAt(bay, watchBays[bay].date).forEach(function(it){ watchBays[bay].seen[baySeenKey(it, watchBays[bay].date)] = 1; });
        saveBayWatch(); if(!silent) showWatchPill();
        if(!silent) pushWatchAdd("bay", bay);
      })
      .catch(function(){
        if(!watchBays[bay]) watchBays[bay] = {seen:{}};
        watchBays[bay].seen = {};
        watchBays[bay].silent = !!silent;
        watchBays[bay].date = (DB && DB.dates) ? DB.dates[dateIdx] : "";
        flightsAt(bay, watchBays[bay].date).forEach(function(it){ watchBays[bay].seen[baySeenKey(it, watchBays[bay].date)] = 1; });
        saveBayWatch(); if(!silent) showWatchPill();
        if(!silent) pushWatchAdd("bay", bay);
      });
  }
  function disarmWatch(bay){
    if(bay){ delete watchBays[bay]; pushWatchRemove("bay", bay); }
    else{ 
      Object.keys(watchBays).forEach(function(b){ pushWatchRemove("bay", b); });
      watchBays = {}; 
    }
    saveBayWatch(); showWatchPill();
  }
  function showWatchPill(){
    if(window.__T1M_NO_WATCH) return;
    var box = $("watchpills");
    box.innerHTML = "";
    Object.keys(watchBays).sort().forEach(function(bay){
      if(watchBays[bay].silent) return;  /* @ 靜默加入嘅唔顯示 pill */
      var d = document.createElement("div");
      d.className = "watchpill";
      d.innerHTML = "已關注 <span>"+esc(bay)+"</span> <button aria-label='取消提醒' data-unwatch='"+esc(bay)+"'>✕</button>";
      box.appendChild(d);
    });
    Object.keys(flightWatches).sort().forEach(function(fid){
      var w = flightWatches[fid];
      if(w.silent) return;  /* @ 靜默加入嘅唔顯示 pill */
      var d = document.createElement("div");
      d.className = "watchpill";
      var dateLabel = "";
      if(w.date){
        var parts = w.date.split("-");
        if(parts.length === 3) dateLabel = " " + parts[1] + "/" + parts[2];
      }
      var dispFid = fid.split("|")[0];
      d.innerHTML = "已關注 <span class='gotoflight' data-gotoflight='"+esc(dispFid)+"' style='cursor:pointer;text-decoration:underline;'>"+esc(dispFid)+dateLabel+"</span> <button aria-label='取消提醒' data-unwatchflight='"+esc(fid)+"'>✕</button>";
      box.appendChild(d);
    });
    var hasVisible = Object.keys(watchBays).some(function(b){ return !watchBays[b].silent; }) ||
                     Object.keys(flightWatches).some(function(f){ return !flightWatches[f].silent; });
    box.hidden = !hasVisible;
    updatePillToggle();
    setBarH();
  }
  /* 關注 pill 收合/展開：超過一行先出掣，掣同 pills 同一行 */
  function updatePillToggle(){
    var box = $("watchpills");
    if(!box) return;
    var btn = $("pilltogglebtn");
    if(!btn){
      btn = document.createElement("button");
      btn.id = "pilltogglebtn";
      btn.setAttribute("aria-label", "展開或收起關注");
      box.appendChild(btn);
    }
    if(box.hidden){ btn.style.display = "none"; return; }
    /* 全部顯示，量度邊啲 pill 跌咗落第二行 */
    var pills = Array.prototype.slice.call(box.querySelectorAll(".watchpill"));
    pills.forEach(function(p){ p.classList.remove("rowhide"); });
    btn.style.display = "";
    var firstTop = null, beyond = [];
    pills.forEach(function(p){
      if(p.hidden) return;
      if(firstTop === null) firstTop = p.offsetTop;
      else if(p.offsetTop > firstTop + 4) beyond.push(p);
    });
    if(!beyond.length){ btn.style.display = "none"; return; }
    var pref = null;
    try{ pref = localStorage.getItem("hkia-pill-collapse"); }catch(e){}
    var collapsed = (pref === null) ? true : (pref === "1");
    function apply(c){
      beyond.forEach(function(p){ p.classList.toggle("rowhide", c); });
      var n = pills.filter(function(p){ return !p.hidden; }).length;
      btn.textContent = c ? ("+" + n) : "▲";
      btn.setAttribute("aria-label", c ? ("展開全部 " + n + " 個關注") : "收起");
    }
    apply(collapsed);
    btn.onclick = function(){
      collapsed = !collapsed;
      try{ localStorage.setItem("hkia-pill-collapse", collapsed ? "1" : "0"); }catch(e){}
      apply(collapsed);
      setBarH();
    };
  }
  function checkBayWatch(){
    if(window.__T1M_NO_WATCH) return;
    if(!watchCount() || !DB) return;
    var allFresh = [];
    Object.keys(watchBays).forEach(function(bay){
      var seen = watchBays[bay].seen || (watchBays[bay].seen = {});
      var bd = bayWatchDate(bay);
      var cur = flightsAt(bay, bd), curKeys = {}, fresh = [];
      cur.forEach(function(it){
        var k = baySeenKey(it, bd); curKeys[k] = 1;
        if(!seen[k]) fresh.push({bay:bay, typ:it.typ, f:it.f});
      });
      Object.keys(seen).forEach(function(k){ if(!curKeys[k]) delete seen[k]; });
      cur.forEach(function(it){ seen[baySeenKey(it, bd)] = 1; });
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
    if(b){ disarmWatch(b.getAttribute("data-unwatch")); return; }
    var f = e.target.closest && e.target.closest("[data-unwatchflight]");
    if(f){ disarmFlightWatch(f.getAttribute("data-unwatchflight")); return; }
    /* 撳 pill 跳去航班＋高亮 */
    var g = e.target.closest && e.target.closest("[data-gotoflight]");
    if(g){
      e.preventDefault();
      gotoFlight(g.getAttribute("data-gotoflight"));
      return;
    }
    /* 撳其他地方取消高亮 */
    clearFlightHighlight();
  });

  /* 跳去指定航班＋高亮航班編號（M1：跨日自動切 tab；目標日存在但被篩選遮住就明講原因） */
  function gotoFlight(fid){
    clearFlightHighlight();
    if(!window.lastItems) return;
    var findIdx = function(){
      for(var i=0; i<lastItems.length; i++){
        try{
          if(opId(lastItems[i].f).toUpperCase() === fid.toUpperCase()){ return i; }
        }catch(e){}
      }
      return -1;
    };
    var goRow = function(idx){
      var row = document.querySelector("tr.rw[data-k='"+idx+"']");
      if(!row){ showToast("搵唔到 " + fid); return; }
      row.scrollIntoView({block:"center", behavior:"smooth"});
      var fidTxt = row.querySelector("td.fid .fidtxt");
      if(fidTxt) fidTxt.classList.add("hl");
    };
    var idx = findIdx();
    if(idx < 0 && !expanded){
      expanded = true; render();
      idx = findIdx();
    }
    if(idx >= 0){ goRow(idx); return; }
    /* 跨日：先跟 watch 本身釘死嘅日期（最準），再掃三日 */
    var targetIdx = -1;
    var fidKey = (fid || "").toUpperCase().replace(/\s/g, "");
    try{
      Object.keys(flightWatches).forEach(function(k){
        if(targetIdx >= 0) return;
        var p = k.split("|");
        if(p[0] === fidKey && flightWatches[k] && flightWatches[k].date){
          var di = DB.dates.indexOf(flightWatches[k].date);
          if(di >= 0) targetIdx = di;
        }
      });
    }catch(e){}
    if(targetIdx < 0 && DB && DB.dates){
      for(var d=0; d<DB.dates.length; d++){
        if(d === dateIdx) continue;
        try{ if(findFlight(fid, DB.dates[d])){ targetIdx = d; break; } }catch(e){}
      }
    }
    if(targetIdx < 0){
      showToast("搵唔到 " + fid + "（可能唔喺呢三日／已取消）");
      return;
    }
    if(targetIdx !== dateIdx){
      dateIdx = targetIdx; expanded = false; detailKey = null;
      try{ buildDates(); }catch(e){}
      render();
    }
    idx = findIdx();
    if(idx < 0 && !expanded){
      expanded = true; render();
      idx = findIdx();
    }
    if(idx >= 0){ goRow(idx); return; }
    var onDate = false;
    try{ onDate = !!(DB && DB.dates && findFlight(fid, DB.dates[dateIdx])); }catch(e){}
    if(onDate) showToast(fid + " 喺" + (DATE_NAMES[dateIdx] || "") + "，但被而家嘅篩選遮住咗");
    else showToast("搵唔到 " + fid);
  }
  function clearFlightHighlight(){
    var els = document.querySelectorAll(".fidtxt.hl");
    for(var i=0; i<els.length; i++) els[i].classList.remove("hl");
  }

  /* ---------- 指定航班泊位提醒（隱藏功能：搜尋欄輸入 FLIGHT@） ---------- */
  var flightWatches = {};  /* flightId -> {seenBay:""} */

  var PUSH_WORKER = "https://hkia-push.xiaojian-hk.workers.dev";
  var PUSH_TOKEN = "18d17be5005c63145881b72855c6851e575f68f5f7456d915ce0b22a067cf0aa";
  function pushWatchAdd(type, value, date, seenBay, dir, quiet){
    try{
      (async function(){
        var endpoint = "";
        try{
          var reg = await navigator.serviceWorker.ready;
          var sub = await reg.pushManager.getSubscription();
          if(sub) endpoint = sub.endpoint || "";
        }catch(e){}
        if(!endpoint){
          if(!quiet){ try{ showToast("請先去關於頁啟用推送通知"); }catch(e){} }
          return;
        }
        fetch(PUSH_WORKER + "/push/watch/add", {
          method: "POST", headers: { "Content-Type": "application/json", "X-API-Token": PUSH_TOKEN },
          body: JSON.stringify((function(){ var _d=""; try{ _d=localStorage.getItem("hkia-device-id")||""; }catch(e){} return { type: type, value: value, deviceId: _d, date: date || "", seenBay: seenBay || "", dir: dir || "" }; })())
        }).catch(function(){});
      })();
    }catch(e){}
  }
  function pushWatchRemove(type, value, dir){
    try{
      (async function(){
        var id = type + ":" + (value || "").toUpperCase().replace(/\s/g, "") + (dir ? ":" + dir : "");
        fetch(PUSH_WORKER + "/push/watch/remove", {
          method: "POST", headers: { "Content-Type": "application/json", "X-API-Token": PUSH_TOKEN },
          body: JSON.stringify((function(){ var _d=""; try{ _d=localStorage.getItem("hkia-device-id")||""; }catch(e){} return { id: id, deviceId: _d }; })())
        }).catch(function(){});
      })();
    }catch(e){}
  }

  var FW_KEY = "hkia-flightwatch-v1";
  function saveFlightWatch(){
    try{ localStorage.setItem(FW_KEY, JSON.stringify({flights:flightWatches})); }catch(e){}
  }
  function loadFlightWatch(){
    if(window.__T1M_NO_WATCH) return;
    try{
      var fw = JSON.parse(localStorage.getItem(FW_KEY) || "null");
      if(fw && fw.flights) flightWatches = fw.flights;
      // 自動清理：冇日期嘅殭屍 watch 同日期已過（早過今日）嘅 watch 自動刪除
      var todayStr = new Date(Date.now() + 8*3600*1000).toISOString().slice(0, 10); /* HKT 今日（同 Worker todayHKT 一致） */
      var changed = false;
      Object.keys(flightWatches).forEach(function(fid){
        var w = flightWatches[fid];
        if(w && (!w.date || w.date < todayStr)){
          delete flightWatches[fid];
          changed = true;
          try{ var p = (fid || "").split("|"); pushWatchRemove("flight", p[0], p[1] || ""); }catch(e){}
        }
      });
      if(changed) saveFlightWatch();
    }catch(e){}
  }
  function flightWatchCount(){ return Object.keys(flightWatches).length; }
  function findFlight(fid, date, typ){
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
        if(typ && pair[0] !== typ) return;
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
  function armFlightWatch(fid, silent){
    if(window.__T1M_NO_WATCH) return;
    fid = (fid || "").toUpperCase().replace(/\s/g, "");
    var target = DB && DB.dates ? DB.dates[dateIdx] : "";
    if(!target){ if(!silent) showToast("數據載入緊，稍後再試"); return; }  /* L2：DB 未載入就唔 arm，免留冇日期嘅殭屍 watch */
    var it = findFlight(fid, target);
    var bay = it ? flightBay(it.f) : "";
    var key = it ? fid + "|" + it.typ : fid;
    flightWatches[key] = { seenBay: bay, date: target, silent: !!silent };
    saveFlightWatch(); if(!silent) showWatchPill();
    if(!silent) pushWatchAdd("flight", fid, target, bay, it ? it.typ : "");
  }
  function disarmFlightWatch(fid){
    if(fid){ var p = (fid || "").split("|"); delete flightWatches[fid]; pushWatchRemove("flight", p[0], p[1] || ""); }
    else{ 
      Object.keys(flightWatches).forEach(function(f){ var p = (f || "").split("|"); pushWatchRemove("flight", p[0], p[1] || ""); });
      flightWatches = {}; 
    }
    saveFlightWatch(); showWatchPill();
  }
  function checkFlightWatch(){
    if(window.__T1M_NO_WATCH) return;
    if(!flightWatchCount() || !DB) return;
    var fresh = [];
    Object.keys(flightWatches).forEach(function(fid){
      var w = flightWatches[fid];
      if(w && !w.date) return;  /* L2：冇日期嘅殭屍 watch 唔觸發，等 loadFlightWatch 清理 */
      /* 遷移：舊 key（淨 fid）搵到方向就改名做 fid|typ；若新 key 已存在就淨刪舊 key（去重） */
      if(fid.indexOf("|") < 0 && DB){
        var mig = findFlight(fid, w.date);
        if(mig){
          var nk = fid + "|" + mig.typ;
          if(flightWatches[nk]){
            delete flightWatches[fid];
            try{ pushWatchRemove("flight", fid); }catch(e){}
            return; /* 去重：新 key 嗰次 iteration 會處理，呢次跳過免重複彈 */
          }else{
            flightWatches[nk] = w; delete flightWatches[fid];
            try{ pushWatchRemove("flight", fid); }catch(e){}
            try{ pushWatchAdd("flight", fid, w.date, w.seenBay, mig.typ, true); }catch(e){}
            fid = nk;
          }
        }
      }
      var parts = fid.split("|");
      var it = parts.length > 1 ? findFlight(parts[0], w.date, parts[1]) : findFlight(fid, w.date);
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
      return "<div style='margin-bottom:6px'><b>"+esc(it.fid.split("|")[0])+"</b>"+esc(dateLabel)+" "+(it.typ === "arrival" ? "到港" : "離港")+"</div>"+
        "<div>時間：<b>"+esc(eff(it.f))+"</b></div>"+
        "<div>泊位：<b>"+esc(it.bay)+"</b></div>";
    }).join("");
    queueAlert("🔔 指定航班已有泊位", html);
  }

  /* ---- 機場降雨提醒 ---- */
  var RAIN_KEY = "hkia-rain-watch-v1";
  var rainWatch = { on:true, alertedAt:"" };  /* 預設開，掣已移除 */
  try{
    var rw = JSON.parse(localStorage.getItem(RAIN_KEY) || "null");
    if(rw && typeof rw.on === "boolean") rainWatch = rw;
  }catch(e){}
  function saveRainWatch(){ try{ localStorage.setItem(RAIN_KEY, JSON.stringify(rainWatch)); }catch(e){} }
  function checkRainWatch(){
    if(!rainWatch.on) return;
    fetch("https://api.open-meteo.com/v1/forecast?latitude=22.308&longitude=113.915&minutely_15=precipitation&timezone=Asia%2FHong_Kong&forecast_days=2")
      .then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(d){
        var times = (d.minutely_15||{}).time || [], vals = (d.minutely_15||{}).precipitation || [];
        var nowMs = Date.now();
        var curVal = null, firstT = "", firstMin = 0, firstVal = 0;
        for(var i=0;i<times.length;i++){
          /* Open-Meteo times 係 HKT 無 offset 字串，唔好用本地時區解讀 */
          var tm = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(times[i] || "");
          var t = tm ? new Date(Date.UTC(+tm[1], +tm[2]-1, +tm[3], +tm[4]-8, +tm[5])) : new Date(times[i]);
          var diffMin = (t.getTime() - nowMs)/60000;
          var v = parseFloat(vals[i]); if(isNaN(v)) v = 0;
          if(diffMin > -15 && diffMin <= 0){
            /* 今格（15 分鐘格包含而家） */
            if(curVal === null || v > curVal) curVal = v;
          }else if(diffMin > 0 && diffMin <= 60){
            if(firstT === "" && v >= 0.2){ firstT = times[i]; firstMin = Math.round(diffMin); firstVal = v; }
          }
        }
        if(curVal !== null && curVal >= 0.2){
          /* 落緊雨：唔彈（睇到就多餘），事件未完唔 reset */
          return;
        }
        if(firstT !== ""){
          /* 未來 60 分鐘內有雨：同一場雨淨彈一次 */
          if(!rainWatch.alertedAt){
            rainWatch.alertedAt = firstT; saveRainWatch();
            rainAlert(firstMin, firstVal, firstT); flushAlerts();
          }
        }else{
          if(rainWatch.alertedAt){ rainWatch.alertedAt = ""; saveRainWatch(); }
        }
      })
      .catch(function(){});
  }
  function rainAlert(mins, val, isoTime){
    var d = new Date(isoTime);
    var hh = ("0"+d.getHours()).slice(-2), mi = ("0"+d.getMinutes()).slice(-2);
    var html = "<div>預報雨量 <b>"+val+" mm</b>（約 "+hh+":"+mi+"）</div><div style='color:var(--muted);font-size:12px;margin-top:4px'>資料來源：Open-Meteo 預報</div>";
    queueAlert("🌧 機場約 "+mins+" 分鐘後有雨", html);
  }


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
  var lastTempFetch = 0;
  function checkHkoTemp(){
    var el = $("hkoTempTx");
    if(!el) el = $("hkoTemp");
    if(!el) return;
    lastTempFetch = Date.now();
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
  /* 超過 12 分鐘冇攞過就補攞（對付 iOS 背景 throttle） */
  function maybeRefreshTemp(){
    if(Date.now() - lastTempFetch > 12 * 60 * 1000) checkHkoTemp();
  }
  checkHkoTemp();
  setInterval(checkHkoTemp, 15 * 60 * 1000);
  window.__hkiaCheckTemp = checkHkoTemp; /* 俾下拉更新手動觸發 */
  /* PWA 切返嚟（重開）都更新溫度 */
  document.addEventListener("visibilitychange", function(){
    if(!document.hidden) maybeRefreshTemp();
  });
  /* 用戶郁個頁（碌／撳）嗰陣，如果溫度舊都補攞 */
  document.addEventListener("touchstart", maybeRefreshTemp, {passive:true});
  document.addEventListener("scroll", maybeRefreshTemp, {passive:true});

  /* 密碼版本驗證：開頁嗰陣對一次 Worker auth API */
  if(window.__hkiaVerifyAuth) window.__hkiaVerifyAuth();

  loadWatch(); loadFlightWatch();

  /* Web Push 撳入嚟：?highlight=CX479，跳去嗰班機＋高亮（同撳 pill 一樣） */
  (function(){
    try{
      var m = location.search.match(/[?&]highlight=([^&]+)/);
      if(!m) return;
      var hl = decodeURIComponent(m[1]).toUpperCase();
      var tries = 0;
      var timer = setInterval(function(){
        tries++;
        if(window.lastItems && window.lastItems.length > 0){
          clearInterval(timer);
          if(/^[A-Z]{2}\d+/.test(hl)){
            gotoFlight(hl);
          }else{
            try{
              var sb = document.getElementById("q");
              if(sb){ sb.value = hl; sb.dispatchEvent(new Event("input")); }
            }catch(e){}
          }
          try{ history.replaceState(null, "", location.pathname); }catch(e){}
        }else if(tries > 50){
          clearInterval(timer);
        }
      }, 200);
    }catch(e){}
  })();

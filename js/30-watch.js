/* HKIA flight board - 30-watch.js */
  /* ---------- 事件 ---------- */
  var q = $("q");
  if(q) q.addEventListener("input", function(){
    var v = q.value.trim();
    /* 暗號入夜班頁 */
    if(v === "Cargo3577"){
      q.value = ""; query = "";
      $("qclear").parentElement.classList.remove("hasq");
      location.href = "nld.html";
      return;
    }
    /* 暗號開機尾號匯入（v225，本地專用；其他頁會由 regOpenImport 提示只限主頁） */
    if(v === "Callsign3577"){
      q.value = ""; query = "";
      $("qclear").parentElement.classList.remove("hasq");
      try{ if(typeof regOpenImport === "function") regOpenImport(); }catch(e){}
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
      /* H8：armWatch 係異步，等佢回傳結果先 toast——DB 未載入／arm 失敗嗰陣唔好假話「已添加」 */
      var bayAt = mBayAt[1].toUpperCase();
      var pBay = armWatch(bayAt, true);
      if(pBay && typeof pBay.then === "function"){
        pBay.then(function(ok){ showToast(ok ? ("已添加 " + bayAt) : ("未能添加 " + bayAt), true); },
                  function(){ showToast("未能添加 " + bayAt, true); });
      }else{
        showToast(pBay ? ("已添加 " + bayAt) : ("未能添加 " + bayAt), true);
      }
      q.value = ""; query = "";
      $("qclear").parentElement.classList.remove("hasq");
      expanded = false; render();
      q.blur();
      return;
    }
    /* FLIGHT@：靜默加入航班關注 */
    var mFlightAt = /^([A-Za-z0-9]{2,}\d+)@$/i.exec(v);
    if(mFlightAt){
      /* M10＋H7/H8：armFlightWatch 而家係異步（先 fetch 新數據），等結果返嚟先 toast；
         arm 失敗（三日都無呢班機／數據載入唔到）就唔好話「已添加」 */
      var fidAt = mFlightAt[1].toUpperCase();
      var pF = armFlightWatch(fidAt, true);
      if(pF && typeof pF.then === "function"){
        pF.then(function(okF){ showToast(okF ? ("已添加 " + fidAt) : "呢三日無呢班機", true); },
                function(){ showToast("未能添加 " + fidAt, true); });
      }else{
        showToast(pF ? ("已添加 " + fidAt) : "呢三日無呢班機", true);
      }
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
    query = v;
    $("qclear").parentElement.classList.toggle("hasq", !!q.value);
    expanded = false;
    render();
  });
  /* ---------- 泊位到位提醒（隱藏功能：搜尋欄輸入 BAY+） ---------- */
  var watchBays = {};  /* bay -> {seen:{...}}，可同時 watch 多個 */
  /* M11：bay watch seen key 缺失 grace 計數（bay -> {seenKey: 連續缺失轉數}），淨係放喺記憶體，唔寫入 localStorage */
  var bayMiss = {};
  var WB_KEY = "hkia-watchbay-v1";
  function saveBayWatch(){
    try{ localStorage.setItem(WB_KEY, JSON.stringify({bays:watchBays})); }catch(e){}
  }
  function loadWatch(){
    if(window.__T1M_NO_WATCH) return;
    try{
      var wb = JSON.parse(localStorage.getItem(WB_KEY) || "null");
      /* M9：載入值唔係純物件就唔接受，免得損壞數據拖垮成個檢查 */
      if(wb && typeof wb === "object"){
        if(wb.bays && typeof wb.bays === "object" && !Array.isArray(wb.bays)){ watchBays = wb.bays; }
        else if(wb.bay){ watchBays[wb.bay] = {seen:{}}; }  /* 舊單一格式遷移 */
      }
      /* M7：清理過期 bay watch——date 早過數據窗口第一日（DB.dates[0]，即係尋日）；
         DB 未載入嗰陣用 HKT 尋日計，效果一樣。M9：損壞值（唔係物件）一併清走。
         H6：留一日 grace——班機延誤轆去下一日嗰陣，armDate 本身已跌出窗口但班機仲喺窗口內
         （armDate+1），唔好喺 load 嗰陣刪咗佢；checkBayWatch 會喺覆蓋範圍全部跌出先刪。 */
      var cutoff = "";
      if(DB && DB.dates && DB.dates.length){ cutoff = DB.dates[0]; }
      else{
        var _t = new Date(Date.now() + 8*3600*1000);
        _t.setUTCDate(_t.getUTCDate() - 1);
        cutoff = _t.toISOString().slice(0, 10);
      }
      var changed = false;
      Object.keys(watchBays).forEach(function(bay){
        var wbv = watchBays[bay];
        if(!wbv || typeof wbv !== "object"){ delete watchBays[bay]; changed = true; return; }
        var wd = wbv.date || "";
        var wdNext = wd ? (addDaysStr(wd, 1) || wd) : "";
        if(wd && wdNext < cutoff){ delete watchBays[bay]; if(bayMiss[bay]) delete bayMiss[bay]; changed = true; }
      });
      if(changed) saveBayWatch();
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
        /* H6：記低每班機嘅實際日期（date＝effDate＝target）同原定日期（sdate＝bucket），
           checkBayWatch 嘅 seen key 要跟實際日期走，唔係跟 armDate */
        if(st === b || (f.stand_old || "").toUpperCase() === b) out.push({typ:"arrival", f:f, date:target, sdate:d});
      });
      (day.departure || []).forEach(function(f){
        if((effDate(f) || d) !== target) return;
        var st = (manualStand("departure", f) || f.stand || "").toUpperCase();
        if(st === b || (f.stand_old || "").toUpperCase() === b) out.push({typ:"departure", f:f, date:target, sdate:d});
      });
    });
    return out;
  }
  /* H6：日期加減（ISO 日期字串，唔合格式回傳 ""） */
  function addDaysStr(dateStr, n){
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || "");
    if(!m) return "";
    var t = Date.UTC(+m[1], +m[2]-1, +m[3]) + n * 86400000;
    return new Date(t).toISOString().slice(0, 10);
  }
  /* H6：bay watch 檢查／快照範圍——armDate 前後一日，夾返 3 日數據窗口。
     armDate 唔知（舊 watch 冇 .date）就成個窗口都掃。 */
  function bayWatchDates(armDate){
    if(!DB || !DB.dates || !DB.dates.length) return [];
    if(!armDate) return DB.dates.slice();
    var lo = addDaysStr(armDate, -1), hi = addDaysStr(armDate, 1);
    return DB.dates.filter(function(d){ return d >= lo && d <= hi; });
  }
  /* H6：跨幾日掃 flightsAt（每班機淨喺佢 effDate 嗰日出現一次，各日結果唔會重疊） */
  function flightsAtRange(bay, dates){
    var out = [];
    (dates || []).forEach(function(d){ out = out.concat(flightsAt(bay, d)); });
    return out;
  }
  function armWatch(bay, silent){
    if(window.__T1M_NO_WATCH) return Promise.resolve(false);
    /* arm 即刻拉一次新數據 */
    if(typeof fetchDataJson !== "function"){ if(!silent) showToast("數據載入緊，稍後再試"); return Promise.resolve(false); }
    /* H8：回傳 Promise<boolean>——arm 成先 true，失敗就 false；silent 嗰陣入面唔出 toast，
       靠回傳值話畀 handler 知，等佢先至 toast「已添加」／「未能添加」。唔用返回值嘅舊調用（BAY+）唔受影響。 */
    return fetchDataJson()
      .then(function(d){
        /* M12：淨係新過現有 DB 嗰陣先覆蓋，舊回應唔好倒退數據 */
        if(d && d.generated_at && d.dates && d.days && (!DB || !DB.generated_at || d.generated_at > DB.generated_at)){
          DB = d;
          var hts = $("headTs"); if(hts) hts.textContent = d.generated_at || "—"; if(typeof checkStale === "function") checkStale(d.generated_at);
          if(typeof buildDates==="function") buildDates(); render();
        }
        /* M7：guard dateIdx 越界，攞唔到有效日期就唔 arm */
        var armDate = (DB && DB.dates && dateIdx >= 0 && dateIdx < DB.dates.length) ? DB.dates[dateIdx] : "";
        if(!armDate){ if(!silent) showToast("數據載入緊，稍後再試"); return false; }
        if(!watchBays[bay]) watchBays[bay] = {seen:{}};
        watchBays[bay].seen = {};
        watchBays[bay].silent = !!silent;
        watchBays[bay].date = armDate;
        /* H6：快照覆蓋同檢查一樣嘅範圍（armDate ±1 日），唔係淨係 armDate 嗰日——
           跨午夜航班 arm 嗰刻已經喺 bay，但 effDate 係隔籬日，唔 snapshot 就會即刻誤報 */
        flightsAtRange(bay, bayWatchDates(armDate)).forEach(function(it){ watchBays[bay].seen[baySeenKey(it, it.date || armDate)] = 1; });
        saveBayWatch(); if(!silent) showWatchPill();
        if(!silent) pushWatchAdd("bay", bay);
        return true;
      })
      .catch(function(){
        /* M7：guard dateIdx 越界，攞唔到有效日期就唔 arm */
        var armDate = (DB && DB.dates && dateIdx >= 0 && dateIdx < DB.dates.length) ? DB.dates[dateIdx] : "";
        if(!armDate){ if(!silent) showToast("數據載入緊，稍後再試"); return false; }
        if(!watchBays[bay]) watchBays[bay] = {seen:{}};
        watchBays[bay].seen = {};
        watchBays[bay].silent = !!silent;
        watchBays[bay].date = armDate;
        /* H6：快照覆蓋同檢查一樣嘅範圍（armDate ±1 日），見上面 */
        flightsAtRange(bay, bayWatchDates(armDate)).forEach(function(it){ watchBays[bay].seen[baySeenKey(it, it.date || armDate)] = 1; });
        saveBayWatch(); if(!silent) showWatchPill();
        if(!silent) pushWatchAdd("bay", bay);
        return true;
      });
  }
  function disarmWatch(bay){
    if(bay){ var wasSilent = !!(watchBays[bay] && watchBays[bay].silent); delete watchBays[bay]; if(bayMiss[bay]) delete bayMiss[bay]; if(!wasSilent) pushWatchRemove("bay", bay); }
    else{ 
      Object.keys(watchBays).forEach(function(b){ if(!(watchBays[b] && watchBays[b].silent)) pushWatchRemove("bay", b); });
      watchBays = {}; bayMiss = {};
    }
    saveBayWatch(); showWatchPill();
  }
  function showWatchPill(){
    if(window.__T1M_NO_WATCH) return;
    var box = $("watchpills");
    if(!box) return;
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
      /* 顯示原定日期（sdate），唔係 Worker 搵機用嘅實際日期（w.date）：
         延誤跨日嗰陣兩者唔同（CX361 原定 11/13、實際 11/14），pill 要跟返用戶認嗰班機。
         舊 watch 未存 sdate 嗰陣即場由 findFlight 攞（bucket 日期）；攞唔到先跌返 w.date */
      var dispDate = w.sdate || "";
      if(!dispDate && DB && w.date){
        try{
          /* H5：跨三日搵，班機轆去另一日都搵到原定日期 */
          var _found = findFlightAnyDay(fid.split("|")[0], fid.split("|")[1] || undefined, w.date);
          if(_found && _found.it.sdate) dispDate = _found.it.sdate;
        }catch(e){}
      }
      if(!dispDate) dispDate = w.date || "";
      var dateLabel = "";
      if(dispDate){
        var parts = dispDate.split("-");
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
    var changed = false;
    Object.keys(watchBays).forEach(function(bay){
      var wbv = watchBays[bay];
      /* M9：損壞值唔係物件就刪，唔好中斷成個檢查 */
      if(!wbv || typeof wbv !== "object"){ delete watchBays[bay]; if(bayMiss[bay]) delete bayMiss[bay]; changed = true; return; }
      var seen = wbv.seen || (wbv.seen = {});
      var bd = bayWatchDate(bay);
      /* H6：檢查覆蓋 armDate 前後一日（bayWatchDates），唔再釘死單一日。
         M7：成個覆蓋範圍都跌出數據窗口先刪 watch——淨係 armDate 跌出唔刪，
         班機可能延誤轆去下一日，仲喺窗口內。 */
      var covered = bayWatchDates(bd);
      if(bd && DB.dates && DB.dates.length && !covered.length){
        delete watchBays[bay];
        if(bayMiss[bay]) delete bayMiss[bay];
        changed = true;
        return;
      }
      /* H6：seen key 用每班機自己嘅實際日期（it.date＝effDate），唔係用 armDate——
         同掃描範圍一致，班機轆日之後新 key 先認到，舊 key 就由 M11 正常老化刪走，唔會誤刪 watch */
      var cur = flightsAtRange(bay, covered), curKeys = {}, fresh = [];
      cur.forEach(function(it){
        var k = baySeenKey(it, it.date || bd); curKeys[k] = 1;
        if(!seen[k]) fresh.push({bay:bay, typ:it.typ, f:it.f});
      });
      /* M11：seen key 缺失唔即刻刪，連續 3 轉缺失先刪；重現就清計數 */
      var miss = bayMiss[bay] || (bayMiss[bay] = {});
      Object.keys(seen).forEach(function(k){
        if(curKeys[k]){ if(miss[k]) delete miss[k]; }
        else{
          miss[k] = (miss[k] || 0) + 1;
          if(miss[k] >= 3){ delete seen[k]; delete miss[k]; }
        }
      });
      cur.forEach(function(it){ seen[baySeenKey(it, it.date || bd)] = 1; });
      if(fresh.length) allFresh = allFresh.concat(fresh);
    });
    saveBayWatch();
    if(changed) showWatchPill();
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
  var waOk = $("waOk");
  if(waOk) waOk.addEventListener("click", function(){ $("watchalert").hidden = true; });
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
    /* pinned 日期行先：有關注釘死嘅日期，先跳去嗰日搵（修 CX811 呢類每日班次：今日嗰班唔好搶先） */
    var fidKey = (fid || "").toUpperCase().replace(/\s/g, "");
    var pinnedIdx = -1;
    try{
      Object.keys(flightWatches).forEach(function(k){
        if(pinnedIdx >= 0) return;
        var p = k.split("|");
        if(p[0] === fidKey && flightWatches[k] && flightWatches[k].date){
          var di = DB.dates.indexOf(flightWatches[k].date);
          if(di >= 0) pinnedIdx = di;
        }
      });
    }catch(e){}
    if(pinnedIdx >= 0 && pinnedIdx !== dateIdx){
      dateIdx = pinnedIdx; expanded = false; detailKey = null;
      try{ buildDates(); }catch(e){}
      render();
    }
    var idx = findIdx();
    if(idx < 0 && !expanded){
      expanded = true; render();
      idx = findIdx();
    }
    if(idx >= 0){ goRow(idx); return; }
    /* 釘死嗰日搵唔到：嗰日有班機但被篩選遮住就明講，唔好跳去另一日嗰班 */
    if(pinnedIdx >= 0){
      var onPinned = false;
      try{ onPinned = !!(DB && DB.dates && findFlight(fid, DB.dates[pinnedIdx])); }catch(e){}
      if(onPinned){
        showToast(fid + " 喺" + (DATE_NAMES[pinnedIdx] || "") + "，但被而家嘅篩選遮住咗");
        return;
      }
    }
    /* 跨日掃三日（跳過而家個 tab） */
    var targetIdx = -1;
    if(DB && DB.dates){
      for(var d=0; d<DB.dates.length; d++){
        if(d === dateIdx) continue;
        try{ if(findFlight(fid, DB.dates[d])){ targetIdx = d; break; } }catch(e){}
      }
    }
    if(targetIdx < 0){
      showToast("搵唔到 " + fid + "（可能唔喺呢三日／已取消）");
      return;
    }
    dateIdx = targetIdx; expanded = false; detailKey = null;
    try{ buildDates(); }catch(e){}
    render();
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
  /* M11：flight watch bay 缺失 grace 計數（fid -> 連續缺失轉數），淨係放喺記憶體，唔寫入 localStorage */
  var flightMiss = {};

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
      /* M9：載入值唔係純物件就唔接受，免得損壞數據拖垮成個檢查 */
      if(fw && typeof fw === "object" && fw.flights && typeof fw.flights === "object" && !Array.isArray(fw.flights)) flightWatches = fw.flights;
      // 自動清理：冇日期嘅殭屍 watch 同日期已過（早過今日）嘅 watch 自動刪除
      var todayStr = new Date(Date.now() + 8*3600*1000).toISOString().slice(0, 10); /* HKT 今日（同 Worker todayHKT 一致） */
      var changed = false;
      Object.keys(flightWatches).forEach(function(fid){
        var w = flightWatches[fid];
        /* M9：損壞值（唔係物件／冇 date）一併清走 */
        if(!w || typeof w !== "object" || !w.date || w.date < todayStr){
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
          if(opId(f).toUpperCase() === fidU) found = {typ:pair[0], f:f, sdate:d};  /* sdate = 呢班機喺 data 入面屬於邊一日（原定日期） */
        });
      });
    });
    return found;
  }
  /* H5/H7：跨三日搵航班——preferDate 先試，之後掃晒 DB.dates；搵到回傳 {it, date}（date＝實際日期，即傳入 findFlight 嗰個 target），搵唔到回傳 null */
  function findFlightAnyDay(fid, typ, preferDate){
    if(!DB || !DB.dates || !DB.dates.length) return null;
    var order = [];
    if(preferDate) order.push(preferDate);
    DB.dates.forEach(function(d){ if(order.indexOf(d) < 0) order.push(d); });
    for(var i = 0; i < order.length; i++){
      var it = findFlight(fid, order[i], typ);
      if(it) return {it: it, date: order[i]};
    }
    return null;
  }
  function flightBay(f){
    return (manualStand("arrival", f) || manualStand("departure", f) || f.stand || "").toUpperCase();
  }
  /* H7：armFlightWatch 而家係異步，回傳 Promise<boolean>——先 fetchDataJson() 拉新數據再 snapshot
     （跟 armWatch 一樣，M12 guard 防止舊數據倒退），唔再用最舊可達 3 分鐘嘅 DB 做 seenBay 快照，
     免得 arm 嗰刻已有 bay 都誤報「新有泊位」。唔用返回值嘅舊調用（FLIGHT+、40-ui.js 詳情「關注」掣）唔受影響；
     要用結果嘅 FLIGHT@ handler 已改做等 Promise（見 H8）。 */
  function armFlightWatch(fid, silent){
    if(window.__T1M_NO_WATCH) return Promise.resolve(false);
    fid = (fid || "").toUpperCase().replace(/\s/g, "");
    if(typeof fetchDataJson !== "function"){ if(!silent) showToast("數據載入緊，稍後再試"); return Promise.resolve(false); }
    var p;
    try{
      p = fetchDataJson();
    }catch(e){
      return Promise.resolve(armFlightWatchFromDB(fid, silent));
    }
    return p
      .then(function(d){
        /* M12：淨係新過現有 DB 嗰陣先覆蓋，舊回應唔好倒退數據 */
        if(d && d.generated_at && d.dates && d.days && (!DB || !DB.generated_at || d.generated_at > DB.generated_at)){
          DB = d;
          var hts = $("headTs"); if(hts) hts.textContent = d.generated_at || "—"; if(typeof checkStale === "function") checkStale(d.generated_at);
          if(typeof buildDates==="function") buildDates(); render();
        }
        return armFlightWatchFromDB(fid, silent);
      })
      .catch(function(){
        /* fetch 失敗：用現有 DB 照試（跟 armWatch 一樣）；DB 完全冇嗰陣 FromDB 會回傳 false */
        return armFlightWatchFromDB(fid, silent);
      });
  }
  /* H7：真正 arm 嘅同步核心（對而家嘅 DB 做 M10 跨三日掃＋snapshot），由上面嘅異步殼調用 */
  function armFlightWatchFromDB(fid, silent){
    if(window.__T1M_NO_WATCH) return false;
    fid = (fid || "").toUpperCase().replace(/\s/g, "");
    if(!DB || !DB.dates || !DB.dates.length){ if(!silent) showToast("數據載入緊，稍後再試"); return false; }  /* L2：DB 未載入就唔 arm，免留冇日期嘅殭屍 watch */
    var target = DB.dates[dateIdx] || "";
    if(!target){ if(!silent) showToast("數據載入緊，稍後再試"); return false; }
    /* M10：唔喺今日 tab：跨三日掃一次，搵航班實際日期（例如聽日機） */
    var found = findFlightAnyDay(fid, undefined, target);
    /* M10：三日都搵唔到就唔 arm，唔好留死 watch＋誤導 pill */
    if(!found){ if(!silent) showToast("呢三日無呢班機"); return false; }
    var it = found.it, effTarget = found.date;
    var bay = flightBay(it.f);
    var key = fid + "|" + it.typ;
    /* date 係實際日期（Worker 搵機＋跳頁釘位用，唔郁）；sdate 係原定日期（pill／提示顯示用） */
    flightWatches[key] = { seenBay: bay, date: effTarget, sdate: it.sdate || "", silent: !!silent };
    saveFlightWatch(); if(!silent) showWatchPill();
    if(!silent) pushWatchAdd("flight", fid, effTarget, bay, it.typ);
    return true;
  }
  function disarmFlightWatch(fid){
    if(fid){ var p = (fid || "").split("|"); var wasSilentF = !!(flightWatches[fid] && flightWatches[fid].silent); delete flightWatches[fid]; if(flightMiss[fid]) delete flightMiss[fid]; if(!wasSilentF) pushWatchRemove("flight", p[0], p[1] || ""); }
    else{ 
      Object.keys(flightWatches).forEach(function(f){ if(!(flightWatches[f] && flightWatches[f].silent)){ var p = (f || "").split("|"); pushWatchRemove("flight", p[0], p[1] || ""); } });
      flightWatches = {}; flightMiss = {};
    }
    saveFlightWatch(); showWatchPill();
  }
  function checkFlightWatch(){
    if(window.__T1M_NO_WATCH) return;
    if(!flightWatchCount() || !DB) return;
    var fresh = [];
    var changed = false;
    Object.keys(flightWatches).forEach(function(fid){
      try{
        var w = flightWatches[fid];
        /* M9：損壞值（唔係物件／冇 date）就刪，唔好中斷成個檢查 */
        if(!w || typeof w !== "object" || typeof w.date !== "string" || !w.date){
          delete flightWatches[fid];
          changed = true;
          if(flightMiss[fid]) delete flightMiss[fid];
          return;
        }
        /* 遷移：舊 key（淨 fid）搵到方向就改名做 fid|typ；若新 key 已存在就淨刪舊 key（去重） */
        if(fid.indexOf("|") < 0 && DB){
          /* H5：跨三日搵，班機轆去另一日都遷移到啱嘅方向，順手跟埋新實際日期；
             遷移語義唔變——搵唔到就唔改名，留返下面統一處理 */
          var mig = findFlightAnyDay(fid, undefined, w.date);
          if(mig){
            var nk = fid + "|" + mig.it.typ;
            if(flightWatches[nk]){
              delete flightWatches[fid];
              try{ pushWatchRemove("flight", fid); }catch(e){}
              return; /* 去重：新 key 嗰次 iteration 會處理，呢次跳過免重複彈 */
            }else{
              flightWatches[nk] = w; delete flightWatches[fid];
              w.date = mig.date;
              if(!w.sdate && mig.it.sdate) w.sdate = mig.it.sdate;
              try{ pushWatchRemove("flight", fid); }catch(e){}
              try{ pushWatchAdd("flight", fid, w.date, w.seenBay, mig.it.typ, true); }catch(e){}
              fid = nk;
            }
          }
        }
        var parts = fid.split("|");
        /* H5：跨三日掃，唔再淨係搵 w.date 嗰日——班機 arm 咗之後先延誤跨日，effDate 會轆去下一日 */
        var found = findFlightAnyDay(parts[0], parts.length > 1 ? parts[1] : undefined, w.date);
        if(!found) return;
        var it = found.it;
        /* 班機轆去另一日：跟住更新 w.date（pill 顯示繼續用 sdate，唔受影響）；sdate 缺失嗰陣補返 */
        if(found.date !== w.date) w.date = found.date;
        if(!w.sdate && found.it.sdate){ w.sdate = found.it.sdate; changed = true; }
        /* M8：已飛／已取消就自動刪 watch，唔好留 pill，唔好再誤彈（拖機轉 bay） */
        var done = !!it.f.cancelled || (it.f.ata && it.f.ata !== "—") || (it.f.atd && it.f.atd !== "—");
        if(done){
          delete flightWatches[fid];
          changed = true;
          if(flightMiss[fid]) delete flightMiss[fid];
          try{ pushWatchRemove("flight", parts[0], parts[1] || ""); }catch(e){}
          return;
        }
        var bay = flightBay(it.f);
        if(bay && bay !== "—" && bay !== w.seenBay){
          /* 新有 Bay（或轉咗 Bay） */
          fresh.push({fid:fid, typ:it.typ, f:it.f, bay:bay, sdate:it.sdate});
          w.seenBay = bay;
          if(flightMiss[fid]) delete flightMiss[fid];
        }else if(!bay || bay === "—"){
          /* M11：bay 閃失唔即刻清 seenBay，連續 3 轉都無先清 */
          var mc = (flightMiss[fid] || 0) + 1;
          if(mc >= 3){ w.seenBay = ""; delete flightMiss[fid]; }
          else{ flightMiss[fid] = mc; }
        }else{
          /* bay 無變：清 miss 計數 */
          if(flightMiss[fid]) delete flightMiss[fid];
        }
      }catch(e){
        /* M9：個別 watch 出錯唔好中斷成個檢查，刪咗佢繼續 */
        try{ delete flightWatches[fid]; changed = true; if(flightMiss[fid]) delete flightMiss[fid]; }catch(e2){}
      }
    });
    saveFlightWatch();
    if(changed) showWatchPill();
    if(fresh.length) flightAlert(fresh);
  }
  function flightAlert(list){
    var html = list.map(function(it){
      var dateLabel = "";
      var w = flightWatches[it.fid];
      var dispDate = it.sdate || (w && (w.sdate || w.date)) || "";
      if(dispDate){
        var parts = dispDate.split("-");
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
        var curVal = null, curT = "", firstT = "", firstMin = 0, firstVal = 0;
        for(var i=0;i<times.length;i++){
          /* Open-Meteo times 係 HKT 無 offset 字串，唔好用本地時區解讀 */
          var tm = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(times[i] || "");
          var t = tm ? new Date(Date.UTC(+tm[1], +tm[2]-1, +tm[3], +tm[4]-8, +tm[5])) : new Date(times[i]);
          var diffMin = (t.getTime() - nowMs)/60000;
          var v = parseFloat(vals[i]); if(isNaN(v)) v = 0;
          if(diffMin > -15 && diffMin <= 0){
            /* 今格（15 分鐘格包含而家） */
            if(curVal === null || v > curVal){ curVal = v; curT = times[i]; }
          }else if(diffMin > 0 && diffMin <= 60){
            if(firstT === "" && v >= 0.2){ firstT = times[i]; firstMin = Math.round(diffMin); firstVal = v; }
          }
        }
        if(curVal !== null && curVal >= 0.2){
          /* 落緊雨：2026-11-04 改返 0.2mm——0.1mm 嗰日彈咗兩次但實際冇落雨，誤報太多；同一場雨淨彈一次；事件未完唔 reset */
          if(!rainWatch.alertedAt){
            rainWatch.alertedAt = curT || "now"; saveRainWatch();
            rainNowAlert(curVal); flushAlerts();
          }
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
  function rainNowAlert(val){
    var html = "<div>預報雨量 <b>"+val+" mm</b>（而家呢格）</div><div style='color:var(--muted);font-size:12px;margin-top:4px'>資料來源：Open-Meteo 預報</div>";
    queueAlert("🌧 機場而家落緊雨", html);
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
          /* 已取消嘅警告（actionCode CANCEL）唔顯示：天文台取消之後條記錄仲喺清單入面，淨睇 code 會誤報（2026-11-14 黃雨教訓） */
          if((w.actionCode || "").toUpperCase() === "CANCEL") return;
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

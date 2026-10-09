/* HKIA flight board - 40-ui.js */
  /* 大字模式：開頁還原＋掣切換 */
  (function(){
    var KEY = "hkia-large-v1";
    function apply(v){
      document.documentElement.classList.toggle("large", !!v);
      try{ localStorage.setItem(KEY, v ? "1" : "0"); }catch(e){}
    }
    try{ if(localStorage.getItem(KEY) === "1") apply(true); }catch(e){}
    var b = document.getElementById("largeBtn");
    if(b) b.addEventListener("click", function(){
      var on = !document.documentElement.classList.contains("large");
      apply(on);
      render();
    });
    window.__hkiaLarge = function(){ return document.documentElement.classList.contains("large"); };
  })();
  /* 右下角浮動搜尋掣：撳=搜尋，長按拖動=搬位（位置存 localStorage） */
  (function(){
    var fab = $("fabSearch");
    var KEY = "hkia-fab-pos-v1";
    /* 還原上次位置 */
    try{
      var p = JSON.parse(localStorage.getItem(KEY));
      if(p && typeof p.x === "number" && typeof p.y === "number"){
        fab.style.right = "auto"; fab.style.bottom = "auto";
        fab.style.left = p.x + "px"; fab.style.top = p.y + "px";
      }
    }catch(e){}
    var dragging = false, moved = false, sx, sy, ox, oy, pressTimer = null;
    function pos(e){
      var t = e.touches ? e.touches[0] : e;
      return {x: t.clientX, y: t.clientY};
    }
    fab.addEventListener("touchstart", function(e){
      var pt = pos(e); sx = pt.x; sy = pt.y; moved = false;
      var r = fab.getBoundingClientRect(); ox = r.left; oy = r.top;
      pressTimer = setTimeout(function(){
        dragging = true;
        fab.style.right = "auto"; fab.style.bottom = "auto";
        fab.style.left = ox + "px"; fab.style.top = oy + "px";
      }, 400);
    }, {passive: true});
    fab.addEventListener("touchmove", function(e){
      if(!dragging) return;
      var pt = pos(e);
      if(Math.abs(pt.x - sx) + Math.abs(pt.y - sy) > 8) moved = true;
      var nx = Math.min(Math.max(0, ox + pt.x - sx), window.innerWidth - 52);
      var ny = Math.min(Math.max(0, oy + pt.y - sy), window.innerHeight - 52);
      fab.style.left = nx + "px"; fab.style.top = ny + "px";
      if(e.cancelable) e.preventDefault();
    }, {passive: false});
    fab.addEventListener("touchend", function(){
      if(pressTimer){ clearTimeout(pressTimer); pressTimer = null; }
      if(dragging){
        dragging = false;
        if(moved){
          /* 存位置 */
          try{
            localStorage.setItem(KEY, JSON.stringify({
              x: parseInt(fab.style.left), y: parseInt(fab.style.top)
            }));
          }catch(e){}
        }
      }
    });
    fab.addEventListener("click", function(e){
      if(moved){ moved = false; e.preventDefault(); e.stopPropagation(); return; }
      q.focus();
      window.scrollTo({top: 0, behavior: "smooth"});
    });
  })();
  // 共用同一個 localStorage key 做搜尋框同步（舊版 q/qm）
  $("qclear").addEventListener("click", function(){
    q.value = ""; query = "";
    this.parentElement.classList.remove("hasq");
    expanded = false; render(); q.blur();
  });
  $("hidePax").addEventListener("change", function(){ hidePax = !!this.checked; expanded=false; render(); });
  $("hideCargo").addEventListener("change", function(){ hideCargo = !!this.checked; expanded=false; render(); });
  $("showHas").addEventListener("change", function(){ onlyHas = !!this.checked; expanded=false; render(); });
  $("hideCX").addEventListener("change", function(){ hideCX = !!this.checked; expanded=false; render(); });
  function toggleExpand(){
    if(!expanded){
      /* 展開前記住「而家」線喺畫面嘅位置，render 後放返同一位置，唔跳 */
      var nl = document.querySelector("tr.nowline");
      var top = nl ? nl.getBoundingClientRect().top : null;
      expanded = true; render();
      var nl2 = document.querySelector("tr.nowline");
      if(nl2 && top !== null) window.scrollTo(0, window.scrollY + nl2.getBoundingClientRect().top - top);
    }else{
      expanded = false; render();
      window.scrollTo({top:0, behavior:"smooth"});
    }
  }
  $("expandBtn").addEventListener("click", toggleExpand);
  $("refreshBtn").addEventListener("click", function(){
    /* 軟更新：拉 data.json + 溫度，唔 reload 成頁（PWA 下更可靠） */
    var btn = this;
    btn.style.opacity = "0.5";
    doPullRefresh(function(){
      btn.style.opacity = "";
      if(typeof jumpToTimeline === "function") jumpToTimeline();
    });
  });

  /* 撳列展開（有備註先有反應） */
  var pressTimer = null, pressItem = null, suppressClick = false;
  function rowFromEvent(e){
    var t = e.target;
    return (t && t.closest) ? t.closest("tr.rw") : null;
  }
  $("rows").addEventListener("click", function(e){
    if(suppressClick){ suppressClick = false; return; }
    var t = e.target;
    if(!t || !t.closest) return;

    /* 先處理詳情區按鈕（保存／刪除）：佢哋喺 tr.drow 入面，唔係 tr.rw */
    var actEl = t.closest("[data-act]");
    if(actEl){
      var act = actEl.getAttribute("data-act");
      var it2 = null;
      for(var j=0;j<lastItems.length;j++){
        if(itemKey(lastItems[j]) === detailKey){ it2 = lastItems[j]; break; }
      }
      if(act === "note-save"){ commitNote(); }
      else if(act === "note-cancel" && it2){ deleteNote(it2.typ, it2.f); }
      else if(act === "copy-flight" && it2){ copyFlight(it2.typ, it2.f); }
      return;
    }

    var row = rowFromEvent(e);
    if(!row) return;
    var it = lastItems[+row.getAttribute("data-k")];
    if(!it) return;
    /* 備註編輯緊：點航班 row 就保存兼關閉，唔使下下撳掣 */
    if(noteEditingKey){
      commitNote();
      return;
    }
    if(window.getSelection && window.getSelection().toString()) return;
    var k = itemKey(it);
    /* 撳冇備注嘅航班：如果有嘢開緊就閂咗佢 */
    if(!hasNote(it.typ, it.f)){
      if(detailKey){ detailKey = null; render(); }
      return;
    }
    detailKey = (detailKey === k) ? null : k;
    render();
  });

  /* 長按：Bay 格=高亮同區泊位，其他位=加備註／手動泊位 */
  var pressOnBay = false;
  function pressStart(e){
    if(pressTimer) clearTimeout(pressTimer);
    var row = rowFromEvent(e);
    if(!row) return;
    if(e.target.closest && (e.target.closest("[data-act]") || e.target.closest("a[href*='flightradar24']"))) return;
    var it = lastItems[+row.getAttribute("data-k")];
    if(!it) return;
    pressItem = it;
    pressOnBay = !!(e.target.closest && e.target.closest("td.bayc"));
    /* 記低起始位，輕微郁唔當取消（Android 好易震） */
    var t0 = (e.touches && e.touches[0]) || e;
    pressSX = t0.clientX; pressSY = t0.clientY;
    pressTimer = setTimeout(function(){
      pressTimer = null;
      suppressClick = true;
      setTimeout(function(){ suppressClick = false; }, 800);
      if(pressOnBay){
        var area = standArea(pressItem.typ, pressItem.f);
        if(area){ hlArea = (hlArea === area) ? null : area; render(); }
      }else{
        var k = itemKey(pressItem);
        if(!WATCH[k]) WATCH[k] = {t:Date.now()};
        detailKey = k; noteEditingKey = k; noteFocus = true;
        render();
      }
    }, 550);
  }
  function pressCancel(){ if(pressTimer){ clearTimeout(pressTimer); pressTimer = null; } pressItem = null; }
  /* 郁超過 12px 先當取消，輕微震唔理 */
  function pressMove(e){
    if(!pressTimer) return;
    var t0 = (e.touches && e.touches[0]) || e;
    if(Math.abs(t0.clientX - pressSX) > 12 || Math.abs(t0.clientY - pressSY) > 12) pressCancel();
  }
  var pressSX = 0, pressSY = 0;
  var rowsEl = $("rows");
  rowsEl.addEventListener("touchstart", pressStart, {passive:true});
  rowsEl.addEventListener("touchend", pressCancel);
  rowsEl.addEventListener("touchcancel", pressCancel);
  rowsEl.addEventListener("touchmove", pressMove, {passive:true});
  rowsEl.addEventListener("mousedown", function(e){ if(e.button===0) pressStart(e); });
  rowsEl.addEventListener("mouseup", pressCancel);
  rowsEl.addEventListener("mousemove", pressMove);
  rowsEl.addEventListener("contextmenu", function(e){ if(rowFromEvent(e)) e.preventDefault(); });

  /* 左右滑：左滑加紅「/」（已巡視），右滑取消 */
  var swSX = 0, swSY = 0, swRow = null, swipedAt = 0;
  rowsEl.addEventListener("touchstart", function(e){
    var row = rowFromEvent(e);
    if(!row){ swRow = null; return; }
    var t = e.touches && e.touches[0];
    if(t){ swSX = t.clientX; swSY = t.clientY; swRow = row; }
  }, {passive:true});
  rowsEl.addEventListener("touchend", function(e){
    if(!swRow) return;
    var row = swRow; swRow = null;
    var t = e.changedTouches && e.changedTouches[0];
    if(!t) return;
    var dx = t.clientX - swSX, dy = t.clientY - swSY;
    if(Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
    swipedAt = Date.now();
    var it = lastItems[+row.getAttribute("data-k")];
    if(!it) return;
    /* 關注頁：左滑取消關注（唔做巡視標記） */
    if(window.__WATCH_ONLY && dx < 0){
      try{
        var fidU = opId(it.f).toUpperCase();
        if(typeof flightWatches !== "undefined" && flightWatches[fidU] && typeof disarmFlightWatch === "function"){
          disarmFlightWatch(fidU);
          showToast("已取消關注 " + fidU, true);
          suppressClick = true;
          setTimeout(function(){ suppressClick = false; }, 800);
          tapTimes.length = 0;
          render();
          return;
        }
      }catch(err){}
      /* 唔係直接關注嘅航班（bay／備註），左滑無效 */
      return;
    }
    var lvl = inspLevel(it.typ, it.f);
    var want = Math.max(0, Math.min(2, lvl + (dx < 0 ? 1 : -1)));
    if(want === lvl) return;
    setInspLevel(it.typ, it.f, want);
    suppressClick = true;
    setTimeout(function(){ suppressClick = false; }, 800);
    tapTimes.length = 0;
    render();
  });

  /* 橫向手勢由網頁接管：一起勢就 preventDefault，唔俾瀏覽器搶去做返回／前進 */
  var hSX = 0, hSY = 0, hId = null, hLock = null;
  document.addEventListener("touchstart", function(e){
    if(e.touches.length !== 1){ hId = null; return; }
    var t = e.touches[0];
    hId = t.identifier; hSX = t.clientX; hSY = t.clientY; hLock = null;
  }, {passive:true});
  document.addEventListener("touchmove", function(e){
    if(hId === null) return;
    var t = null;
    for(var i = 0; i < e.touches.length; i++) if(e.touches[i].identifier === hId) t = e.touches[i];
    if(!t) return;
    var dx = t.clientX - hSX, dy = t.clientY - hSY;
    if(hLock === null){
      if(Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
      hLock = (Math.abs(dx) > Math.abs(dy) * 1.5) ? "h" : "v";
    }
    if(hLock === "h") e.preventDefault();
  }, {passive:false});
  document.addEventListener("touchend", function(){ hId = null; }, {passive:true});
  document.addEventListener("touchcancel", function(){ hId = null; }, {passive:true});

  /* 下拉更新：在頂部向下拉，鬆手更新數據＋跳返時間線 */
  var ptrEl = $("ptr"), ptrSpin = ptrEl.querySelector(".ptrspin"), ptrLabel = ptrEl.querySelector(".ptrlabel");
  var pId = null, pSX = 0, pSY = 0, pPull = 0, pActive = false, pRefreshing = false, ptrAteTap = false;
  function ptrShow(dy, refreshing){
    if(refreshing){
      ptrEl.classList.add("refreshing");
      ptrEl.style.transition = "";
      ptrEl.style.transform = "translate(-50%,0px)";
      ptrEl.style.opacity = 1;
      ptrSpin.style.transform = "";
      ptrLabel.textContent = "更新中…";
      return;
    }
    ptrEl.classList.remove("refreshing");
    var show = Math.min(dy * 0.55, 58);
    ptrEl.style.transition = "none";
    ptrEl.style.transform = "translate(-50%," + (show - 80) + "px)";
    ptrEl.style.opacity = Math.min(1, dy / 48);
    ptrSpin.style.transform = "rotate(" + Math.min(dy * 4, 360) + "deg)";
    ptrLabel.textContent = dy > 70 ? "放開更新" : "下拉更新";
  }
  function ptrHide(){
    ptrEl.classList.remove("refreshing");
    ptrEl.style.transition = "";
    ptrEl.style.transform = "translate(-50%,-80px)";
    ptrEl.style.opacity = 0;
  }
  document.addEventListener("touchstart", function(e){
    if(pRefreshing || pActive) return;
    if(e.touches.length !== 1) return;
    var t0 = e.touches[0];
    var inSticky = false;
    var sb = document.querySelector(".stickybar");
    if(sb){
      var r = sb.getBoundingClientRect();
      if(t0.clientY >= r.top && t0.clientY <= r.bottom) inSticky = true;
    }
    if(window.scrollY > 0 && !inSticky) return;
    if($("aboutOverlay").classList.contains("open")) return;
    if(document.activeElement === q) return;
    var t = e.touches[0];
    pId = t.identifier; pSX = t.clientX; pSY = t.clientY; pPull = 0; pActive = true;
  }, {passive:true});
  document.addEventListener("touchmove", function(e){
    if(!pActive || pRefreshing) return;
    var t = null;
    for(var i=0;i<e.touches.length;i++) if(e.touches[i].identifier === pId) t = e.touches[i];
    if(!t){ pActive = false; return; }
    var dx = t.clientX - pSX, dy = t.clientY - pSY;
    if(dy <= 0 || Math.abs(dx) > dy * 1.2){ pActive = false; pPull = 0; ptrHide(); return; }
    e.preventDefault();
    pPull = Math.min(dy, 150);
    ptrShow(pPull, false);
  }, {passive:false});
  document.addEventListener("touchend", function(e){
    if(!pActive) return;
    pActive = false;
    var pulled = pPull; pPull = 0;
    if(pulled > 12){
      ptrAteTap = true;
      tapTimes.length = 0; lastTapT = 0;
      suppressClick = true;
      setTimeout(function(){ suppressClick = false; }, 800);
    }
    if(pRefreshing){ ptrHide(); return; }
    if(pulled > 70){
      pRefreshing = true;
      ptrShow(0, true);
      doPullRefresh(function(status){
        pRefreshing = false;
        ptrEl.classList.remove("refreshing");
        ptrSpin.style.transform = "";
        ptrLabel.textContent = status === "updated" ? "已更新 ✓" : (status === "failed" ? "更新失敗" : "已是最新");
        ptrEl.style.transition = "";
        ptrEl.style.transform = "translate(-50%,0px)";
        ptrEl.style.opacity = 1;
        setTimeout(function(){
          ptrHide();
          jumpToTimeline();
        }, 800);
      });
    }else{
      ptrHide();
    }
  }, {passive:true});
  function doPullRefresh(done){
    if(window.__hkiaCheckTemp) window.__hkiaCheckTemp(); /* 順手更新機場溫度 */
    fetch("data.json?_="+Date.now(), {cache:"no-store"})
      .then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(d){
        if(d && d.generated_at && d.dates && d.days && d.generated_at !== DB.generated_at){
          DB = d;
          var hts = $("headTs"); if(hts) hts.textContent = d.generated_at || "—"; checkStale(d.generated_at);
          if(typeof buildDates==="function") buildDates();
          checkBayWatch(); checkRainWatch(); checkFlightWatch(); flushAlerts();
          done("updated");
        }else{
          done("latest");
        }
      })
      .catch(function(){ done("failed"); });
  }

  /* 連點兩下跳返時間線，連點三下開搜尋（三下嗰陣會先跳一次，無害） */
  var tapTimes = [];
  var lastTapT = 0, lastTapX = 0, lastTapY = 0;
  document.addEventListener("touchend", function(e){
    if(ptrAteTap){ ptrAteTap = false; return; }
    var now = Date.now();
    if(now - swipedAt < 500) return;
    tapTimes.push(now);
    while(tapTimes.length && now - tapTimes[0] > 800) tapTimes.shift();
    var tc = e.changedTouches && e.changedTouches[0];
    var x = tc ? tc.clientX : -9999, y = tc ? tc.clientY : -9999;
    var isDbl = (tapTimes.length === 2) && (now - lastTapT < 400) &&
                ((x-lastTapX)*(x-lastTapX) + (y-lastTapY)*(y-lastTapY) < 1600);
    lastTapT = now; lastTapX = x; lastTapY = y;
    if(tapTimes.length >= 3){
      tapTimes = [];
      if($("aboutOverlay").classList.contains("open")) return;
      if(document.activeElement === q) return;
      e.preventDefault();
      q.focus();
      return;
    }
    if(isDbl && !noteEditingKey &&
       !$("aboutOverlay").classList.contains("open") &&
       document.activeElement !== q &&
       !(e.target.closest && e.target.closest("input,button,thead"))){
      e.preventDefault();
      jumpToTimeline();
    }
  }, {passive:false});
  /* dblclick 做後備：上面 touchend 漏咗（冇 preventDefault）嗰陣先會觸發 */
  document.addEventListener("dblclick", function(e){
    if(noteEditingKey) return;
    if($("aboutOverlay").classList.contains("open")) return;
    if(document.activeElement === q) return;
    if(e.target.closest && e.target.closest("input,button,thead")) return;
    e.preventDefault();
    jumpToTimeline();
  });

  /* 雙擊跳返時間線：未展開就返頂；展開緊就唔收起，淨係將 nowline 捲返時間線位置附近 */
  function jumpToTimeline(){
    if($("aboutOverlay").classList.contains("open")) return;
    if(document.activeElement === q || noteEditingKey) return;
    if(query){ window.scrollTo({top:0, behavior:"smooth"}); return; }
    if(dateIdx !== 1){
      dateIdx = 1;
      var btns = document.querySelectorAll("#datePills button");
      for(var i=0;i<btns.length;i++) btns[i].classList.toggle("on", i===1);
      expanded = false; detailKey = null; noteEditingKey = null;
      render();
      scrollToEightAbove();
      return;
    }
    render();
    if(!expanded){ scrollToEightAbove(); return; }
    var nl = document.querySelector("tr.nowline");
    if(!nl){ scrollToEightAbove(); return; }
    var rw = document.querySelector("tr.rw");
    var rowH = rw ? rw.getBoundingClientRect().height : 34;
    var xr = document.querySelector("tr.xrow");
    var xH = xr ? xr.getBoundingClientRect().height : 0;
    var thr = document.querySelector("thead th").getBoundingClientRect();
    var wantTop = thr.top + thr.height + xH + 8 * rowH;
    window.scrollTo(0, window.scrollY + (nl.getBoundingClientRect().top - wantTop));
  }

  /* 捲到「時間線上 8 班」嘅位置（大字模式：4 班） */
  function scrollToEightAbove(){
    var nl = document.querySelector("tr.nowline");
    var thr = document.querySelector("thead th");
    if(nl && thr){
      /* 動態搵 nowline，上面留 8 班（唔 hardcode index） */
      var rw = document.querySelector("tr.rw");
      var rowH = rw ? rw.getBoundingClientRect().height : 34;
      var thRect = thr.getBoundingClientRect();
      var wantTop = thRect.top + thRect.height + 8 * rowH;
      window.scrollTo(0, window.scrollY + (nl.getBoundingClientRect().top - wantTop));
    }else{
      window.scrollTo(0, 0);
    }
  }

  /* 頂部「展開全部」掣：永遠喺頂，碌上去就見到（唔做顯示／隱藏，避免卡頓） */

  /* 主題 */
  var icoSun = $("icoSun"), icoMoon = $("icoMoon");
  function syncThemeUI(){
    var t = document.documentElement.getAttribute("data-theme") || "dark";
    var isLight = (t === "light");
    icoSun.style.display = isLight ? "none" : "";
    icoMoon.style.display = isLight ? "" : "none";
    var old = document.querySelector('meta[name="theme-color"]');
    if(old) old.parentNode.removeChild(old);
    var mc = document.createElement("meta");
    mc.setAttribute("name", "theme-color");
    mc.setAttribute("content", isLight ? "#ffffff" : "#0b1c2c");
    document.head.appendChild(mc);
  }
  syncThemeUI();
  $("themeBtn").addEventListener("click", function(){
    var cur = document.documentElement.getAttribute("data-theme");
    var next = (cur === "light") ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try{ localStorage.setItem("hkia-theme", next); }catch(e){}
    syncThemeUI();
  });

  /* 關於（watch.html 冇關於掣，defensive） */
  var overlay = $("aboutOverlay");
  var abBtn = $("aboutBtn");
  if(abBtn && overlay) abBtn.addEventListener("click", function(){ overlay.classList.add("open"); });
  var abClose = $("aboutClose");
  if(abClose && overlay) abClose.addEventListener("click", function(){ overlay.classList.remove("open"); });
  if(overlay) overlay.addEventListener("click", function(e){ if(e.target===overlay) overlay.classList.remove("open"); });
  /* 關注頁返回掣 */
  var bkBtn = $("backBtn");
  if(bkBtn) bkBtn.addEventListener("click", function(){ location.href = "./hkiaflight.html"; });

  window.addEventListener("resize", function(){ setBarH(); });
  /* 瀏覽器唔好自動還原舊 scroll 位，定位由我哋控制 */
  try{ history.scrollRestoration = "manual"; }catch(e){}
  setBarH();

  /* 載入（如果鎖住咗，等解鎖先行） */
  function bootLoad(){
    if(window.__hkiaLocked){
      window.addEventListener("hkia-unlocked", function h(){ window.removeEventListener("hkia-unlocked", h); bootLoad(); });
      return;
    }
  /* loading 狀態：落緊 data.json 嗰陣顯示 */
  $("rows").innerHTML = "<tr><td colspan='6' style='text-align:center;color:var(--muted);padding:32px;'><div style='font-size:20px;margin-bottom:8px;'>✈️</div>載入航班數據…</td></tr>";
  fetch("data.json?_="+Date.now(), {cache:"no-store"})
    .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
    .then(function(d){
      DB = d;
      if(!DB.dates || !DB.days) throw new Error("bad data");
      dateIdx = 1;
      $("headTs").textContent = d.generated_at || "—";
      checkStale(d.generated_at);
      if(typeof buildDates==="function") buildDates();
      render();
      /* 開頁停喺時間線上 8 班（上面仲有 10 班，要碌上去先見） */
      scrollToEightAbove();
      /* 還原提醒：同上次見過嘅比較，有新航班入 bay 就彈 banner */
      if(watchCount() || flightWatchCount()){
        checkBayWatch(); checkRainWatch(); checkFlightWatch(); flushAlerts();
        showWatchPill();
      }
    })
    .catch(function(e){
      $("rows").innerHTML = "<tr><td colspan='6' style='text-align:center;color:var(--red);padding:24px;'>載入失敗："+esc(e.message)+"</td></tr>";
    });
  }
  bootLoad();

  /* 靜默更新 */
  var lastActive = Date.now();
  ["touchstart","touchmove","mousedown","keydown","wheel","scroll"].forEach(function(ev){
    window.addEventListener(ev, function(){ lastActive = Date.now(); }, {passive:true});
  });
  setInterval(function(){
    if(!DB || document.visibilityState !== "visible") return;
    if(Date.now() - lastActive < 60000 && !watchCount() && !flightWatchCount()) return;
    if(detailKey || noteEditingKey) return;
    if(document.activeElement === q) return;
    if(overlay.classList.contains("open")) return;
    fetch("data.json?_="+Date.now(), {cache:"no-store"})
      .then(function(r){ return r.json(); })
      .then(function(d){
        if(d && d.generated_at && d.generated_at !== DB.generated_at && d.dates && d.days){
          var sy = window.scrollY, keepEx = expanded;
          DB = d;
          $("headTs").textContent = d.generated_at;
          checkStale(d.generated_at);
          if(typeof buildDates==="function") buildDates(); render();
          if(keepEx){ expanded = true; render(); }
          checkBayWatch(); checkRainWatch(); checkFlightWatch(); flushAlerts();
          /* 展開／搜尋緊就還原舊位，否則停返時間線上 8 班 */
          if(keepEx || query){ if(sy) window.scrollTo(0, sy); }
          else scrollToEightAbove();
        }
      })
      .catch(function(){});
  }, 15*60*1000);
  document.addEventListener("visibilitychange", function(){
    if(document.visibilityState === "visible" && DB){
      // 回來即檢查一次（簡單起見交給 interval）
    }
  });
  /* 雙擊到港／離港標題欄：主頁↔關注頁跳轉（隱藏功能） */
  (function(){
    /* 關注頁唔顯示 pill（成頁都係關注，唔使再提示） */
    if(window.__WATCH_ONLY){
      var wp = document.getElementById("watchpills");
      if(wp) wp.style.display = "none";
    }
    var thead = document.querySelector("thead");
    if(!thead) return;
    /* 用原生 dblclick（唔用手動計時，避免同 browser timing 打架）；
       stopPropagation 擋住 document 層嘅時間線跳轉 */
    function goWatch(){
      if(window.__WATCH_ONLY){
        location.href = "./hkiaflight.html";
      }else{
        location.href = "./watch.html";
      }
    }
    thead.addEventListener("dblclick", function(e){
      e.preventDefault();
      e.stopPropagation();
      goWatch();
    });
    /* 手機 touchend 版雙擊（iOS 有時唔出 dblclick） */
    var thLastTap = 0;
    thead.addEventListener("touchend", function(e){
      var now = Date.now();
      if(now - thLastTap < 500){
        thLastTap = 0;
        e.preventDefault();
        e.stopPropagation();
        goWatch();
      }else{
        thLastTap = now;
      }
    }, {passive:false});
  })();

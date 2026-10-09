/* HKIA flight board - 10-core.js */
  var DB = null, dateIdx = 1, query = "";
  var hideCargo = true, hidePax = false, onlyHas = true, hideCX = false;
  var expanded = false, detailKey = null, lastItems = [];
  var DATE_NAMES = ["昨天","今天","明天"];

  /* ---------- 備註／手動泊位（localStorage） ---------- */
  var WATCH = (function(){
    try{
      var w = JSON.parse(localStorage.getItem("hkia-watch-v1")) || {};
      Object.keys(w).forEach(function(k){ if(!w[k] || (!w[k].note && !w[k].stand && !w[k].insp)) delete w[k]; });
      return w;
    }catch(e){ return {}; }
  })();
  function saveWatch(){ try{ localStorage.setItem("hkia-watch-v1", JSON.stringify(WATCH)); }catch(e){} }
  function watchKey(typ, f){
    var d = (DB && DB.dates && DB.dates[dateIdx]) ? DB.dates[dateIdx] : ("d"+dateIdx);
    return d + "|" + typ + "|" + opId(f);
  }
  function hasNote(typ, f){
    var k = watchKey(typ, f), w = WATCH[k];
    if(f.cargo){ if(w && w.note){ delete w.note; if(!w.stand && !w.insp) delete WATCH[k]; saveWatch(); } return false; }
    return !!(w && w.note);
  }
  function manualStand(typ, f){ var w = WATCH[watchKey(typ, f)]; return (w && w.stand) || ""; }
  /* 已巡視級別 0/1/2（localStorage，同備註共用 WATCH） */
  function inspLevel(typ, f){ var w = WATCH[watchKey(typ, f)]; return (w && w.insp) || 0; }
  function setInspLevel(typ, f, lvl){
    var k = watchKey(typ, f), w = WATCH[k];
    if(lvl > 0){ if(!w) w = WATCH[k] = {t:Date.now()}; w.insp = lvl; }
    else if(w){ delete w.insp; if(!w.note && !w.stand) delete WATCH[k]; }
    saveWatch();
  }
  /* 泊位區（S/N/W/R，數字歸R組；冇泊位返 ""） */
  function standArea(typ, f){
    var s = ((manualStand(typ, f) || f.stand || "").trim().toUpperCase());
    if(!s || s === "—") return "";
    var c = s.charAt(0);
    if(c === "S" || c === "N" || c === "W") return c;
    if(c === "R" || /^\d+$/.test(s)) return "R";
    return "";
  }
  /* 同區高亮狀態（唔 save，純睇嘢用） */
  var hlArea = null;

  var HAS_PAX_CODES = ["CX","PX","JX","KE","JL","QR","FJ","BI","LH","LX","DL","UO","AK","FD","Z2","QZ","GK","9G"];
  var HAS_CARGO_CODES = ["CX","LD","QY","3V","C6","D4","MS","CK","AK","Z2","GH"];
  var LCC_HIDE = ["UO","Z2","QZ","AK","FD"];
  function isHasFlight(f){
    var code = opId(f).replace(/\s/g,"").substring(0,2).toUpperCase();
    if(!f.cargo && LCC_HIDE.indexOf(code) !== -1) return false;
    return (f.cargo ? HAS_CARGO_CODES : HAS_PAX_CODES).indexOf(code) !== -1;
  }
  function isCX(f){
    return opId(f).replace(/\s/g,"").substring(0,2).toUpperCase() === "CX";
  }

  function $(id){ return document.getElementById(id); }
  function esc(s){
    return String(s==null?"":s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function norm(s){ return (s||"").replace(/\s+/g,"").toUpperCase(); }
  function md(iso){ var p = String(iso).split("-"); return (+p[1]) + "/" + (+p[2]); }
  function opId(f){ return (f.flight_id || "").split(" / ")[0].replace(/\s/g,""); }
  function apCode(typ, f){
    /* 到港取最後一個航點，離港取第一個航點 */
    var parts = (f.via || "").split(" / ").map(function(s){ return s.trim(); }).filter(Boolean);
    if(!parts.length) return "—";
    return typ === "arrival" ? parts[parts.length-1] : parts[0];
  }
  function eff(f){
    if(f.ata && f.ata !== "—") return f.ata;
    if(f.est && f.est !== "—") return f.est;
    return f.eta || "—";
  }
  /* 到港時間顯示：已降落＋A、預計＋E、只有STA淺灰＋S（排序照用 eff） */
  function arrTimeHtml(f){
    var noAta = !(f.ata && f.ata !== "—");
    var estShown = f.est && f.est !== "—" && f.est !== f.eta;
    if(!noAta){
      /* L=落地（Landed），A=到閘口（At gate） */
      var landed = /^landed/i.test(f.status_raw || "");
      var mk = landed ? "L" : "A";
      return esc(f.ata)+"<span class='tmark'>"+mk+"</span>";
    }
    if(estShown) return esc(f.est)+"<span class='tmark'>E</span>";
    return "<span class='tsta'>"+esc(f.eta || "—")+"<span class='tmark'>S</span></span>";
  }
  /* 離港時間顯示：已起飛正常顯示＋A、有變（預計同原定唔同）就紅色，否則原色 */
  function depTimeHtml(f){
    var t = eff(f);
    var flown = f.ata && f.ata !== "—";
    if(flown) return esc(t)+"<span class='tmark'>A</span>";
    var changed = f.est && f.est !== "—" && f.est !== f.eta;
    if(changed) return "<span class='tchg'>"+esc(t)+"</span><span class='tmark tchg'>E</span>";
    return esc(t)+"<span class='tmark'>E</span>";
  }
  function checkStale(genAt){
    var el = $("staleWarn"); if(!el) return;
    var m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(genAt || "");
    if(!m){ el.hidden = true; return; }
    var gen = new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5]);
    var ageMin = (Date.now() - gen.getTime()) / 60000;
    if(ageMin > 60){
      var h = Math.floor(ageMin / 60);
      $("staleAge").textContent = h > 0 ? ("約 " + h + " 小時") : ("約 " + Math.floor(ageMin) + " 分鐘");
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }
  function toMin(t){
    var m = /^(\d{1,2}):(\d{2})/.exec(t || "");
    return m ? (+m[1])*60 + (+m[2]) : 99999;
  }
  function nowHHMM(){
    var d = new Date();
    var hkt = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000);
    return ("0"+hkt.getHours()).slice(-2) + ":" + ("0"+hkt.getMinutes()).slice(-2);
  }

  function setBarH(){
    var b = document.querySelector(".stickybar");
    if(b) document.documentElement.style.setProperty("--barH", b.offsetHeight + "px");
  }

  /* 泊位色 */
  function standColorCls(s){
    s = (s || "").trim();
    var c = s.charAt(0).toUpperCase();
    if(c === "S") return "stS";
    if(c === "N") return "stN";
    if(c === "W") return "stW";
    if(c === "R" || /^\d+$/.test(s)) return "stR";
    return "";
  }
  function standHtml(typ, f){
    var ms = manualStand(typ, f);
    var inner, c;
    if(ms){ inner = esc(ms); c = standColorCls(ms); }
    else if(f.stand_old && f.stand_old !== f.stand){
      /* bay 轉過：淨顯示新 bay，紅色提示；舊 bay 撳入詳情先見 */
      inner = "<span class='stchg'>"+esc(f.stand)+"</span>";
      c = standColorCls(f.stand);
    } else { inner = esc(f.stand); c = standColorCls(f.stand); }
    if(!c) return inner;
    if(hlArea && standArea(typ, f) === hlArea) return "<span class='sthl "+c+"'>"+inner+"</span>";
    return "<span class='st "+c+"'>"+inner+"</span>";
  }

  function badge(f){
    var h = "";
    if(f.cancelled) h += '<span class="cbadge cancel">取消</span>';
    return h;
  }

  function getLists(){
    if(!DB || !DB.dates || !DB.days) return {arr:[], dep:[]};
    /* 按實際日期分頁：掃全部日期，取有效日期等於目標日期嘅航班 */
    var target = DB.dates[dateIdx];
    var arr = [], dep = [];
    Object.keys(DB.days).forEach(function(d){
      var day = DB.days[d];
      (day.arrival || []).forEach(function(f){
        if((effDate(f) || d) === target){ f._sdate = d; arr.push(f); }
      });
      (day.departure || []).forEach(function(f){
        if((effDate(f) || d) === target){ f._sdate = d; dep.push(f); }
      });
    });
    var flt = function(f){
      if(hideCargo && f.cargo) return false;
      if(hidePax && !f.cargo) return false;
      if(hideCX && isCX(f)) return false;
      if(onlyHas && !isHasFlight(f)) return false;
      return true;
    };
    arr = arr.filter(flt); dep = dep.filter(flt);
    var nq = norm(query);
    if(nq){
      var mf = function(typ){
        return function(f){
          var w = WATCH[watchKey(typ, f)];
          /* 淨 match 主航班編號，唔 match 聯合航班 */
          return norm(opId(f)).indexOf(nq) !== -1 ||
                 norm(f.via).indexOf(nq) !== -1 ||
                 norm(manualStand(typ, f) || f.stand).indexOf(nq) !== -1 ||
                 norm(w && w.note).indexOf(nq) !== -1;
        };
      };
      arr = arr.filter(mf('arrival')); dep = dep.filter(mf('departure'));
    }
    return {arr:arr, dep:dep};
  }

  function merged(){
    var g = getLists();
    var items = [];
    var fdate = DB.dates[dateIdx];
    g.arr.forEach(function(f){ items.push({sk:skDate(f, fdate, false), typ:'arrival', f:f}); });
    g.dep.forEach(function(f){ items.push({sk:skDate(f, fdate, true), typ:'departure', f:f}); });
    items.sort(function(a,b){ return a.sk-b.sk; });
    /* 關注頁模式：淨顯示關注航班／關注 bay／有備註嘅航班 */
    if(window.__WATCH_ONLY){
      items = items.filter(function(it){
        var fid = "";
        try{ fid = opId(it.f).toUpperCase(); }catch(e){}
        /* 1. 航班關注（@ 或 +） */
        try{ if(typeof flightWatches !== "undefined" && flightWatches[fid]) return true; }catch(e){}
        /* 2. Bay 關注：而家個 bay 喺 watch list 入面 */
        try{
          if(typeof watchBays !== "undefined"){
            var bay = ((it.f.stand || "") + "").toUpperCase();
            if(bay && watchBays[bay]) return true;
          }
        }catch(e){}
        /* 3. 有備註 */
        try{ if(hasNote(it.typ, it.f)) return true; }catch(e){}
        return false;
      });
    }
    return items;
  }
  /* 排序鍵（認日期）：實際／預計時間若同航班日期唔同，加減 1440；離港減 50 分鐘 */
  function skDate(f, fdate, isDep){
    var t = eff(f);
    var m = toMin(t);
    if(m > 90000) return m;
    var ad = effDate(f);
    if(ad && fdate && ad !== fdate){
      var diff = Math.round((new Date(ad+"T00:00:00") - new Date(fdate+"T00:00:00")) / 86400000);
      m += diff * 1440;
    }
    return isDep ? m - 50 : m;
  }
  /* 有效時間嘅日期（ata/atd/est 有 date 就用佢） */
  function effDate(f){
    var t = eff(f);
    if(t === f.ata && f.ata_date) return f.ata_date;
    if(t === f.est && f.est_date) return f.est_date;
    return null;
  }
  /* 原定同實際唔同日，顯示原定嘅 DD（單行並排） */
  function dateTag(f){
    var sd = f._sdate;  /* getLists 掃嗰陣記低嘅原定日期 */
    var fdate = DB.dates[dateIdx];
    if(!sd || !fdate || sd === fdate) return "";
    var p = sd.split("-");
    return "<span class='ddate'>"+p[2]+"</span>";
  }

  function itemKey(it){ return watchKey(it.typ, it.f); }

  function detailInner(typ, f){
    var h = "";
    if(f.cancelled) h += "<div><span style='color:var(--red);font-weight:700;'>已取消</span></div>";
    var wk = watchKey(typ, f), w = WATCH[wk];
    var note = w ? (w.note || "") : "";
    if(noteEditingKey === wk){
      if(f.cargo){
        h += "<div class='notewrap'><span>泊位：</span><input id='standInput' class='noteinput' maxlength='10' value='"+esc(manualStand(typ,f)).replace(/"/g,"&quot;")+"' placeholder='手動輸入'>"+
             "<button class='nbtn' data-act='note-save'>保存</button><button class='nbtn' data-act='note-cancel'>刪除</button></div>";
      }else{
        h += "<div class='notewrap'><span>備註：</span><input id='noteInput' class='noteinput' maxlength='140' value='"+esc(note).replace(/"/g,"&quot;")+"'>"+
             "<button class='nbtn' data-act='note-save'>保存</button><button class='nbtn' data-act='note-cancel'>刪除</button></div>";
      }
    }else if(note){
      h += "<div><span>備註：</span>"+esc(note)+"</div>";
    }
    /* 延誤 */
    if(f.est && f.est !== "—" && f.eta && f.eta !== "—" && f.est !== f.eta){
      var m1 = toMin(f.eta), m2 = toMin(f.est), dd = m2 - m1;
      if(dd > 720) dd -= 1440; else if(dd < -720) dd += 1440;
      if(dd !== 0) h += "<div><span>時間：</span>"+esc(dd > 0 ? "延誤 "+dd+" 分鐘" : "提早 "+(-dd)+" 分鐘")+"</div>";
    }
    if(typ === "arrival"){
      if(f.baggage && f.baggage !== "—") h += "<div><span>行李帶：</span>"+esc(f.baggage)+"</div>";
    }else{
      if(f.hall && f.hall !== "—") h += "<div><span>大堂：</span>"+esc(f.hall)+"</div>";
    }
    if(f.stand_old && f.stand_old !== f.stand){
      h += "<div><span>"+(typ==="arrival"?"泊位變動：":"閘口變動：")+"</span>"+esc(f.stand_old)+" → "+esc(f.stand)+"</div>";
    }
    h += "<div style='margin-top:6px'><button class='nbtn' data-act='copy-flight'>📋 複製航班資料</button> "+
         "<a class='nbtn' style='text-decoration:none;display:inline-block;font-family:inherit;line-height:normal;vertical-align:baseline;' href='https://www.flightradar24.com/"+opId(f).toLowerCase()+"' rel='noopener'>✈️ Flightradar24</a></div>";
    return h;
  }


  function copyFlight(typ, f){
    var w = WATCH[watchKey(typ, f)];
    var note = w ? (w.note || "") : "";
    var bay = manualStand(typ, f) || f.stand || "—";
    /* 日期：DD/MM/YYYY（用緊睇嗰日） */
    var dstr = (DB && DB.dates && DB.dates[dateIdx]) || "";
    var dp = dstr.split("-");
    var dateline = dp.length === 3 ? dp[2] + "/" + dp[1] + "/" + dp[0] : dstr;
    /* 時間：有 ATA 用 ATA，有 EST 用 ETA，得 STA 用 STA/STD */
    var tm, tlabel;
    if(f.ata && f.ata !== "—"){ tm = f.ata; tlabel = "ATA"; }
    else if(f.est && f.est !== "—"){ tm = f.est; tlabel = "ETA"; }
    else { tm = f.eta || "—"; tlabel = typ === "arrival" ? "STA" : "STD"; }
    var txt = dateline + "\n" + opId(f) + " (" + bay + " / " + tlabel + " " + tm + ")";
    if(note) txt += "\n" + note;
    var done = function(){ showToast("已複製：" + opId(f)); };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(done, function(){ fallbackCopy(txt); done(); });
    }else{ fallbackCopy(txt); done(); }
  }
  function fallbackCopy(txt){
    try{
      var ta = document.createElement("textarea");
      ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
    }catch(e){}
  }
  var toastTimer = null;
  function showToast(msg, big){
    var el = $("toast");
    if(!el){
      el = document.createElement("div");
      el.id = "toast";
      document.body.appendChild(el);
    }
    /* big=1：大版提示（例如 @ 加入關注），置中＋大字＋國泰綠底 */
    if(big){
      el.style.cssText = "position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);background:#006b6e;color:#fff;padding:16px 28px;border-radius:12px;font-size:18px;font-weight:700;z-index:9999;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,.3);";
    }else{
      el.style.cssText = "position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:rgba(0,0,0,.8);color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;z-index:99;white-space:nowrap;";
    }
    el.textContent = msg; el.style.display = "block";
    if(toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ el.style.display = "none"; }, big ? 2500 : 1800);
  }

  var noteEditingKey = null, noteFocus = false;
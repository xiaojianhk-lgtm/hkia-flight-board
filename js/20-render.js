/* HKIA flight board - 20-render.js */

  function render(){
    var items = merged();
    /* 而家位置（sk 時間軸，同排序一致；時間線同 50 班 window 都用佢） */
    var now2 = nowHHMM(), nowMin = toMin(now2);
    var divPos = items.length;
    for(var j=0;j<items.length;j++){
      var tj = eff(items[j].f);
      if(tj && tj !== "—" && items[j].sk >= nowMin){ divPos = j; break; }
    }
    /* 今日：時間線之前 18 班開始顯示 60 班（上面18班，下面42班）；開頁／雙擊停喺上8班位置 */
    var largeMode = window.__hkiaLarge && window.__hkiaLarge();
    var pageN = largeMode ? 30 : 60;
    var aboveN = largeMode ? 12 : 18;
    var start = 0, showN = pageN;
    if(!expanded && !query && dateIdx === 1 && items.length){
      showN = Math.min(pageN, items.length);
      start = Math.max(0, Math.min(divPos - aboveN, items.length - showN));
    }
    var list = expanded ? items : items.slice(start, start + showN);
    lastItems = list;
    if(detailKey && list.map(itemKey).indexOf(detailKey) === -1){ detailKey = null; noteEditingKey = null; }

    /* 而家分隔線（只限今天） */
    var showNow = (dateIdx === 1 && items.length > 0);
    var nowLabel = showNow ? now2 : "";
    divPos = Math.max(0, divPos - start);

    var html = (items.length > showN)
      ? "<tr class='xrow'><td colspan='6'><button class='xrowbtn'>"+(expanded?"收起":"展開全部 "+items.length+" 班航班")+"</button></td></tr>"
      : "";
    for(var i=0;i<list.length;i++){
      if(showNow && i === divPos){
        html += "<tr class='nowline'><td colspan='6'><div class='nl'><span>"+esc(nowLabel)+"</span></div></td></tr>";
      }
      var it = list[i], f = it.f, typ = it.typ;
      var hn = hasNote(typ, f);
      var cls = "rw"+(typ==="arrival"?" arr":" dep")+(hn?" noted":"")+(f.cancelled?" cancelled":"");
      var key = itemKey(it);
      var ilv = inspLevel(typ, f);
      var adir = "<span class='adir'>"+(typ==="arrival"?"↓":"↑")+"</span>";
      var fidCell = "<td class='fid'>"+(typ==="arrival"?adir:"")+"<span class='fidtxt'>"+esc(opId(f))+"</span>"+dateTag(f)+badge(f)+(hn?" <span class='nst'>★</span>":"")+(ilv>=1?" <span class='tmark inspk'>✓</span>":"")+"</td>";
      var tMark2 = ilv>=2 ? "<span class='tmark inspk ab'>✓</span>" : "";
      /* v225：有本地機尾號先畫兩行細字，冇／出錯一律畫返航點（50-reg.js 載入失敗都唔會死頁） */
      var apcHtml = "<td class='apc'>"+esc(apCode(typ,f))+"</td>";
      try{ if(typeof regApcCell === "function") apcHtml = regApcCell(typ,f); }catch(e){}
      if(typ === 'arrival'){
        html += "<tr class='"+cls+"' data-k='"+i+"'>"+fidCell+"<td></td>"+
                apcHtml+
                "<td class='time tcol'><span class='twrap'>"+arrTimeHtml(f)+tMark2+"</span></td><td class='tcol'></td>"+
                "<td class='bayc'>"+standHtml(typ,f)+"</td></tr>";
      }else{
        html += "<tr class='"+cls+"' data-k='"+i+"'><td>"+adir+"</td>"+fidCell+
                apcHtml+
                "<td class='tcol'></td><td class='time tcol'><span class='twrap'>"+depTimeHtml(f)+tMark2+"</span></td>"+
                "<td class='bayc'>"+standHtml(typ,f)+"</td></tr>";
      }
      if(detailKey === key){
        html += "<tr class='drow'><td colspan='6'><div class='ddetail'>"+detailInner(typ,f)+"</div></td></tr>";
      }
    }
    if(showNow && divPos >= list.length){
      html += "<tr class='nowline'><td colspan='6'><div class='nl'><span>"+esc(nowLabel)+"</span></div></td></tr>";
    }
    /* M1：搜尋零結果時，睇下其他日期 tab 有冇（提示＋一撳跳轉；搜尋本身維持只限當前 tab） */
    if(!list.length && query && !window.__WATCH_ONLY && DB && DB.dates){
      var curDi = dateIdx, hintDates = [];
      for(var hd=0; hd<DB.dates.length; hd++){
        if(hd === curDi) continue;
        dateIdx = hd;
        var hg = getLists();
        if(hg.arr.length || hg.dep.length) hintDates.push(hd);
      }
      dateIdx = curDi;
      if(hintDates.length){
        var htxt = "「" + esc(query) + "」唔喺" + (DATE_NAMES[curDi] || "今日");
        var hbtns = hintDates.map(function(hd){
          return "<button class='xrowbtn' data-hintdate='" + hd + "'>去" + (DATE_NAMES[hd] || DB.dates[hd]) + "睇</button>";
        }).join(" ");
        html += "<tr class='xrow'><td colspan='6'><span style='color:var(--muted)'>" + htxt + "</span> " + hbtns + "</td></tr>";
      }
    }
    $("rows").innerHTML = html;

    /* 同一班機有兩行（延誤跨日）嗰陣會有兩個輸入框：逐個掛 Enter 監聽，撳 Enter 嗰陣傳返嗰個輸入框，等 commitNote 讀啱格 */
    var nis = document.querySelectorAll("#rows input.noteinput");
    for(var ni2 = 0; ni2 < nis.length; ni2++){
      nis[ni2].addEventListener("keydown", function(ev){ if(ev.key === "Enter"){ ev.preventDefault(); commitNote(ev.target); } });
    }
    var ni = $("noteInput") || $("standInput");
    if(noteFocus){ noteFocus = false; try{ if(ni) ni.focus(); }catch(e){} }

    var g = getLists();
    var ac = $("adCount");
    if(ac) ac.textContent = "到港 " + g.arr.length + " / 離港 " + g.dep.length;
    var total = items.length;
    if(total > showN){
      $("expandBar").style.display = "";
      $("expandBtn").textContent = expanded ? "收起" : "展開全部 "+total+" 班航班";
    }else{
      $("expandBar").style.display = "none";
    }
    setBarH();
    var xb = document.querySelector("#rows .xrowbtn:not([data-hintdate])");
    if(xb) xb.addEventListener("click", toggleExpand);
    var hb = document.querySelectorAll("#rows [data-hintdate]");
    for(var hi=0; hi<hb.length; hi++){
      (function(btn){
        btn.addEventListener("click", function(){
          var di = parseInt(btn.getAttribute("data-hintdate"), 10);
          if(isNaN(di) || !DB || !DB.dates || di < 0 || di >= DB.dates.length) return;
          dateIdx = di; expanded = false; detailKey = null;
          try{ buildDates(); }catch(e){}
          render();
        });
      })(hb[hi]);
    }
  }

  /* 保存備註／手動泊位。srcEl（可選）：觸發保存嗰個元素（保存掣／輸入框／航班行）。
     同一班機有兩行（延誤跨日）嗰陣會有兩個輸入框（id 重複），唔可以直接用
     getElementById 攞第一個——要讀返觸發嗰行詳情入面嗰個，否則打咗嘅字會唔見。 */
  function commitNote(srcEl){
    var ni = null, si = null, k = noteEditingKey;
    noteEditingKey = null;
    var wrap = null;
    if(srcEl && srcEl.closest){
      wrap = srcEl.closest(".drow");
      if(!wrap && srcEl.classList && srcEl.classList.contains("rw")){
        var nx = srcEl.nextElementSibling;
        if(nx && nx.classList && nx.classList.contains("drow")) wrap = nx;
      }
    }
    if(wrap){
      var inp = wrap.querySelector("input.noteinput");
      if(inp){ if(inp.id === "standInput") si = inp; else ni = inp; }
    }
    if(!ni) ni = $("noteInput");
    if(!si) si = $("standInput");
    if(k){
      WATCH[k] = WATCH[k] || {};
      if(ni){ var v = ni.value.trim(); if(v) WATCH[k].note = v; else delete WATCH[k].note; }
      if(si){ var s = si.value.trim().toUpperCase(); if(s) WATCH[k].stand = s; else delete WATCH[k].stand; }
      if(!WATCH[k].note && !WATCH[k].stand && !WATCH[k].insp) delete WATCH[k];
      saveWatch();
      if(!(WATCH[k] && WATCH[k].note)) detailKey = null;
    }
    render();
  }
  function deleteNote(typ, f){
    var k = noteEditingKey;
    noteEditingKey = null;
    if(k && WATCH[k]){
      if(f && f.cargo) delete WATCH[k].stand; else delete WATCH[k].note;
      if(!WATCH[k].note && !WATCH[k].stand && !WATCH[k].insp) delete WATCH[k];
      saveWatch();
    }
    detailKey = null;
    render();
  }

  function buildDates(){
    var wrap = $("datePills");
    wrap.innerHTML = "";
    DB.dates.slice(0,3).forEach(function(d, i){
      var b = document.createElement("button");
      b.innerHTML = esc(DATE_NAMES[i]||d) + "<br><small>" + esc(md(d)) + "</small>";
      if(i===dateIdx) b.classList.add("on");
      b.addEventListener("click", function(){
        dateIdx = i;
        var btns = wrap.querySelectorAll("button");
        for(var k=0;k<btns.length;k++) btns[k].classList.toggle("on", k===i);
        expanded = false; detailKey = null;
        render();
      });
      wrap.appendChild(b);
    });
  }

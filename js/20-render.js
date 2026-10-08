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
    var start = 0, showN = 60;
    if(!expanded && !query && dateIdx === 1 && items.length){
      showN = Math.min(60, items.length);
      start = Math.max(0, Math.min(divPos - 18, items.length - showN));
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
      var fidCell = "<td class='fid'>"+(typ==="arrival"?adir:"")+esc(opId(f))+dateTag(f)+badge(f)+(hn?" <span class='nst'>★</span>":"")+(ilv>=1?" <span class='tmark inspk'>✓</span>":"")+"</td>";
      var tMark2 = ilv>=2 ? "<span class='tmark inspk ab'>✓</span>" : "";
      if(typ === 'arrival'){
        html += "<tr class='"+cls+"' data-k='"+i+"'>"+fidCell+"<td></td>"+
                "<td class='apc'>"+esc(apCode(typ,f))+"</td>"+
                "<td class='time tcol'><span class='twrap'>"+arrTimeHtml(f)+tMark2+"</span></td><td class='tcol'></td>"+
                "<td class='bayc'>"+standHtml(typ,f)+"</td></tr>";
      }else{
        html += "<tr class='"+cls+"' data-k='"+i+"'><td>"+adir+"</td>"+fidCell+
                "<td class='apc'>"+esc(apCode(typ,f))+"</td>"+
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
    $("rows").innerHTML = html;

    var ni = $("noteInput") || $("standInput");
    if(ni){
      ni.addEventListener("keydown", function(ev){ if(ev.key === "Enter"){ ev.preventDefault(); commitNote(); } });
      if(noteFocus){ noteFocus = false; try{ ni.focus(); }catch(e){} }
    }

    var g = getLists();
    $("headCount").textContent = g.arr.length + g.dep.length;
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
    var xb = document.querySelector("#rows .xrowbtn");
    if(xb) xb.addEventListener("click", toggleExpand);
  }

  function commitNote(){
    var ni = $("noteInput"), si = $("standInput"), k = noteEditingKey;
    noteEditingKey = null;
    if(k){
      WATCH[k] = WATCH[k] || {t:Date.now()};
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

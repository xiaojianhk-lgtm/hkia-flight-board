/* HKIA flight board - 50-reg.js (v225) */
/* 機尾號本地層：只存呢部機 localStorage，唔上傳、唔入 repo、唔入 Worker。
   主頁專用：顯示（APT 欄改為兩行細字）＋搜尋（打機尾號搵到班機）＋匯入（搜尋欄暗號 Callsign3577）。
   其他頁（關注頁／T1M／nld）就算載入呢個檔，顯示都會被頁面判斷閘住；匯入入口淨主頁先開。
   呢個檔載入失敗、本地數據損壞，成個板都會跌返去今日嘅樣（顯示航點），唔會死頁。
   呢個檔載入嗰陣唔掂 DOM，淨係定義函數；所有 DOM 操作都等用戶觸發先做。 */
var REG_KEY = "hkia-reg-v1";
function normReg(s){ return String(s == null ? "" : s).replace(/\s+/g, "").toUpperCase(); }
function regLoadData(){
  try{
    var d = JSON.parse(localStorage.getItem(REG_KEY) || "null");
    if(!d || typeof d !== "object" || Array.isArray(d)) return null;
    return d;
  }catch(e){ return null; }
}
function regFmtDate(dt){
  return dt.getFullYear() + "-" + ("0" + (dt.getMonth() + 1)).slice(-2) + "-" + ("0" + dt.getDate()).slice(-2);
}
/* 對位：跟備註同一個慣例，用而家睇緊嗰日 tab 嘅日期＋方向＋航班編號（去空格大寫）。
   同一日同編號同方向有多班（極少），就用班機顯示時間最近嗰個。 */
function regFor(typ, f){
  try{
    if(typeof DB === "undefined" || !DB || !DB.dates || typeof dateIdx === "undefined" || !DB.dates[dateIdx]) return null;
    if(typeof opId !== "function" || typeof eff !== "function" || typeof toMin !== "function") return null;
    var data = regLoadData(); if(!data) return null;
    var date = DB.dates[dateIdx];
    var key = date + "|" + typ + "|" + opId(f);
    var arr = data[date] && data[date][key];
    if(!arr || !arr.length) return null;
    if(arr.length === 1) return arr[0];
    var t = toMin(eff(f)), best = arr[0], bd = 1e9;
    for(var i = 0; i < arr.length; i++){
      var d = Math.abs(toMin(arr[i].time) - t);
      if(d < bd){ bd = d; best = arr[i]; }
    }
    return best;
  }catch(e){ return null; }
}
/* 搜尋：淨 match 機尾號（唔 match 機型，免得 351 同 CX351 撞）。冇數據／出錯一律唔中。 */
function regSearchMatch(typ, f, nq){
  try{
    var r = regFor(typ, f);
    return !!(r && normReg(r.reg).indexOf(nq) !== -1);
  }catch(e){ return false; }
}
/* APT 欄：主頁＋有本地機尾號先畫兩行細字，其他情況一律畫返航點。 */
function regApcCell(typ, f){
  try{
    if(!/hkiaflight\.html$/.test(location.pathname)) return "<td class='apc'>" + esc(apCode(typ, f)) + "</td>";
    var r = regFor(typ, f);
    if(r) return "<td class='apc regcell'><span class='reg'>" + esc(r.reg) + "</span><span class='typ'>" + esc(r.type) + "</span></td>";
  }catch(e){}
  try{ return "<td class='apc'>" + esc(apCode(typ, f)) + "</td>"; }catch(e2){ return "<td class='apc'>—</td>"; }
}
/* 匯入驗證＋寫入：成個 JSON 驗證通過先寫，任何錯都唔寫入。回傳 {ok, date, count} 或 {ok:false, error}。 */
function regImportJson(text){
  try{
    if(typeof text !== "string" || !text.trim() || text.length > 500000) return {ok: false, error: "內容太長或係空嘅"};
    var j = JSON.parse(text);
    if(!j || typeof j !== "object" || Array.isArray(j)) return {ok: false, error: "需要一個 JSON 物件"};
    if(!/^\d{4}-\d{2}-\d{2}$/.test(j.date || "")) return {ok: false, error: "需要 date: YYYY-MM-DD"};
    if(!Array.isArray(j.flights) || !j.flights.length || j.flights.length > 2000) return {ok: false, error: "flights 唔啱（要 1–2000 班）"};
    var map = {};
    for(var i = 0; i < j.flights.length; i++){
      var fl = j.flights[i];
      if(!fl || typeof fl !== "object") return {ok: false, error: "第 " + (i + 1) + " 班格式唔啱"};
      var fn = normReg(fl.f), dir = fl.dir, tm = fl.time, rg = normReg(fl.reg), ty = normReg(fl.type);
      if(!fn || (dir !== "arrival" && dir !== "departure") || !/^\d{1,2}:\d{2}$/.test(tm || "") || !rg || !ty)
        return {ok: false, error: "第 " + (i + 1) + " 班資料唔齊（要 f / dir / time / reg / type）"};
      var k = j.date + "|" + dir + "|" + fn;
      if(!map[k]) map[k] = [];
      map[k].push({time: tm, reg: rg, type: ty});
    }
    var data = regLoadData() || {};
    data[j.date] = map;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var cut = regFmtDate(new Date(today.getTime() - 86400000));
    Object.keys(data).forEach(function(d){ if(d < cut) delete data[d]; });
    localStorage.setItem(REG_KEY, JSON.stringify(data));
    return {ok: true, date: j.date, count: j.flights.length};
  }catch(e){ return {ok: false, error: "JSON 解唔開"}; }
}
function regClearData(){
  try{ localStorage.removeItem(REG_KEY); return true; }catch(e){ return false; }
}
function regStoredSummary(){
  try{
    var d = regLoadData(); if(!d) return "未匯入任何機尾號";
    return Object.keys(d).sort().map(function(date){
      var n = 0; Object.keys(d[date]).forEach(function(k){ n += d[date][k].length; });
      return date + "（" + n + " 班）";
    }).join("、") || "未匯入任何機尾號";
  }catch(e){ return "未匯入任何機尾號"; }
}
/* 匯入介面：淨主頁先開，其他頁撳暗號只會提示。介面本身唔發任何網絡請求。 */
function regOpenImport(){
  try{
    if(!/hkiaflight\.html$/.test(location.pathname)){
      if(typeof showToast === "function") showToast("機尾號匯入只限主頁");
      return;
    }
    var box = document.getElementById("regImportBox");
    if(box){ box.style.display = ""; var st = document.getElementById("regImportStatus"); if(st) st.textContent = "而家存咗：" + regStoredSummary(); return; }
    box = document.createElement("div");
    box.id = "regImportBox";
    box.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;";
    box.innerHTML = "<div style='background:var(--card,#fff);color:var(--text,#111);width:100%;max-width:520px;border-radius:12px;padding:16px;box-shadow:0 8px 30px rgba(0,0,0,.3);'>"
      + "<div style='font-weight:700;font-size:16px;margin-bottom:4px;'>機尾號匯入</div>"
      + "<div style='font-size:12px;opacity:.7;line-height:1.6;margin-bottom:10px;'>淨存喺呢部機，唔上傳、其他人睇唔到。貼上 Muse 轉好嘅 JSON（{date, flights[]}），匯入後主頁 APT 欄就會顯示機尾號＋機型。</div>"
      + "<div id='regImportStatus' style='font-size:12px;margin-bottom:8px;'>而家存咗：" + regStoredSummary() + "</div>"
      + "<textarea id='regImportText' rows='8' placeholder='貼上 JSON…' style='width:100%;box-sizing:border-box;font-size:13px;padding:8px;border:1px solid #ccc;border-radius:8px;'></textarea>"
      + "<div id='regImportMsg' style='font-size:12px;min-height:18px;margin:6px 0;color:#b00;'></div>"
      + "<div style='display:flex;gap:8px;'>"
      + "<button id='regImportDo' style='flex:1;padding:10px;border:0;border-radius:8px;background:#006b6e;color:#fff;font-size:15px;'>匯入</button>"
      + "<button id='regImportClear' style='flex:1;padding:10px;border:1px solid #ccc;border-radius:8px;background:transparent;font-size:15px;'>清除全部</button>"
      + "<button id='regImportCancel' style='flex:1;padding:10px;border:1px solid #ccc;border-radius:8px;background:transparent;font-size:15px;'>取消</button>"
      + "</div></div>";
    document.body.appendChild(box);
    document.getElementById("regImportDo").addEventListener("click", function(){
      var msg = document.getElementById("regImportMsg");
      var r = regImportJson(document.getElementById("regImportText").value);
      if(!r.ok){ msg.textContent = "匯入失敗：" + r.error; return; }
      box.style.display = "none";
      try{ if(typeof render === "function") render(); }catch(e){}
      try{ if(typeof showToast === "function") showToast("已匯入 " + r.date + "，共 " + r.count + " 班"); }catch(e){}
    });
    document.getElementById("regImportClear").addEventListener("click", function(){
      if(!window.confirm("清除全部已匯入嘅機尾號？")) return;
      regClearData();
      box.style.display = "none";
      try{ if(typeof render === "function") render(); }catch(e){}
      try{ if(typeof showToast === "function") showToast("已清除機尾號"); }catch(e){}
    });
    document.getElementById("regImportCancel").addEventListener("click", function(){ box.style.display = "none"; });
    box.addEventListener("click", function(ev){ if(ev.target === box) box.style.display = "none"; });
  }catch(e){}
}

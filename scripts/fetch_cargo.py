#!/usr/bin/env python3
"""獨立 Menzies 貨機 bay 抓數（通宵貨機專用）。

每晚 22:00–02:00 跑，寫 cargo-bays.json。
主頁 data.json 完全唔掂呢個檔，兩邊獨立。

格式：{"generated_at": "2026-10-12 22:30 HKT", "bays": {"CX035": "X9", ...}}
"""

import json
import os
import sys
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

HKT = ZoneInfo("Asia/Hong_Kong")
TIMEOUT_SECS = 30

MCS_URL = "https://fv.menziescnac.com/data2?page={page}&ha_filter=&flight_id={fid}&date_filter={df}&arr_dep={ad}"
MCS_AIRLINES = ["CX", "LD", "AK", "QY"]

def fetch_cargo_bays(old_bays=None):
    """22:00-02:00 先抓；回 {flight_id: bay}。"""
    now = datetime.now(HKT)
    h = now.hour
    if not (h >= 22 or h < 2):
        return old_bays or {}
    # 保險掣
    cb_file = "/tmp/cargo_circuit_breaker"
    try:
        if h == 22:
            with open(cb_file, "w") as f:
                f.write("0")
            fails = 0
        else:
            with open(cb_file) as f:
                fails = int(f.read().strip() or "0")
        if fails >= 3:
            print("cargo: circuit breaker open, skip", file=sys.stderr)
            return old_bays or {}
    except:
        fails = 0
    # 新一晚 22:00：唔沿用尋晚嘅 bay
    if h == 22:
        bays = {}
    else:
        bays = dict(old_bays) if old_bays else {}
    success = False
    dates = ["today", "tomorrow"] if h >= 22 else ["today"]
    for al in MCS_AIRLINES:
        for ad in ("a", "d"):
            for df in dates:
                page = 1
                while True:
                    url = MCS_URL.format(page=page, fid=al, ad=ad, df=df)
                    try:
                        req = urllib.request.Request(url, headers={
                            "Referer": "https://fv.menziescnac.com/",
                            "User-Agent": "Mozilla/5.0",
                        })
                        with urllib.request.urlopen(req, timeout=TIMEOUT_SECS) as resp:
                            d = json.load(resp)
                        for r in d.get("rows") or []:
                            if r.get("T") not in ("F", "H"):
                                continue
                            flt = (r.get("Flight") or "").strip()
                            if "[" in flt:
                                flt = flt.split("[")[0].strip()
                            st = (r.get("ST") or "").strip()
                            if st and "(" in st:
                                st = st.split("(")[0].strip()
                            if flt and st and st.lower() != "none":
                                bays[flt] = st
                        total = d.get("total_pages") or 1
                        if page >= total:
                            success = True
                            break
                        page += 1
                    except Exception as exc:
                        print(f"WARN: cargo {al}/{ad}/{df} p{page} failed ({exc})", file=sys.stderr)
                        break
    try:
        with open(cb_file, "w") as f:
            f.write("0" if success else str(fails + 1))
    except:
        pass
    return bays

def main():
    out_path = os.path.join(os.path.dirname(__file__), "..", "cargo-bays.json")
    out_path = os.path.abspath(out_path)
    # 讀舊嘅
    old_bays = {}
    try:
        with open(out_path) as f:
            old_bays = json.load(f).get("bays", {})
    except:
        pass
    bays = fetch_cargo_bays(old_bays)
    now = datetime.now(HKT)
    payload = {
        "generated_at": now.strftime("%Y-%m-%d %H:%M") + " HKT",
        "bays": bays,
    }
    with open(out_path, "w") as f:
        json.dump(payload, f, ensure_ascii=False)
    print(f"OK: {len(bays)} bays -> {out_path}")
    return 0

if __name__ == "__main__":
    sys.exit(main())

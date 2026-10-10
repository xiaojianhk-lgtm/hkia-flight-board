#!/usr/bin/env python3
"""Fetch HKIA flights for yesterday/today/tomorrow/day-after (Asia/Hong_Kong).

Covers arrival + departure, passenger + cargo. Writes data.json.
Days are calendar days (00:00-23:59) as returned by the API.

Idempotent: rewrites data.json only when the flight data changed; on any
API failure exits non-zero and leaves the existing file untouched.
No third-party dependencies.
"""

import json
import math
import os
import re
import sys
import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

HKT = ZoneInfo("Asia/Hong_Kong")
API_URL = (
    "https://www.hongkongairport.com/flightinfo-rest/rest/flights"
    "?date={date}&lan=tc&cargo={cargo}&arrival={arrival}"
)
TIMEOUT_SECS = 30

ATA_RE = re.compile(r"(?:At gate|Landed)\s+(\d{1,2}:\d{2})")
ATD_RE = re.compile(r"Dep\s+(\d{1,2}:\d{2})")
EST_RE = re.compile(r"Est at\s+(\d{1,2}:\d{2})")
DATE_RE = re.compile(r"\((\d{1,2})/(\d{1,2})/(\d{4})\)")

HKG_LAT, HKG_LON = 22.3080, 113.9185

# Menzies CNAC Flightviewer（夜班貨機 bay 專用）
MCS_URL = "https://fv.menziescnac.com/data2?page=1&ha_filter=&flight_id={fid}&date_filter=today&arr_dep={ad}"
MCS_AIRLINES = ["CX", "LD", "AK", "QY"]  # 淨係呢四間要 bay

def fetch_mcs_bays():
    """23:00-06:00 先抓；回 {flight_id: bay}，key 係 'CX 123' 格式（Menzies 嘅 Flight 欄）。"""
    now = datetime.now(HKT)
    h = now.hour
    # 23:00-04:00 先抓（04:00 後唔使再抓；顯示窗口照舊 23:00-06:00）
    if not (h >= 23 or h < 4):
        return {}
    bays = {}
    for al in MCS_AIRLINES:
        for ad in ("a", "d"):
            url = MCS_URL.format(fid=al, ad=ad)
            try:
                req = urllib.request.Request(url, headers={
                    "Referer": "https://fv.menziescnac.com/",
                    "User-Agent": "Mozilla/5.0",
                })
                with urllib.request.urlopen(req, timeout=TIMEOUT_SECS) as resp:
                    d = json.load(resp)
                for r in d.get("rows") or []:
                    # 淨係要貨機（T=F/H）
                    if r.get("T") not in ("F", "H"):
                        continue
                    flt = (r.get("Flight") or "").strip()
                    # 去掉 codeshare 括號，例如 "CX5651[UO651]" -> "CX5651"
                    if "[" in flt:
                        flt = flt.split("[")[0].strip()
                    st = (r.get("ST") or "").strip()
                    # ST 可能係 "X25(X15)"，攞括號前嗰個（最新）
                    if st and "(" in st:
                        st = st.split("(")[0].strip()
                    if flt and st and st.lower() != "none":
                        bays[flt] = st
            except Exception as exc:
                print(f"WARN: mcs {al}/{ad} failed ({exc})", file=sys.stderr)
    return bays

def _load_coords():
    try:
        p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "airport_coords.json")
        with open(p, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}
AIRPORT_COORDS = _load_coords()

def rough_duration(iata: str) -> str:
    """由大圓距離估算飛行時間（大致），如 '10h25m'；無座標回 ''。"""
    c = AIRPORT_COORDS.get(iata or "")
    if not c:
        return ""
    la1, lo1 = math.radians(HKG_LAT), math.radians(HKG_LON)
    la2, lo2 = math.radians(c[0]), math.radians(c[1])
    a = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    km = 12742 * math.asin(math.sqrt(a))
    speed = 750 if km < 1500 else 850  # km/h，短途慢啲
    mins = round(km / speed * 60 + 30)  # +30 分鐘爬升／下降
    mins = round(mins / 5) * 5  # 取至 5 分鐘，大致就得
    h, m = divmod(mins, 60)
    return f"{h}h{m:02d}m" if m else f"{h}h"
STAND_PREFIX_RE = re.compile(r"^([A-Za-z]+)(\d+.*)$")


def parse_actual(status: str, arrival: bool) -> str:
    """Actual arrival (ATA) / departure (ATD) time from a status string."""
    if not status:
        return "—"
    m = (ATA_RE if arrival else ATD_RE).search(status)
    return m.group(1) if m else "—"


def parse_est(status: str) -> str:
    """Estimated time (ETA/ETD) from a status like 'Est at 03:50 (30/09/2026)'."""
    if not status:
        return "—"
    m = EST_RE.search(status)
    return m.group(1) if m else "—"


def parse_status_date(status: str) -> str:
    """Date (YYYY-MM-DD) from a status like 'Est at 01:20 (03/10/2026)'; '' if none."""
    if not status:
        return ""
    m = DATE_RE.search(status)
    if not m:
        return ""
    return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"


def infer_actual_date(flight_date: str, eta: str, actual: str) -> str:
    """Infer the date of an actual (ata/atd) time when the API gives no date.
    If actual is >12h earlier than scheduled by clock, it's the previous day
    (early arrival crossing midnight); if >12h later, it's the next day."""
    def _tm(t):
        m = re.match(r"(\d{1,2}):(\d{2})", t or "")
        return int(m.group(1)) * 60 + int(m.group(2)) if m else None
    em, am = _tm(eta), _tm(actual)
    if em is None or am is None:
        return flight_date
    try:
        base = datetime.strptime(flight_date, "%Y-%m-%d")
    except Exception:
        return flight_date
    if am > em + 720:
        return (base - timedelta(days=1)).strftime("%Y-%m-%d")
    if am < em - 720:
        return (base + timedelta(days=1)).strftime("%Y-%m-%d")
    return flight_date

def fetch(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "hkia-flight-board/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECS) as resp:
        if resp.status != 200:
            raise RuntimeError(f"API returned HTTP {resp.status}")
        return json.load(resp)


def prefix_gate(gate: str, prefix_map: dict) -> str:
    """Add the apron letter to a bare departure gate number when known.

    The departure API only reports bare numbers (e.g. "70"); the letter
    (e.g. "W") is learned from arrival stands. Never guess: unknown numbers
    are returned unchanged.
    """
    g = (gate or "").strip()
    if not g or g == "—" or g[0].isalpha():
        return gate
    letter = prefix_map.get(g)
    return (letter + g) if letter else gate


def parse_flight(f: dict, arrival: bool, cargo: bool) -> dict:
    status = (f.get("status") or "").strip()
    via_list = f.get("origin" if arrival else "destination") or []
    stand = (f.get("stand") if arrival else f.get("gate")) or ""
    est = parse_est(status)
    ata = parse_actual(status, arrival)
    status_date = parse_status_date(status)
    return {
        "flight_id": " / ".join(x.get("no", "") for x in f.get("flight", [])),
        "via": " / ".join(via_list),
        "reg": "—",
        "subtype": "—",
        "stand": stand.strip() or "—",
        "baggage": (f.get("baggage") or "").strip() or "—",
        "hall": (f.get("hall") or "").strip() or "—",
        "eta": (f.get("time") or "").strip(),
        "est": est,
        "est_date": status_date if est != "—" else "",
        "ata": ata,
        "ata_date": status_date if ata != "—" else "",
        "avg_dur": rough_duration(via_list[-1] if via_list else "") if arrival else "",
        "cargo": cargo,
        "cancelled": status.lower() == "cancelled",
        "status_raw": status,
    }


def main() -> int:
    now = datetime.now(HKT)
    dates = [(now + timedelta(days=d)).strftime("%Y-%m-%d") for d in (-1, 0, 1, 2)]

    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(project_root, "data.json")

    # Previous stands/ests, keyed by (date, tab, flight_id), for stand-change
    # detection and for preserving last-known estimated times.
    old_payload = None
    old_stands = {}
    old_ests = {}
    old_stand_olds = {}
    old_stand_miss = {}
    if os.path.exists(out_path):
        try:
            with open(out_path, encoding="utf-8") as fh:
                old_payload = json.load(fh)
            for d, day in (old_payload.get("days") or {}).items():
                for tk in ("arrival", "departure"):
                    for f in day.get(tk, []):
                        old_stands[(d, tk, f.get("flight_id"))] = f.get("stand")
                        if f.get("stand_old"):
                            old_stand_olds[(d, tk, f.get("flight_id"))] = f.get("stand_old")
                        if f.get("stand_miss"):
                            old_stand_miss[(d, tk, f.get("flight_id"))] = f.get("stand_miss")
                        if f.get("est") and f.get("est") != "—":
                            old_ests[(d, tk, f.get("flight_id"))] = (f.get("est"), f.get("est_date") or "")
        except (json.JSONDecodeError, OSError) as exc:
            print(f"WARN: existing data.json unreadable ({exc}), rewriting", file=sys.stderr)
            old_payload = None

    # Stand letter-prefix map (number -> letter, e.g. "70" -> "W"), learned
    # from arrival stands which carry the prefix; applied to departure gates
    # which the API only reports as bare numbers. Add-only: an existing
    # mapping is never overwritten, and unknown numbers are never guessed.
    prefix_path = os.path.join(project_root, "stand_prefix.json")
    prefix_map = {}
    if os.path.exists(prefix_path):
        try:
            with open(prefix_path, encoding="utf-8") as fh:
                prefix_map = json.load(fh) or {}
        except (json.JSONDecodeError, OSError) as exc:
            print(f"WARN: stand_prefix.json unreadable ({exc}), starting empty", file=sys.stderr)
    map_changed = False

    days = {}
    try:
        for date in dates:
            day = {}
            for arrival in (True, False):
                key = "arrival" if arrival else "departure"
                flights = []
                for cargo in (False, True):
                    url = API_URL.format(
                        date=date,
                        cargo=str(cargo).lower(),
                        arrival=str(arrival).lower(),
                    )
                    groups = fetch(url)
                    grp = next((g for g in groups if g.get("date") == date), None)
                    if grp is None:
                        print(f"WARN: no group for {date} in {url}", file=sys.stderr)
                        continue
                    for f in grp.get("list", []):
                        fl = parse_flight(f, arrival, cargo)
                        # 保留上次已知嘅預計時間（要喺排序之前做，等排序用啱時間）：
                        # status 由 "Est at XX:XX" 轉做 Final Call/Boarding 等之後，
                        # API 唔再俾預計時間，但舊嘅仍然有效（未有實際時間先保留）。
                        if fl["est"] == "—" and fl["ata"] == "—":
                            oe = old_ests.get((date, key, fl["flight_id"]))
                            if oe:
                                fl["est"], fl["est_date"] = oe[0], oe[1]
                        if arrival:
                            # Learn number -> letter from arrival stands.
                            pm = STAND_PREFIX_RE.match(fl["stand"])
                            if pm:
                                num, letter = pm.group(2), pm.group(1)
                                if num in prefix_map:
                                    if prefix_map[num] != letter:
                                        print(f"WARN: stand {num} maps to both {prefix_map[num]} and {letter}; keeping {prefix_map[num]}", file=sys.stderr)
                                else:
                                    prefix_map[num] = letter
                                    map_changed = True
                        else:
                            # Departure API only gives bare gate numbers.
                            fl["stand"] = prefix_gate(fl["stand"], prefix_map)
                        flights.append(fl)
                # Sort by most relevant time: actual (ATA/ATD) if landed/departed,
                # else estimated (EST), else scheduled (STA/STD).
                flights.sort(key=lambda fl: fl["ata"] if fl["ata"] != "—" else (fl["est"] if fl["est"] != "—" else fl["eta"]))
                for i, fl in enumerate(flights, start=1):
                    fl["no"] = i
                # 實際時間嘅日期推斷：API 好多時唔俾日期，得個鐘數。
                # 如果實際比原定早／遲超過 12 小時，好可能係前一日／後一日
                #（例如 00:10 嘅機 23:39 到，係前一晚早到，唔係今日未來）。
                for fl in flights:
                    for ak, dk in (("ata", "ata_date"), ("atd", "atd_date")):
                        t = fl.get(ak)
                        if t and t != "—" and not fl.get(dk):
                            fl[dk] = infer_actual_date(date, fl.get("eta"), t)
                # Sanity: 實際時間（連正確日期）唔可以係未來超過 30 分鐘
                for fl in flights:
                    for ak, dk in (("ata", "ata_date"), ("atd", "atd_date")):
                        t = fl.get(ak)
                        d = fl.get(dk) or date
                        if t and t != "—":
                            m = re.match(r"(\d{1,2}):(\d{2})", t)
                            if m:
                                try:
                                    adt = datetime.strptime(f"{d} {t}", "%Y-%m-%d %H:%M").replace(tzinfo=HKT)
                                    if adt > now + timedelta(minutes=30):
                                        print(f"  WARN: {fl['flight_id'][:24]} {ak}={t} ({d}) 係未來，清除", file=sys.stderr)
                                        fl[ak] = "—"
                                        fl[dk] = ""
                                except Exception:
                                    pass
                day[key] = flights
                n_cargo = sum(1 for fl in flights if fl["cargo"])
                print(f"  {date} {key}: {len(flights)} flights ({n_cargo} cargo)")
            days[date] = day
    except Exception as exc:  # timeout, HTTP error, bad JSON...
        print(f"ERROR: failed to fetch flight data: {exc}", file=sys.stderr)
        return 1

    # Stand-change detection (second pass, so departure gates are already
    # prefixed with the final map; old bare numbers are normalized the same
    # way to avoid false "changed" flags on the migration run).
    #
    # Policy (user 2026-10-04):
    # - A change shows as new (old), e.g. W61 (S33). If it changes again,
    #   the previous new becomes the old: C (B).
    # - The marker persists until the flight actually operates (has an
    #   actual time); afterwards only the final stand is kept.
    # - If the API temporarily drops the stand, the last known stand and
    #   marker are kept instead of showing "—". (The old `continue` here
    #   silently dropped stand_old whenever the API omitted the gate.)
    # - If the API drops the stand 3 times in a row (45 min), treat it as
    #   genuinely cancelled: show "—" and clear the marker.
    # - If the old stand is now occupied by a DIFFERENT flight (aircraft
    #   swap: the bay was reassigned), show "—" immediately.
    def _norm(k, s):
        return prefix_gate(s, prefix_map) if k == "departure" else s

    # 今次所有航班佔用緊嘅泊位（用 display form）
    current_stands = set()
    for date in dates:
        day = days.get(date)
        if not day:
            continue
        for key in ("arrival", "departure"):
            for fl in day.get(key, []):
                s = fl.get("stand")
                if s and s != "—":
                    current_stands.add(_norm(key, s))

    for date in dates:
        day = days.get(date)
        if not day:
            continue
        for key in ("arrival", "departure"):
            for fl in day.get(key, []):
                k = (date, key, fl["flight_id"])
                prev = old_stands.get(k)
                prev_old = old_stand_olds.get(k)
                cur = fl["stand"]
                flown = bool(fl.get("ata") and fl["ata"] != "—")
                # 上次嘅 stand/stand_old 轉做 display form 先比較
                prev_d = _norm(key, prev) if prev and prev != "—" else prev
                prev_old_d = _norm(key, prev_old) if prev_old and prev_old != "—" else prev_old
                if flown:
                    # 起飛／降落後：只留最終泊位，唔再顯示變動
                    if (not cur or cur == "—") and prev_d and prev_d != "—":
                        fl["stand"] = prev_d
                    fl.pop("stand_old", None)
                    continue
                if not cur or cur == "—":
                    # API 今次冇俾泊位
                    miss = old_stand_miss.get(k, 0) + 1
                    # 舊 bay 俾咗另一班機（換飛機）：即刻當取消
                    bay_taken = bool(prev_d and prev_d != "—" and prev_d in current_stands)
                    if bay_taken or miss >= 3:
                        # 真係冇咗：顯示 —，清 marker
                        fl["stand"] = "—"
                        fl.pop("stand_old", None)
                        fl["stand_miss"] = miss
                    elif prev_d and prev_d != "—":
                        # 暫時甩：沿用上次已知嘅泊位＋變動標記
                        fl["stand"] = prev_d
                        if prev_old_d and prev_old_d != "—" and prev_old_d != prev_d:
                            fl["stand_old"] = prev_old_d
                        fl["stand_miss"] = miss
                    else:
                        fl["stand_miss"] = miss
                    continue
                # 有泊位：reset miss count
                fl.pop("stand_miss", None)
                if prev_d and prev_d != "—" and prev_d != cur:
                    # 泊位變咗：上次嘅新（prev）變成今次嘅舊
                    fl["stand_old"] = prev_d
                elif prev_old_d and prev_old_d != "—" and prev_old_d != cur:
                    # 泊位冇變：上次嘅變動標記繼續留住，直到起飛／降落
                    fl["stand_old"] = prev_old_d

    if map_changed:
        tmp_map = prefix_path + ".tmp"
        with open(tmp_map, "w", encoding="utf-8") as fh:
            json.dump(prefix_map, fh, ensure_ascii=False, indent=2, sort_keys=True)
            fh.write("\n")
        os.replace(tmp_map, prefix_path)
        print(f"OK: stand_prefix.json updated ({len(prefix_map)} mappings)")

    payload = {
        "generated_at": now.strftime("%Y-%m-%d %H:%M") + " HKT",
        "dates": dates,
        "days": days,
        "mcs_bays": fetch_mcs_bays(),
    }
    # 輕量版：淨係頭 3 日（昨天/今天/明天，UI 顯示用），細 ~30%
    slim_payload = {
        "generated_at": payload["generated_at"],
        "dates": dates[:3],
        "days": {d: days[d] for d in dates[:3]},
        "mcs_bays": payload["mcs_bays"],
    }

    # Idempotent: only rewrite when the data actually changed, so the CI
    # `git diff` check correctly reports "no change" and skips the commit.
    # (stand_old is part of days, so a newly detected / cleared stand change
    # counts as a change.)
    if old_payload is not None:
        if old_payload.get("dates") == dates[:3] and old_payload.get("days") == slim_payload["days"] and old_payload.get("mcs_bays") == slim_payload["mcs_bays"]:
            total = sum(len(v) for d in days.values() for v in d.values())
            print(f"OK: no change ({total} flights), kept {out_path}")
            return 0

    tmp_path = out_path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(slim_payload, fh, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp_path, out_path)

    # 完整版（4 日齊）另外存 data-full.json
    full_path = os.path.join(os.path.dirname(out_path), "data-full.json")
    tmp_full = full_path + ".tmp"
    with open(tmp_full, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp_full, full_path)

    total = sum(len(v) for d in days.values() for v in d.values())
    slim_total = sum(len(v) for d in slim_payload["days"].values() for v in d.values())
    print(f"OK: wrote {slim_total} flights for {dates[0]}..{dates[2]} -> {out_path}")
    print(f"OK: wrote {total} flights for {dates[0]}..{dates[3]} -> {full_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Fetch HKIA flights for yesterday/today/tomorrow (Asia/Hong_Kong).

Covers arrival + departure, passenger + cargo. Writes data.json.

Idempotent: rewrites data.json only when the flight data changed; on any
API failure exits non-zero and leaves the existing file untouched.
No third-party dependencies.
"""

import json
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

# Menzies CNAC flight info (cargo handler). Arrival/departure pages carry the
# STAND (ST) field, which the official API does not publish for cargo flights.
# GENTLE mode: today only, first 2 pages per direction (most imminent flights),
# 3s delay between requests, 30s timeout (their API is slow, ~20s/response),
# and only runs ~every 45 min (not every workflow run).
# Best-effort secondary source: only fills stands the official API leaves as "—".
MENZIES_URL = (
    "https://fv.menziescnac.com/data2"
    "?page={page}&ha_filter=all&flight_id=&date_filter={date_filter}&arr_dep={arr_dep}"
)
MENZIES_TIMEOUT_SECS = 30
MENZIES_MAX_PAGES = 2
MENZIES_DELAY_SECS = 3

ATA_RE = re.compile(r"(?:At gate|Landed)\s+(\d{1,2}:\d{2})")
ATD_RE = re.compile(r"Dep\s+(\d{1,2}:\d{2})")
EST_RE = re.compile(r"Est at\s+(\d{1,2}:\d{2})")


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


def fetch(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "hkia-flight-board/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECS) as resp:
        if resp.status != 200:
            raise RuntimeError(f"API returned HTTP {resp.status}")
        return json.load(resp)


def should_fetch_menzies(now) -> bool:
    """Only fetch Menzies ~every 45 min (workflow runs every 15 min at
    :00/:15/:30/:45, so this fires at :00 and :45). Keeps request volume low."""
    return (now.minute % 45) < 15


def fetch_menzies_stands(date_filter: str, arr_dep: str) -> dict:
    """Gentle best-effort: {flight_code: stand} from Menzies.

    Only first MENZIES_MAX_PAGES pages, MENZIES_DELAY_SECS pause between
    requests, short timeout. Never raises: on any failure returns {} and
    the caller skips enrichment (old stands are preserved).
    """
    import time
    code_to_stand: dict = {}
    try:
        for page in range(1, MENZIES_MAX_PAGES + 1):
            url = MENZIES_URL.format(page=page, date_filter=date_filter, arr_dep=arr_dep)
            req = urllib.request.Request(url, headers={"User-Agent": "hkia-flight-board/1.0"})
            with urllib.request.urlopen(req, timeout=MENZIES_TIMEOUT_SECS) as resp:
                data = json.load(resp)
            for row in data.get("rows") or []:
                st = (row.get("ST") or "").strip()
                if not st or st == "-":
                    continue
                for c in flight_codes(row.get("Flight") or ""):
                    code_to_stand.setdefault(c, st)
            # Stop early if we've seen all pages.
            total = int(data.get("total_pages") or 1)
            if page >= total:
                break
            time.sleep(MENZIES_DELAY_SECS)
    except Exception as exc:
        print(f"WARN: menzies stand fetch ({date_filter}/{arr_dep}) failed: {exc}, skipping", file=sys.stderr)
        return {}
    return code_to_stand


def flight_codes(s: str) -> set:
    """Normalize 'CX 501 / QR 3458' or 'AY5099[CX165]' -> {'CX501','QR3458'}."""
    return {p for p in re.split(r"[\/\[\]\(\)]+", (s or "").upper().replace(" ", "")) if p}


def parse_flight(f: dict, arrival: bool, cargo: bool) -> dict:
    status = (f.get("status") or "").strip()
    via_list = f.get("origin" if arrival else "destination") or []
    stand = (f.get("stand") if arrival else f.get("gate")) or ""
    return {
        "flight_id": " / ".join(x.get("no", "") for x in f.get("flight", [])),
        "via": " / ".join(via_list),
        "reg": "—",
        "subtype": "—",
        "stand": stand.strip() or "—",
        "eta": (f.get("time") or "").strip(),
        "est": parse_est(status),
        "ata": parse_actual(status, arrival),
        "cargo": cargo,
        "status_raw": status,
    }


def main() -> int:
    now = datetime.now(HKT)
    dates = [(now + timedelta(days=d)).strftime("%Y-%m-%d") for d in (-1, 0, 1)]

    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(project_root, "data.json")

    # Previous stands, keyed by (date, tab, flight_id), for stand-change detection.
    old_payload = None
    old_stands = {}
    if os.path.exists(out_path):
        try:
            with open(out_path, encoding="utf-8") as fh:
                old_payload = json.load(fh)
            for d, day in (old_payload.get("days") or {}).items():
                for tk in ("arrival", "departure"):
                    for f in day.get(tk, []):
                        old_stands[(d, tk, f.get("flight_id"))] = f.get("stand")
        except (json.JSONDecodeError, OSError) as exc:
            print(f"WARN: existing data.json unreadable ({exc}), rewriting", file=sys.stderr)
            old_payload = None

    days = {}
    # Menzies stand enrichment (gentle: ~every 45 min, first pages only).
    # Official first; Menzies only fills stands the official API leaves as "—".
    # Their API only serves today/tomorrow (yesterday -> HTTP 500).
    # On failure returns {}, old stands are preserved (never wiped).
    menzies = {}  # (date_filter, arr_dep) -> {code: stand}
    if should_fetch_menzies(now):
        df_for_date = {dates[1]: "today"}
        for df in ("today",):
            for ad in ("A", "D"):
                m = fetch_menzies_stands(df, ad)
                if m:
                    menzies[(df, ad)] = m
                    print(f"  menzies {df} {ad}: {len(m)} flight codes with stands")
    else:
        print("  menzies: skipped (gentle interval, next ~45min run)")
    df_for_date = {dates[1]: "today"}
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
                        flights.append(parse_flight(f, arrival, cargo))
                # Fill stands missing from the official API.
                # Priority: 1) fresh Menzies (if fetched this run),
                #           2) preserved from previous run (don't wipe on skip/fail).
                # Official non-"—" stands are never overwritten.
                df = df_for_date.get(date)
                ad = "A" if arrival else "D"
                code_to_stand = menzies.get((df, ad), {})
                n_fill, n_keep = 0, 0
                for fl in flights:
                    if fl["stand"] != "—":
                        continue
                    filled = False
                    for c in flight_codes(fl["flight_id"]):
                        if c in code_to_stand:
                            fl["stand"] = code_to_stand[c]
                            n_fill += 1
                            filled = True
                            break
                    if not filled:
                        prev = old_stands.get((date, key, fl["flight_id"]))
                        if prev and prev != "—":
                            fl["stand"] = prev
                            n_keep += 1
                if n_fill:
                    print(f"  {date} {key}: menzies filled {n_fill} stands")
                if n_keep:
                    print(f"  {date} {key}: kept {n_keep} stands from previous run")
                for fl in flights:
                    prev = old_stands.get((date, key, fl["flight_id"]))
                    cur = fl["stand"]
                    if prev and cur and prev != "—" and cur != "—" and prev != cur:
                        fl["stand_old"] = prev
                # Sort by most relevant time: actual (ATA/ATD) if landed/departed,
                # else estimated (EST), else scheduled (STA/STD).
                flights.sort(key=lambda fl: fl["ata"] if fl["ata"] != "—" else (fl["est"] if fl["est"] != "—" else fl["eta"]))
                for i, fl in enumerate(flights, start=1):
                    fl["no"] = i
                day[key] = flights
                n_cargo = sum(1 for fl in flights if fl["cargo"])
                print(f"  {date} {key}: {len(flights)} flights ({n_cargo} cargo)")
            days[date] = day
    except Exception as exc:  # timeout, HTTP error, bad JSON...
        print(f"ERROR: failed to fetch flight data: {exc}", file=sys.stderr)
        return 1

    payload = {
        "generated_at": now.strftime("%Y-%m-%d %H:%M") + " HKT",
        "dates": dates,
        "days": days,
    }

    # Idempotent: only rewrite when the data actually changed, so the CI
    # `git diff` check correctly reports "no change" and skips the commit.
    # (stand_old is part of days, so a newly detected / cleared stand change
    # counts as a change.)
    if old_payload is not None:
        if old_payload.get("dates") == dates and old_payload.get("days") == days:
            total = sum(len(v) for d in days.values() for v in d.values())
            print(f"OK: no change ({total} flights), kept {out_path}")
            return 0

    tmp_path = out_path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp_path, out_path)

    total = sum(len(v) for d in days.values() for v in d.values())
    print(f"OK: wrote {total} flights for {dates[0]}..{dates[2]} -> {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

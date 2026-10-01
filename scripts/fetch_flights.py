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

ATA_RE = re.compile(r"(?:At gate|Landed)\s+(\d{1,2}:\d{2})")
ATD_RE = re.compile(r"Dep\s+(\d{1,2}:\d{2})")
EST_RE = re.compile(r"Est at\s+(\d{1,2}:\d{2})")
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
    return {
        "flight_id": " / ".join(x.get("no", "") for x in f.get("flight", [])),
        "via": " / ".join(via_list),
        "reg": "—",
        "subtype": "—",
        "stand": stand.strip() or "—",
        "baggage": (f.get("baggage") or "").strip() or "—",
        "hall": (f.get("hall") or "").strip() or "—",
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
    for date in dates:
        day = days.get(date)
        if not day:
            continue
        for key in ("arrival", "departure"):
            for fl in day.get(key, []):
                prev = old_stands.get((date, key, fl["flight_id"]))
                cur = fl["stand"]
                if not prev or prev == "—" or not cur or cur == "—":
                    continue
                prev_norm = prefix_gate(prev, prefix_map) if key == "departure" else prev
                if prev_norm != cur:
                    fl["stand_old"] = prev

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

#!/usr/bin/env python3
"""Fetch HKIA arrival flights for today (Asia/Hong_Kong) and write data.json.

Idempotent: writes data.json atomically only on success. On any API failure
it exits non-zero and leaves the existing data.json untouched.

Usage: python3 scripts/fetch_flights.py [output_path]
Default output: data.json next to the project root (parent of scripts/).
No third-party dependencies.
"""

import json
import os
import re
import sys
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

HKT = ZoneInfo("Asia/Hong_Kong")
API_URL = (
    "https://www.hongkongairport.com/flightinfo-rest/rest/flights"
    "/past?date={date}&lan=tc&cargo=false&arrival=true"
)
TIMEOUT_SECS = 30

ATA_RE = re.compile(r"(?:At gate|Landed)\s+(\d{1,2}:\d{2})")


def parse_ata(status: str) -> str:
    """Extract actual arrival time from a status string, else '—'."""
    if not status:
        return "—"
    m = ATA_RE.search(status)
    return m.group(1) if m else "—"


def fetch(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "hkia-flight-board/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECS) as resp:
        if resp.status != 200:
            raise RuntimeError(f"API returned HTTP {resp.status}")
        return json.load(resp)


def main() -> int:
    now = datetime.now(HKT)
    today = now.strftime("%Y-%m-%d")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(project_root, "data.json")

    try:
        days = fetch(API_URL.format(date=today))
    except Exception as exc:  # timeout, HTTP error, bad JSON...
        print(f"ERROR: failed to fetch flight data: {exc}", file=sys.stderr)
        return 1

    day = next((d for d in days if d.get("date") == today), None)
    if day is None:
        print(f"ERROR: API response has no entry for {today}", file=sys.stderr)
        return 1

    flights = []
    for i, f in enumerate(day.get("list", []), start=1):
        status = (f.get("status") or "").strip()
        flights.append(
            {
                "no": i,
                "flight_id": " / ".join(x.get("no", "") for x in f.get("flight", [])),
                "reg": "—",
                "subtype": "—",
                "stand": (f.get("stand") or "").strip() or "—",
                "eta": (f.get("time") or "").strip(),
                "ata": parse_ata(status),
                "status_raw": status,
            }
        )

    payload = {
        "generated_at": now.strftime("%Y-%m-%d %H:%M") + " HKT",
        "date": today,
        "count": len(flights),
        "flights": flights,
    }

    # Idempotent: if the flight list is unchanged, keep the existing file so
    # `git diff` in CI correctly reports "no change" and skips the commit.
    if os.path.exists(out_path):
        try:
            with open(out_path, encoding="utf-8") as fh:
                old = json.load(fh)
            if old.get("date") == today and old.get("flights") == flights:
                print(f"OK: no change ({len(flights)} flights), kept {out_path}")
                return 0
        except (json.JSONDecodeError, OSError) as exc:
            print(f"WARN: existing data.json unreadable ({exc}), rewriting", file=sys.stderr)

    tmp_path = out_path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp_path, out_path)

    print(f"OK: wrote {len(flights)} flights for {today} -> {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "history.json"
UOB_FEED_URL = "https://www.uobgroup.com/wsm/gold-silver"

DISPLAY_NAMES = {
    "ACB": "ARGOR Cast Bar",
    "ALB": "ARGOR Heraeus Lunar Bar",
    "CTB": "Cast Bars",
    "GBC": "Gold Bullion Coins",
    "GCT": "Gold Certificate",
    "GSA": "Gold Savings Account",
    "PGL": "PAMP Gold Bars",
    "PLB": "PAMP Lunar Bar",
    "ULB": "UOB Lunar Bar",
    "UOB": "UOB Bar",
}

UOB_ORDER = [
    ("ACB", "100 GM"),
    ("ALB", "1 GM"),
    ("ALB", "5 GM"),
    ("ALB", "10 GM"),
    ("ALB", "1 OZ"),
    ("CTB", "1 KILOBAR"),
    ("GCT", "1 KILOCERT"),
    ("GSA", "1 GM"),
    ("GBC", "1 OZ"),
    ("GBC", "1/2 OZ"),
    ("GBC", "1/4 OZ"),
    ("GBC", "1/10 OZ"),
    ("GBC", "1/20 OZ(GNC,SLC &GML)"),
    ("PGL", "100 GM"),
    ("PGL", "50 GM"),
    ("PGL", "20 GM"),
    ("PGL", "10 GM"),
    ("PGL", "5 GM"),
    ("PGL", "2.5 GM"),
    ("PGL", "1 GM"),
    ("PGL", "1 OZ"),
    ("PGL", "1/2 OZ"),
    ("PLB", "1 OZ"),
    ("PLB", "5 GM"),
    ("ULB", "1 OZ"),
    ("ULB", "50 GM"),
    ("ULB", "100 GM"),
    ("ULB", "10 GM"),
    ("UOB", "1 OZ"),
    ("UOB", "50 GM"),
    ("UOB", "100 GM"),
]

ORDER_MAP = {f"{code}|{unit}": index for index, (code, unit) in enumerate(UOB_ORDER)}


def fetch_feed() -> dict:
    request = Request(
        UOB_FEED_URL,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json",
        },
    )
    with urlopen(request, timeout=25) as response:
        return json.loads(response.read().decode("utf-8"))


def normalize_item(raw_item: dict) -> dict | None:
    code = raw_item.get("description")
    if code not in DISPLAY_NAMES:
        return None

    unit = str(raw_item.get("unit", "")).strip()
    item_id = f"{code}|{unit}"

    return {
        "id": item_id,
        "code": code,
        "name": DISPLAY_NAMES[code],
        "unit": unit,
        "currency": raw_item.get("currency") or "SGD",
        "bankSell": float(raw_item["bankSell"]) if raw_item.get("bankSell") else None,
        "bankBuy": float(raw_item["bankBuy"]) if raw_item.get("bankBuy") else None,
        "sortOrder": ORDER_MAP.get(item_id, 9999),
    }


def normalize_snapshot(feed: dict) -> dict:
    items = []
    for raw_item in feed.get("types", []):
        normalized = normalize_item(raw_item)
        if normalized is not None:
            items.append(normalized)

    items.sort(key=lambda item: (item["sortOrder"], item["name"], item["unit"]))
    return {
        "fetchedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "sourceDate": str(feed.get("currentDate", "")).strip(),
        "sourceTime": str(feed.get("time", "")).strip(),
        "items": items,
    }


def read_history() -> list[dict]:
    if not DATA_PATH.exists():
        return []
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def write_history(history: list[dict]) -> None:
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(json.dumps(history, indent=2), encoding="utf-8")


def snapshot_sort_key(snapshot: dict) -> tuple[str, str]:
    return (
        str(snapshot.get("sourceDate", "")),
        str(snapshot.get("sourceTime", "")).zfill(6),
    )


def main() -> None:
    history = read_history()
    latest = normalize_snapshot(fetch_feed())
    latest_key = (latest["sourceDate"], latest["sourceTime"])

    for existing in history:
        if (existing.get("sourceDate"), existing.get("sourceTime")) == latest_key:
            print("No new UOB snapshot to append.")
            return

    history.append(latest)
    history.sort(key=snapshot_sort_key)
    write_history(history)
    print(f"Saved new UOB snapshot for {latest['sourceDate']} {latest['sourceTime']}.")


if __name__ == "__main__":
    main()

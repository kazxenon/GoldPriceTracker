from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
HISTORY_PATH = DATA_DIR / "history.json"
GLOBAL_GOLD_CACHE_PATH = DATA_DIR / "global_gold_cache.json"
UOB_FEED_URL = "https://www.uobgroup.com/wsm/gold-silver"
FREE_GOLD_API_URL = "https://freegoldapi.com/data/latest.json"
FRANKFURTER_API_URL = "https://api.frankfurter.dev/v1/"

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


@dataclass
class ApiError(Exception):
    status: int
    message: str


def to_decimal(value: str | None) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(Decimal(str(value)))
    except (InvalidOperation, ValueError):
        return None


def read_history() -> list[dict[str, Any]]:
    if not HISTORY_PATH.exists():
        return []
    try:
        return json.loads(HISTORY_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []


def write_history(history: list[dict[str, Any]]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    HISTORY_PATH.write_text(json.dumps(history, indent=2), encoding="utf-8")


def normalize_item(raw_item: dict[str, Any]) -> dict[str, Any] | None:
    code = raw_item.get("description")
    if code not in DISPLAY_NAMES:
        return None

    unit = str(raw_item.get("unit", "")).strip()
    item_id = f"{code}|{unit}"
    bank_sell = to_decimal(raw_item.get("bankSell"))
    bank_buy = to_decimal(raw_item.get("bankBuy"))

    return {
        "id": item_id,
        "code": code,
        "name": DISPLAY_NAMES[code],
        "unit": unit,
        "currency": raw_item.get("currency") or "SGD",
        "bankSell": bank_sell,
        "bankBuy": bank_buy,
        "sortOrder": ORDER_MAP.get(item_id, 9999),
    }


def normalize_snapshot(feed: dict[str, Any]) -> dict[str, Any]:
    items = []
    for raw_item in feed.get("types", []):
        normalized = normalize_item(raw_item)
        if normalized is not None:
            items.append(normalized)

    items.sort(key=lambda item: (item["sortOrder"], item["name"], item["unit"]))

    source_date = str(feed.get("currentDate", "")).strip()
    source_time = str(feed.get("time", "")).strip()
    fetched_at = datetime.now().astimezone().isoformat(timespec="seconds")

    return {
        "fetchedAt": fetched_at,
        "sourceDate": source_date,
        "sourceTime": source_time,
        "items": items,
    }


def fetch_live_feed() -> dict[str, Any]:
    request = Request(
        UOB_FEED_URL,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=20) as response:
            payload = response.read().decode("utf-8")
    except HTTPError as error:
        raise ApiError(HTTPStatus.BAD_GATEWAY, f"UOB returned HTTP {error.code}.") from error
    except URLError as error:
        raise ApiError(
            HTTPStatus.BAD_GATEWAY,
            "Unable to reach UOB right now. Check your network and try again.",
        ) from error

    try:
        return json.loads(payload)
    except json.JSONDecodeError as error:
        raise ApiError(HTTPStatus.BAD_GATEWAY, "UOB returned an unreadable response.") from error


def save_snapshot(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    history = read_history()
    snapshot_key = (snapshot.get("sourceDate"), snapshot.get("sourceTime"))

    for existing in history:
        existing_key = (existing.get("sourceDate"), existing.get("sourceTime"))
        if existing_key == snapshot_key:
            return history

    history.append(snapshot)
    history.sort(key=lambda entry: entry.get("fetchedAt", ""))
    write_history(history)
    return history


def build_response_payload(record_latest: bool = False) -> dict[str, Any]:
    latest_snapshot = None
    history = read_history()

    if record_latest:
        latest_snapshot = normalize_snapshot(fetch_live_feed())
        history = save_snapshot(latest_snapshot)
    elif history:
        latest_snapshot = history[-1]

    return {
        "latest": latest_snapshot,
        "history": history,
        "updatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
    }


def fetch_json(url: str) -> Any:
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=25) as response:
            payload = response.read().decode("utf-8")
    except HTTPError as error:
        raise ApiError(HTTPStatus.BAD_GATEWAY, f"Remote source returned HTTP {error.code}.") from error
    except URLError as error:
        raise ApiError(
            HTTPStatus.BAD_GATEWAY,
            "Unable to reach the external gold data source right now. Check your network and try again.",
        ) from error

    try:
        return json.loads(payload)
    except json.JSONDecodeError as error:
        raise ApiError(HTTPStatus.BAD_GATEWAY, "External data source returned unreadable JSON.") from error


def read_json_file(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def write_json_file(path: Path, payload: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def get_global_gold_dataset() -> list[dict[str, Any]]:
    cached = read_json_file(GLOBAL_GOLD_CACHE_PATH)
    today_key = datetime.now().astimezone().date().isoformat()
    if cached and cached.get("fetchedOn") == today_key:
        return cached.get("items", [])

    raw_items = fetch_json(FREE_GOLD_API_URL)
    items = [
        item for item in raw_items
        if str(item.get("date", "")) >= "1999-01-01" and item.get("price") is not None
    ]
    write_json_file(GLOBAL_GOLD_CACHE_PATH, {"fetchedOn": today_key, "items": items})
    return items


def get_date_window(view: str) -> tuple[date, str]:
    today = datetime.now().astimezone().date()
    if view == "day":
        return today - timedelta(days=35), "day"
    if view == "month":
        return today - timedelta(days=760), "month"
    return today - timedelta(days=3652), "year"


def fetch_fx_rates(start_date: str, end_date: str, currency: str) -> dict[str, float]:
    if currency == "USD":
        return {}

    url = f"{FRANKFURTER_API_URL}{start_date}..{end_date}?base=USD&symbols={currency}"
    payload = fetch_json(url)
    rates = payload.get("rates", {})
    return {
        rate_date: float(values[currency])
        for rate_date, values in rates.items()
        if currency in values
    }


def pick_latest_by_bucket(entries: list[dict[str, Any]], bucket: str) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for entry in entries:
        entry_date = entry["date"]
        if bucket == "year":
            key = entry_date[:4]
            label = key
        elif bucket == "month":
            key = entry_date[:7]
            year, month = key.split("-")
            label = datetime(int(year), int(month), 1).strftime("%b %Y")
        else:
            key = entry_date
            label = datetime.fromisoformat(entry_date).strftime("%d %b %Y")

        grouped[key] = {
            "date": entry_date,
            "label": label,
            "price": entry["price"],
            "currency": entry["currency"],
            "unit": entry["unit"],
        }

    return [grouped[key] for key in sorted(grouped.keys())]


def convert_price(price_per_ozt_usd: float, currency_rate: float, unit: str) -> float:
    price = price_per_ozt_usd * currency_rate
    if unit == "gram":
        return price / 31.1034768
    if unit == "kg":
        return price * 32.1507465686
    return price


def build_global_gold_payload(currency: str = "USD", unit: str = "ozt", view: str = "year") -> dict[str, Any]:
    currency = currency.upper()
    if currency not in {"USD", "SGD"}:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Currency must be USD or SGD.")

    if unit not in {"ozt", "gram", "kg"}:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Unit must be ozt, gram, or kg.")

    if view not in {"day", "month", "year"}:
        raise ApiError(HTTPStatus.BAD_REQUEST, "View must be day, month, or year.")

    dataset = get_global_gold_dataset()
    start_window, bucket = get_date_window(view)
    filtered = [
        item for item in dataset
        if datetime.fromisoformat(item["date"]).date() >= start_window
    ]
    if not filtered:
        raise ApiError(HTTPStatus.BAD_GATEWAY, "No gold history was returned for this view.")

    fx_rates = fetch_fx_rates(filtered[0]["date"], filtered[-1]["date"], currency)
    latest_rate = 1.0
    if currency == "SGD" and fx_rates:
        latest_rate = fx_rates[sorted(fx_rates.keys())[0]]
    converted_entries = []

    for item in filtered:
        rate = 1.0
        if currency == "SGD":
            if item["date"] in fx_rates:
                latest_rate = fx_rates[item["date"]]
            rate = latest_rate

        converted_entries.append({
            "date": item["date"],
            "price": round(convert_price(float(item["price"]), rate, unit), 4),
            "currency": currency,
            "unit": unit,
        })

    points = pick_latest_by_bucket(converted_entries, bucket)
    latest_point = points[-1]
    first_point = points[0]

    return {
        "source": "FreeGoldAPI + Frankfurter",
        "view": view,
        "currency": currency,
        "unit": unit,
        "points": points,
        "summary": {
            "latestPrice": latest_point["price"],
            "latestDate": latest_point["date"],
            "change": round(latest_point["price"] - first_point["price"], 4),
            "pointCount": len(points),
        },
        "updatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
    }


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if self.path.startswith("/api/refresh"):
            self.handle_api(record_latest=True)
            return

        if self.path.startswith("/api/data"):
            should_refresh = "refresh=1" in self.path
            self.handle_api(record_latest=should_refresh)
            return

        if parsed.path == "/api/global-gold":
            self.handle_global_gold(parsed.query)
            return

        if self.path in ("/", "/index.html"):
            self.path = "/index.html"

        super().do_GET()

    def handle_api(self, record_latest: bool) -> None:
        try:
            payload = build_response_payload(record_latest=record_latest)
            self.send_json(HTTPStatus.OK, payload)
        except ApiError as error:
            self.send_json(error.status, {"error": error.message})
        except Exception:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "Unexpected server error."})

    def handle_global_gold(self, query: str) -> None:
        params = parse_qs(query)
        currency = params.get("currency", ["USD"])[0]
        unit = params.get("unit", ["ozt"])[0]
        view = params.get("view", ["year"])[0]

        try:
            payload = build_global_gold_payload(currency=currency, unit=unit, view=view)
            self.send_json(HTTPStatus.OK, payload)
        except ApiError as error:
            self.send_json(error.status, {"error": error.message})
        except Exception:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "Unexpected server error."})

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 8000), AppHandler)
    print("UOB Gold Tracker running at http://127.0.0.1:8000")
    server.serve_forever()


if __name__ == "__main__":
    main()

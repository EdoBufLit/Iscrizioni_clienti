from __future__ import annotations

import json
import unicodedata
from functools import lru_cache
from pathlib import Path


_DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "italian_municipalities.json"


def normalize_municipality_text(value: str | None) -> str:
    if value is None:
        return ""
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    cleaned = "".join(ch if ch.isalnum() else " " for ch in ascii_text.upper())
    return " ".join(cleaned.split())


@lru_cache(maxsize=1)
def _load_municipalities() -> tuple[dict, ...]:
    with _DATA_PATH.open("r", encoding="utf-8") as fh:
        raw_items = json.load(fh)

    prepared = []
    for item in raw_items:
        name = str(item.get("name") or "").strip()
        province = str(item.get("province") or "").strip().upper() or None
        region = str(item.get("region") or "").strip() or None
        code = str(item.get("code") or "").strip().upper()
        if not name or not code:
            continue
        prepared.append(
            {
                "name": name,
                "province": province,
                "region": region,
                "code": code,
                "_search": normalize_municipality_text(name),
            }
        )
    return tuple(prepared)


@lru_cache(maxsize=1)
def _municipality_by_code() -> dict[str, dict]:
    return {
        item["code"]: {
            "name": item["name"],
            "province": item["province"],
            "region": item["region"],
            "code": item["code"],
        }
        for item in _load_municipalities()
    }


def get_municipality_by_code(code: str | None) -> dict | None:
    normalized_code = (code or "").strip().upper()
    if not normalized_code:
        return None
    return _municipality_by_code().get(normalized_code)


def search_municipalities(query: str | None, *, limit: int = 10) -> list[dict]:
    normalized_query = normalize_municipality_text(query)
    if len(normalized_query) < 2:
        return []

    capped_limit = max(1, min(limit, 20))
    matches: list[tuple[int, str, dict]] = []
    for item in _load_municipalities():
        search_key = item["_search"]
        idx = search_key.find(normalized_query)
        if idx == -1:
            continue
        matches.append(
            (
                idx,
                search_key,
                {
                    "name": item["name"],
                    "province": item["province"],
                    "region": item["region"],
                    "code": item["code"],
                },
            )
        )

    matches.sort(key=lambda entry: (entry[0], len(entry[1]), entry[2]["name"]))
    return [entry[2] for entry in matches[:capped_limit]]

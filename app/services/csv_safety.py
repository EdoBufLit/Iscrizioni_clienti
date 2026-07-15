from __future__ import annotations

import unicodedata
from typing import Any


_FORMULA_PREFIXES = {"=", "+", "-", "@"}


def neutralize_csv_formula(value: Any) -> Any:
    """Keep string cells from being interpreted as formulas by spreadsheets."""
    if not isinstance(value, str) or not value:
        return value

    for character in value:
        if character.isspace() or unicodedata.category(character).startswith("C"):
            continue
        if character in _FORMULA_PREFIXES:
            return f"'{value}"
        break

    return value

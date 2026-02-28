from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import date


_MONTH_CODES = {
    1: "A",
    2: "B",
    3: "C",
    4: "D",
    5: "E",
    6: "H",
    7: "L",
    8: "M",
    9: "P",
    10: "R",
    11: "S",
    12: "T",
}
_VOWELS = {"A", "E", "I", "O", "U"}
_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
_FORMAL_PATTERN = re.compile(
    r"^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST]"
    r"[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$"
)
_OMOCODIA_DECODE = {
    "L": "0",
    "M": "1",
    "N": "2",
    "P": "3",
    "Q": "4",
    "R": "5",
    "S": "6",
    "T": "7",
    "U": "8",
    "V": "9",
}
_OMOCODIA_POSITIONS = {6, 7, 9, 10, 12, 13, 14}
_ODD_VALUES = {
    "0": 1,
    "1": 0,
    "2": 5,
    "3": 7,
    "4": 9,
    "5": 13,
    "6": 15,
    "7": 17,
    "8": 19,
    "9": 21,
    "A": 1,
    "B": 0,
    "C": 5,
    "D": 7,
    "E": 9,
    "F": 13,
    "G": 15,
    "H": 17,
    "I": 19,
    "J": 21,
    "K": 2,
    "L": 4,
    "M": 18,
    "N": 20,
    "O": 11,
    "P": 3,
    "Q": 6,
    "R": 8,
    "S": 12,
    "T": 14,
    "U": 16,
    "V": 10,
    "W": 22,
    "X": 25,
    "Y": 24,
    "Z": 23,
}
_EVEN_VALUES = {
    **{str(num): num for num in range(10)},
    **{char: index for index, char in enumerate(_ALPHABET)},
}


@dataclass(frozen=True)
class FiscalCodeValidation:
    normalized: str
    canonical: str | None
    expected: str | None
    is_formally_valid: bool
    checksum_valid: bool
    matches_expected: bool | None


def normalize_fiscal_code(value: str | None) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", "", value).strip().upper()


def _normalize_letters(value: str | None) -> str:
    if value is None:
        return ""
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return "".join(ch for ch in ascii_text.upper() if ch.isalpha())


def _encode_name_part(value: str | None, *, is_first_name: bool) -> str:
    letters = _normalize_letters(value)
    consonants = [ch for ch in letters if ch not in _VOWELS]
    vowels = [ch for ch in letters if ch in _VOWELS]
    if is_first_name and len(consonants) >= 4:
        selected = [consonants[0], consonants[2], consonants[3]]
    else:
        selected = consonants[:3]
    selected.extend(vowels)
    selected.extend(["X", "X", "X"])
    return "".join(selected[:3])


def _checksum_char(first_fifteen: str) -> str:
    total = 0
    for index, char in enumerate(first_fifteen.upper(), start=1):
        if index % 2 == 0:
            total += _EVEN_VALUES[char]
        else:
            total += _ODD_VALUES[char]
    return _ALPHABET[total % 26]


def calculate_fiscal_code(
    *,
    first_name: str,
    last_name: str,
    birth_date: date,
    gender: str,
    birth_place_code: str,
) -> str:
    gender_code = (gender or "").strip().upper()
    if gender_code not in {"M", "F"}:
        raise ValueError("gender must be M or F")

    cadastral_code = normalize_fiscal_code(birth_place_code)
    if len(cadastral_code) != 4:
        raise ValueError("birth_place_code must be 4 characters")

    surname_code = _encode_name_part(last_name, is_first_name=False)
    name_code = _encode_name_part(first_name, is_first_name=True)
    year_code = f"{birth_date.year % 100:02d}"
    month_code = _MONTH_CODES[birth_date.month]
    day = birth_date.day + (40 if gender_code == "F" else 0)
    partial = f"{surname_code}{name_code}{year_code}{month_code}{day:02d}{cadastral_code}"
    return f"{partial}{_checksum_char(partial)}"


def canonicalize_fiscal_code(value: str | None) -> str | None:
    normalized = normalize_fiscal_code(value)
    if len(normalized) != 16:
        return None

    chars = list(normalized[:15])
    for pos in _OMOCODIA_POSITIONS:
        char = chars[pos]
        if char.isdigit():
            continue
        decoded = _OMOCODIA_DECODE.get(char)
        if decoded is None:
            return None
        chars[pos] = decoded

    canonical_first_fifteen = "".join(chars)
    return f"{canonical_first_fifteen}{_checksum_char(canonical_first_fifteen)}"


def is_formally_valid_fiscal_code(value: str | None) -> bool:
    normalized = normalize_fiscal_code(value)
    if not _FORMAL_PATTERN.fullmatch(normalized):
        return False
    return normalized[-1] == _checksum_char(normalized[:15])


def validate_fiscal_code(
    *,
    fiscal_code: str | None,
    first_name: str | None = None,
    last_name: str | None = None,
    birth_date: date | None = None,
    gender: str | None = None,
    birth_place_code: str | None = None,
) -> FiscalCodeValidation:
    normalized = normalize_fiscal_code(fiscal_code)
    checksum_valid = False
    is_formally_valid = False
    canonical = None
    expected = None
    matches_expected: bool | None = None

    if normalized and _FORMAL_PATTERN.fullmatch(normalized):
        checksum_valid = normalized[-1] == _checksum_char(normalized[:15])
        is_formally_valid = checksum_valid
        canonical = canonicalize_fiscal_code(normalized) if checksum_valid else None

    if first_name and last_name and birth_date and gender and birth_place_code:
        expected = calculate_fiscal_code(
            first_name=first_name,
            last_name=last_name,
            birth_date=birth_date,
            gender=gender,
            birth_place_code=birth_place_code,
        )
        if canonical is not None:
            matches_expected = canonical == expected

    return FiscalCodeValidation(
        normalized=normalized,
        canonical=canonical,
        expected=expected,
        is_formally_valid=is_formally_valid,
        checksum_valid=checksum_valid,
        matches_expected=matches_expected,
    )

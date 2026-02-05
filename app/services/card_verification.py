import base64
import hashlib
import hmac
import json
from typing import Optional, TypedDict

from app.config import settings
from app.models import MemberStatus

_TOKEN_PREFIX = "card-verify-v1"


class CardVerificationPayload(TypedDict):
    member_id: int
    org_id: int
    card_number: int
    card_year: int


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padded = value + "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def _sign(encoded_payload: str) -> str:
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        f"{_TOKEN_PREFIX}.{encoded_payload}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def build_card_verification_token(
    member_id: int,
    org_id: int,
    card_number: int,
    card_year: int,
) -> str:
    payload = {
        "v": 1,
        "member_id": member_id,
        "org_id": org_id,
        "card_number": card_number,
        "card_year": card_year,
    }
    encoded_payload = _b64url_encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signature = _sign(encoded_payload)
    return f"{encoded_payload}.{signature}"


def parse_card_verification_token(token: str) -> Optional[CardVerificationPayload]:
    try:
        encoded_payload, signature = token.split(".", 1)
    except ValueError:
        return None

    expected = _sign(encoded_payload)
    if not hmac.compare_digest(signature, expected):
        return None

    try:
        payload = json.loads(_b64url_decode(encoded_payload).decode("utf-8"))
    except Exception:
        return None

    if payload.get("v") != 1:
        return None

    try:
        member_id = int(payload["member_id"])
        org_id = int(payload["org_id"])
        card_number = int(payload["card_number"])
        card_year = int(payload["card_year"])
    except (KeyError, TypeError, ValueError):
        return None

    if min(member_id, org_id, card_number, card_year) <= 0:
        return None

    return {
        "member_id": member_id,
        "org_id": org_id,
        "card_number": card_number,
        "card_year": card_year,
    }


def to_card_status(status: object, card_number: Optional[int]) -> str:
    if card_number is None:
        return "non_attiva"

    normalized = status
    if isinstance(status, MemberStatus):
        normalized = status.value
    elif status is None:
        normalized = ""
    else:
        normalized = str(status)

    return "attiva" if str(normalized).lower() == MemberStatus.ACTIVE.value else "non_attiva"

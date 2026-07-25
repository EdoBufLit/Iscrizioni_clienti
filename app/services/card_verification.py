import base64
import hashlib
import hmac
import json
import re
from datetime import datetime
from types import SimpleNamespace
from typing import Optional, TypedDict
from urllib.parse import parse_qs, unquote, urlparse

from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    AnnualMembershipTerm,
    AnnualMembershipTermStatus,
    Member,
    MembershipType,
)
from app.services.annual_memberships import as_rome_datetime
from app.services.member_activity import (
    MEMBER_INACTIVE_REASON_DELETED,
    MEMBER_INACTIVE_REASON_EXPIRED,
    MEMBER_INACTIVE_REASON_NOT_APPROVED,
    get_member_inactive_reason,
    is_card_active,
)
from app.services.member_membership import resolve_member_membership_type

# HMAC domain separator/version string; not a secret.
_TOKEN_PREFIX = "card-verify-v1"  # nosec hardcoded_secret_name
_VERIFY_PATH_RE = re.compile(r"/api/cards/verify/([^/?#]+)")


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


def extract_card_verification_token(raw_value: str | None) -> str | None:
    """Extract a signed token from a raw token or one of the existing card URLs."""

    value = (raw_value or "").strip()
    if not value:
        return None
    if parse_card_verification_token(value):
        return value

    parsed = urlparse(value)
    query_token = parse_qs(parsed.query).get("card_token", [None])[0]
    candidates = [query_token]
    path_match = _VERIFY_PATH_RE.search(parsed.path or value)
    if path_match:
        candidates.append(path_match.group(1))

    for candidate in candidates:
        normalized = unquote((candidate or "").strip())
        if normalized and parse_card_verification_token(normalized):
            return normalized
    return None


def resolve_card_verification_membership(
    db: Session,
    *,
    payload: CardVerificationPayload,
    checked_at: datetime,
) -> tuple[Member | None, AnnualMembershipTerm | None, str]:
    """Resolve the signed card snapshot using the public verifier semantics."""

    member = (
        db.query(Member)
        .filter(
            Member.id == payload["member_id"],
            Member.org_id == payload["org_id"],
        )
        .first()
    )
    term = (
        db.query(AnnualMembershipTerm)
        .filter(
            AnnualMembershipTerm.member_id == payload["member_id"],
            AnnualMembershipTerm.org_id == payload["org_id"],
            AnnualMembershipTerm.card_no == payload["card_number"],
            AnnualMembershipTerm.card_year == payload["card_year"],
        )
        .first()
    )
    if member is None or member.deleted_at is not None:
        return member, term, MEMBER_INACTIVE_REASON_DELETED

    member_inactive_reason = get_member_inactive_reason(member, now=checked_at)
    current_membership_type = resolve_member_membership_type(member)
    if current_membership_type != MembershipType.ANNUAL.value:
        if member_inactive_reason == "" and (
            member.card_no != payload["card_number"]
            or member.card_year != payload["card_year"]
        ):
            member_inactive_reason = MEMBER_INACTIVE_REASON_NOT_APPROVED
        return member, None, member_inactive_reason
    if member_inactive_reason:
        return member, term, member_inactive_reason

    if term is None:
        inactive_reason = member_inactive_reason
        if inactive_reason == "" and (
            member.card_no != payload["card_number"]
            or member.card_year != payload["card_year"]
        ):
            inactive_reason = MEMBER_INACTIVE_REASON_NOT_APPROVED
        return member, None, inactive_reason

    local_today = as_rome_datetime(checked_at).date()
    if (
        term.status == AnnualMembershipTermStatus.EXPIRED.value
        or local_today > term.valid_through
    ):
        return member, term, MEMBER_INACTIVE_REASON_EXPIRED
    if (
        term.status
        not in {
            AnnualMembershipTermStatus.ACTIVE.value,
            AnnualMembershipTermStatus.SCHEDULED.value,
        }
        or local_today < term.starts_on
    ):
        return member, term, MEMBER_INACTIVE_REASON_NOT_APPROVED
    return member, term, ""


def to_card_status(
    status: object,
    card_number: Optional[int],
    card_year: Optional[int] = None,
    deleted_at: object | None = None,
    now: datetime | None = None,
) -> str:
    stub_member = SimpleNamespace(
        status=status,
        card_no=card_number,
        card_year=card_year,
        deleted_at=deleted_at,
    )
    return "attiva" if is_card_active(stub_member, now=now) else "non_attiva"

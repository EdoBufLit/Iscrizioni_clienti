from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from app.models import Member, Organization
from app.services.annual_memberships import (
    annual_membership_expiry_datetime,
    annual_membership_valid_through,
    as_rome_datetime,
)

MEMBERSHIP_TYPE_ANNUAL = "annual"
MEMBERSHIP_TYPE_TEMPORARY = "temporary"
TEMPORARY_DURATION_UNIT_HOURS = "hours"
TEMPORARY_DURATION_UNIT_DAYS = "days"
DEFAULT_TEMPORARY_DURATION_VALUE = 1
DEFAULT_TEMPORARY_DURATION_UNIT = TEMPORARY_DURATION_UNIT_DAYS

VALID_MEMBERSHIP_TYPES = {
    MEMBERSHIP_TYPE_ANNUAL,
    MEMBERSHIP_TYPE_TEMPORARY,
}
VALID_TEMPORARY_DURATION_UNITS = {
    TEMPORARY_DURATION_UNIT_HOURS,
    TEMPORARY_DURATION_UNIT_DAYS,
}


def quantize_membership_amount(value: Decimal | float | int | str | None) -> Decimal | None:
    if value is None or value == "":
        return None
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def membership_amount_to_float(value: Decimal | float | int | str | None) -> float | None:
    normalized = quantize_membership_amount(value)
    return float(normalized) if normalized is not None else None


def normalize_membership_type(value: object | None) -> str:
    normalized = str(value or "").strip().lower()
    if normalized not in VALID_MEMBERSHIP_TYPES:
        return MEMBERSHIP_TYPE_ANNUAL
    return normalized


def membership_type_label(value: object | None) -> str:
    if normalize_membership_type(value) == MEMBERSHIP_TYPE_TEMPORARY:
        return "Temporanea"
    return "Annuale"


def membership_type_badge_label(value: object | None) -> str:
    if normalize_membership_type(value) == MEMBERSHIP_TYPE_TEMPORARY:
        return "TEMPORANEA"
    return "ANNUALE"


def organization_allows_custom_membership_types(org: Organization | None) -> bool:
    return bool(org and getattr(org, "custom_membership_types_enabled", False))


def normalize_temporary_duration_unit(value: object | None) -> str:
    normalized = str(value or "").strip().lower()
    if normalized not in VALID_TEMPORARY_DURATION_UNITS:
        return DEFAULT_TEMPORARY_DURATION_UNIT
    return normalized


def resolve_temporary_duration(org: Organization | None) -> tuple[int, str]:
    raw_value = getattr(org, "temporary_membership_duration_value", None) if org else None
    try:
        value = int(raw_value) if raw_value is not None else DEFAULT_TEMPORARY_DURATION_VALUE
    except (TypeError, ValueError):
        value = DEFAULT_TEMPORARY_DURATION_VALUE
    if value <= 0:
        value = DEFAULT_TEMPORARY_DURATION_VALUE
    unit = normalize_temporary_duration_unit(
        getattr(org, "temporary_membership_duration_unit", None) if org else None
    )
    return value, unit


def temporary_duration_to_timedelta(org: Organization | None) -> timedelta:
    value, unit = resolve_temporary_duration(org)
    if unit == TEMPORARY_DURATION_UNIT_HOURS:
        return timedelta(hours=value)
    return timedelta(days=value)


def organization_membership_fee_amount(
    org: Organization | None,
    membership_type: object | None,
) -> Decimal | None:
    if org is None:
        return None
    resolved_type = normalize_membership_type(membership_type)
    if resolved_type == MEMBERSHIP_TYPE_TEMPORARY:
        return quantize_membership_amount(
            getattr(org, "temporary_membership_fee_amount", None)
        )
    return quantize_membership_amount(getattr(org, "membership_fee_amount", None))


def resolve_member_membership_type(member: Member | None) -> str:
    if member is None:
        return MEMBERSHIP_TYPE_ANNUAL
    return normalize_membership_type(getattr(member, "membership_type", None))


def resolve_member_valid_from(member: Member | None) -> datetime | None:
    if member is None:
        return None
    return getattr(member, "valid_from", None) or getattr(member, "joined_at", None)


def resolve_member_valid_until(member: Member | None) -> datetime | None:
    if member is None:
        return None
    explicit_valid_until = getattr(member, "valid_until", None)
    if explicit_valid_until is not None:
        return explicit_valid_until
    card_year = getattr(member, "card_year", None)
    if card_year is None:
        return None
    try:
        parsed_year = int(card_year)
    except (TypeError, ValueError):
        return None
    return annual_membership_expiry_datetime(parsed_year)


def is_member_membership_expired(
    member: Member | None,
    *,
    now: datetime | None = None,
) -> bool:
    if member is None:
        return True
    current_time = now or datetime.utcnow()
    explicit_valid_until = getattr(member, "valid_until", None)
    if explicit_valid_until is not None:
        if explicit_valid_until.tzinfo is None:
            comparable_now = (
                current_time
                if current_time.tzinfo is None
                else current_time.astimezone(timezone.utc).replace(tzinfo=None)
            )
        else:
            comparable_now = (
                current_time.replace(tzinfo=timezone.utc)
                if current_time.tzinfo is None
                else current_time.astimezone(explicit_valid_until.tzinfo)
            )
        return explicit_valid_until < comparable_now
    card_year = getattr(member, "card_year", None)
    if card_year is None:
        return False
    try:
        parsed_year = int(card_year)
    except (TypeError, ValueError):
        return True
    return as_rome_datetime(current_time).date() > annual_membership_valid_through(parsed_year)


def member_has_issued_card(member: Member | None) -> bool:
    if member is None:
        return False
    return getattr(member, "card_no", None) is not None and getattr(member, "card_year", None) is not None


def apply_membership_defaults(
    *,
    member: Member,
    org: Organization | None,
    membership_type: object | None,
    reference_time: datetime | None = None,
    membership_fee_snapshot: Decimal | float | int | str | None = None,
) -> None:
    effective_time = reference_time or datetime.utcnow()
    resolved_type = normalize_membership_type(membership_type)
    member.membership_type = resolved_type
    member.valid_from = effective_time
    if resolved_type == MEMBERSHIP_TYPE_TEMPORARY:
        member.valid_until = effective_time + temporary_duration_to_timedelta(org)
    else:
        member.valid_until = None
    snapshot = quantize_membership_amount(membership_fee_snapshot)
    if snapshot is None:
        snapshot = organization_membership_fee_amount(org, resolved_type)
    member.membership_fee_snapshot = snapshot


def serialize_membership_configuration(org: Organization | None) -> dict[str, Any]:
    annual_fee = organization_membership_fee_amount(org, MEMBERSHIP_TYPE_ANNUAL)
    temporary_fee = organization_membership_fee_amount(org, MEMBERSHIP_TYPE_TEMPORARY)
    duration_value, duration_unit = resolve_temporary_duration(org)
    enabled = organization_allows_custom_membership_types(org)
    available_types = [MEMBERSHIP_TYPE_ANNUAL]
    if enabled:
        available_types.append(MEMBERSHIP_TYPE_TEMPORARY)
    return {
        "custom_types_enabled": enabled,
        "available_types": available_types,
        "annual_fee_amount": membership_amount_to_float(annual_fee),
        "temporary_fee_amount": membership_amount_to_float(temporary_fee),
        "currency": getattr(org, "membership_fee_currency", "EUR") if org else "EUR",
        "temporary_duration_value": duration_value,
        "temporary_duration_unit": duration_unit,
        "temporary_duration_label": (
            f"{duration_value} ora" if duration_unit == TEMPORARY_DURATION_UNIT_HOURS and duration_value == 1
            else f"{duration_value} ore" if duration_unit == TEMPORARY_DURATION_UNIT_HOURS
            else f"{duration_value} giorno" if duration_value == 1
            else f"{duration_value} giorni"
        ),
    }

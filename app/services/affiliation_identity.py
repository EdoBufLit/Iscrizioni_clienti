from __future__ import annotations

import hashlib
import re
from typing import Any


def normalize_affiliation_email(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    return normalized or None


def normalize_affiliation_name(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = re.sub(r"\s+", " ", value.strip().lower())
    return normalized or None


def normalize_affiliation_code(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = re.sub(r"[^a-z0-9]", "", value.strip().lower())
    return normalized or None


def build_affiliation_idempotency_key(
    *,
    applicant_email: str | None,
    organization_name: str | None,
    organization_legal_name: str | None = None,
    tax_code: str | None = None,
    vat_number: str | None = None,
    fallback_idempotency_key: str | None = None,
) -> str | None:
    normalized_email = normalize_affiliation_email(applicant_email)
    normalized_org_name = normalize_affiliation_name(organization_name) or normalize_affiliation_name(
        organization_legal_name
    )
    normalized_tax_code = normalize_affiliation_code(tax_code)
    normalized_vat_number = normalize_affiliation_code(vat_number)
    fallback = (fallback_idempotency_key or "").strip() or None

    if normalized_email is None and fallback is None:
        return None

    if normalized_org_name is None and normalized_tax_code is None and normalized_vat_number is None:
        return fallback

    raw = "|".join(
        [
            normalized_email or "-",
            normalized_org_name or "-",
            normalized_tax_code or "-",
            normalized_vat_number or "-",
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def sync_affiliation_identity_fields(application: Any) -> None:
    application.normalized_applicant_email = normalize_affiliation_email(
        getattr(application, "applicant_email", None)
    )
    application.normalized_org_name = normalize_affiliation_name(
        getattr(application, "organization_name", None)
        or getattr(application, "organization_legal_name", None)
    )
    application.idempotency_key = build_affiliation_idempotency_key(
        applicant_email=getattr(application, "applicant_email", None),
        organization_name=getattr(application, "organization_name", None),
        organization_legal_name=getattr(application, "organization_legal_name", None),
        tax_code=getattr(application, "tax_code", None),
        vat_number=getattr(application, "vat_number", None),
        fallback_idempotency_key=getattr(application, "idempotency_key", None),
    )

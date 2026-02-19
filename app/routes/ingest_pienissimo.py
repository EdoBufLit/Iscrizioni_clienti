import logging
import hashlib
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import audit
from app.config import settings
from app.db import get_db
from app.models import IntegrationApiKey, Organization, SignupSource
from app.services.integration_issuer import (
    IssueMemberCommand,
    issue_member_from_ingest,
)
from app.services.db_rate_limit import enforce_db_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ingest/pienissimo", tags=["ingest-pienissimo"])

_REQUIRED_SCOPE = "issue_member"
_DEFAULT_INTEGRATION_NAME = "pienissimo"


class PienissimoIngestBody(BaseModel):
    model_config = ConfigDict(extra="allow")

    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    full_name: str | None = None
    phone: str | None = None
    fiscal_code: str | None = None
    external_customer_id: str | None = None
    send_email: bool | None = None


class PienissimoIngestResponse(BaseModel):
    status: str
    member_id: int
    card_number: int
    card_verification_token: str
    card_url: str
    card_verification_url: str
    card_download_url: str
    card_wallet_apple_url: str | None = None
    card_wallet_google_url: str | None = None
    wallet_enabled: bool = False


def _normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def _is_truthy(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _extract_value(payload: dict[str, Any], candidates: list[str]) -> str | None:
    for key in candidates:
        if key in payload:
            normalized_value = _normalize_text(payload[key])
            if normalized_value is not None:
                return normalized_value

    lowered_payload = {str(k).lower(): v for k, v in payload.items()}
    for key in candidates:
        lowered_key = key.lower()
        if lowered_key in lowered_payload:
            normalized_value = _normalize_text(lowered_payload[lowered_key])
            if normalized_value is not None:
                return normalized_value

    return None


def _split_full_name(full_name: str | None) -> tuple[str | None, str | None]:
    cleaned = _normalize_text(full_name)
    if not cleaned:
        return None, None

    parts = cleaned.split()
    if len(parts) == 1:
        return parts[0], None
    return parts[0], " ".join(parts[1:])


def _has_required_scope(key: IntegrationApiKey, scope: str) -> bool:
    if not isinstance(key.scopes, list):
        return False
    normalized_scopes = {str(item).strip() for item in key.scopes if str(item).strip()}
    return scope in normalized_scopes


def _resolve_org_or_404(db: Session, org_slug: str) -> Organization:
    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _find_active_pienissimo_key(db: Session, org_id: int) -> IntegrationApiKey | None:
    named_candidates = (
        db.query(IntegrationApiKey)
        .filter(
            IntegrationApiKey.org_id == org_id,
            IntegrationApiKey.is_active.is_(True),
            func.lower(IntegrationApiKey.name) == _DEFAULT_INTEGRATION_NAME,
        )
        .order_by(IntegrationApiKey.created_at.desc(), IntegrationApiKey.id.desc())
        .all()
    )
    for key in named_candidates:
        if _has_required_scope(key, _REQUIRED_SCOPE):
            return key

    fallback_candidates = (
        db.query(IntegrationApiKey)
        .filter(
            IntegrationApiKey.org_id == org_id,
            IntegrationApiKey.is_active.is_(True),
        )
        .order_by(IntegrationApiKey.created_at.desc(), IntegrationApiKey.id.desc())
        .all()
    )
    for key in fallback_candidates:
        if _has_required_scope(key, _REQUIRED_SCOPE):
            return key
    return None


def _log_ingest_operation(
    db: Session,
    *,
    request: Request,
    org_slug: str,
    external_customer_id: str | None,
    member_id: int | None,
    outcome: str,
):
    external_id_hash = None
    if external_customer_id:
        external_id_hash = hashlib.sha256(
            external_customer_id.strip().lower().encode("utf-8")
        ).hexdigest()[:16]

    audit.log_operation(
        db,
        action="integration_ingest_member",
        entity_type="member",
        entity_id=member_id,
        metadata={
            "org_slug": org_slug,
            "external_customer_id_hash": external_id_hash,
            "outcome": outcome,
        },
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()


def _enforce_rate_limit_or_429(db: Session, *, org_slug: str, client_ip: str):
    enforce_db_rate_limit(
        db,
        bucket=f"ingest:{org_slug}",
        client_ip=client_ip,
        window_seconds=settings.INGEST_RATE_LIMIT_WINDOW_SECONDS,
        max_requests=settings.INGEST_RATE_LIMIT_MAX_REQUESTS,
    )


def _normalize_ingest_payload(body: PienissimoIngestBody) -> dict[str, Any]:
    payload = body.model_dump()
    if body.model_extra:
        payload.update(body.model_extra)
    return payload


def _inactive_integration_response() -> JSONResponse:
    return JSONResponse(
        status_code=402,
        content={
            "error": "integration_inactive",
            "message": "Integrazione non attiva per questa associazione",
        },
    )


@router.post("/{org_slug}", response_model=PienissimoIngestResponse)
def ingest_pienissimo_member(
    org_slug: str,
    request: Request,
    body: PienissimoIngestBody,
    db: Session = Depends(get_db),
):
    org = _resolve_org_or_404(db, org_slug)
    payload = _normalize_ingest_payload(body)
    pre_email = _extract_value(payload, ["email", "Email", "mail", "e-mail"])
    pre_external_customer_id = _extract_value(
        payload,
        ["external_customer_id", "lead_id", "id", "contact_id"],
    )
    if not pre_external_customer_id and pre_email:
        pre_external_customer_id = f"email:{pre_email.lower()}"

    integration_key = _find_active_pienissimo_key(db, org.id)
    if not integration_key:
        _log_ingest_operation(
            db,
            request=request,
            org_slug=org.slug,
            external_customer_id=pre_external_customer_id,
            member_id=None,
            outcome="inactive",
        )
        return _inactive_integration_response()

    client_ip = request.client.host if request.client else "unknown"
    try:
        _enforce_rate_limit_or_429(db, org_slug=org.slug, client_ip=client_ip)
    except HTTPException as exc:
        if exc.status_code == 429:
            _log_ingest_operation(
                db,
                request=request,
                org_slug=org.slug,
                external_customer_id=pre_external_customer_id,
                member_id=None,
                outcome="rate_limited",
            )
        raise

    if not pre_email:
        raise HTTPException(status_code=422, detail="email is required")
    normalized_email = pre_email.lower()

    first_name = _extract_value(payload, ["first_name", "nome", "Nome"])
    last_name = _extract_value(payload, ["last_name", "cognome", "Cognome"])
    full_name = _extract_value(payload, ["full_name", "nominativo", "name"])
    if (not first_name or not last_name) and full_name:
        parsed_first_name, parsed_last_name = _split_full_name(full_name)
        if not first_name:
            first_name = parsed_first_name
        if not last_name:
            last_name = parsed_last_name

    first_name = first_name or "Socio"
    last_name = last_name or ""

    phone = _extract_value(payload, ["phone", "telefono", "cellulare"])
    fiscal_code = _extract_value(payload, ["fiscal_code", "codice_fiscale", "fiscalCode"])
    external_customer_id = pre_external_customer_id or f"email:{normalized_email}"

    try:
        result = issue_member_from_ingest(
            db,
            IssueMemberCommand(
                org_id=org.id,
                external_customer_id=external_customer_id,
                email=normalized_email,
                first_name=first_name,
                last_name=last_name,
                phone=phone,
                fiscal_code=fiscal_code,
                send_email=_is_truthy(payload.get("send_email"), True),
                signup_source=SignupSource.PIENISSIMO.value,
                integration_name=integration_key.name,
                request_ip=client_ip,
                request_user_agent=request.headers.get("user-agent"),
                backend_base_url=str(request.base_url).rstrip("/"),
                send_email_once=True,
            ),
        )
    except HTTPException as exc:
        if exc.status_code == 409:
            return JSONResponse(
                status_code=409,
                content={
                    "error": "card_range_exhausted",
                    "message": str(exc.detail),
                },
            )
        raise

    integration_key.last_used_at = datetime.utcnow()
    integration_key.last_used_ip = client_ip
    integration_key.last_used_user_agent = request.headers.get("user-agent")
    db.commit()

    _log_ingest_operation(
        db,
        request=request,
        org_slug=org.slug,
        external_customer_id=external_customer_id,
        member_id=result.member_id,
        outcome=result.outcome,
    )

    return PienissimoIngestResponse(
        status=result.status,
        member_id=result.member_id,
        card_number=result.card_number,
        card_verification_token=result.card_verification_token,
        card_url=result.card_verification_url,
        card_verification_url=result.card_verification_url,
        card_download_url=result.card_download_url,
        card_wallet_apple_url=result.card_wallet_apple_url,
        card_wallet_google_url=result.card_wallet_google_url,
        wallet_enabled=result.wallet_enabled,
    )

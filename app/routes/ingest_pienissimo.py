import hashlib
import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import audit
from app.config import settings
from app.db import get_db
from app.models import IntegrationApiKey, Organization, SignupSource
from app.services.integration_issuer import IssueMemberCommand, issue_member_from_integration

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
    card_url: str


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


def _require_ingest_secret(x_asso_ingest_secret: str | None):
    configured_secret = (settings.INGEST_SECRET or "").strip()
    if not configured_secret:
        logger.warning("INGEST_SECRET is empty: ingest endpoint is not protected by route secret.")
        return

    provided_secret = (x_asso_ingest_secret or "").strip()
    if provided_secret != configured_secret:
        raise HTTPException(status_code=401, detail="Invalid ingest secret")


def _resolve_org_or_404(db: Session, org_slug: str) -> Organization:
    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _find_active_pienissimo_key(db: Session, org_id: int) -> IntegrationApiKey:
    candidates = (
        db.query(IntegrationApiKey)
        .filter(
            IntegrationApiKey.org_id == org_id,
            IntegrationApiKey.is_active.is_(True),
            func.lower(IntegrationApiKey.name) == _DEFAULT_INTEGRATION_NAME,
        )
        .order_by(IntegrationApiKey.created_at.desc(), IntegrationApiKey.id.desc())
        .all()
    )

    if not candidates:
        candidates = (
            db.query(IntegrationApiKey)
            .filter(
                IntegrationApiKey.org_id == org_id,
                IntegrationApiKey.is_active.is_(True),
            )
            .order_by(IntegrationApiKey.created_at.desc(), IntegrationApiKey.id.desc())
            .all()
        )

    for key in candidates:
        if _has_required_scope(key, _REQUIRED_SCOPE):
            return key

    raise HTTPException(
        status_code=403,
        detail="No active integration key with issue_member scope configured for this organization",
    )


@router.post("/{org_slug}", response_model=PienissimoIngestResponse)
def ingest_pienissimo_member(
    org_slug: str,
    request: Request,
    body: PienissimoIngestBody,
    db: Session = Depends(get_db),
    x_asso_ingest_secret: str | None = Header(default=None, alias="X-ASSO-INGEST-SECRET"),
):
    _require_ingest_secret(x_asso_ingest_secret)

    org = _resolve_org_or_404(db, org_slug)
    integration_key = _find_active_pienissimo_key(db, org.id)

    payload = body.model_dump()
    if body.model_extra:
        payload.update(body.model_extra)
    extracted_email = _extract_value(payload, ["email", "Email", "mail", "e-mail"])
    if not extracted_email:
        raise HTTPException(status_code=400, detail="Missing email field in ingest payload")

    first_name = _extract_value(payload, ["first_name", "nome", "Nome"])
    last_name = _extract_value(payload, ["last_name", "cognome", "Cognome"])
    full_name = _extract_value(payload, ["full_name", "nominativo", "name"])
    if (not first_name or not last_name) and full_name:
        parsed_first_name, parsed_last_name = _split_full_name(full_name)
        if not first_name:
            first_name = parsed_first_name
        if not last_name:
            last_name = parsed_last_name

    phone = _extract_value(payload, ["phone", "telefono", "cellulare"])
    fiscal_code = _extract_value(payload, ["fiscal_code", "codice_fiscale", "fiscalCode"])
    external_customer_id = _extract_value(
        payload,
        ["external_customer_id", "lead_id", "id", "contact_id"],
    )

    external_id_fallback_used = False
    if not external_customer_id:
        digest = hashlib.sha256(f"{extracted_email.lower()}{org_slug}".encode("utf-8")).hexdigest()
        external_customer_id = digest
        external_id_fallback_used = True
        logger.warning(
            "ingest_pienissimo: generated fallback external_customer_id for org_slug=%s email_hash=%s",
            org_slug,
            hashlib.sha256(extracted_email.lower().encode("utf-8")).hexdigest()[:16],
        )

    result = issue_member_from_integration(
        db,
        IssueMemberCommand(
            org_id=org.id,
            external_customer_id=external_customer_id,
            email=extracted_email,
            first_name=first_name,
            last_name=last_name,
            phone=phone,
            fiscal_code=fiscal_code,
            send_email=_is_truthy(payload.get("send_email"), True),
            signup_source=SignupSource.PIENISSIMO.value,
            integration_name=integration_key.name,
            request_ip=request.client.host if request.client else None,
            request_user_agent=request.headers.get("user-agent"),
            backend_base_url=str(request.base_url).rstrip("/"),
        ),
    )

    integration_key.last_used_at = datetime.utcnow()
    integration_key.last_used_ip = request.client.host if request.client else None
    integration_key.last_used_user_agent = request.headers.get("user-agent")

    audit.log_operation(
        db,
        action="integration_ingest_member",
        entity_type="member",
        entity_id=result.member_id,
        metadata={
            "org_slug": org.slug,
            "integration_key_id": integration_key.id,
            "integration_name": integration_key.name,
            "external_customer_id": external_customer_id,
            "external_id_fallback_used": external_id_fallback_used,
        },
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return PienissimoIngestResponse(
        status=result.status,
        member_id=result.member_id,
        card_number=result.card_number,
        card_url=result.card_verification_url,
    )

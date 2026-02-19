from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy.orm import Session

from app import audit
from app.db import get_db
from app.models import IntegrationApiKey, Organization, SignupSource
from app.security import IntegrationContext, require_integration_key
from app.services.integration_issuer import (
    IssueMemberCommand,
    issue_member_from_integration,
)

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


class IssueMemberBody(BaseModel):
    model_config = ConfigDict(extra="allow")

    org_slug: str | None = None
    org_id: int | None = Field(default=None, ge=1)
    external_customer_id: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    fiscal_code: str | None = None
    send_email: bool = True


class IssueMemberResponse(BaseModel):
    status: str
    member_id: int
    card_number: int
    card_year: int
    card_verification_token: str
    card_verification_url: str
    card_download_url: str
    card_wallet_apple_url: str | None = None
    card_wallet_google_url: str | None = None
    wallet_enabled: bool = False
    member_portal_login_hint: str


def _log_integration_security_event(
    db: Session,
    request: Request,
    integration_context: IntegrationContext,
    reason: str,
    metadata: dict,
):
    payload = {
        "event_type": "integration_org_mismatch",
        "reason": reason,
        "key_id": integration_context.key_id,
        "key_org_id": integration_context.org_id,
    }
    payload.update(metadata)
    audit.log_operation(
        db,
        action="security_event",
        entity_type="integration_api_key",
        entity_id=integration_context.key_id,
        metadata=payload,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()


@router.post("/members/issue", response_model=IssueMemberResponse)
def issue_member(
    request: Request,
    body: IssueMemberBody,
    db: Session = Depends(get_db),
    integration_context: IntegrationContext = Depends(require_integration_key(scope="issue_member")),
):
    org = db.query(Organization).filter(Organization.id == integration_context.org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    if body.org_id is not None and body.org_id != integration_context.org_id:
        _log_integration_security_event(
            db,
            request,
            integration_context,
            reason="org_id_mismatch",
            metadata={"payload_org_id": body.org_id},
        )
        raise HTTPException(status_code=403, detail="Payload organization does not match API key organization")

    if body.org_slug is not None and body.org_slug.strip() and body.org_slug.strip() != org.slug:
        _log_integration_security_event(
            db,
            request,
            integration_context,
            reason="org_slug_mismatch",
            metadata={"payload_org_slug": body.org_slug, "expected_org_slug": org.slug},
        )
        raise HTTPException(status_code=403, detail="Payload organization does not match API key organization")

    key_name = (
        db.query(IntegrationApiKey.name)
        .filter(IntegrationApiKey.id == integration_context.key_id)
        .scalar()
    )
    result = issue_member_from_integration(
        db,
        IssueMemberCommand(
            org_id=integration_context.org_id,
            external_customer_id=body.external_customer_id,
            email=str(body.email),
            first_name=body.first_name,
            last_name=body.last_name,
            phone=body.phone,
            fiscal_code=body.fiscal_code,
            send_email=body.send_email,
            signup_source=SignupSource.PIENISSIMO.value,
            integration_name=key_name,
            request_ip=request.client.host if request.client else None,
            request_user_agent=request.headers.get("user-agent"),
            backend_base_url=str(request.base_url).rstrip("/"),
        ),
    )

    return IssueMemberResponse(
        status=result.status,
        member_id=result.member_id,
        card_number=result.card_number,
        card_year=result.card_year,
        card_verification_token=result.card_verification_token,
        card_verification_url=result.card_verification_url,
        card_download_url=result.card_download_url,
        card_wallet_apple_url=result.card_wallet_apple_url,
        card_wallet_google_url=result.card_wallet_google_url,
        wallet_enabled=result.wallet_enabled,
        member_portal_login_hint=result.member_portal_login_hint,
    )

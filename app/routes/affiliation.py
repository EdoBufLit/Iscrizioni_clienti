from __future__ import annotations

import hashlib
import hmac
import json
import logging
import math
import os
import re
import secrets
import time
import unicodedata
from datetime import datetime, timedelta
from typing import Any

import requests
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import audit
from app.config import settings
from app.db import get_db
from app.middleware import get_client_ip
from app.models import (
    AdminRole,
    AdminUser,
    AffiliationApplication,
    AffiliationApplicationStatus,
    AffiliationDocument,
    AffiliationDocumentStatus,
    AffiliationDocsStatus,
    AffiliationEvent,
    AffiliationPaymentMethod,
    AffiliationPaymentStatus,
    AffiliationPerson,
    AffiliationVideoMode,
    Referral,
    ReferralStatus,
    Organization,
    OrgAdminToken,
)
from app.services.affiliation_video import (
    enqueue_affiliation_video_job,
    process_video_jobs_once,
    serialize_video_job,
)
from app.services.email_outbox import build_email_payload, enqueue_email
from app.utils import generate_token, hash_token, save_upload_file

logger = logging.getLogger(__name__)

router = APIRouter()
super_admin_router = APIRouter(prefix="/api/super-admin")
associations_router = APIRouter(prefix="/api/admin")


def ensure_public_affiliation_enabled() -> None:
    if settings.AFFILIAZIONE_ENABLED:
        return
    raise HTTPException(status_code=404, detail="Affiliazione non disponibile")

REQUIRED_DOCUMENT_TYPES = [
    "statuto",
    "atto_costitutivo",
    "documento_presidente",
    "codice_fiscale_presidente",
]

MANUAL_PAYMENT_METHODS = {
    AffiliationPaymentMethod.BANK_TRANSFER.value,
    AffiliationPaymentMethod.CASH.value,
}

PAYMENT_OK_STATUSES = {
    AffiliationPaymentStatus.PAID.value,
    AffiliationPaymentStatus.VERIFIED.value,
}


class CreateAffiliationDraftBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    applicant_email: EmailStr | None = None
    referral_slug: str | None = None


class PatchAffiliationDraftBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    organization_name: str | None = None
    organization_legal_name: str | None = None
    organization_slug_candidate: str | None = None
    tax_code: str | None = None
    vat_number: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    country: str | None = None
    applicant_full_name: str | None = None
    applicant_email: EmailStr | None = None
    applicant_phone: str | None = None
    notes: str | None = None
    payment_method: str | None = None
    manual_preferred_date: str | None = None
    manual_preferred_time: str | None = None
    manual_contact: str | None = None


class AffiliationPersonInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: str
    full_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    fiscal_code: str | None = None


class ReplaceAffiliationPeopleBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[AffiliationPersonInput] = Field(default_factory=list)


class ReviewAffiliationDocumentBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str
    notes: str | None = None


class VerifyAffiliationPaymentBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    verified: bool = True
    notes: str | None = None


class AffiliationDecisionBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    notes: str | None = None


class RunAffiliationVideoBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    limit: int = Field(default=1, ge=1, le=10)


def _safe_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_payment_method(value: str | None) -> str | None:
    normalized = (value or "").strip().lower()
    if not normalized:
        return None
    aliases = {
        "stripe": AffiliationPaymentMethod.STRIPE.value,
        "card": AffiliationPaymentMethod.STRIPE.value,
        "bonifico": AffiliationPaymentMethod.BANK_TRANSFER.value,
        "bank_transfer": AffiliationPaymentMethod.BANK_TRANSFER.value,
        "contanti": AffiliationPaymentMethod.CASH.value,
        "cash": AffiliationPaymentMethod.CASH.value,
    }
    result = aliases.get(normalized)
    if result is None:
        raise HTTPException(
            status_code=400,
            detail="Metodo pagamento non valido. Valori ammessi: stripe, bank_transfer, cash.",
        )
    return result


def _resolve_frontend_base(request: Request) -> str:
    configured = (settings.FRONTEND_URL or "").strip().rstrip("/")
    if configured:
        return configured
    return str(request.base_url).rstrip("/")


def _required_field_check(application: AffiliationApplication) -> list[str]:
    missing: list[str] = []
    if not _normalize_text(application.organization_name):
        missing.append("organization_name")
    if not _normalize_text(application.applicant_email):
        missing.append("applicant_email")
    if not _normalize_text(application.applicant_full_name):
        missing.append("applicant_full_name")
    if not _normalize_text(application.applicant_phone):
        missing.append("applicant_phone")
    if not _normalize_text(application.payment_method):
        missing.append("payment_method")
    return missing


def _latest_documents_by_type(
    documents: list[AffiliationDocument],
) -> dict[str, AffiliationDocument]:
    latest: dict[str, AffiliationDocument] = {}
    for doc in sorted(
        documents,
        key=lambda item: (item.uploaded_at or datetime.min, item.id or 0),
    ):
        latest[doc.doc_type] = doc
    return latest


def _recompute_docs_status(application: AffiliationApplication) -> str:
    latest_docs = _latest_documents_by_type(list(application.documents or []))
    statuses: list[str | None] = [
        latest_docs.get(doc_type).status if latest_docs.get(doc_type) else None
        for doc_type in REQUIRED_DOCUMENT_TYPES
    ]

    if any(status == AffiliationDocumentStatus.REJECTED.value for status in statuses):
        return AffiliationDocsStatus.CHANGES_REQUESTED.value

    if all(status == AffiliationDocumentStatus.APPROVED.value for status in statuses):
        return AffiliationDocsStatus.OK.value

    return AffiliationDocsStatus.PENDING.value


def _payment_is_ok(application: AffiliationApplication) -> bool:
    return (application.payment_status or "").strip().lower() in PAYMENT_OK_STATUSES


def _can_approve(application: AffiliationApplication) -> bool:
    docs_ok = (application.docs_status or "").strip().lower() == AffiliationDocsStatus.OK.value
    return docs_ok and _payment_is_ok(application)


def _ensure_super_admin(request: Request, db: Session) -> AdminUser:
    admin_id = request.session.get("admin_id")
    if not admin_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    admin = (
        db.query(AdminUser)
        .filter(
            AdminUser.id == admin_id,
            AdminUser.role == AdminRole.SUPER_ADMIN,
            AdminUser.is_active.is_(True),
            AdminUser.deleted_at.is_(None),
        )
        .first()
    )
    if admin is None:
        raise HTTPException(status_code=403, detail="Forbidden")
    return admin


def _find_application_by_token(db: Session, public_token: str) -> AffiliationApplication:
    application = (
        db.query(AffiliationApplication)
        .filter(AffiliationApplication.public_token == public_token)
        .first()
    )
    if application is None:
        raise HTTPException(status_code=404, detail="Bozza affiliazione non trovata")
    return application


def _record_affiliation_event(
    db: Session,
    *,
    application_id: int,
    event_type: str,
    actor_type: str,
    actor_admin_id: int | None = None,
    payload: dict[str, Any] | None = None,
) -> AffiliationEvent:
    event = AffiliationEvent(
        application_id=application_id,
        event_type=event_type,
        actor_type=actor_type,
        actor_admin_id=actor_admin_id,
        payload_json=payload or {},
    )
    db.add(event)
    db.flush()
    return event


def _serialize_person(item: AffiliationPerson) -> dict[str, Any]:
    return {
        "id": item.id,
        "role": item.role,
        "full_name": item.full_name,
        "email": item.email,
        "phone": item.phone,
        "fiscal_code": item.fiscal_code,
        "created_at": _safe_iso(item.created_at),
        "updated_at": _safe_iso(item.updated_at),
    }


def _serialize_document_public(
    application: AffiliationApplication,
    document: AffiliationDocument,
) -> dict[str, Any]:
    return {
        "id": document.id,
        "doc_type": document.doc_type,
        "filename": document.original_filename,
        "mime_type": document.mime_type,
        "size_bytes": document.size_bytes,
        "status": document.status,
        "review_notes": document.review_notes,
        "rejection_note": document.rejection_note,
        "uploaded_at": _safe_iso(document.uploaded_at),
        "reviewed_at": _safe_iso(document.reviewed_at),
        "download_url": f"/api/affiliazione/draft/{application.public_token}/documents/{document.id}",
    }


def _serialize_document_admin(
    application: AffiliationApplication,
    document: AffiliationDocument,
) -> dict[str, Any]:
    payload = _serialize_document_public(application, document)
    payload["download_url"] = (
        f"/api/super-admin/affiliations/{application.id}/documents/{document.id}"
    )
    return payload


def _serialize_event(item: AffiliationEvent) -> dict[str, Any]:
    return {
        "id": item.id,
        "event_type": item.event_type,
        "actor_type": item.actor_type,
        "actor_admin_id": item.actor_admin_id,
        "payload": item.payload_json or {},
        "created_at": _safe_iso(item.created_at),
    }


def _serialize_referral(item: Referral | None) -> dict[str, Any] | None:
    if item is None:
        return None
    referrer = item.referrer_organization
    return {
        "id": item.id,
        "referrer_org_id": item.referrer_org_id,
        "referrer_org_slug": referrer.slug if referrer else None,
        "referrer_org_name": referrer.name if referrer else None,
        "status": item.status,
        "created_at": _safe_iso(item.created_at),
        "approved_at": _safe_iso(item.approved_at),
        "rewarded_at": _safe_iso(item.rewarded_at),
        "reward_code": item.reward_code,
        "reward_title": item.reward_title,
        "reward_description": item.reward_description,
        "reward_delivery_timing": item.reward_delivery_timing,
    }


def _serialize_affiliation(
    application: AffiliationApplication,
    *,
    include_people: bool,
    include_documents: bool,
    include_events: bool,
    admin_view: bool,
) -> dict[str, Any]:
    latest_docs_map = _latest_documents_by_type(list(application.documents or []))
    latest_docs = list(latest_docs_map.values())
    latest_video_job = None
    if application.video_jobs:
        latest_video_job = sorted(
            application.video_jobs,
            key=lambda job: (job.requested_at or datetime.min, job.id or 0),
            reverse=True,
        )[0]

    payload: dict[str, Any] = {
        "id": application.id,
        "public_token": application.public_token,
        "status": application.status,
        "docs_status": application.docs_status,
        "payment_method": application.payment_method,
        "payment_status": application.payment_status,
        "payment_amount_cents": application.payment_amount_cents,
        "organization_name": application.organization_name,
        "organization_legal_name": application.organization_legal_name,
        "organization_slug_candidate": application.organization_slug_candidate,
        "tax_code": application.tax_code,
        "vat_number": application.vat_number,
        "address_line1": application.address_line1,
        "address_line2": application.address_line2,
        "city": application.city,
        "province": application.province,
        "postal_code": application.postal_code,
        "country": application.country,
        "applicant_full_name": application.applicant_full_name,
        "applicant_email": application.applicant_email,
        "applicant_phone": application.applicant_phone,
        "notes": application.notes,
        "manual_preferred_date": application.manual_preferred_date,
        "manual_preferred_time": application.manual_preferred_time,
        "manual_contact": application.manual_contact,
        "submitted_at": _safe_iso(application.submitted_at),
        "reviewed_at": _safe_iso(application.reviewed_at),
        "review_notes": application.review_notes,
        "approved_at": _safe_iso(application.approved_at),
        "rejected_at": _safe_iso(application.rejected_at),
        "approved_org_id": application.approved_org_id,
        "created_at": _safe_iso(application.created_at),
        "updated_at": _safe_iso(application.updated_at),
        "required_document_types": REQUIRED_DOCUMENT_TYPES,
        "resume_url": f"/affiliazione?token={application.public_token}",
        "payment_config": {
            "stripe_enabled": bool(settings.STRIPE_ENABLED),
            "bank_iban": settings.AFFILIATION_BANK_IBAN,
            "bank_causale_prefix": settings.AFFILIATION_BANK_CAUSALE_PREFIX,
            "cash_location": settings.AFFILIATION_CASH_LOCATION,
        },
        "can_approve": _can_approve(application),
        "latest_video_job": serialize_video_job(latest_video_job),
        "referral": _serialize_referral(application.referral),
    }

    if include_people:
        payload["people"] = [_serialize_person(item) for item in (application.people or [])]

    if include_documents:
        serializer = _serialize_document_admin if admin_view else _serialize_document_public
        payload["documents"] = [
            serializer(application, item)
            for item in sorted(latest_docs, key=lambda document: document.doc_type)
        ]

    if include_events:
        payload["events"] = [
            _serialize_event(item)
            for item in sorted(
                application.events or [],
                key=lambda event: (event.created_at or datetime.min, event.id or 0),
                reverse=True,
            )
        ]
        payload["video_jobs"] = [
            serialize_video_job(item)
            for item in sorted(
                application.video_jobs or [],
                key=lambda job: (job.requested_at or datetime.min, job.id or 0),
                reverse=True,
            )
        ]

    return payload


def _slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_value = ascii_value.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_value).strip("-")
    return slug or "associazione"


def _unique_organization_slug(db: Session, base_slug: str) -> str:
    base = _slugify(base_slug)
    slug = base
    counter = 2

    while (
        db.query(Organization.id)
        .filter(func.lower(Organization.slug) == slug.lower())
        .first()
        is not None
    ):
        slug = f"{base}-{counter}"
        counter += 1

    return slug


def _application_download_path(document: AffiliationDocument) -> str:
    full_path = os.path.join(settings.UPLOAD_DIR, document.rel_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File documento non trovato")
    return full_path


def _invite_org_admin(
    db: Session,
    *,
    admin: AdminUser,
    organization_name: str,
) -> None:
    token_str = generate_token()
    token = OrgAdminToken(
        admin_id=admin.id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=settings.LOGIN_TOKEN_EXPIRE_MINUTES),
    )
    db.add(token)
    db.flush()

    frontend_base = (settings.FRONTEND_URL or settings.BASE_URL or "").strip().rstrip("/")
    invite_url = f"{frontend_base}/auth/verify?token={token_str}&role=org_admin"

    enqueue_email(
        db,
        email_type="affiliation_approved_org_admin_invite",
        to_email=admin.email,
        subject="Affiliazione approvata - accesso amministratore",
        payload=build_email_payload(
            text_body=(
                f"La tua richiesta per {organization_name} e stata approvata.\n"
                f"Accedi all'area amministratore: {invite_url}"
            ),
            meta={"admin_id": admin.id, "org_id": admin.org_id},
        ),
        priority=1,
    )


def _provision_organization_and_admin(
    db: Session,
    *,
    application: AffiliationApplication,
) -> tuple[Organization, AdminUser | None]:
    organization_name = (
        _normalize_text(application.organization_name)
        or _normalize_text(application.organization_legal_name)
        or f"Associazione #{application.id}"
    )
    slug_candidate = _normalize_text(application.organization_slug_candidate) or organization_name
    organization_slug = _unique_organization_slug(db, slug_candidate)

    organization = Organization(
        name=organization_name,
        slug=organization_slug,
        statute_version="v1",
        privacy_version="v1",
        address_line1=_normalize_text(application.address_line1),
        address_line2=_normalize_text(application.address_line2),
        city=_normalize_text(application.city),
        province=_normalize_text(application.province),
        postal_code=_normalize_text(application.postal_code),
        country=_normalize_text(application.country) or "Italy",
        email=_normalize_text(application.applicant_email),
        phone=_normalize_text(application.applicant_phone),
        description=_normalize_text(application.notes),
        is_active=True,
        auto_approve_signup=False,
    )
    db.add(organization)
    db.flush()

    applicant_email = (_normalize_text(application.applicant_email) or "").lower()
    if not applicant_email:
        return organization, None

    existing_admin = (
        db.query(AdminUser)
        .filter(func.lower(AdminUser.email) == applicant_email)
        .first()
    )

    if existing_admin is None:
        admin_user = AdminUser(
            email=applicant_email,
            password_hash="",
            role=AdminRole.ORG_ADMIN,
            org_id=organization.id,
            is_active=True,
        )
        db.add(admin_user)
        db.flush()
        return organization, admin_user

    if existing_admin.role == AdminRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=409,
            detail="Email richiedente gia associata a un super admin.",
        )

    if existing_admin.deleted_at is not None:
        existing_admin.deleted_at = None

    if existing_admin.org_id not in {None, organization.id} and existing_admin.is_active:
        raise HTTPException(
            status_code=409,
            detail="Email richiedente gia associata a un'altra organizzazione.",
        )

    existing_admin.org_id = organization.id
    existing_admin.is_active = True
    existing_admin.role = AdminRole.ORG_ADMIN
    if not existing_admin.password_hash:
        existing_admin.password_hash = ""
    db.flush()
    return organization, existing_admin


def _verify_stripe_webhook_signature(raw_payload: bytes, signature_header: str) -> None:
    webhook_secret = (settings.STRIPE_WEBHOOK_SECRET or "").strip()
    if not webhook_secret:
        raise HTTPException(status_code=503, detail="Stripe non configurato. Usa Bonifico o Contanti.")

    if not signature_header:
        raise HTTPException(status_code=400, detail="Stripe-Signature mancante")

    parts = [part.strip() for part in signature_header.split(",") if "=" in part]
    timestamp: str | None = None
    signatures: list[str] = []
    for part in parts:
        key, value = part.split("=", 1)
        if key == "t":
            timestamp = value
        elif key == "v1":
            signatures.append(value)

    if not timestamp or not signatures:
        raise HTTPException(status_code=400, detail="Firma Stripe non valida")

    try:
        timestamp_value = int(timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Timestamp Stripe non valido") from exc

    if abs(int(time.time()) - timestamp_value) > 300:
        raise HTTPException(status_code=400, detail="Webhook Stripe scaduto")

    signed_payload = f"{timestamp}.{raw_payload.decode('utf-8')}".encode("utf-8")
    expected_signature = hmac.new(
        webhook_secret.encode("utf-8"),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()

    if not any(hmac.compare_digest(expected_signature, value) for value in signatures):
        raise HTTPException(status_code=400, detail="Firma Stripe non valida")


def _require_stripe_enabled_for_public() -> None:
    if settings.STRIPE_ENABLED:
        return
    raise HTTPException(
        status_code=503,
        detail="Stripe non configurato. Usa Bonifico o Contanti.",
    )


def _create_stripe_checkout_session(
    *,
    application: AffiliationApplication,
    request: Request,
) -> dict[str, Any]:
    _require_stripe_enabled_for_public()
    stripe_secret_key = (settings.STRIPE_SECRET_KEY or "").strip()
    stripe_price_id = (settings.STRIPE_PRICE_ID or "").strip()

    frontend_base = _resolve_frontend_base(request)
    success_url = (
        f"{frontend_base}/affiliazione?token={application.public_token}&stripe=success"
    )
    cancel_url = (
        f"{frontend_base}/affiliazione?token={application.public_token}&stripe=cancel"
    )

    body = {
        "mode": "payment",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "payment_method_types[0]": "card",
        "line_items[0][price]": stripe_price_id,
        "line_items[0][quantity]": "1",
        "metadata[application_id]": str(application.id),
        "metadata[public_token]": application.public_token,
    }

    response = requests.post(
        "https://api.stripe.com/v1/checkout/sessions",
        headers={"Authorization": f"Bearer {stripe_secret_key}"},
        data=body,
        timeout=20,
    )

    payload = response.json().copy() if response.content else {}
    if not response.ok:
        message = payload.get("error", {}).get("message") if isinstance(payload, dict) else None
        raise HTTPException(
            status_code=502,
            detail=message or "Errore durante la creazione della sessione Stripe.",
        )

    if not isinstance(payload, dict) or not payload.get("id") or not payload.get("url"):
        raise HTTPException(
            status_code=502,
            detail="Risposta Stripe non valida durante la creazione checkout.",
        )

    return payload


def _apply_patch_to_application(
    application: AffiliationApplication,
    body: PatchAffiliationDraftBody,
) -> dict[str, Any]:
    payload = body.model_dump(exclude_unset=True)
    changed: dict[str, Any] = {}

    for key, value in payload.items():
        if key == "payment_method":
            normalized_payment_method = _normalize_payment_method(value)
            if (
                normalized_payment_method == AffiliationPaymentMethod.STRIPE.value
                and not settings.STRIPE_ENABLED
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Pagamento con carta non disponibile. "
                        "Seleziona Bonifico o Contanti."
                    ),
                )
            setattr(application, key, normalized_payment_method)
            changed[key] = normalized_payment_method
            continue
        normalized_value = _normalize_text(value)
        setattr(application, key, normalized_value)
        changed[key] = normalized_value

    return changed


@router.post("/api/affiliazione/draft")
def create_affiliation_draft(
    request: Request,
    body: CreateAffiliationDraftBody,
    db: Session = Depends(get_db),
):
    applicant_email = (_normalize_text(body.applicant_email) or "").lower() or None
    referral_slug = (
        (_normalize_text(body.referral_slug) or _normalize_text(request.query_params.get("ref")))
        or None
    )
    normalized_referral_slug = referral_slug.lower() if referral_slug else None
    referrer_org = None
    if normalized_referral_slug:
        referrer_org = (
            db.query(Organization)
            .filter(
                Organization.slug == normalized_referral_slug,
                Organization.is_active.is_(True),
                Organization.deleted_at.is_(None),
            )
            .first()
        )

    for _ in range(5):
        public_token = secrets.token_urlsafe(24)
        exists = (
            db.query(AffiliationApplication.id)
            .filter(AffiliationApplication.public_token == public_token)
            .first()
        )
        if exists is None:
            break
    else:
        raise HTTPException(status_code=500, detail="Impossibile generare token bozza")

    application = AffiliationApplication(
        public_token=public_token,
        status=AffiliationApplicationStatus.DRAFT.value,
        docs_status=AffiliationDocsStatus.PENDING.value,
        payment_status=AffiliationPaymentStatus.UNPAID.value,
        payment_amount_cents=int(settings.STRIPE_AFFILIATION_PRICE_CENTS),
        applicant_email=applicant_email,
    )
    db.add(application)
    db.flush()

    if referrer_org is not None:
        db.add(
            Referral(
                referrer_org_id=referrer_org.id,
                application_id=application.id,
                status=ReferralStatus.PENDING.value,
            )
        )
        db.flush()
        _record_affiliation_event(
            db,
            application_id=application.id,
            event_type="referral_attached",
            actor_type="public",
            payload={
                "referrer_org_id": referrer_org.id,
                "referrer_org_slug": referrer_org.slug,
                "referrer_org_name": referrer_org.name,
            },
        )
    elif normalized_referral_slug:
        _record_affiliation_event(
            db,
            application_id=application.id,
            event_type="referral_ignored",
            actor_type="public",
            payload={"ref_slug": normalized_referral_slug},
        )

    _record_affiliation_event(
        db,
        application_id=application.id,
        event_type="draft_created",
        actor_type="public",
        payload={"ip": get_client_ip(request)},
    )
    db.commit()
    db.refresh(application)

    payload = _serialize_affiliation(
        application,
        include_people=True,
        include_documents=True,
        include_events=False,
        admin_view=False,
    )
    payload["resume_url_absolute"] = (
        f"{_resolve_frontend_base(request)}/affiliazione?token={application.public_token}"
    )
    return payload


@router.get("/api/affiliazione/draft/{public_token}")
def get_affiliation_draft(public_token: str, db: Session = Depends(get_db)):
    application = _find_application_by_token(db, public_token)
    return _serialize_affiliation(
        application,
        include_people=True,
        include_documents=True,
        include_events=False,
        admin_view=False,
    )


@router.patch("/api/affiliazione/draft/{public_token}")
def patch_affiliation_draft(
    request: Request,
    public_token: str,
    body: PatchAffiliationDraftBody,
    db: Session = Depends(get_db),
):
    application = _find_application_by_token(db, public_token)

    if application.status not in {
        AffiliationApplicationStatus.DRAFT.value,
        AffiliationApplicationStatus.CHANGES_REQUESTED.value,
    }:
        raise HTTPException(
            status_code=409,
            detail="La bozza non e modificabile nello stato corrente.",
        )

    changed_fields = _apply_patch_to_application(application, body)
    if changed_fields:
        _record_affiliation_event(
            db,
            application_id=application.id,
            event_type="draft_autosaved",
            actor_type="public",
            payload={"fields": sorted(changed_fields.keys()), "ip": get_client_ip(request)},
        )

    db.commit()
    db.refresh(application)
    return _serialize_affiliation(
        application,
        include_people=True,
        include_documents=True,
        include_events=False,
        admin_view=False,
    )


@router.put("/api/affiliazione/draft/{public_token}/people")
def replace_affiliation_people(
    request: Request,
    public_token: str,
    body: ReplaceAffiliationPeopleBody,
    db: Session = Depends(get_db),
):
    application = _find_application_by_token(db, public_token)

    if application.status not in {
        AffiliationApplicationStatus.DRAFT.value,
        AffiliationApplicationStatus.CHANGES_REQUESTED.value,
    }:
        raise HTTPException(
            status_code=409,
            detail="Le cariche non sono modificabili nello stato corrente.",
        )

    seen_roles: set[str] = set()
    normalized_items: list[AffiliationPersonInput] = []
    for item in body.items:
        role = (_normalize_text(item.role) or "").lower()
        if not role:
            raise HTTPException(status_code=400, detail="Role obbligatorio per ogni carica.")
        if role in seen_roles:
            raise HTTPException(
                status_code=400,
                detail=f"Ruolo duplicato non consentito: {role}",
            )
        seen_roles.add(role)
        normalized_items.append(
            AffiliationPersonInput(
                role=role,
                full_name=_normalize_text(item.full_name),
                email=item.email,
                phone=_normalize_text(item.phone),
                fiscal_code=_normalize_text(item.fiscal_code),
            )
        )

    for existing in list(application.people or []):
        db.delete(existing)
    db.flush()

    for item in normalized_items:
        db.add(
            AffiliationPerson(
                application_id=application.id,
                role=item.role,
                full_name=item.full_name,
                email=item.email,
                phone=item.phone,
                fiscal_code=item.fiscal_code,
            )
        )

    _record_affiliation_event(
        db,
        application_id=application.id,
        event_type="people_updated",
        actor_type="public",
        payload={"count": len(normalized_items), "ip": get_client_ip(request)},
    )
    db.commit()
    db.refresh(application)

    return _serialize_affiliation(
        application,
        include_people=True,
        include_documents=True,
        include_events=False,
        admin_view=False,
    )


@router.post("/api/affiliazione/draft/{public_token}/documents")
async def upload_affiliation_document(
    request: Request,
    public_token: str,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    application = _find_application_by_token(db, public_token)

    if application.status not in {
        AffiliationApplicationStatus.DRAFT.value,
        AffiliationApplicationStatus.CHANGES_REQUESTED.value,
    }:
        raise HTTPException(
            status_code=409,
            detail="I documenti non sono modificabili nello stato corrente.",
        )

    normalized_doc_type = (_normalize_text(doc_type) or "").lower()
    if normalized_doc_type not in REQUIRED_DOCUMENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Tipo documento non valido. Valori ammessi: "
                + ", ".join(REQUIRED_DOCUMENT_TYPES)
            ),
        )

    rel_path, size_bytes, sha256 = await save_upload_file(
        file,
        sub_directory=f"affiliations/{application.id}",
    )
    latest_same_type = _latest_documents_by_type(list(application.documents or [])).get(
        normalized_doc_type
    )

    document = AffiliationDocument(
        application_id=application.id,
        doc_type=normalized_doc_type,
        rel_path=rel_path,
        original_filename=file.filename,
        mime_type=file.content_type,
        size_bytes=size_bytes,
        sha256=sha256,
        status=AffiliationDocumentStatus.PENDING.value,
        replaces_document_id=latest_same_type.id if latest_same_type else None,
    )
    db.add(document)
    application.docs_status = _recompute_docs_status(application)

    _record_affiliation_event(
        db,
        application_id=application.id,
        event_type="document_uploaded",
        actor_type="public",
        payload={
            "doc_type": normalized_doc_type,
            "filename": file.filename,
            "size": size_bytes,
            "ip": get_client_ip(request),
        },
    )
    db.commit()
    db.refresh(application)

    return {
        "ok": True,
        "document": _serialize_document_public(application, document),
        "docs_status": application.docs_status,
    }


@router.get("/api/affiliazione/draft/{public_token}/documents/{document_id}")
def download_affiliation_document_public(
    public_token: str,
    document_id: int,
    db: Session = Depends(get_db),
):
    application = _find_application_by_token(db, public_token)
    document = (
        db.query(AffiliationDocument)
        .filter(
            AffiliationDocument.id == document_id,
            AffiliationDocument.application_id == application.id,
        )
        .first()
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Documento non trovato")

    full_path = _application_download_path(document)
    filename = document.original_filename or f"{document.doc_type}-{document.id}.pdf"
    return FileResponse(full_path, filename=filename, content_disposition_type="attachment")


@router.post("/api/affiliazione/draft/{public_token}/stripe/checkout")
def create_affiliation_checkout(
    request: Request,
    public_token: str,
    db: Session = Depends(get_db),
):
    application = _find_application_by_token(db, public_token)
    _require_stripe_enabled_for_public()

    if application.status not in {
        AffiliationApplicationStatus.DRAFT.value,
        AffiliationApplicationStatus.CHANGES_REQUESTED.value,
        AffiliationApplicationStatus.UNDER_REVIEW.value,
    }:
        raise HTTPException(
            status_code=409,
            detail="Checkout Stripe non disponibile nello stato corrente.",
        )

    application.payment_method = AffiliationPaymentMethod.STRIPE.value
    session_payload = _create_stripe_checkout_session(
        application=application,
        request=request,
    )
    application.payment_status = AffiliationPaymentStatus.CHECKOUT_PENDING.value
    application.stripe_checkout_session_id = session_payload.get("id")

    _record_affiliation_event(
        db,
        application_id=application.id,
        event_type="stripe_checkout_created",
        actor_type="public",
        payload={
            "stripe_session_id": application.stripe_checkout_session_id,
            "ip": get_client_ip(request),
        },
    )
    db.commit()

    return {
        "ok": True,
        "checkout_url": session_payload.get("url"),
        "session_id": session_payload.get("id"),
        "payment_status": application.payment_status,
    }


@router.post("/api/affiliazione/draft/{public_token}/submit")
def submit_affiliation_draft(
    request: Request,
    public_token: str,
    db: Session = Depends(get_db),
):
    application = _find_application_by_token(db, public_token)

    if application.status not in {
        AffiliationApplicationStatus.DRAFT.value,
        AffiliationApplicationStatus.CHANGES_REQUESTED.value,
    }:
        raise HTTPException(
            status_code=409,
            detail="La richiesta non puo essere inviata nello stato corrente.",
        )

    missing_fields = _required_field_check(application)
    if missing_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Campi mancanti: {', '.join(missing_fields)}",
        )

    latest_docs = _latest_documents_by_type(list(application.documents or []))
    missing_docs = [doc_type for doc_type in REQUIRED_DOCUMENT_TYPES if doc_type not in latest_docs]
    if missing_docs:
        raise HTTPException(
            status_code=400,
            detail=f"Documenti mancanti: {', '.join(missing_docs)}",
        )

    normalized_payment_method = _normalize_payment_method(application.payment_method)
    if normalized_payment_method is None:
        raise HTTPException(status_code=400, detail="Metodo di pagamento obbligatorio")
    if (
        normalized_payment_method == AffiliationPaymentMethod.STRIPE.value
        and not settings.STRIPE_ENABLED
    ):
        raise HTTPException(
            status_code=400,
            detail="Pagamento con carta non disponibile. Seleziona Bonifico o Contanti.",
        )

    application.payment_method = normalized_payment_method
    application.docs_status = AffiliationDocsStatus.PENDING.value
    application.status = AffiliationApplicationStatus.UNDER_REVIEW.value
    application.submitted_at = datetime.utcnow()

    video_mode = AffiliationVideoMode.REVIEW.value
    if normalized_payment_method in MANUAL_PAYMENT_METHODS:
        application.payment_status = AffiliationPaymentStatus.PAYMENT_UNDER_REVIEW.value
        video_mode = AffiliationVideoMode.PAYMENT_PENDING.value
    elif application.payment_status != AffiliationPaymentStatus.PAID.value:
        application.payment_status = AffiliationPaymentStatus.CHECKOUT_PENDING.value

    _record_affiliation_event(
        db,
        application_id=application.id,
        event_type="application_submitted",
        actor_type="public",
        payload={
            "payment_method": application.payment_method,
            "payment_status": application.payment_status,
            "ip": get_client_ip(request),
            "user_agent": request.headers.get("user-agent"),
        },
    )

    video_job = enqueue_affiliation_video_job(
        db,
        application_id=application.id,
        mode=video_mode,
        payload={
            "trigger": "submit",
            "organization_name": application.organization_name,
        },
    )

    db.commit()
    db.refresh(application)

    if application.payment_method in MANUAL_PAYMENT_METHODS:
        status_message = "Ti contatteremo per conferma"
    elif application.payment_status == AffiliationPaymentStatus.PAID.value:
        status_message = "Pagamento ricevuto, documenti in revisione"
    else:
        status_message = "Pagamento in attesa, documenti in revisione"

    return {
        "ok": True,
        "status": application.status,
        "payment_status": application.payment_status,
        "message": status_message,
        "next_steps": [
            "Richiesta inviata",
            status_message,
            "Riceverai email alla conferma",
        ],
        "latest_video_job": serialize_video_job(video_job),
        "application": _serialize_affiliation(
            application,
            include_people=True,
            include_documents=True,
            include_events=False,
            admin_view=False,
        ),
    }


@router.post("/api/affiliazione/stripe/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    if not settings.STRIPE_ENABLED:
        return {"received": True, "stripe_enabled": False}

    raw_payload = await request.body()
    signature_header = request.headers.get("Stripe-Signature", "")
    _verify_stripe_webhook_signature(raw_payload, signature_header)

    try:
        payload = json.loads(raw_payload.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Payload Stripe non valido") from exc

    event_type = str(payload.get("type") or "").strip()
    event_id = str(payload.get("id") or "").strip()
    event_data = payload.get("data") if isinstance(payload, dict) else None
    event_object = event_data.get("object") if isinstance(event_data, dict) else None

    if event_type == "checkout.session.completed" and isinstance(event_object, dict):
        session_id = str(event_object.get("id") or "").strip()
        metadata = event_object.get("metadata") if isinstance(event_object, dict) else {}
        application_id_raw = metadata.get("application_id") if isinstance(metadata, dict) else None
        application = None

        if application_id_raw is not None:
            try:
                application_id = int(str(application_id_raw).strip())
            except ValueError:
                application_id = None
            if application_id is not None:
                application = (
                    db.query(AffiliationApplication)
                    .filter(AffiliationApplication.id == application_id)
                    .first()
                )

        if application is None and session_id:
            application = (
                db.query(AffiliationApplication)
                .filter(AffiliationApplication.stripe_checkout_session_id == session_id)
                .first()
            )

        if application is not None and application.stripe_last_event_id != event_id:
            application.payment_method = AffiliationPaymentMethod.STRIPE.value
            application.payment_status = AffiliationPaymentStatus.PAID.value
            application.stripe_checkout_session_id = session_id or application.stripe_checkout_session_id
            payment_intent = event_object.get("payment_intent")
            if payment_intent:
                application.stripe_payment_intent_id = str(payment_intent)
            application.stripe_last_event_id = event_id or application.stripe_last_event_id

            _record_affiliation_event(
                db,
                application_id=application.id,
                event_type="stripe_payment_completed",
                actor_type="webhook",
                payload={
                    "event_id": event_id,
                    "session_id": session_id,
                    "payment_intent": application.stripe_payment_intent_id,
                },
            )
            db.commit()

    return {"received": True}


@super_admin_router.get("/affiliations")
def list_affiliations(
    request: Request,
    q: str | None = Query(default=None),
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    _ensure_super_admin(request, db)

    query = db.query(AffiliationApplication)
    normalized_q = _normalize_text(q)
    if normalized_q:
        pattern = f"%{normalized_q}%"
        query = query.filter(
            or_(
                AffiliationApplication.organization_name.ilike(pattern),
                AffiliationApplication.organization_legal_name.ilike(pattern),
                AffiliationApplication.applicant_email.ilike(pattern),
                AffiliationApplication.city.ilike(pattern),
            )
        )

    normalized_status = (_normalize_text(status) or "").lower()
    if normalized_status:
        query = query.filter(AffiliationApplication.status == normalized_status)

    total = int(query.count())
    total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1
    items = (
        query.order_by(
            AffiliationApplication.submitted_at.desc().nullslast(),
            AffiliationApplication.created_at.desc(),
            AffiliationApplication.id.desc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "items": [
            {
                "id": item.id,
                "public_token": item.public_token,
                "organization_name": item.organization_name,
                "applicant_email": item.applicant_email,
                "status": item.status,
                "docs_status": item.docs_status,
                "payment_method": item.payment_method,
                "payment_status": item.payment_status,
                "submitted_at": _safe_iso(item.submitted_at),
                "created_at": _safe_iso(item.created_at),
                "can_approve": _can_approve(item),
            }
            for item in items
        ],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
    }


@super_admin_router.get("/affiliations/{application_id}")
def get_affiliation_detail_admin(
    request: Request,
    application_id: int,
    db: Session = Depends(get_db),
):
    _ensure_super_admin(request, db)
    application = (
        db.query(AffiliationApplication)
        .filter(AffiliationApplication.id == application_id)
        .first()
    )
    if application is None:
        raise HTTPException(status_code=404, detail="Affiliazione non trovata")

    return _serialize_affiliation(
        application,
        include_people=True,
        include_documents=True,
        include_events=True,
        admin_view=True,
    )


@super_admin_router.get("/affiliations/{application_id}/documents/{document_id}")
def download_affiliation_document_admin(
    request: Request,
    application_id: int,
    document_id: int,
    db: Session = Depends(get_db),
):
    _ensure_super_admin(request, db)
    document = (
        db.query(AffiliationDocument)
        .filter(
            AffiliationDocument.id == document_id,
            AffiliationDocument.application_id == application_id,
        )
        .first()
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Documento non trovato")

    full_path = _application_download_path(document)
    filename = document.original_filename or f"{document.doc_type}-{document.id}.pdf"
    return FileResponse(full_path, filename=filename, content_disposition_type="attachment")


@super_admin_router.post("/affiliations/{application_id}/documents/{document_id}/review")
def review_affiliation_document(
    request: Request,
    application_id: int,
    document_id: int,
    body: ReviewAffiliationDocumentBody,
    db: Session = Depends(get_db),
):
    admin = _ensure_super_admin(request, db)
    application = (
        db.query(AffiliationApplication)
        .filter(AffiliationApplication.id == application_id)
        .first()
    )
    if application is None:
        raise HTTPException(status_code=404, detail="Affiliazione non trovata")

    if application.status in {
        AffiliationApplicationStatus.APPROVED.value,
        AffiliationApplicationStatus.REJECTED.value,
    }:
        raise HTTPException(
            status_code=409,
            detail="Affiliazione chiusa: review documentale non disponibile.",
        )

    document = (
        db.query(AffiliationDocument)
        .filter(
            AffiliationDocument.id == document_id,
            AffiliationDocument.application_id == application.id,
        )
        .first()
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Documento non trovato")

    normalized_status = (_normalize_text(body.status) or "").lower()
    if normalized_status not in {
        AffiliationDocumentStatus.APPROVED.value,
        AffiliationDocumentStatus.REJECTED.value,
    }:
        raise HTTPException(status_code=400, detail="Status review non valido")

    notes = _normalize_text(body.notes)
    if normalized_status == AffiliationDocumentStatus.REJECTED.value and not notes:
        raise HTTPException(
            status_code=400,
            detail="La nota e obbligatoria quando un documento viene rifiutato.",
        )

    document.status = normalized_status
    document.review_notes = notes
    document.rejection_note = (
        notes if normalized_status == AffiliationDocumentStatus.REJECTED.value else None
    )
    document.reviewed_at = datetime.utcnow()
    document.reviewed_by_admin_id = admin.id

    application.docs_status = _recompute_docs_status(application)
    if application.docs_status == AffiliationDocsStatus.CHANGES_REQUESTED.value:
        application.status = AffiliationApplicationStatus.CHANGES_REQUESTED.value
    elif application.status == AffiliationApplicationStatus.CHANGES_REQUESTED.value:
        application.status = AffiliationApplicationStatus.UNDER_REVIEW.value

    application.reviewed_by_admin_id = admin.id
    application.reviewed_at = datetime.utcnow()

    _record_affiliation_event(
        db,
        application_id=application.id,
        event_type="document_reviewed",
        actor_type="super_admin",
        actor_admin_id=admin.id,
        payload={
            "document_id": document.id,
            "doc_type": document.doc_type,
            "status": document.status,
            "notes": notes,
        },
    )
    db.commit()

    return {
        "ok": True,
        "docs_status": application.docs_status,
        "application_status": application.status,
        "document": _serialize_document_admin(application, document),
    }


@super_admin_router.post("/affiliations/{application_id}/payment/verify")
def verify_affiliation_payment(
    request: Request,
    application_id: int,
    body: VerifyAffiliationPaymentBody,
    db: Session = Depends(get_db),
):
    admin = _ensure_super_admin(request, db)
    application = (
        db.query(AffiliationApplication)
        .filter(AffiliationApplication.id == application_id)
        .first()
    )
    if application is None:
        raise HTTPException(status_code=404, detail="Affiliazione non trovata")

    payment_method = (application.payment_method or "").strip().lower()
    if payment_method not in MANUAL_PAYMENT_METHODS:
        raise HTTPException(
            status_code=400,
            detail="Verifica manuale disponibile solo per bonifico o contanti.",
        )

    notes = _normalize_text(body.notes)
    application.reviewed_by_admin_id = admin.id
    application.reviewed_at = datetime.utcnow()

    if body.verified:
        application.payment_status = AffiliationPaymentStatus.VERIFIED.value
        application.payment_verified_at = datetime.utcnow()
        application.payment_verified_by_admin_id = admin.id
    else:
        application.payment_status = AffiliationPaymentStatus.PAYMENT_UNDER_REVIEW.value

    if notes:
        application.review_notes = notes

    _record_affiliation_event(
        db,
        application_id=application.id,
        event_type="payment_reviewed",
        actor_type="super_admin",
        actor_admin_id=admin.id,
        payload={
            "verified": bool(body.verified),
            "payment_status": application.payment_status,
            "notes": notes,
        },
    )
    db.commit()

    return {
        "ok": True,
        "payment_status": application.payment_status,
        "can_approve": _can_approve(application),
    }


@super_admin_router.post("/affiliations/{application_id}/request-changes")
def request_affiliation_changes(
    request: Request,
    application_id: int,
    body: AffiliationDecisionBody,
    db: Session = Depends(get_db),
):
    admin = _ensure_super_admin(request, db)
    application = (
        db.query(AffiliationApplication)
        .filter(AffiliationApplication.id == application_id)
        .first()
    )
    if application is None:
        raise HTTPException(status_code=404, detail="Affiliazione non trovata")

    notes = _normalize_text(body.notes)
    if not notes:
        raise HTTPException(
            status_code=400,
            detail="Inserisci una nota per la richiesta modifiche.",
        )

    application.status = AffiliationApplicationStatus.CHANGES_REQUESTED.value
    application.docs_status = AffiliationDocsStatus.CHANGES_REQUESTED.value
    application.reviewed_at = datetime.utcnow()
    application.reviewed_by_admin_id = admin.id
    application.review_notes = notes

    _record_affiliation_event(
        db,
        application_id=application.id,
        event_type="changes_requested",
        actor_type="super_admin",
        actor_admin_id=admin.id,
        payload={"notes": notes},
    )
    db.commit()

    return {
        "ok": True,
        "status": application.status,
        "docs_status": application.docs_status,
    }


@super_admin_router.post("/affiliations/{application_id}/approve")
def approve_affiliation_application(
    request: Request,
    application_id: int,
    body: AffiliationDecisionBody,
    db: Session = Depends(get_db),
):
    admin = _ensure_super_admin(request, db)
    application = (
        db.query(AffiliationApplication)
        .filter(AffiliationApplication.id == application_id)
        .first()
    )
    if application is None:
        raise HTTPException(status_code=404, detail="Affiliazione non trovata")

    if application.status == AffiliationApplicationStatus.APPROVED.value:
        return {
            "ok": True,
            "status": application.status,
            "approved_org_id": application.approved_org_id,
        }

    if not _can_approve(application):
        raise HTTPException(
            status_code=409,
            detail=(
                "Impossibile approvare: servono documenti OK e pagamento verificato "
                "(Stripe PAID o manuale VERIFIED)."
            ),
        )

    organization, admin_user = _provision_organization_and_admin(
        db,
        application=application,
    )
    if admin_user is not None:
        _invite_org_admin(db, admin=admin_user, organization_name=organization.name)

    notes = _normalize_text(body.notes)
    application.status = AffiliationApplicationStatus.APPROVED.value
    application.approved_at = datetime.utcnow()
    application.reviewed_at = datetime.utcnow()
    application.reviewed_by_admin_id = admin.id
    application.review_notes = notes
    application.approved_org_id = organization.id

    _record_affiliation_event(
        db,
        application_id=application.id,
        event_type="application_approved",
        actor_type="super_admin",
        actor_admin_id=admin.id,
        payload={
            "notes": notes,
            "organization_id": organization.id,
            "org_admin_id": admin_user.id if admin_user else None,
        },
    )

    referral = application.referral
    if referral is not None and referral.status == ReferralStatus.PENDING.value:
        referral.status = ReferralStatus.APPROVED.value
        referral.approved_at = datetime.utcnow()
        _record_affiliation_event(
            db,
            application_id=application.id,
            event_type="referral_approved",
            actor_type="super_admin",
            actor_admin_id=admin.id,
            payload={
                "referral_id": referral.id,
                "referrer_org_id": referral.referrer_org_id,
            },
        )

    enqueue_affiliation_video_job(
        db,
        application_id=application.id,
        mode=AffiliationVideoMode.APPROVED.value,
        payload={"trigger": "approve", "organization_id": organization.id},
    )

    audit.log_operation(
        db,
        action="affiliation.approved",
        entity_type="affiliation_application",
        entity_id=application.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.SUPER_ADMIN.value,
        metadata={
            "organization_id": organization.id,
            "org_admin_id": admin_user.id if admin_user else None,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    db.commit()

    return {
        "ok": True,
        "status": application.status,
        "approved_org_id": organization.id,
        "org_admin_id": admin_user.id if admin_user else None,
        "organization_slug": organization.slug,
    }


@super_admin_router.post("/affiliations/{application_id}/reject")
def reject_affiliation_application(
    request: Request,
    application_id: int,
    body: AffiliationDecisionBody,
    db: Session = Depends(get_db),
):
    admin = _ensure_super_admin(request, db)
    application = (
        db.query(AffiliationApplication)
        .filter(AffiliationApplication.id == application_id)
        .first()
    )
    if application is None:
        raise HTTPException(status_code=404, detail="Affiliazione non trovata")

    notes = _normalize_text(body.notes)
    if not notes:
        raise HTTPException(
            status_code=400,
            detail="Inserisci una nota di rifiuto.",
        )

    application.status = AffiliationApplicationStatus.REJECTED.value
    application.rejected_at = datetime.utcnow()
    application.reviewed_at = datetime.utcnow()
    application.reviewed_by_admin_id = admin.id
    application.review_notes = notes

    _record_affiliation_event(
        db,
        application_id=application.id,
        event_type="application_rejected",
        actor_type="super_admin",
        actor_admin_id=admin.id,
        payload={"notes": notes},
    )

    audit.log_operation(
        db,
        action="affiliation.rejected",
        entity_type="affiliation_application",
        entity_id=application.id,
        actor_admin_id=admin.id,
        actor_role=AdminRole.SUPER_ADMIN.value,
        metadata={"notes": notes},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    db.commit()

    return {
        "ok": True,
        "status": application.status,
    }


@super_admin_router.post("/affiliations/video-jobs/run")
def run_affiliation_video_jobs(
    request: Request,
    body: RunAffiliationVideoBody,
    db: Session = Depends(get_db),
):
    _ensure_super_admin(request, db)
    stats = process_video_jobs_once(limit=body.limit)
    return {"ok": True, "stats": stats}


@associations_router.get("/organizations-unified")
def list_organizations_unified(
    request: Request,
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    _ensure_super_admin(request, db)
    normalized_q = _normalize_text(q)

    org_query = db.query(Organization)
    if normalized_q:
        pattern = f"%{normalized_q}%"
        org_query = org_query.filter(
            or_(
                Organization.name.ilike(pattern),
                Organization.slug.ilike(pattern),
                Organization.email.ilike(pattern),
            )
        )
    organizations = org_query.all()

    affiliation_query = db.query(AffiliationApplication).filter(
        AffiliationApplication.status.in_(
            [
                AffiliationApplicationStatus.UNDER_REVIEW.value,
                AffiliationApplicationStatus.CHANGES_REQUESTED.value,
            ]
        )
    )
    if normalized_q:
        pattern = f"%{normalized_q}%"
        affiliation_query = affiliation_query.filter(
            or_(
                AffiliationApplication.organization_name.ilike(pattern),
                AffiliationApplication.organization_legal_name.ilike(pattern),
                AffiliationApplication.applicant_email.ilike(pattern),
            )
        )
    pending_affiliations = affiliation_query.all()

    merged: list[dict[str, Any]] = []
    for org in organizations:
        merged.append(
            {
                "entity_type": "organization",
                "id": org.id,
                "name": org.name,
                "slug": org.slug,
                "email": org.email,
                "city": org.city,
                "status_label": "Attiva" if org.is_active else "Disattivata",
                "created_at": _safe_iso(org.created_at),
                "sort_date": org.created_at or datetime.min,
            }
        )

    for item in pending_affiliations:
        merged.append(
            {
                "entity_type": "affiliation_pending",
                "id": item.id,
                "name": item.organization_name or item.organization_legal_name,
                "slug": None,
                "email": item.applicant_email,
                "city": item.city,
                "status_label": "In revisione",
                "created_at": _safe_iso(item.submitted_at or item.created_at),
                "sort_date": item.submitted_at or item.created_at or datetime.min,
            }
        )

    merged.sort(key=lambda entry: entry["sort_date"], reverse=True)
    total = len(merged)
    total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1
    start = (page - 1) * page_size
    end = start + page_size

    items = []
    for entry in merged[start:end]:
        payload = dict(entry)
        payload.pop("sort_date", None)
        items.append(payload)

    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
    }

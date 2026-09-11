"""Transactional delivery of central communications to affiliated organizations."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime

from fastapi import HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    AdminRole, AdminUser, AffiliateCommunication, AffiliateCommunicationRead,
    AffiliateCommunicationRecipient, Organization, OrgAdminNotification,
    OrgAdminNotificationType,
)
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.org_admin_notifications import (
    _resolve_frontend_base_url, _unique_org_admin_recipient_emails,
)
from app.services.system_email_layout import build_system_email_html


def list_eligible_organizations(db: Session) -> list[Organization]:
    return db.query(Organization).filter(
        Organization.is_active.is_(True), Organization.deleted_at.is_(None),
    ).order_by(Organization.name.asc(), Organization.id.asc()).all()


def resolve_audience(db: Session, audience: str, organization_ids: list[int]) -> list[Organization]:
    organizations = list_eligible_organizations(db)
    if audience == "selected":
        selected = set(organization_ids)
        organizations = [org for org in organizations if org.id in selected]
        if selected != {org.id for org in organizations}:
            raise HTTPException(422, "Seleziona soltanto associazioni affiliate attive e disponibili.")
    if not organizations:
        raise HTTPException(422, "Nessuna associazione attiva disponibile per l'invio.")
    return organizations


def audience_admins(db: Session, organizations: list[Organization]) -> dict[int, list[AdminUser]]:
    result: dict[int, list[AdminUser]] = {org.id: [] for org in organizations}
    if not result:
        return result
    for admin in db.query(AdminUser).filter(
        AdminUser.org_id.in_(result), AdminUser.role == AdminRole.ORG_ADMIN,
        AdminUser.is_active.is_(True), AdminUser.deleted_at.is_(None),
    ).order_by(AdminUser.id.asc()).all():
        result[admin.org_id].append(admin)
    return result


def serialize_recipient(org: Organization, admins: list[AdminUser]) -> dict:
    return {
        "id": org.id, "name": org.name, "slug": org.slug,
        "admin_count": len(admins),
        "email_count": len(_unique_org_admin_recipient_emails(admins)),
    }


def preview_audience(db: Session, organizations: list[Organization]) -> dict:
    admins_by_org = audience_admins(db, organizations)
    recipients = [serialize_recipient(org, admins_by_org[org.id]) for org in organizations]
    return {
        "organization_count": len(recipients),
        "admin_count": sum(item["admin_count"] for item in recipients),
        "email_count": sum(item["email_count"] for item in recipients),
        "without_admin_count": sum(item["admin_count"] == 0 for item in recipients),
        "recipients": recipients,
    }


def communication_href(communication_id: int) -> str:
    return f"/org-admin/comunicazioni-assonam?message={communication_id}"


def serialize_communication(item: AffiliateCommunication) -> dict:
    return {
        "id": item.id, "subject": item.subject, "body": item.body,
        "excerpt": " ".join(item.body.split())[:180], "audience": item.audience,
        "created_at": item.created_at.isoformat() + "Z",
        "recipient_count": item.recipient_count, "email_count": item.email_count,
        "notification_count": item.notification_count,
        "created_by_email": item.created_by_email,
    }


def send_communication(
    db: Session, *, admin: AdminUser, request: Request, subject: str, body: str,
    audience: str, organization_ids: list[int], idempotency_key: str,
    expected_organization_ids: list[int] | None = None,
) -> tuple[AffiliateCommunication, bool]:
    fingerprint = hashlib.sha256(json.dumps({
        "subject": subject, "body": body, "audience": audience,
        "organization_ids": sorted(set(organization_ids)),
        "admin_id": admin.id,
        "expected_organization_ids": sorted(set(expected_organization_ids)) if expected_organization_ids is not None else None,
    }, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()

    def replay_existing() -> AffiliateCommunication | None:
        existing = db.query(AffiliateCommunication).filter_by(idempotency_key=idempotency_key).first()
        if existing is not None and existing.request_fingerprint != fingerprint:
            raise HTTPException(409, "Questa chiave di invio è già stata usata per una comunicazione diversa.")
        return existing

    existing = replay_existing()
    if existing is not None:
        return existing, True

    organizations = resolve_audience(db, audience, organization_ids)
    if expected_organization_ids is not None and set(expected_organization_ids) != {org.id for org in organizations}:
        raise HTTPException(409, "Le associazioni destinatarie sono cambiate. Aggiorna l'anteprima prima di inviare.")
    admins_by_org = audience_admins(db, organizations)
    message = AffiliateCommunication(
        subject=subject, body=body, audience=audience, idempotency_key=idempotency_key,
        request_fingerprint=fingerprint, created_by_admin_id=admin.id,
        created_by_email=admin.email, recipient_count=len(organizations),
        email_count=0, notification_count=0,
    )
    try:
        # No commits in delivery helpers: publication, bell and outbox are one unit.
        db.add(message)
        db.flush()
        href = communication_href(message.id)
        cta_url = f"{_resolve_frontend_base_url(request)}{href}"
        for org in organizations:
            admins = admins_by_org[org.id]
            recipients = _unique_org_admin_recipient_emails(admins)
            db.add(AffiliateCommunicationRecipient(
                communication_id=message.id, organization_id=org.id,
                organization_name=org.name, admin_count=len(admins), email_count=len(recipients),
            ))
            for recipient_admin in admins:
                db.add(OrgAdminNotification(
                    admin_user_id=recipient_admin.id, org_id=org.id,
                    type=OrgAdminNotificationType.CENTRAL_COMMUNICATION.value,
                    title=subject, body=" ".join(body.split())[:240], href=href,
                    communication_id=message.id, is_read=False,
                ))
            html_body = build_system_email_html(
                title=subject, body=body, preheader="Nuova comunicazione da ASSO.N.A.M.",
                eyebrow="Comunicazioni", organization_name=org.name,
                cta_url=cta_url, cta_label="Leggi nell'area riservata",
                footer="Questa comunicazione è disponibile anche nell'area riservata della tua associazione.",
            )
            for recipient_admin, email in recipients:
                enqueue_email(
                    db, email_type=OrgAdminNotificationType.CENTRAL_COMMUNICATION.value,
                    to_email=email, subject=subject, priority=3,
                    payload=build_email_payload(
                        text_body=f"ASSO.N.A.M. · {org.name}\n\n{subject}\n\n{body}\n\nLeggi nell'area riservata: {cta_url}",
                        html_body=html_body,
                        meta={"org_id": org.id, "admin_id": recipient_admin.id,
                              "communication_id": message.id, "href": href},
                    ),
                    dedupe_key=f"central_communication:{message.id}:{recipient_admin.id}",
                )
            message.email_count += len(recipients)
            message.notification_count += len(admins)
        db.commit()
    except IntegrityError:
        db.rollback()
        # A concurrent identical request may have won the unique key race.
        existing = replay_existing()
        if existing is not None:
            return existing, True
        raise
    except Exception:
        db.rollback()
        raise
    return message, False


def record_communication_read(
    db: Session, *, communication_id: int, admin_user_id: int, now: datetime | None = None,
) -> None:
    """Keep inbox state when bell notifications are marked read or removed."""
    key = {"communication_id": communication_id, "admin_user_id": admin_user_id}
    if db.query(AffiliateCommunicationRead).filter_by(**key).first() is not None:
        return
    try:
        with db.begin_nested():
            db.add(AffiliateCommunicationRead(**key, read_at=now or datetime.utcnow()))
            db.flush()
    except IntegrityError:
        # Concurrent read/read-all is harmless; preserve the first read timestamp.
        if db.query(AffiliateCommunicationRead).filter_by(**key).first() is None:
            raise

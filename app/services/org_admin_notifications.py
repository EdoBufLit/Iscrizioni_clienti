from __future__ import annotations

import logging
from datetime import datetime
from typing import Iterable

from fastapi import Request
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    AdminRole,
    AdminUser,
    AccountingDocument,
    OrgAdminNotification,
    OrgAdminNotificationType,
    Organization,
    OrganizationSharedDocument,
)
from app.services.email_outbox import build_email_payload, enqueue_email

logger = logging.getLogger(__name__)


def _resolve_frontend_base_url(request: Request | None = None) -> str:
    configured = (settings.FRONTEND_URL or "").strip().rstrip("/")
    if configured:
        return configured
    if request is not None:
        return str(request.base_url).rstrip("/")
    fallback = (settings.BASE_URL or "").strip().rstrip("/")
    return fallback


def _list_active_org_admins(db: Session, org_id: int) -> list[AdminUser]:
    return (
        db.query(AdminUser)
        .filter(
            AdminUser.org_id == org_id,
            AdminUser.role == AdminRole.ORG_ADMIN,
            AdminUser.is_active.is_(True),
            AdminUser.deleted_at.is_(None),
        )
        .order_by(AdminUser.id.asc())
        .all()
    )


def _unique_org_admin_recipient_emails(admins: Iterable[AdminUser]) -> list[tuple[AdminUser, str]]:
    recipients: list[tuple[AdminUser, str]] = []
    seen: set[str] = set()
    for admin in admins:
        normalized_email = (admin.email or "").strip().lower()
        if not normalized_email or normalized_email in seen:
            continue
        seen.add(normalized_email)
        recipients.append((admin, normalized_email))
    return recipients


def _create_notification_rows(
    db: Session,
    *,
    admins: Iterable[AdminUser],
    org_id: int,
    notification_type: OrgAdminNotificationType,
    title: str,
    body: str,
    href: str,
) -> int:
    created = 0
    for admin in admins:
        db.add(
            OrgAdminNotification(
                admin_user_id=admin.id,
                org_id=org_id,
                type=notification_type.value,
                title=title,
                body=body,
                href=href,
                is_read=False,
            )
        )
        created += 1
    return created


def _build_email_html(
    *,
    heading: str,
    title: str,
    body: str,
    cta_url: str,
    cta_label: str,
    organization_name: str,
) -> str:
    return f"""
    <div style="background:#f3f4f6;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#111827;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid rgba(15,23,42,0.08);box-shadow:0 30px 80px -50px rgba(15,23,42,0.35);">
        <div style="padding:28px 32px;background:linear-gradient(135deg,#0f172a,#111827);color:#f8fafc;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;color:#cbd5e1;">ASSO.N.A.M.</div>
          <h1 style="margin:16px 0 0;font-size:28px;line-height:1.1;font-weight:700;">{heading}</h1>
        </div>
        <div style="padding:32px;">
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.24em;text-transform:uppercase;color:#9ca3af;font-weight:700;">{organization_name}</p>
          <h2 style="margin:0 0 14px;font-size:24px;line-height:1.2;color:#111827;">{title}</h2>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#4b5563;">{body}</p>
          <a href="{cta_url}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#0f766e;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">{cta_label}</a>
        </div>
      </div>
    </div>
    """.strip()


def notify_org_admins_about_shared_document(
    db: Session,
    *,
    organization: Organization,
    document: OrganizationSharedDocument,
    request: Request,
) -> dict[str, int]:
    admins = _list_active_org_admins(db, organization.id)
    recipient_emails = _unique_org_admin_recipient_emails(admins)
    href = (
        "/org-admin/contabilita"
        if document.kind == "accounting"
        else "/org-admin/documenti"
    )
    frontend_base_url = _resolve_frontend_base_url(request)
    cta_url = f"{frontend_base_url}{href}"
    is_accounting = document.kind == "accounting"
    title = (
        "Nuovo documento contabile disponibile"
        if is_accounting
        else "Nuovo documento disponibile"
    )
    body = (
        f"Il Super Admin ha caricato il documento \"{document.title}\" nella sezione Contabilità."
        if is_accounting
        else f"Il Super Admin ha caricato il documento \"{document.title}\" nella sezione Documenti."
    )
    notification_type = (
        OrgAdminNotificationType.DOCUMENT_ACCOUNTING
        if is_accounting
        else OrgAdminNotificationType.DOCUMENT_GENERAL
    )

    notifications_created = _create_notification_rows(
        db,
        admins=admins,
        org_id=organization.id,
        notification_type=notification_type,
        title=title,
        body=body,
        href=href,
    )

    emails_queued = 0
    subject = (
        f"Nuovo documento contabile per {organization.name}"
        if is_accounting
        else f"Nuovo documento per {organization.name}"
    )
    heading = "Nuovo documento contabile" if is_accounting else "Nuovo documento"
    html_body = _build_email_html(
        heading=heading,
        title=document.title,
        body=body,
        cta_url=cta_url,
        cta_label="Apri dashboard",
        organization_name=organization.name,
    )
    text_body = f"{title}\n\n{body}\n\nApri la dashboard: {cta_url}"

    for admin, email in recipient_emails:
        enqueue_email(
            db,
            email_type=notification_type.value,
            to_email=email,
            subject=subject,
            payload=build_email_payload(
                text_body=text_body,
                html_body=html_body,
                meta={
                    "admin_id": admin.id,
                    "org_id": organization.id,
                    "document_id": document.id,
                    "href": href,
                },
            ),
            priority=3,
            dedupe_key=f"{notification_type.value}:{document.id}:{admin.id}",
        )
        emails_queued += 1

    logger.info(
        "org_admin_document_alerts_queued org_id=%s document_id=%s type=%s admin_ids=%s recipient_emails=%s notifications=%s emails=%s",
        organization.id,
        document.id,
        notification_type.value,
        [admin.id for admin in admins],
        [email for _, email in recipient_emails],
        notifications_created,
        emails_queued,
    )

    return {
        "notifications_created": notifications_created,
        "emails_queued": emails_queued,
    }


def notify_org_admins_about_accounting_document(
    db: Session,
    *,
    organization: Organization,
    document: AccountingDocument,
    request: Request,
) -> dict[str, int]:
    admins = _list_active_org_admins(db, organization.id)
    recipient_emails = _unique_org_admin_recipient_emails(admins)
    href = "/org-admin/contabilita"
    frontend_base_url = _resolve_frontend_base_url(request)
    cta_url = f"{frontend_base_url}{href}"
    title = "Nuovo documento contabile disponibile"
    body = (
        f'Il Super Admin ha caricato il documento "{document.title}" nella sezione Contabilita.'
    )
    notification_type = OrgAdminNotificationType.DOCUMENT_ACCOUNTING

    notifications_created = _create_notification_rows(
        db,
        admins=admins,
        org_id=organization.id,
        notification_type=notification_type,
        title=title,
        body=body,
        href=href,
    )

    subject = f"Nuovo documento contabile per {organization.name}"
    html_body = _build_email_html(
        heading="Nuovo documento contabile",
        title=document.title,
        body=body,
        cta_url=cta_url,
        cta_label="Apri dashboard",
        organization_name=organization.name,
    )
    text_body = f"{title}\n\n{body}\n\nApri la dashboard: {cta_url}"

    emails_queued = 0
    for admin, email in recipient_emails:
        enqueue_email(
            db,
            email_type=notification_type.value,
            to_email=email,
            subject=subject,
            payload=build_email_payload(
                text_body=text_body,
                html_body=html_body,
                meta={
                    "admin_id": admin.id,
                    "org_id": organization.id,
                    "document_id": document.id,
                    "href": href,
                },
            ),
            priority=3,
            dedupe_key=f"{notification_type.value}:accounting:{document.id}:{admin.id}",
        )
        emails_queued += 1

    logger.info(
        "org_admin_accounting_alerts_queued org_id=%s document_id=%s admin_ids=%s recipient_emails=%s notifications=%s emails=%s",
        organization.id,
        document.id,
        [admin.id for admin in admins],
        [email for _, email in recipient_emails],
        notifications_created,
        emails_queued,
    )

    return {
        "notifications_created": notifications_created,
        "emails_queued": emails_queued,
    }


def notify_org_admins_low_cards(
    db: Session,
    *,
    organization: Organization,
    remaining: int,
    now: datetime,
    request: Request | None = None,
) -> dict[str, int]:
    admins = _list_active_org_admins(db, organization.id)
    recipient_emails = _unique_org_admin_recipient_emails(admins)
    href = "/org-admin/tessere"
    frontend_base_url = _resolve_frontend_base_url(request)
    cta_url = f"{frontend_base_url}{href}" if frontend_base_url else href
    title = "Tessere in esaurimento"
    body = (
        f"L'associazione {organization.name} ha solo {remaining} tessere disponibili. "
        "Controlla subito la sezione Tessere."
    )

    notifications_created = _create_notification_rows(
        db,
        admins=admins,
        org_id=organization.id,
        notification_type=OrgAdminNotificationType.LOW_CARDS,
        title=title,
        body=body,
        href=href,
    )

    html_body = _build_email_html(
        heading="Scorta tessere sotto soglia",
        title=title,
        body=body,
        cta_url=cta_url,
        cta_label="Apri tessere",
        organization_name=organization.name,
    )
    text_body = f"{title}\n\n{body}\n\nApri la dashboard: {cta_url}"

    emails_queued = 0
    alert_marker = now.isoformat()
    for admin, email in recipient_emails:
        enqueue_email(
            db,
            email_type=OrgAdminNotificationType.LOW_CARDS.value,
            to_email=email,
            subject=f"Tessere in esaurimento per {organization.name}",
            payload=build_email_payload(
                text_body=text_body,
                html_body=html_body,
                meta={
                    "admin_id": admin.id,
                    "org_id": organization.id,
                    "remaining": remaining,
                    "href": href,
                },
            ),
            priority=2,
            dedupe_key=f"low_cards:{organization.id}:{admin.id}:{alert_marker}",
        )
        emails_queued += 1

    logger.info(
        "org_admin_low_cards_alerts_queued org_id=%s remaining=%s admin_ids=%s recipient_emails=%s notifications=%s emails=%s",
        organization.id,
        remaining,
        [admin.id for admin in admins],
        [email for _, email in recipient_emails],
        notifications_created,
        emails_queued,
    )

    return {
        "notifications_created": notifications_created,
        "emails_queued": emails_queued,
    }

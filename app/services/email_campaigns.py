from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import html
import re
from typing import Iterable

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import EmailCampaign, EmailCampaignRecipient, Member, Organization
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.email_sender import build_sender_payload
from app.services.email_templates import render_template_content
from app.services.member_activity import get_member_lifecycle_status, is_member_active


AUDIENCE_ALL_ACTIVE = "active_members"
AUDIENCE_EXPIRED = "expired_members"
AUDIENCE_RENEWAL_DUE = "renewal_due_members"
ALLOWED_AUDIENCE_TYPES = {
    AUDIENCE_ALL_ACTIVE,
    AUDIENCE_EXPIRED,
    AUDIENCE_RENEWAL_DUE,
}

CAMPAIGN_STATUS_DRAFT = "draft"
CAMPAIGN_STATUS_SENDING = "sending"
CAMPAIGN_STATUS_SENT = "sent"
CAMPAIGN_STATUS_FAILED = "failed"
CAMPAIGN_STATUS_PARTIAL_FAILED = "partial_failed"

RECIPIENT_STATUS_QUEUED = "queued"
RECIPIENT_STATUS_SENT = "sent"
RECIPIENT_STATUS_FAILED = "failed"


@dataclass(frozen=True)
class AudienceRecipient:
    member: Member | None
    recipient_email: str
    recipient_name: str | None


def _normalize_text(value: str | None) -> str | None:
    cleaned = str(value or "").strip()
    return cleaned or None


def _normalize_email(value: str | None) -> str | None:
    cleaned = _normalize_text(value)
    return cleaned.lower() if cleaned else None


def _build_recipient_name(member: Member) -> str | None:
    full_name = f"{(member.first_name or '').strip()} {(member.last_name or '').strip()}".strip()
    return full_name or None


def _plain_text_to_html(value: str) -> str:
    blocks = [block.strip() for block in value.replace("\r\n", "\n").split("\n\n")]
    paragraphs = [block for block in blocks if block]
    if not paragraphs:
        return ""
    return "".join(
        f"<p>{html.escape(paragraph).replace(chr(10), '<br />')}</p>"
        for paragraph in paragraphs
    )


def _html_to_plain_text(value: str) -> str:
    normalized = re.sub(r"<\s*br\s*/?\s*>", "\n", value, flags=re.IGNORECASE)
    normalized = re.sub(r"</\s*p\s*>", "\n\n", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"<[^>]+>", "", normalized)
    normalized = html.unescape(normalized)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def normalize_campaign_bodies(
    *,
    body_html: str | None,
    body_text: str | None,
) -> tuple[str | None, str | None]:
    normalized_html = _normalize_text(body_html)
    normalized_text = _normalize_text(body_text)
    if normalized_html is None and normalized_text is None:
        raise HTTPException(
            status_code=422,
            detail="Inserisci il contenuto della campagna in HTML o testo semplice.",
        )
    if normalized_html is None and normalized_text is not None:
        normalized_html = _plain_text_to_html(normalized_text)
    if normalized_text is None and normalized_html is not None:
        normalized_text = _html_to_plain_text(normalized_html)
    return normalized_html, normalized_text


def _member_matches_audience(
    member: Member,
    *,
    audience_type: str,
    now: datetime,
) -> bool:
    if audience_type == AUDIENCE_ALL_ACTIVE:
        return is_member_active(member, now=now)
    if audience_type == AUDIENCE_EXPIRED:
        return get_member_lifecycle_status(member, now=now) == "EXPIRED"
    if audience_type == AUDIENCE_RENEWAL_DUE:
        return is_member_active(member, now=now) and int(member.card_year or 0) == now.year
    return False


def resolve_audience_recipients(
    db: Session,
    *,
    association_id: int,
    audience_type: str,
    now: datetime | None = None,
) -> list[AudienceRecipient]:
    normalized_audience = _normalize_text(audience_type)
    if normalized_audience not in ALLOWED_AUDIENCE_TYPES:
        raise HTTPException(status_code=422, detail="Audience non valida.")

    current_time = now or datetime.utcnow()
    members = (
        db.query(Member)
        .filter(
            Member.org_id == association_id,
            Member.deleted_at.is_(None),
            Member.email.isnot(None),
        )
        .order_by(Member.id.desc())
        .all()
    )

    recipients: list[AudienceRecipient] = []
    seen_emails: set[str] = set()
    for member in members:
        email = _normalize_email(member.email)
        if not email or email in seen_emails:
            continue
        if not _member_matches_audience(member, audience_type=normalized_audience, now=current_time):
            continue
        seen_emails.add(email)
        recipients.append(
            AudienceRecipient(
                member=member,
                recipient_email=email,
                recipient_name=_build_recipient_name(member),
            )
        )
    return recipients


def ensure_campaign_is_sendable(organization: Organization) -> None:
    if not bool(getattr(organization, "communications_enabled", False)):
        raise HTTPException(
            status_code=409,
            detail="Le comunicazioni associazione non sono abilitate. Completa prima la configurazione email.",
        )


def create_campaign_draft(
    db: Session,
    *,
    organization: Organization,
    created_by_user_id: int | None,
    name: str | None,
    subject: str,
    body_html: str | None,
    body_text: str | None,
    audience_type: str,
) -> EmailCampaign:
    normalized_subject = _normalize_text(subject)
    if normalized_subject is None:
        raise HTTPException(status_code=422, detail="Oggetto campagna obbligatorio.")

    normalized_audience = _normalize_text(audience_type)
    if normalized_audience not in ALLOWED_AUDIENCE_TYPES:
        raise HTTPException(status_code=422, detail="Audience non valida.")

    normalized_body_html, normalized_body_text = normalize_campaign_bodies(
        body_html=body_html,
        body_text=body_text,
    )
    campaign = EmailCampaign(
        association_id=organization.id,
        name=_normalize_text(name),
        subject=normalized_subject,
        body_html=normalized_body_html,
        body_text=normalized_body_text,
        audience_type=normalized_audience,
        status=CAMPAIGN_STATUS_DRAFT,
        created_by_user_id=created_by_user_id,
    )
    db.add(campaign)
    db.flush()
    return campaign


def enqueue_test_email(
    db: Session,
    *,
    organization: Organization,
    to_email: str,
    requested_by_user_id: int | None,
) -> str:
    normalized_email = _normalize_email(to_email)
    if normalized_email is None:
        raise HTTPException(status_code=422, detail="Email destinatario non valida.")

    return enqueue_email(
        db,
        email_type="association_test_email",
        to_email=normalized_email,
        subject=f"Test comunicazioni {organization.name}",
        payload=build_email_payload(
            text_body=(
                f"Questa e una email di test per le comunicazioni dell'associazione {organization.name}.\n"
                "Se la ricevi, il sender association mode e configurato correttamente."
            ),
            html_body=(
                f"<p>Questa e una email di test per le comunicazioni dell'associazione <strong>{html.escape(organization.name or 'ASSONAM')}</strong>.</p>"
                "<p>Se la ricevi, il sender association mode e configurato correttamente.</p>"
            ),
            sender=build_sender_payload(mode="association", association=organization),
            meta={
                "org_id": organization.id,
                "requested_by_user_id": requested_by_user_id,
            },
        ),
        priority=2,
    )


def send_campaign(
    db: Session,
    *,
    campaign: EmailCampaign,
    organization: Organization,
) -> tuple[EmailCampaign, int]:
    ensure_campaign_is_sendable(organization)
    if campaign.association_id != organization.id:
        raise HTTPException(status_code=404, detail="Campagna non trovata.")
    if (campaign.status or "").strip().lower() != CAMPAIGN_STATUS_DRAFT:
        raise HTTPException(
            status_code=409,
            detail="Solo le campagne in bozza possono essere inviate.",
        )

    recipients = resolve_audience_recipients(
        db,
        association_id=organization.id,
        audience_type=campaign.audience_type,
    )
    if not recipients:
        raise HTTPException(
            status_code=400,
            detail="Nessun destinatario disponibile per l'audience selezionata.",
        )

    now = datetime.utcnow()
    campaign.status = CAMPAIGN_STATUS_SENDING
    campaign.sent_at = now
    db.flush()

    for recipient in recipients:
        recipient_row = EmailCampaignRecipient(
            campaign_id=campaign.id,
            association_id=organization.id,
            user_id=recipient.member.id if recipient.member is not None else None,
            recipient_email=recipient.recipient_email,
            recipient_name=recipient.recipient_name,
            delivery_status=RECIPIENT_STATUS_QUEUED,
        )
        db.add(recipient_row)
        db.flush()
        rendered_content = render_template_content(
            subject=campaign.subject,
            body_html=campaign.body_html,
            body_text=campaign.body_text,
            association=organization,
            member=recipient.member,
        )
        enqueue_email(
            db,
            email_type="association_campaign",
            to_email=recipient.recipient_email,
            subject=rendered_content.subject,
            payload=build_email_payload(
                text_body=rendered_content.body_text or "",
                html_body=rendered_content.body_html,
                sender=build_sender_payload(mode="association", association=organization),
                meta={
                    "campaign_id": campaign.id,
                    "campaign_recipient_id": recipient_row.id,
                    "org_id": organization.id,
                },
            ),
            priority=4,
            dedupe_key=f"campaign:{campaign.id}:{recipient.recipient_email}",
        )

    db.flush()
    return campaign, len(recipients)


def refresh_campaign_status(db: Session, campaign_id: int) -> str | None:
    campaign = db.query(EmailCampaign).filter(EmailCampaign.id == campaign_id).first()
    if campaign is None:
        return None

    recipients = (
        db.query(EmailCampaignRecipient)
        .filter(EmailCampaignRecipient.campaign_id == campaign_id)
        .all()
    )
    if not recipients:
        campaign.status = CAMPAIGN_STATUS_DRAFT
        db.flush()
        return campaign.status

    statuses = {(recipient.delivery_status or "").strip().lower() for recipient in recipients}
    statuses.discard("")
    if statuses == {RECIPIENT_STATUS_SENT}:
        campaign.status = CAMPAIGN_STATUS_SENT
    elif statuses and statuses.issubset({RECIPIENT_STATUS_FAILED}):
        campaign.status = CAMPAIGN_STATUS_FAILED
    elif RECIPIENT_STATUS_FAILED in statuses and RECIPIENT_STATUS_SENT in statuses:
        campaign.status = CAMPAIGN_STATUS_PARTIAL_FAILED
    else:
        campaign.status = CAMPAIGN_STATUS_SENDING
    db.flush()
    return campaign.status


def mark_campaign_recipient_sent(
    db: Session,
    *,
    recipient_id: int,
    provider_message_id: str | None,
    sent_at: datetime,
) -> None:
    recipient = (
        db.query(EmailCampaignRecipient)
        .filter(EmailCampaignRecipient.id == recipient_id)
        .first()
    )
    if recipient is None:
        return
    recipient.delivery_status = RECIPIENT_STATUS_SENT
    recipient.provider_message_id = provider_message_id
    recipient.error_message = None
    recipient.sent_at = sent_at
    db.flush()
    refresh_campaign_status(db, recipient.campaign_id)


def mark_campaign_recipient_failed(
    db: Session,
    *,
    recipient_id: int,
    error_message: str,
) -> None:
    recipient = (
        db.query(EmailCampaignRecipient)
        .filter(EmailCampaignRecipient.id == recipient_id)
        .first()
    )
    if recipient is None:
        return
    recipient.delivery_status = RECIPIENT_STATUS_FAILED
    recipient.error_message = _normalize_text(error_message) or "smtp_delivery_failed"
    db.flush()
    refresh_campaign_status(db, recipient.campaign_id)


def campaign_status_counts(recipients: Iterable[EmailCampaignRecipient]) -> dict[str, int]:
    counts = {
        RECIPIENT_STATUS_QUEUED: 0,
        RECIPIENT_STATUS_SENT: 0,
        RECIPIENT_STATUS_FAILED: 0,
    }
    for recipient in recipients:
        normalized = (recipient.delivery_status or "").strip().lower()
        if normalized in counts:
            counts[normalized] += 1
    return counts

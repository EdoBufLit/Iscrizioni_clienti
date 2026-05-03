from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import html
import json
import re
from typing import Any, Iterable

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import EmailCampaign, EmailCampaignRecipient, Form, Member, Organization
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.email_sender import build_sender_payload
from app.services.email_templates import (
    build_linked_form_url,
    decorate_rendered_email,
    normalize_email_design,
    render_template_content,
)
from app.services.member_activity import get_member_lifecycle_status, is_member_active
from app.utils import send_email_via_transport_low_level


AUDIENCE_ALL_ACTIVE = "active_members"
AUDIENCE_EXPIRED = "expired_members"
AUDIENCE_RENEWAL_DUE = "renewal_due_members"
ALLOWED_AUDIENCE_TYPES = {
    AUDIENCE_ALL_ACTIVE,
    AUDIENCE_EXPIRED,
    AUDIENCE_RENEWAL_DUE,
}
RECIPIENT_MODE_ALL_MEMBERS = "all_members"
RECIPIENT_MODE_SELECTED_MEMBERS = "selected_members"
ALLOWED_RECIPIENT_MODES = {
    RECIPIENT_MODE_ALL_MEMBERS,
    RECIPIENT_MODE_SELECTED_MEMBERS,
}

CAMPAIGN_STATUS_DRAFT = "draft"
CAMPAIGN_STATUS_SCHEDULED = "scheduled"
CAMPAIGN_STATUS_SENDING = "sending"
CAMPAIGN_STATUS_SENT = "sent"
CAMPAIGN_STATUS_FAILED = "failed"
CAMPAIGN_STATUS_PARTIAL_FAILED = "partial_failed"

RECIPIENT_STATUS_QUEUED = "queued"
RECIPIENT_STATUS_PROCESSING = "processing"
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


def normalize_recipient_mode(value: str | None) -> str:
    normalized = _normalize_text(value)
    if normalized not in ALLOWED_RECIPIENT_MODES:
        raise HTTPException(status_code=422, detail="Modalità destinatari non valida.")
    return normalized


def normalize_selected_member_ids(
    member_ids: Iterable[int] | None,
    *,
    recipient_mode: str,
) -> list[int]:
    normalized_ids: list[int] = []
    seen_ids: set[int] = set()
    for raw_id in member_ids or []:
        try:
            member_id = int(raw_id)
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="Lista destinatari non valida.")
        if member_id <= 0 or member_id in seen_ids:
            continue
        seen_ids.add(member_id)
        normalized_ids.append(member_id)

    if recipient_mode == RECIPIENT_MODE_SELECTED_MEMBERS and not normalized_ids:
        raise HTTPException(
            status_code=422,
            detail="Se scegli 'Soci selezionati' devi aggiungere almeno un socio.",
        )
    return normalized_ids


def normalize_scheduled_at(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone().replace(tzinfo=None)
    return value


def serialize_selected_member_ids(member_ids: Iterable[int]) -> str | None:
    normalized_ids = [int(member_id) for member_id in member_ids if int(member_id) > 0]
    if not normalized_ids:
        return None
    return json.dumps(normalized_ids)


def deserialize_selected_member_ids(value: str | None) -> list[int]:
    normalized = _normalize_text(value)
    if normalized is None:
        return []
    try:
        parsed = json.loads(normalized)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    result: list[int] = []
    seen_ids: set[int] = set()
    for raw_id in parsed:
        try:
            member_id = int(raw_id)
        except (TypeError, ValueError):
            continue
        if member_id <= 0 or member_id in seen_ids:
            continue
        seen_ids.add(member_id)
        result.append(member_id)
    return result


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


def resolve_selected_member_recipients(
    db: Session,
    *,
    association_id: int,
    member_ids: Iterable[int],
) -> list[AudienceRecipient]:
    normalized_member_ids = normalize_selected_member_ids(
        member_ids,
        recipient_mode=RECIPIENT_MODE_SELECTED_MEMBERS,
    )
    members = (
        db.query(Member)
        .filter(
            Member.org_id == association_id,
            Member.deleted_at.is_(None),
            Member.id.in_(normalized_member_ids),
        )
        .order_by(Member.id.desc())
        .all()
    )
    members_by_id = {member.id: member for member in members}
    missing_ids = [member_id for member_id in normalized_member_ids if member_id not in members_by_id]
    if missing_ids:
        raise HTTPException(
            status_code=422,
            detail="Uno o più destinatari selezionati non appartengono alla tua associazione.",
        )

    recipients: list[AudienceRecipient] = []
    seen_emails: set[str] = set()
    for member_id in normalized_member_ids:
        member = members_by_id[member_id]
        email = _normalize_email(member.email)
        if email is None:
            raise HTTPException(
                status_code=422,
                detail=f"Il socio selezionato #{member.id} non ha un indirizzo email valido.",
            )
        if email in seen_emails:
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


def resolve_campaign_recipients(
    db: Session,
    *,
    campaign: EmailCampaign,
    association_id: int,
) -> list[AudienceRecipient]:
    recipient_mode = normalize_recipient_mode(getattr(campaign, "recipient_mode", None) or RECIPIENT_MODE_ALL_MEMBERS)
    if recipient_mode == RECIPIENT_MODE_SELECTED_MEMBERS:
        return resolve_selected_member_recipients(
            db,
            association_id=association_id,
            member_ids=deserialize_selected_member_ids(campaign.selected_member_ids_json),
        )
    return resolve_audience_recipients(
        db,
        association_id=association_id,
        audience_type=campaign.audience_type,
    )


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
    recipient_mode: str,
    selected_member_ids: Iterable[int] | None = None,
    scheduled_at: datetime | None = None,
    design: dict[str, Any] | None = None,
    linked_form: Form | None = None,
    source_template_id: int | None = None,
    editor_status: str | None = None,
    grapesjs_project_json: dict[str, Any] | None = None,
    mjml_source: str | None = None,
    compiled_html: str | None = None,
) -> EmailCampaign:
    normalized_subject = _normalize_text(subject)
    if normalized_subject is None:
        raise HTTPException(status_code=422, detail="Oggetto campagna obbligatorio.")

    normalized_audience = _normalize_text(audience_type)
    if normalized_audience not in ALLOWED_AUDIENCE_TYPES:
        raise HTTPException(status_code=422, detail="Audience non valida.")
    normalized_recipient_mode = normalize_recipient_mode(recipient_mode)
    normalized_selected_member_ids = normalize_selected_member_ids(
        selected_member_ids,
        recipient_mode=normalized_recipient_mode,
    )
    if normalized_recipient_mode == RECIPIENT_MODE_SELECTED_MEMBERS:
        resolve_selected_member_recipients(
            db,
            association_id=organization.id,
            member_ids=normalized_selected_member_ids,
        )

    normalized_body_html, normalized_body_text = normalize_campaign_bodies(
        body_html=compiled_html or body_html,
        body_text=body_text,
    )
    normalized_scheduled_at = normalize_scheduled_at(scheduled_at)
    now = datetime.utcnow()
    campaign = EmailCampaign(
        association_id=organization.id,
        name=_normalize_text(name),
        source_template_id=source_template_id,
        subject=normalized_subject,
        body_html=compiled_html or normalized_body_html,
        body_text=normalized_body_text,
        editor_status=_normalize_text(editor_status) or (
            "ready" if compiled_html or mjml_source or grapesjs_project_json else "draft"
        ),
        design_json=normalize_email_design(design),
        grapesjs_project_json=grapesjs_project_json,
        mjml_source=_normalize_text(mjml_source),
        compiled_html=compiled_html or normalized_body_html,
        linked_form_id=linked_form.id if linked_form is not None else None,
        audience_type=normalized_audience,
        recipient_mode=normalized_recipient_mode,
        selected_member_ids_json=serialize_selected_member_ids(normalized_selected_member_ids),
        status=(
            CAMPAIGN_STATUS_SCHEDULED
            if normalized_scheduled_at is not None and normalized_scheduled_at > now
            else CAMPAIGN_STATUS_DRAFT
        ),
        created_by_user_id=created_by_user_id,
        scheduled_at=normalized_scheduled_at,
    )
    db.add(campaign)
    db.flush()
    return campaign


def update_campaign_draft(
    db: Session,
    *,
    campaign: EmailCampaign,
    organization: Organization,
    name: str | None,
    subject: str,
    body_html: str | None,
    body_text: str | None,
    audience_type: str,
    recipient_mode: str,
    selected_member_ids: Iterable[int] | None = None,
    scheduled_at: datetime | None = None,
    design: dict[str, Any] | None = None,
    linked_form: Form | None = None,
    source_template_id: int | None = None,
    editor_status: str | None = None,
    grapesjs_project_json: dict[str, Any] | None = None,
    mjml_source: str | None = None,
    compiled_html: str | None = None,
) -> EmailCampaign:
    if campaign.association_id != organization.id:
        raise HTTPException(status_code=404, detail="Campagna non trovata.")

    current_status = (campaign.status or "").strip().lower()
    if current_status not in {CAMPAIGN_STATUS_DRAFT, CAMPAIGN_STATUS_SCHEDULED}:
        raise HTTPException(
            status_code=409,
            detail="Solo le campagne in bozza o programmate possono essere modificate.",
        )

    normalized_subject = _normalize_text(subject)
    if normalized_subject is None:
        raise HTTPException(status_code=422, detail="Oggetto campagna obbligatorio.")

    normalized_audience = _normalize_text(audience_type)
    if normalized_audience not in ALLOWED_AUDIENCE_TYPES:
        raise HTTPException(status_code=422, detail="Audience non valida.")

    normalized_recipient_mode = normalize_recipient_mode(recipient_mode)
    normalized_selected_member_ids = normalize_selected_member_ids(
        selected_member_ids,
        recipient_mode=normalized_recipient_mode,
    )
    if normalized_recipient_mode == RECIPIENT_MODE_SELECTED_MEMBERS:
        resolve_selected_member_recipients(
            db,
            association_id=organization.id,
            member_ids=normalized_selected_member_ids,
        )

    normalized_body_html, normalized_body_text = normalize_campaign_bodies(
        body_html=compiled_html or body_html,
        body_text=body_text,
    )
    normalized_scheduled_at = normalize_scheduled_at(scheduled_at)
    now = datetime.utcnow()

    campaign.name = _normalize_text(name)
    campaign.source_template_id = source_template_id
    campaign.subject = normalized_subject
    campaign.body_html = compiled_html or normalized_body_html
    campaign.body_text = normalized_body_text
    campaign.editor_status = _normalize_text(editor_status) or (
        "ready" if compiled_html or mjml_source or grapesjs_project_json else "draft"
    )
    campaign.design_json = normalize_email_design(design)
    campaign.grapesjs_project_json = grapesjs_project_json
    campaign.mjml_source = _normalize_text(mjml_source)
    campaign.compiled_html = compiled_html or normalized_body_html
    campaign.linked_form_id = linked_form.id if linked_form is not None else None
    campaign.audience_type = normalized_audience
    campaign.recipient_mode = normalized_recipient_mode
    campaign.selected_member_ids_json = serialize_selected_member_ids(normalized_selected_member_ids)
    campaign.status = (
        CAMPAIGN_STATUS_SCHEDULED
        if normalized_scheduled_at is not None and normalized_scheduled_at > now
        else CAMPAIGN_STATUS_DRAFT
    )
    campaign.scheduled_at = normalized_scheduled_at
    db.flush()
    return campaign


def send_test_email_now(
    *,
    organization: Organization,
    to_email: str,
    requested_by_user_id: int | None = None,
) -> str:
    normalized_email = _normalize_email(to_email)
    if normalized_email is None:
        raise HTTPException(status_code=422, detail="Email destinatario non valida.")

    return send_email_via_transport_low_level(
        to_email=normalized_email,
        subject=f"Test comunicazioni {organization.name}",
        text_body=(
            f"Questa e una email di test per le comunicazioni dell'associazione {organization.name}.\n"
            "Se la ricevi, il sender association mode e configurato correttamente."
        ),
        html_body=(
            f"<p>Questa e una email di test per le comunicazioni dell'associazione <strong>{html.escape(organization.name or 'ASSONAM')}</strong>.</p>"
            "<p>Se la ricevi, il sender association mode e configurato correttamente.</p>"
        ),
        mode="association",
        association=organization,
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
    if (campaign.status or "").strip().lower() not in {
        CAMPAIGN_STATUS_DRAFT,
        CAMPAIGN_STATUS_SCHEDULED,
    }:
        raise HTTPException(
            status_code=409,
            detail="Solo le campagne in bozza o programmate possono essere inviate.",
        )

    recipients = resolve_campaign_recipients(
        db,
        campaign=campaign,
        association_id=organization.id,
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
            extra_context={
                "titolo_form": campaign.linked_form.title if campaign.linked_form is not None else "",
                "link_form_collegato": build_linked_form_url(
                    association=organization,
                    linked_form=campaign.linked_form,
                ) or "",
            },
        )
        rendered_content = decorate_rendered_email(
            rendered_content,
            association=organization,
            design=getattr(campaign, "design_json", None),
            linked_form=getattr(campaign, "linked_form", None),
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


def mark_campaign_recipient_processing(
    db: Session,
    *,
    recipient_id: int,
) -> None:
    recipient = (
        db.query(EmailCampaignRecipient)
        .filter(EmailCampaignRecipient.id == recipient_id)
        .first()
    )
    if recipient is None:
        return
    recipient.delivery_status = RECIPIENT_STATUS_PROCESSING
    recipient.error_message = None
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
        RECIPIENT_STATUS_PROCESSING: 0,
        RECIPIENT_STATUS_SENT: 0,
        RECIPIENT_STATUS_FAILED: 0,
    }
    for recipient in recipients:
        normalized = (recipient.delivery_status or "").strip().lower()
        if normalized in counts:
            counts[normalized] += 1
    return counts


def process_scheduled_campaigns(
    db: Session,
    *,
    now: datetime | None = None,
) -> dict[str, int]:
    current_time = now or datetime.utcnow()
    due_campaigns = (
        db.query(EmailCampaign)
        .filter(
            EmailCampaign.status == CAMPAIGN_STATUS_SCHEDULED,
            EmailCampaign.scheduled_at.isnot(None),
            EmailCampaign.scheduled_at <= current_time,
        )
        .order_by(EmailCampaign.scheduled_at.asc(), EmailCampaign.id.asc())
        .all()
    )
    stats = {"processed": 0, "queued_recipients": 0, "failed": 0}
    for due_campaign in due_campaigns:
        organization = (
            db.query(Organization)
            .filter(Organization.id == due_campaign.association_id)
            .first()
        )
        if organization is None:
            due_campaign.status = CAMPAIGN_STATUS_FAILED
            db.commit()
            stats["failed"] += 1
            continue
        try:
            _campaign, queued = send_campaign(
                db,
                campaign=due_campaign,
                organization=organization,
            )
            db.commit()
            stats["processed"] += 1
            stats["queued_recipients"] += queued
        except HTTPException:
            db.rollback()
            failed_campaign = (
                db.query(EmailCampaign).filter(EmailCampaign.id == due_campaign.id).first()
            )
            if failed_campaign is not None:
                failed_campaign.status = CAMPAIGN_STATUS_FAILED
                db.commit()
            stats["failed"] += 1
    return stats


def process_scheduled_campaigns_once(*, now: datetime | None = None) -> dict[str, int]:
    db = SessionLocal()
    try:
        return process_scheduled_campaigns(db, now=now)
    finally:
        db.close()

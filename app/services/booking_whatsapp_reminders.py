from __future__ import annotations

import logging
import html
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.models import Booking, BookingEvent, BookingStatus, Form, Organization, WhatsAppConnection
from app.services.booking_formatting import format_booking_date_it
from app.services.booking_customer_actions import create_booking_action_links
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.email_sender import build_sender_payload
from app.services.email_templates import build_template_context, render_template_string
from app.services.whatsapp_automation import _send_whatsapp_text
from app.services.whatsapp_evolution import normalize_phone
from app.services.whatsapp_provider import whatsapp_feature_enabled

logger = logging.getLogger(__name__)

BOOKING_REMINDER_EVENT = "whatsapp_booking_reminder_sent"
SURVEY_DISPATCH_EVENT = "whatsapp_post_event_survey_sent"
SURVEY_EMAIL_DISPATCH_EVENT = "email_post_event_survey_sent"

DEFAULT_BOOKING_REMINDER_TEMPLATE = (
    "Ciao {{nome_contatto}}, ti ricordiamo la prenotazione per {{nome_associazione}} "
    "{{data_prenotazione}} alle {{orario_prenotazione}}. Dettagli: {{riepilogo_prenotazione}}.\n\n"
    "✅ CONFERMA\n{{link_conferma_prenotazione}}\n\n"
    "❌ ANNULLA\n{{link_annulla_prenotazione}}\n\n"
    "✍️ MODIFICA / NOTE\n{{link_note_prenotazione}}\n\n"
    "Puoi anche rispondere SI o NO a questo messaggio."
)
DEFAULT_SURVEY_TEMPLATE = (
    "Ciao {{nome_contatto}}, grazie per aver partecipato all'evento di {{nome_associazione}}. "
    "Ci aiuti con un breve sondaggio? {{link_sondaggio}}"
)


def process_booking_whatsapp_reminders(
    db: Session,
    *,
    now: datetime | None = None,
    limit: int = 100,
) -> dict[str, int]:
    current = _as_utc_datetime(now or datetime.now(timezone.utc))
    stats = {"checked": 0, "sent": 0, "skipped": 0, "failed": 0}
    if not whatsapp_feature_enabled():
        return stats

    bookings = (
        db.query(Booking)
        .options(
            joinedload(Booking.organization),
            joinedload(Booking.form).joinedload(Form.organization),
            joinedload(Booking.submission),
            joinedload(Booking.events),
        )
        .join(Organization, Organization.id == Booking.association_id)
        .filter(
            Booking.status == BookingStatus.CONFIRMED.value,
            Booking.booking_date.isnot(None),
            Organization.communications_enabled.is_(True),
            Organization.booking_whatsapp_reminder_enabled.is_(True),
        )
        .order_by(Booking.booking_date.asc(), Booking.booking_time.asc().nulls_last(), Booking.id.asc())
        .limit(limit)
        .all()
    )
    connection_cache: dict[int, WhatsAppConnection | None] = {}
    for booking in bookings:
        stats["checked"] += 1
        if _has_booking_event(booking, BOOKING_REMINDER_EVENT):
            stats["skipped"] += 1
            continue
        event_at = _booking_datetime(booking)
        if event_at is None:
            stats["skipped"] += 1
            continue
        hours_before = int(getattr(booking.organization, "booking_whatsapp_reminder_hours_before", 24) or 24)
        send_at = event_at - timedelta(hours=max(1, hours_before))
        if current < send_at or current >= event_at:
            stats["skipped"] += 1
            continue
        phone_number = normalize_phone(getattr(booking, "customer_phone", None))
        if not phone_number:
            stats["skipped"] += 1
            continue
        connection = _connection_for_org(db, connection_cache, org_id=booking.association_id)
        if connection is None:
            stats["skipped"] += 1
            continue
        template = (
            getattr(booking.organization, "booking_whatsapp_reminder_template", None)
            or DEFAULT_BOOKING_REMINDER_TEMPLATE
        )
        action_links = create_booking_action_links(db, booking=booking)
        text = _render_booking_template(
            template,
            booking=booking,
            extra_context={
                "link_conferma_prenotazione": action_links.get("confirm", ""),
                "link_annulla_prenotazione": action_links.get("cancel", ""),
                "link_note_prenotazione": action_links.get("note", ""),
            },
        ).strip()
        result = _send_whatsapp_text(
            db,
            connection=connection,
            phone_number=phone_number,
            text=text,
            display_name=booking.customer_name,
        )
        if result.get("sent"):
            _record_booking_event(
                db,
                booking=booking,
                event_type=BOOKING_REMINDER_EVENT,
                payload={
                    "hours_before": hours_before,
                    "event_at": event_at.isoformat(),
                    "message_id": result.get("message_id"),
                },
            )
            stats["sent"] += 1
            db.commit()
        else:
            stats["failed"] += 1
            db.rollback()
            logger.warning(
                "booking_whatsapp_reminder_failed booking_id=%s org_id=%s reason=%s",
                booking.id,
                booking.association_id,
                result.get("reason"),
            )
    return stats


def process_post_event_survey_whatsapp(
    db: Session,
    *,
    now: datetime | None = None,
    limit: int = 100,
) -> dict[str, int]:
    stats = {"checked": 0, "sent": 0, "skipped": 0, "failed": 0}
    # Post-event surveys are intentionally email-only. Keep this function as a
    # no-op for compatibility with older imports/tests.
    return stats


def process_post_event_survey_email(
    db: Session,
    *,
    now: datetime | None = None,
    limit: int = 100,
) -> dict[str, int]:
    current = _as_utc_datetime(now or datetime.now(timezone.utc))
    stats = {"checked": 0, "sent": 0, "skipped": 0, "failed": 0}

    survey_forms = (
        db.query(Form)
        .options(joinedload(Form.organization), joinedload(Form.fields))
        .join(Organization, Organization.id == Form.association_id)
        .filter(
            Form.form_type == "survey",
            Form.is_active.is_(True),
            Form.survey_post_event_enabled.is_(True),
            Organization.communications_enabled.is_(True),
        )
        .order_by(Form.updated_at.desc(), Form.id.desc())
        .all()
    )
    if not survey_forms:
        return stats

    for survey_form in survey_forms:
        delay = int(getattr(survey_form, "survey_post_event_delay_hours", 2) or 2)
        bookings = (
            db.query(Booking)
            .options(joinedload(Booking.organization), joinedload(Booking.events), joinedload(Booking.form))
            .filter(
                Booking.association_id == survey_form.association_id,
                Booking.status.in_([BookingStatus.SEATED.value, BookingStatus.COMPLETED.value]),
                Booking.booking_date.isnot(None),
            )
            .order_by(Booking.booking_date.asc(), Booking.booking_time.asc().nulls_last(), Booking.id.asc())
            .limit(limit)
            .all()
        )
        for booking in bookings:
            stats["checked"] += 1
            if _has_booking_event(booking, SURVEY_EMAIL_DISPATCH_EVENT, survey_form_id=survey_form.id):
                stats["skipped"] += 1
                continue
            event_at = _booking_datetime(booking)
            if event_at is None or current < event_at + timedelta(hours=max(0, delay)):
                stats["skipped"] += 1
                continue
            if not booking.customer_email:
                stats["skipped"] += 1
                continue
            survey_link = _survey_public_url(survey_form)
            template = getattr(survey_form, "survey_post_event_message_template", None) or DEFAULT_SURVEY_TEMPLATE
            text = _render_booking_template(
                template,
                booking=booking,
                extra_context={
                    "titolo_sondaggio": survey_form.title,
                    "link_sondaggio": survey_link,
                },
            ).strip()
            html_body = f"<p>{html.escape(text).replace(chr(10), '<br>')}</p><p><a href='{html.escape(survey_link)}'>Apri sondaggio</a></p>"
            try:
                enqueue_email(
                    db,
                    email_type="post_event_survey",
                    to_email=booking.customer_email,
                    subject=f"Sondaggio: {survey_form.title}",
                    payload=build_email_payload(
                        text_body=text,
                        html_body=html_body,
                        sender=build_sender_payload(mode="association", association=booking.organization),
                        meta={
                            "booking_id": booking.id,
                            "survey_form_id": survey_form.id,
                            "association_id": booking.association_id,
                        },
                    ),
                    priority=5,
                    dedupe_key=f"post_event_survey:{survey_form.id}:{booking.id}",
                )
            except Exception:
                stats["failed"] += 1
                db.rollback()
                logger.exception(
                    "post_event_survey_email_failed booking_id=%s survey_form_id=%s",
                    booking.id,
                    survey_form.id,
                )
                continue
            _record_booking_event(
                db,
                booking=booking,
                event_type=SURVEY_EMAIL_DISPATCH_EVENT,
                payload={
                    "survey_form_id": survey_form.id,
                    "survey_link": survey_link,
                    "delay_hours": delay,
                },
            )
            stats["sent"] += 1
            db.commit()
    return stats


def process_booking_communications_once(*, now: datetime | None = None) -> dict[str, dict[str, int]]:
    from app.db import SessionLocal

    with SessionLocal() as db:
        return {
            "booking_whatsapp_reminders": process_booking_whatsapp_reminders(db, now=now),
            "post_event_surveys": process_post_event_survey_email(db, now=now),
        }


def _booking_datetime(booking: Booking) -> datetime | None:
    booking_date = getattr(booking, "booking_date", None)
    if not isinstance(booking_date, date):
        return None
    raw_time = str(getattr(booking, "booking_time", "") or "").strip()
    parsed_time = time(9, 0)
    if raw_time:
        try:
            parsed_time = time.fromisoformat(raw_time[:5])
        except Exception:
            parsed_time = time(9, 0)
    local_event_at = datetime.combine(booking_date, parsed_time, tzinfo=_booking_timezone())
    return local_event_at.astimezone(timezone.utc)


def _as_utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _booking_timezone() -> ZoneInfo:
    try:
        return ZoneInfo((settings.APP_TIMEZONE or "Europe/Rome").strip() or "Europe/Rome")
    except ZoneInfoNotFoundError:
        logger.warning("booking_reminder_invalid_timezone value=%s fallback=Europe/Rome", settings.APP_TIMEZONE)
        return ZoneInfo("Europe/Rome")


def _connection_for_org(
    db: Session,
    cache: dict[int, WhatsAppConnection | None],
    *,
    org_id: int,
) -> WhatsAppConnection | None:
    if org_id not in cache:
        cache[org_id] = (
            db.query(WhatsAppConnection)
            .filter(WhatsAppConnection.org_id == org_id, WhatsAppConnection.status == "connected")
            .first()
        )
    return cache[org_id]


def _has_booking_event(
    booking: Booking,
    event_type: str,
    *,
    survey_form_id: int | None = None,
) -> bool:
    for event in list(getattr(booking, "events", []) or []):
        if getattr(event, "event_type", None) != event_type:
            continue
        if survey_form_id is None:
            return True
        payload = event.payload_json if isinstance(event.payload_json, dict) else {}
        if int(payload.get("survey_form_id") or 0) == int(survey_form_id):
            return True
    return False


def _record_booking_event(
    db: Session,
    *,
    booking: Booking,
    event_type: str,
    payload: dict[str, Any],
) -> None:
    db.add(
        BookingEvent(
            booking_id=booking.id,
            event_type=event_type,
            payload_json=payload,
        )
    )


def _render_booking_template(
    template: str,
    *,
    booking: Booking,
    extra_context: dict[str, str],
) -> str:
    org = booking.organization
    date_value = format_booking_date_it(booking.booking_date)
    time_value = booking.booking_time or ""
    party_size = str(booking.party_size or "")
    event_details = str(getattr(booking, "notes", "") or "").split("\n\nNote richiesta:", 1)[0].strip()
    summary = " - ".join(
        item
        for item in [date_value, time_value, f"{party_size} persone" if party_size else "", event_details]
        if item
    )
    context = build_template_context(
        association=org,
        member=None,
        extra_context={
            "nome_contatto": booking.customer_name or "",
            "nome_associazione": getattr(org, "club_display_name", None) or getattr(org, "name", "") or "",
            "titolo_form": getattr(getattr(booking, "form", None), "title", "") or "",
            "data_prenotazione": date_value,
            "orario_prenotazione": time_value,
            "numero_persone": party_size,
            "riepilogo_prenotazione": summary,
            **extra_context,
        },
    )
    return render_template_string(template, context=context) or ""


def _survey_public_url(form: Form) -> str:
    base = (settings.FRONTEND_URL or settings.BASE_URL or "").strip().rstrip("/")
    path = (
        f"/forms/{form.organization.slug}/{form.public_slug}"
        if form.organization is not None and getattr(form.organization, "slug", None)
        else f"/forms/{form.public_slug}"
    )
    return f"{base}{path}" if base else path

from __future__ import annotations

import html
from datetime import datetime, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.models import (
    AdminRole,
    AdminUser,
    Booking,
    BookingActionToken,
    BookingEvent,
    BookingStatus,
    OrgAdminNotification,
)
from app.services.bookings import update_booking_status
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.email_sender import build_sender_payload
from app.utils import generate_token, hash_token

BOOKING_ACTION_CONFIRM = "confirm"
BOOKING_ACTION_CANCEL = "cancel"
BOOKING_ACTION_NOTE = "note"
BOOKING_ACTIONS = {BOOKING_ACTION_CONFIRM, BOOKING_ACTION_CANCEL, BOOKING_ACTION_NOTE}
BOOKING_ACTION_TOKEN_DAYS = 7


def create_booking_action_links(db: Session, *, booking: Booking) -> dict[str, str]:
    base = (settings.FRONTEND_URL or settings.BASE_URL or "").strip().rstrip("/")
    if not base:
        base = ""
    result: dict[str, str] = {}
    expires_at = datetime.utcnow() + timedelta(days=BOOKING_ACTION_TOKEN_DAYS)
    for action in (BOOKING_ACTION_CONFIRM, BOOKING_ACTION_CANCEL, BOOKING_ACTION_NOTE):
        raw_token = generate_token()
        db.add(
            BookingActionToken(
                booking_id=booking.id,
                action=action,
                token_hash=hash_token(raw_token),
                expires_at=expires_at,
            )
        )
        result[action] = f"{base}/prenotazioni/risposta/{raw_token}"
    db.flush()
    return result


def get_booking_action_token(db: Session, *, raw_token: str) -> BookingActionToken:
    normalized = (raw_token or "").strip()
    if not normalized:
        raise HTTPException(status_code=404, detail="Link prenotazione non valido.")
    token = (
        db.query(BookingActionToken)
        .options(
            joinedload(BookingActionToken.booking).joinedload(Booking.organization),
            joinedload(BookingActionToken.booking).joinedload(Booking.form),
            joinedload(BookingActionToken.booking).joinedload(Booking.submission),
        )
        .filter(BookingActionToken.token_hash == hash_token(normalized))
        .first()
    )
    if token is None or token.action not in BOOKING_ACTIONS or token.booking is None:
        raise HTTPException(status_code=404, detail="Link prenotazione non valido.")
    return token


def consume_booking_action_token(
    db: Session,
    *,
    raw_token: str,
    note: str | None = None,
) -> dict[str, Any]:
    token = get_booking_action_token(db, raw_token=raw_token)
    if token.used_at is not None:
        return {"ok": False, "reason": "used", "booking": token.booking}
    if token.expires_at <= datetime.utcnow():
        return {"ok": False, "reason": "expired", "booking": token.booking}

    booking = token.booking
    action = token.action
    token.used_at = datetime.utcnow()
    if action == BOOKING_ACTION_CONFIRM:
        update_booking_status(
            db,
            booking=booking,
            next_status=BookingStatus.CONFIRMED.value,
            room_id=booking.room_id,
            table_id=booking.table_id,
            notes=booking.notes,
            notify_customer=False,
        )
        event_type = "customer_reconfirmed_from_reminder"
        _record_booking_event(db, booking=booking, event_type=event_type, payload={"source": "secure_link"})
        _notify_admins(
            db,
            booking=booking,
            notification_type="booking_customer_confirmed",
            title=f"Prenotazione confermata da {booking.customer_name}",
            body=_booking_admin_body(booking, prefix="Il cliente ha confermato la prenotazione."),
            email_subject=f"Prenotazione confermata da {booking.customer_name}",
        )
    elif action == BOOKING_ACTION_CANCEL:
        update_booking_status(
            db,
            booking=booking,
            next_status=BookingStatus.CANCELLED.value,
            room_id=booking.room_id,
            table_id=booking.table_id,
            notes=booking.notes,
            notify_customer=False,
        )
        event_type = "customer_cancelled_from_reminder"
        _record_booking_event(db, booking=booking, event_type=event_type, payload={"source": "secure_link"})
        _notify_admins(
            db,
            booking=booking,
            notification_type="booking_customer_cancelled",
            title=f"Prenotazione annullata da {booking.customer_name}",
            body=_booking_admin_body(booking, prefix="Il cliente ha annullato la prenotazione."),
            email_subject=f"Prenotazione annullata da {booking.customer_name}",
        )
    else:
        normalized_note = (note or "").strip()
        if not normalized_note:
            raise HTTPException(status_code=422, detail="Inserisci una nota per la prenotazione.")
        booking.customer_note = normalized_note[:4000]
        booking.customer_note_submitted_at = datetime.utcnow()
        booking.customer_note_reviewed_at = None
        _record_booking_event(
            db,
            booking=booking,
            event_type="customer_note_from_reminder",
            payload={"source": "secure_link", "note": booking.customer_note},
        )
        _notify_admins(
            db,
            booking=booking,
            notification_type="booking_customer_note",
            title=f"Nota su prenotazione da {booking.customer_name}",
            body=_booking_admin_body(booking, prefix=f"Il cliente ha inviato una nota: {booking.customer_note}"),
            email_subject=f"Nota su prenotazione da {booking.customer_name}",
        )
    db.flush()
    return {"ok": True, "action": action, "booking": booking}


def apply_booking_text_reply(
    db: Session,
    *,
    booking: Booking,
    message_text: str,
) -> dict[str, Any]:
    normalized = _normalize_reply(message_text)
    if normalized not in {"confirm", "cancel"}:
        return {"matched": False}
    if normalized == "confirm":
        update_booking_status(
            db,
            booking=booking,
            next_status=BookingStatus.CONFIRMED.value,
            room_id=booking.room_id,
            table_id=booking.table_id,
            notes=booking.notes,
            notify_customer=False,
        )
        event_type = "customer_reconfirmed_from_reply"
        title = f"Prenotazione confermata da {booking.customer_name}"
        prefix = "Il cliente ha risposto SI al reminder WhatsApp."
    else:
        update_booking_status(
            db,
            booking=booking,
            next_status=BookingStatus.CANCELLED.value,
            room_id=booking.room_id,
            table_id=booking.table_id,
            notes=booking.notes,
            notify_customer=False,
        )
        event_type = "customer_cancelled_from_reply"
        title = f"Prenotazione annullata da {booking.customer_name}"
        prefix = "Il cliente ha risposto NO al reminder WhatsApp."
    _record_booking_event(db, booking=booking, event_type=event_type, payload={"source": "whatsapp_reply"})
    _notify_admins(
        db,
        booking=booking,
        notification_type=event_type,
        title=title,
        body=_booking_admin_body(booking, prefix=prefix),
        email_subject=title,
    )
    db.flush()
    return {"matched": True, "action": normalized}


def mark_booking_customer_note_reviewed(
    db: Session,
    *,
    booking: Booking,
    admin_id: int,
) -> Booking:
    booking.customer_note_reviewed_at = datetime.utcnow()
    _record_booking_event(
        db,
        booking=booking,
        event_type="customer_note_reviewed",
        payload={"admin_id": admin_id},
        created_by_user_id=admin_id,
    )
    db.flush()
    return booking


def render_booking_action_page(*, token: BookingActionToken, error: str | None = None) -> str:
    booking = token.booking
    action = token.action
    action_label = {
        BOOKING_ACTION_CONFIRM: "Conferma prenotazione",
        BOOKING_ACTION_CANCEL: "Annulla prenotazione",
        BOOKING_ACTION_NOTE: "Modifica o note",
    }.get(action, "Prenotazione")
    disabled = token.used_at is not None or token.expires_at <= datetime.utcnow()
    summary = _booking_summary_lines(booking)
    if action == BOOKING_ACTION_NOTE and not disabled:
        form = (
            "<form method='post' class='form'>"
            "<label for='note'>Nota per la segreteria</label>"
            "<textarea id='note' name='note' rows='5' maxlength='4000' required "
            "placeholder='Esempio: arriviamo 15 minuti dopo, siamo in 5 invece che 4...'></textarea>"
            "<button type='submit'>Invia nota</button>"
            "</form>"
        )
    elif disabled:
        form = "<p class='muted'>Questo link e' gia stato usato o e' scaduto.</p>"
    else:
        form = "<form method='post'><button type='submit'>Conferma azione</button></form>"
    error_html = f"<p class='error'>{html.escape(error)}</p>" if error else ""
    return _page_shell(
        title=action_label,
        body=(
            f"<h1>{html.escape(action_label)}</h1>"
            f"{error_html}"
            f"<div class='summary'>{summary}</div>"
            f"{form}"
        ),
    )


def render_booking_action_result(*, title: str, message: str) -> str:
    return _page_shell(
        title=title,
        body=f"<h1>{html.escape(title)}</h1><p>{html.escape(message)}</p>",
    )


def _record_booking_event(
    db: Session,
    *,
    booking: Booking,
    event_type: str,
    payload: dict[str, Any],
    created_by_user_id: int | None = None,
) -> None:
    db.add(
        BookingEvent(
            booking_id=booking.id,
            event_type=event_type,
            payload_json=payload,
            created_by_user_id=created_by_user_id,
        )
    )


def _notify_admins(
    db: Session,
    *,
    booking: Booking,
    notification_type: str,
    title: str,
    body: str,
    email_subject: str,
) -> None:
    admins = (
        db.query(AdminUser)
        .filter(
            AdminUser.org_id == booking.association_id,
            AdminUser.role == AdminRole.ORG_ADMIN,
            AdminUser.is_active.is_(True),
            AdminUser.deleted_at.is_(None),
        )
        .all()
    )
    href = _booking_admin_href(booking)
    for admin in admins:
        db.add(
            OrgAdminNotification(
                admin_user_id=admin.id,
                org_id=booking.association_id,
                type=notification_type,
                title=title,
                body=body,
                href=href,
                is_read=False,
            )
        )
        if admin.email:
            enqueue_email(
                db,
                email_type=notification_type,
                to_email=admin.email,
                subject=email_subject,
                payload=build_email_payload(
                    text_body=f"{body}\n\nApri prenotazione: {href}",
                    html_body=f"<p>{html.escape(body)}</p><p><a href='{html.escape(href)}'>Apri prenotazione</a></p>",
                    sender=build_sender_payload(mode="association", association=booking.organization),
                    meta={
                        "booking_id": booking.id,
                        "association_id": booking.association_id,
                        "notification_type": notification_type,
                    },
                ),
                priority=3,
                dedupe_key=f"{notification_type}:{booking.id}:{admin.id}:{datetime.utcnow().date().isoformat()}",
            )


def _booking_admin_href(booking: Booking) -> str:
    date_value = booking.booking_date.isoformat() if booking.booking_date else ""
    if date_value:
        return f"/org-admin/prenotazioni?date={date_value}&bookingId={booking.id}"
    return f"/org-admin/prenotazioni?bookingId={booking.id}"


def _booking_admin_body(booking: Booking, *, prefix: str) -> str:
    return f"{prefix} {_booking_summary_text(booking)}"


def _booking_summary_text(booking: Booking) -> str:
    parts = []
    if booking.booking_date:
        parts.append(booking.booking_date.isoformat())
    if booking.booking_time:
        parts.append(str(booking.booking_time)[:5])
    if booking.party_size:
        parts.append(f"{booking.party_size} persone")
    location = " / ".join(
        item
        for item in [
            getattr(getattr(booking, "room", None), "name", None),
            getattr(getattr(booking, "table", None), "label", None) or getattr(getattr(booking, "table", None), "name", None),
        ]
        if item
    )
    if location:
        parts.append(location)
    return " - ".join(parts)


def _booking_summary_lines(booking: Booking) -> str:
    rows = [
        ("Nome", booking.customer_name),
        ("Data", booking.booking_date.isoformat() if booking.booking_date else "da definire"),
        ("Orario", str(booking.booking_time)[:5] if booking.booking_time else "da definire"),
        ("Persone", str(booking.party_size or "-")),
    ]
    return "<dl>" + "".join(
        f"<div><dt>{html.escape(label)}</dt><dd>{html.escape(value)}</dd></div>" for label, value in rows
    ) + "</dl>"


def _normalize_reply(value: str) -> str | None:
    normalized = " ".join((value or "").strip().lower().replace("ì", "i").split())
    if normalized in {"si", "s", "ok", "confermo", "conferma", "yes"}:
        return "confirm"
    if normalized in {"no", "n", "annulla", "annullo", "non posso", "cancella"}:
        return "cancel"
    return None


def _page_shell(*, title: str, body: str) -> str:
    return (
        "<!doctype html><html lang='it'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        f"<title>{html.escape(title)}</title>"
        "<style>"
        "body{margin:0;background:#f8fafc;color:#0f172a;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}"
        "main{max-width:560px;margin:0 auto;padding:32px 20px 48px}"
        "h1{font-size:28px;line-height:1.1;margin:0 0 20px;font-weight:800}"
        ".summary{border:1px solid #dbe3ea;background:#fff;border-radius:16px;padding:18px;margin:0 0 20px}"
        "dl{margin:0;display:grid;gap:12px}dl div{display:flex;justify-content:space-between;gap:16px}"
        "dt{font-weight:700;color:#475569}dd{margin:0;text-align:right;font-weight:800}"
        "label{display:block;font-weight:800;margin:0 0 8px}textarea{box-sizing:border-box;width:100%;border:1px solid #cbd5e1;border-radius:14px;padding:14px;font:inherit}"
        "button{margin-top:16px;width:100%;border:0;border-radius:14px;background:#0f766e;color:white;padding:14px 18px;font-weight:800;font-size:16px}"
        ".muted{color:#64748b;font-weight:650}.error{border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:12px;padding:12px}"
        "</style></head><body><main>"
        f"{body}"
        "</main></body></html>"
    )

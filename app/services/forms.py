from __future__ import annotations

import html
import io
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from fastapi import HTTPException
from pydantic import EmailStr, TypeAdapter
from sqlalchemy.orm import Session, joinedload

from app.models import Form, FormField, FormSubmission, Member, Organization
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.email_sender import build_sender_payload


FORM_VISIBILITY_PUBLIC = "public"
FORM_VISIBILITY_MEMBERS_ONLY = "members_only"
ALLOWED_FORM_VISIBILITY = {
    FORM_VISIBILITY_PUBLIC,
    FORM_VISIBILITY_MEMBERS_ONLY,
}
FIELD_TYPE_CONSENT = "consent"
ALLOWED_FORM_FIELD_TYPES = {
    "short_text",
    "long_text",
    "email",
    "phone",
    "number",
    "date",
    "select",
    "radio",
    "checkbox",
    FIELD_TYPE_CONSENT,
}
FIELD_TYPE_ALIASES = {
    "consent/privacy": FIELD_TYPE_CONSENT,
    "privacy": FIELD_TYPE_CONSENT,
}
_EMAIL_ADAPTER = TypeAdapter(EmailStr)


@dataclass(frozen=True)
class ValidatedSubmission:
    payload: dict[str, Any]
    submitter_email: str | None


def _normalize_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _normalize_multiline_text(value: Any) -> str | None:
    text = _normalize_text(value)
    if text is None:
        return None
    return text.replace("\r\n", "\n")


def normalize_form_slug(value: Any) -> str:
    raw = _normalize_text(value)
    if raw is None:
        raise HTTPException(status_code=422, detail="Slug form obbligatorio.")
    normalized = unicodedata.normalize("NFD", raw)
    normalized = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    normalized = normalized.lower()
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized)
    normalized = re.sub(r"-{2,}", "-", normalized).strip("-")
    normalized = normalized[:80].strip("-")
    if not normalized:
        raise HTTPException(status_code=422, detail="Slug form non valido.")
    return normalized


def build_unique_form_slug(
    db: Session,
    *,
    base_slug: str,
    exclude_form_id: int | None = None,
) -> str:
    candidate = normalize_form_slug(base_slug)
    suffix = 1
    while True:
        query = db.query(Form).filter(Form.public_slug == candidate)
        if exclude_form_id is not None:
            query = query.filter(Form.id != exclude_form_id)
        if query.first() is None:
            return candidate
        suffix += 1
        candidate = f"{normalize_form_slug(base_slug)[:72].rstrip('-')}-{suffix}"


def normalize_form_visibility(value: Any) -> str:
    normalized = _normalize_text(value)
    if normalized is None:
        return FORM_VISIBILITY_PUBLIC
    lowered = normalized.lower()
    if lowered not in ALLOWED_FORM_VISIBILITY:
        raise HTTPException(status_code=422, detail="Visibilita form non valida.")
    return lowered


def normalize_form_notification_email(value: Any) -> str | None:
    normalized = _normalize_text(value)
    if normalized is None:
        return None
    try:
        return str(_EMAIL_ADAPTER.validate_python(normalized)).lower()
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Email notifica non valida.") from exc


def normalize_field_type(value: Any) -> str:
    normalized = _normalize_text(value)
    if normalized is None:
        raise HTTPException(status_code=422, detail="Tipo campo obbligatorio.")
    lowered = FIELD_TYPE_ALIASES.get(normalized.lower(), normalized.lower())
    if lowered not in ALLOWED_FORM_FIELD_TYPES:
        raise HTTPException(status_code=422, detail="Tipo campo non supportato.")
    return lowered


def normalize_field_key(value: Any, *, fallback_label: Any | None = None) -> str:
    source = _normalize_text(value) or _normalize_text(fallback_label)
    if source is None:
        raise HTTPException(status_code=422, detail="Chiave campo obbligatoria.")
    normalized = normalize_form_slug(source).replace("-", "_")
    if not normalized:
        raise HTTPException(status_code=422, detail="Chiave campo non valida.")
    return normalized[:64]


def normalize_field_options(field_type: str, value: Any) -> list[str] | None:
    normalized_type = normalize_field_type(field_type)
    options: list[str] = []
    if isinstance(value, str):
        options = [item.strip() for item in value.split(",") if item.strip()]
    elif isinstance(value, list):
        options = [str(item).strip() for item in value if str(item).strip()]
    elif value is None:
        options = []
    else:
        raise HTTPException(status_code=422, detail="Opzioni campo non valide.")

    if normalized_type in {"select", "radio", "checkbox"}:
        if not options:
            raise HTTPException(
                status_code=422,
                detail="I campi select, radio e checkbox richiedono almeno una opzione.",
            )
        deduped: list[str] = []
        seen: set[str] = set()
        for option in options:
            lowered = option.lower()
            if lowered in seen:
                continue
            seen.add(lowered)
            deduped.append(option[:120])
        return deduped
    return None


def get_form_for_org_admin(db: Session, *, association_id: int, form_id: int) -> Form:
    form = (
        db.query(Form)
        .options(
            joinedload(Form.fields),
            joinedload(Form.submissions),
        )
        .filter(Form.id == form_id, Form.association_id == association_id)
        .first()
    )
    if form is None:
        raise HTTPException(status_code=404, detail="Form non trovato.")
    return form


def get_form_by_slug_for_public(db: Session, *, slug: str) -> Form:
    form = (
        db.query(Form)
        .options(
            joinedload(Form.fields),
            joinedload(Form.organization),
        )
        .filter(Form.public_slug == normalize_form_slug(slug))
        .first()
    )
    if form is None:
        raise HTTPException(status_code=404, detail="Form non trovato.")
    return form


def serialize_form_field(field: FormField) -> dict[str, Any]:
    return {
        "id": field.id,
        "form_id": field.form_id,
        "field_key": field.field_key,
        "field_type": field.field_type,
        "label": field.label,
        "placeholder": field.placeholder,
        "help_text": field.help_text,
        "is_required": bool(field.is_required),
        "sort_order": int(field.sort_order or 0),
        "options": list(field.options_json or []),
    }


def serialize_form(form: Form, *, include_fields: bool = True) -> dict[str, Any]:
    items = sorted(
        list(form.fields or []),
        key=lambda field: (int(field.sort_order or 0), int(field.id or 0)),
    )
    return {
        "id": form.id,
        "association_id": form.association_id,
        "title": form.title,
        "description": form.description,
        "public_slug": form.public_slug,
        "is_active": bool(form.is_active),
        "visibility": form.visibility,
        "success_message": form.success_message,
        "notification_email": form.notification_email,
        "allow_multiple_submissions": bool(form.allow_multiple_submissions),
        "created_by_user_id": form.created_by_user_id,
        "created_at": form.created_at.isoformat() if form.created_at else None,
        "updated_at": form.updated_at.isoformat() if form.updated_at else None,
        "field_count": len(items),
        "submission_count": len(form.submissions or []),
        "fields": [serialize_form_field(field) for field in items] if include_fields else [],
    }


def serialize_public_form(form: Form) -> dict[str, Any]:
    payload = serialize_form(form, include_fields=True)
    payload["association"] = {
        "id": form.organization.id if form.organization else form.association_id,
        "name": form.organization.name if form.organization else None,
    }
    return payload


def serialize_submission(submission: FormSubmission) -> dict[str, Any]:
    member = submission.member
    return {
        "id": submission.id,
        "form_id": submission.form_id,
        "association_id": submission.association_id,
        "submitted_by_user_id": submission.submitted_by_user_id,
        "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
        "status": submission.status,
        "payload_json": submission.payload_json or {},
        "submitted_by": {
            "id": member.id,
            "name": f"{(member.first_name or '').strip()} {(member.last_name or '').strip()}".strip()
            or None,
            "email": member.email,
        }
        if member is not None
        else None,
    }


def apply_form_updates(
    db: Session,
    *,
    form: Form,
    title: Any,
    description: Any,
    public_slug: Any,
    is_active: bool,
    visibility: Any,
    success_message: Any,
    notification_email: Any,
    allow_multiple_submissions: bool,
) -> Form:
    normalized_title = _normalize_text(title)
    if normalized_title is None:
        raise HTTPException(status_code=422, detail="Titolo form obbligatorio.")
    requested_slug = normalize_form_slug(public_slug or normalized_title)
    form.title = normalized_title
    form.description = _normalize_multiline_text(description)
    form.public_slug = build_unique_form_slug(
        db,
        base_slug=requested_slug,
        exclude_form_id=form.id,
    )
    form.is_active = bool(is_active)
    form.visibility = normalize_form_visibility(visibility)
    form.success_message = _normalize_multiline_text(success_message)
    form.notification_email = normalize_form_notification_email(notification_email)
    form.allow_multiple_submissions = bool(allow_multiple_submissions)
    return form


def apply_form_field_updates(
    field: FormField,
    *,
    field_key: Any,
    field_type: Any,
    label: Any,
    placeholder: Any,
    help_text: Any,
    is_required: bool,
    sort_order: int,
    options: Any,
) -> FormField:
    normalized_label = _normalize_text(label)
    if normalized_label is None:
        raise HTTPException(status_code=422, detail="Etichetta campo obbligatoria.")
    normalized_type = normalize_field_type(field_type)
    field.field_key = normalize_field_key(field_key, fallback_label=normalized_label)
    field.field_type = normalized_type
    field.label = normalized_label
    field.placeholder = _normalize_text(placeholder)
    field.help_text = _normalize_multiline_text(help_text)
    field.is_required = bool(is_required)
    field.sort_order = int(sort_order or 0)
    field.options_json = normalize_field_options(normalized_type, options)
    return field


def _validate_single_value(field: FormField, value: Any) -> tuple[Any, str | None]:
    field_type = normalize_field_type(field.field_type)
    if field_type in {"short_text", "long_text", "phone"}:
        normalized = _normalize_multiline_text(value if value is not None else "")
        return normalized or "", None
    if field_type == "email":
        normalized = _normalize_text(value)
        if normalized is None:
            return "", None
        try:
            email = str(_EMAIL_ADAPTER.validate_python(normalized)).lower()
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Il campo '{field.label}' richiede una email valida.",
            ) from exc
        return email, email
    if field_type == "number":
        if value in (None, ""):
            return None, None
        try:
            number = float(value)
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Il campo '{field.label}' richiede un numero valido.",
            ) from exc
        if number.is_integer():
            return int(number), None
        return number, None
    if field_type == "date":
        normalized = _normalize_text(value)
        if normalized is None:
            return "", None
        try:
            parsed = date.fromisoformat(normalized)
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Il campo '{field.label}' richiede una data valida.",
            ) from exc
        return parsed.isoformat(), None
    if field_type in {"select", "radio"}:
        normalized = _normalize_text(value)
        options = list(field.options_json or [])
        if normalized is None:
            return "", None
        if normalized not in options:
            raise HTTPException(
                status_code=422,
                detail=f"Il valore selezionato per '{field.label}' non e valido.",
            )
        return normalized, None
    if field_type == "checkbox":
        options = list(field.options_json or [])
        if isinstance(value, list):
            normalized_values = [str(item).strip() for item in value if str(item).strip()]
        elif value in (None, ""):
            normalized_values = []
        else:
            normalized_values = [str(value).strip()]
        invalid = [item for item in normalized_values if item not in options]
        if invalid:
            raise HTTPException(
                status_code=422,
                detail=f"Il valore selezionato per '{field.label}' non e valido.",
            )
        return normalized_values, None
    if field_type == FIELD_TYPE_CONSENT:
        normalized = bool(value)
        return normalized, None
    raise HTTPException(status_code=422, detail=f"Tipo campo non supportato: {field_type}")


def validate_form_submission_payload(
    *,
    form: Form,
    raw_payload: dict[str, Any] | None,
) -> ValidatedSubmission:
    raw = raw_payload or {}
    normalized_payload: dict[str, Any] = {}
    submitter_email: str | None = None
    fields = sorted(list(form.fields or []), key=lambda item: (int(item.sort_order or 0), int(item.id or 0)))
    for field in fields:
        raw_value = raw.get(field.field_key)
        normalized_value, detected_email = _validate_single_value(field, raw_value)
        if field.field_type == FIELD_TYPE_CONSENT:
            if field.is_required and normalized_value is not True:
                raise HTTPException(
                    status_code=422,
                    detail=f"Devi accettare '{field.label}' per inviare il form.",
                )
        elif field.field_type == "checkbox":
            if field.is_required and not normalized_value:
                raise HTTPException(
                    status_code=422,
                    detail=f"Il campo '{field.label}' e obbligatorio.",
                )
        else:
            empty = normalized_value in (None, "", [])
            if field.is_required and empty:
                raise HTTPException(
                    status_code=422,
                    detail=f"Il campo '{field.label}' e obbligatorio.",
                )
        normalized_payload[field.field_key] = normalized_value
        if detected_email and submitter_email is None:
            submitter_email = detected_email
    return ValidatedSubmission(payload=normalized_payload, submitter_email=submitter_email)


def ensure_submission_allowed(
    db: Session,
    *,
    form: Form,
    member: Member | None,
    validated_submission: ValidatedSubmission,
) -> None:
    if bool(form.allow_multiple_submissions):
        return

    existing_query = db.query(FormSubmission).filter(FormSubmission.form_id == form.id)
    if member is not None:
        already_sent = existing_query.filter(
            FormSubmission.submitted_by_user_id == member.id
        ).first()
        if already_sent is not None:
            raise HTTPException(
                status_code=409,
                detail="Hai gia inviato questo form.",
            )
        return

    submitter_email = (validated_submission.submitter_email or "").strip().lower()
    if not submitter_email:
        return
    for submission in existing_query.all():
        payload = submission.payload_json or {}
        for value in payload.values():
            if isinstance(value, str) and value.strip().lower() == submitter_email:
                raise HTTPException(
                    status_code=409,
                    detail="Questo indirizzo email ha gia inviato il form.",
                )


def create_submission(
    db: Session,
    *,
    form: Form,
    member: Member | None,
    validated_submission: ValidatedSubmission,
) -> FormSubmission:
    submission = FormSubmission(
        form_id=form.id,
        association_id=form.association_id,
        submitted_by_user_id=member.id if member is not None else None,
        payload_json=validated_submission.payload,
        status="new",
    )
    db.add(submission)
    db.flush()
    return submission


def _format_submission_for_email(form: Form, payload: dict[str, Any]) -> tuple[str, str]:
    lines = [f"Nuova risposta ricevuta per il form '{form.title}'."]
    html_rows: list[str] = [
        f"<p>Nuova risposta ricevuta per il form <strong>{html.escape(form.title)}</strong>.</p>",
        "<ul>",
    ]
    field_map = {field.field_key: field for field in form.fields or []}
    for key, value in payload.items():
        field = field_map.get(key)
        label = field.label if field is not None else key
        if isinstance(value, list):
            printable = ", ".join(str(item) for item in value) if value else "-"
        elif isinstance(value, bool):
            printable = "Si" if value else "No"
        elif value in (None, ""):
            printable = "-"
        else:
            printable = str(value)
        lines.append(f"- {label}: {printable}")
        html_rows.append(f"<li><strong>{html.escape(label)}:</strong> {html.escape(printable)}</li>")
    html_rows.append("</ul>")
    return "\n".join(lines), "".join(html_rows)


def enqueue_submission_notifications(
    db: Session,
    *,
    form: Form,
    submission: FormSubmission,
    validated_submission: ValidatedSubmission,
) -> None:
    notification_email = normalize_form_notification_email(form.notification_email)
    text_summary, html_summary = _format_submission_for_email(form, validated_submission.payload)

    if notification_email:
        enqueue_email(
            db,
            email_type="form_submission_notification",
            to_email=notification_email,
            subject=f"Nuova risposta form: {form.title}",
            payload=build_email_payload(
                text_body=text_summary,
                html_body=html_summary,
                sender=build_sender_payload(mode="system"),
                meta={
                    "form_id": form.id,
                    "submission_id": submission.id,
                    "association_id": form.association_id,
                },
            ),
            priority=4,
        )

    if validated_submission.submitter_email:
        confirmation_text = (
            f"Abbiamo ricevuto la tua richiesta per '{form.title}'.\n\n"
            f"{form.success_message or 'Ti ricontatteremo al piu presto.'}"
        )
        confirmation_html = (
            f"<p>Abbiamo ricevuto la tua richiesta per <strong>{html.escape(form.title)}</strong>.</p>"
            f"<p>{html.escape(form.success_message or 'Ti ricontatteremo al piu presto.')}</p>"
        )
        enqueue_email(
            db,
            email_type="form_submission_confirmation",
            to_email=validated_submission.submitter_email,
            subject=f"Conferma invio: {form.title}",
            payload=build_email_payload(
                text_body=confirmation_text,
                html_body=confirmation_html,
                sender=build_sender_payload(mode="system"),
                meta={
                    "form_id": form.id,
                    "submission_id": submission.id,
                    "association_id": form.association_id,
                },
            ),
            priority=5,
        )


def export_submissions_csv(form: Form) -> io.StringIO:
    fields = sorted(list(form.fields or []), key=lambda item: (int(item.sort_order or 0), int(item.id or 0)))
    submissions = sorted(
        list(form.submissions or []),
        key=lambda item: (item.submitted_at or datetime.min, int(item.id or 0)),
        reverse=True,
    )
    fieldnames = ["submission_id", "submitted_at", "status", "submitted_by_user_id"] + [
        field.field_key for field in fields
    ]
    output = io.StringIO()
    import csv

    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for submission in submissions:
        row = {
            "submission_id": submission.id,
            "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else "",
            "status": submission.status or "",
            "submitted_by_user_id": submission.submitted_by_user_id or "",
        }
        payload = submission.payload_json or {}
        for field in fields:
            value = payload.get(field.field_key)
            if isinstance(value, list):
                row[field.field_key] = ", ".join(str(item) for item in value)
            elif isinstance(value, bool):
                row[field.field_key] = "Si" if value else "No"
            elif value is None:
                row[field.field_key] = ""
            else:
                row[field.field_key] = str(value)
        writer.writerow(row)
    output.seek(0)
    return output

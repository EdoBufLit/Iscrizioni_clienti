from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models import Form, FormSubmission
from app.services.system_email_layout import build_system_email_html
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.email_sender import build_sender_payload


def maybe_enqueue_high_score_survey_thank_you(
    db: Session,
    *,
    form: Form,
    submission: FormSubmission,
    submitter_email: str | None,
    payload: dict[str, Any],
) -> bool:
    if getattr(form, "form_type", None) != "survey":
        return False
    recipient = (submitter_email or "").strip().lower()
    if not recipient:
        return False
    if not _has_high_score(payload):
        return False
    org_name = getattr(form.organization, "club_display_name", None) or getattr(form.organization, "name", "") or "associazione"
    text_body = (
        f"Grazie per il tuo feedback su '{form.title}'.\n\n"
        f"Siamo felici che l'esperienza con {org_name} sia stata positiva."
    )
    html_body = build_system_email_html(
        title="Grazie per il tuo feedback",
        eyebrow="Sondaggi",
        organization_name=org_name,
        body=text_body,
        preheader=f"Grazie per il tuo feedback su {form.title}.",
    )
    enqueue_email(
        db,
        email_type="survey_high_score_thank_you",
        to_email=recipient,
        subject=f"Grazie per il tuo feedback: {form.title}",
        payload=build_email_payload(
            text_body=text_body,
            html_body=html_body,
            sender=build_sender_payload(mode="association", association=form.organization),
            meta={
                "form_id": form.id,
                "submission_id": submission.id,
                "association_id": form.association_id,
            },
        ),
        priority=5,
        dedupe_key=f"survey_high_score_thank_you:{submission.id}",
    )
    return True


def _has_high_score(payload: dict[str, Any]) -> bool:
    for key, value in (payload or {}).items():
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        normalized_key = str(key or "").lower()
        if "__survey_rating__" in normalized_key and number >= 4:
            return True
        if "__survey_nps__" in normalized_key and number >= 9:
            return True
    return False

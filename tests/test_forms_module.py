from __future__ import annotations

from datetime import datetime, timedelta
import io
import uuid

import pytest

from app.db import SessionLocal
from app.models import AdminRole, AdminUser, EmailOutbox, FormSubmission, OrgAdminToken, Organization
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _login_org_admin(client, db, admin_id: int) -> None:
    token_str = f"org-forms-{admin_id}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)


def _create_org_admin(db) -> tuple[Organization, AdminUser]:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Form Club {suffix}",
        slug=f"form-club-{suffix}",
        is_active=True,
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    admin = AdminUser(
        email=f"forms-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return org, admin


def test_org_admin_forms_crud_public_submit_and_export(client, db):
    org, admin = _create_org_admin(db)
    _login_org_admin(client, db, admin.id)
    public_slug = f"prenotazione-tavolo-{uuid.uuid4().hex[:6]}"

    create_res = client.post(
        "/api/org-admin/forms",
        json={
            "title": "Prenotazione tavolo",
            "description": "Modulo prenotazione serata sociale",
            "public_slug": public_slug,
            "is_active": True,
            "visibility": "public",
            "success_message": "Grazie, ti ricontatteremo.",
            "notification_email": "segreteria@example.com",
            "allow_multiple_submissions": False,
        },
    )
    assert create_res.status_code == 201, create_res.text
    form = create_res.json()["form"]
    form_id = form["id"]
    assert form["public_slug"] == public_slug

    name_field_res = client.post(
        f"/api/org-admin/forms/{form_id}/fields",
        json={
            "field_type": "short_text",
            "label": "Nome e cognome",
            "field_key": "nome_socio",
            "is_required": True,
            "sort_order": 0,
        },
    )
    assert name_field_res.status_code == 201, name_field_res.text

    email_field_res = client.post(
        f"/api/org-admin/forms/{form_id}/fields",
        json={
            "field_type": "email",
            "label": "Email",
            "field_key": "email",
            "is_required": True,
            "sort_order": 1,
        },
    )
    assert email_field_res.status_code == 201, email_field_res.text

    slot_field_res = client.post(
        f"/api/org-admin/forms/{form_id}/fields",
        json={
            "field_type": "select",
            "label": "Turno",
            "field_key": "turno",
            "is_required": True,
            "sort_order": 2,
            "options": ["Pranzo", "Cena"],
        },
    )
    assert slot_field_res.status_code == 201, slot_field_res.text

    list_res = client.get("/api/org-admin/forms")
    assert list_res.status_code == 200, list_res.text
    assert list_res.json()["items"][0]["field_count"] == 3

    duplicate_res = client.post(f"/api/org-admin/forms/{form_id}/duplicate", json={})
    assert duplicate_res.status_code == 201, duplicate_res.text
    assert duplicate_res.json()["form"]["is_active"] is False

    public_res = client.get(f"/api/forms/{public_slug}")
    assert public_res.status_code == 200, public_res.text
    assert public_res.json()["form"]["title"] == "Prenotazione tavolo"

    submit_res = client.post(
        f"/api/forms/{public_slug}/submit",
        json={
            "nome_socio": "Mario Rossi",
            "email": "mario@example.com",
            "turno": "Cena",
        },
    )
    assert submit_res.status_code == 200, submit_res.text
    assert submit_res.json()["message"] == "Grazie, ti ricontatteremo."

    duplicate_submit_res = client.post(
        f"/api/forms/{public_slug}/submit",
        json={
            "nome_socio": "Mario Rossi",
            "email": "mario@example.com",
            "turno": "Cena",
        },
    )
    assert duplicate_submit_res.status_code == 409, duplicate_submit_res.text

    assert db.query(FormSubmission).filter(FormSubmission.form_id == form_id).count() == 1
    outbox_rows = db.query(EmailOutbox).filter(EmailOutbox.email_type.like("form_submission%")).all()
    assert len(outbox_rows) == 2

    submissions_res = client.get(f"/api/org-admin/forms/{form_id}/submissions")
    assert submissions_res.status_code == 200, submissions_res.text
    assert submissions_res.json()["total"] == 1

    export_res = client.get(f"/api/org-admin/forms/{form_id}/submissions/export.csv")
    assert export_res.status_code == 200, export_res.text
    csv_text = export_res.text
    assert "submission_id" in csv_text
    assert "Mario Rossi" in csv_text
    assert "mario@example.com" in csv_text


def test_members_only_public_form_requires_member_session(client, db):
    org, admin = _create_org_admin(db)
    _login_org_admin(client, db, admin.id)
    public_slug = f"richiesta-documento-{uuid.uuid4().hex[:6]}"

    create_res = client.post(
        "/api/org-admin/forms",
        json={
            "title": "Richiesta documento",
            "public_slug": public_slug,
            "is_active": True,
            "visibility": "members_only",
        },
    )
    assert create_res.status_code == 201, create_res.text
    form_id = create_res.json()["form"]["id"]

    field_res = client.post(
        f"/api/org-admin/forms/{form_id}/fields",
        json={
            "field_type": "short_text",
            "label": "Richiesta",
            "field_key": "richiesta",
            "is_required": True,
        },
    )
    assert field_res.status_code == 201, field_res.text

    public_res = client.get(f"/api/forms/{public_slug}")
    assert public_res.status_code == 403, public_res.text
    assert "riservato ai soci" in public_res.json()["detail"].lower()

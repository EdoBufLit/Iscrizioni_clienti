from __future__ import annotations

from datetime import datetime, timedelta
import io
import uuid

import pytest

from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    Booking,
    EmailOutbox,
    EmailTemplate,
    FormSubmission,
    OrgAdminNotification,
    OrgAdminToken,
    Organization,
)
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


def _create_org_admin(db, *, communications_enabled: bool = True) -> tuple[Organization, AdminUser]:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Form Club {suffix}",
        slug=f"form-club-{suffix}",
        is_active=True,
        communications_enabled=communications_enabled,
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
    admin_template = EmailTemplate(
        association_id=org.id,
        is_system=False,
        name="Notifica richiesta form",
        category="forms",
        subject="Nuova richiesta {{titolo_form}}",
        body_text="Nuova richiesta da {{nome_socio}}",
        body_html="<p>Nuova richiesta da {{nome_socio}}</p>",
        channel="email",
        is_active=True,
        created_by_user_id=admin.id,
    )
    user_template = EmailTemplate(
        association_id=org.id,
        is_system=False,
        name="Conferma utente form",
        category="forms",
        subject="Ricevuto {{titolo_form}}",
        body_text="Ciao {{nome_socio}}, abbiamo ricevuto il tuo invio.",
        body_html="<p>Ciao {{nome_socio}}, abbiamo ricevuto il tuo invio.</p>",
        channel="email",
        is_active=True,
        created_by_user_id=admin.id,
    )
    db.add(admin_template)
    db.add(user_template)
    db.commit()
    db.refresh(admin_template)
    db.refresh(user_template)

    create_res = client.post(
        "/api/org-admin/forms",
        json={
            "title": "Prenotazione tavolo",
            "description": "Modulo prenotazione serata sociale",
            "accent_color": "#0f766e",
            "submit_button_text": "Prenota ora",
            "show_logo": True,
            "cover_image_url": "https://example.com/cover.jpg",
            "page_style": "spotlight",
            "public_slug": public_slug,
            "is_active": True,
            "visibility": "public",
            "success_message": "Grazie, ti ricontatteremo.",
            "notification_email": "segreteria@example.com",
            "allow_multiple_submissions": False,
            "notify_admin_on_submit": True,
            "send_user_confirmation": True,
            "admin_notification_template_id": admin_template.id,
            "user_confirmation_template_id": user_template.id,
            "create_internal_request": True,
        },
    )
    assert create_res.status_code == 201, create_res.text
    form = create_res.json()["form"]
    form_id = form["id"]
    assert form["public_slug"] == public_slug
    assert form["public_path"] == f"/forms/{org.slug}/{public_slug}"
    assert form["accent_color"] == "#0f766e"
    assert form["submit_button_text"] == "Prenota ora"
    assert form["cover_image_url"] == "https://example.com/cover.jpg"
    assert form["page_style"] == "spotlight"

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

    public_res = client.get(f"/api/forms/{org.slug}/{public_slug}")
    assert public_res.status_code == 200, public_res.text
    assert public_res.json()["form"]["title"] == "Prenotazione tavolo"
    assert public_res.json()["form"]["accent_color"] == "#0f766e"
    assert public_res.json()["form"]["submit_button_text"] == "Prenota ora"
    assert public_res.json()["form"]["association"]["slug"] == org.slug

    legacy_public_res = client.get(f"/api/forms/{public_slug}")
    assert legacy_public_res.status_code == 200, legacy_public_res.text

    submit_res = client.post(
        f"/api/forms/{org.slug}/{public_slug}/submit",
        json={
            "nome_socio": "Mario Rossi",
            "email": "mario@example.com",
            "turno": "Cena",
        },
    )
    assert submit_res.status_code == 200, submit_res.text
    assert submit_res.json()["message"] == "Grazie, ti ricontatteremo."

    duplicate_submit_res = client.post(
        f"/api/forms/{org.slug}/{public_slug}/submit",
        json={
            "nome_socio": "Mario Rossi",
            "email": "mario@example.com",
            "turno": "Cena",
        },
    )
    assert duplicate_submit_res.status_code == 409, duplicate_submit_res.text

    verification_db = SessionLocal()
    try:
        assert verification_db.query(FormSubmission).filter(FormSubmission.form_id == form_id).count() == 1
        outbox_rows = verification_db.query(EmailOutbox).filter(EmailOutbox.email_type.like("form_submission%")).all()
        assert len(outbox_rows) == 2
        assert any(row.subject == "Nuova richiesta Prenotazione tavolo" for row in outbox_rows)
        assert any(row.subject == "Ricevuto Prenotazione tavolo" for row in outbox_rows)
        assert (
            verification_db.query(OrgAdminNotification)
            .filter(
                OrgAdminNotification.type == "form_submission",
                OrgAdminNotification.org_id == org.id,
            )
            .count()
            == 1
        )
    finally:
        verification_db.close()

    submissions_res = client.get(f"/api/org-admin/forms/{form_id}/submissions")
    assert submissions_res.status_code == 200, submissions_res.text
    assert submissions_res.json()["total"] == 1
    assert submissions_res.json()["form"]["actions"]["create_internal_request"] is True

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

    public_res = client.get(f"/api/forms/{org.slug}/{public_slug}")
    assert public_res.status_code == 403, public_res.text
    assert "riservato ai soci" in public_res.json()["detail"].lower()


def test_forms_module_is_locked_when_communications_disabled(client, db):
    org, admin = _create_org_admin(db, communications_enabled=False)
    _login_org_admin(client, db, admin.id)

    list_res = client.get("/api/org-admin/forms")
    assert list_res.status_code == 403, list_res.text
    assert "richiedono il modulo comunicazioni attivo" in list_res.json()["detail"].lower()


def test_public_form_is_locked_when_communications_disabled(client, db):
    org, admin = _create_org_admin(db, communications_enabled=True)
    public_slug = f"richiesta-info-{uuid.uuid4().hex[:6]}"
    form_token = OrgAdminToken(
        admin_id=admin.id,
        token_hash=hash_token(f"org-forms-public-{admin.id}"),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(form_token)
    db.commit()
    client.get(f"/api/org-admin/auth/verify?token=org-forms-public-{admin.id}", follow_redirects=False)

    create_res = client.post(
        "/api/org-admin/forms",
        json={
            "title": "Richiesta info",
            "public_slug": public_slug,
            "is_active": True,
            "visibility": "public",
        },
    )
    assert create_res.status_code == 201, create_res.text

    org.communications_enabled = False
    db.add(org)
    db.commit()

    public_res = client.get(f"/api/forms/{org.slug}/{public_slug}")
    assert public_res.status_code == 403, public_res.text
    assert "richiedono il modulo comunicazioni attivo" in public_res.json()["detail"].lower()


def test_org_admin_can_create_manual_booking_from_agenda(client, db):
    org, admin = _create_org_admin(db)
    _login_org_admin(client, db, admin.id)

    room_res = client.post("/api/org-admin/rooms", json={"name": "Sala agenda", "is_active": True})
    assert room_res.status_code == 201, room_res.text
    room_id = room_res.json()["room"]["id"]

    table_res = client.post(
        f"/api/org-admin/rooms/{room_id}/tables",
        json={
            "name": "T2",
            "capacity": 4,
            "shape": "round",
            "pos_x": 100,
            "pos_y": 120,
            "width": 96,
            "height": 96,
            "is_active": True,
            "is_out_of_service": False,
        },
    )
    assert table_res.status_code == 201, table_res.text
    table_id = table_res.json()["table"]["id"]

    create_res = client.post(
        "/api/org-admin/bookings",
        json={
            "customer_name": "Prenotazione manuale",
            "customer_email": "agenda@example.com",
            "customer_phone": "+39 333 0000000",
            "booking_date": "2026-03-28",
            "booking_time": "19:30",
            "party_size": 3,
            "room_id": room_id,
            "table_id": table_id,
            "status": "confirmed",
            "notes": "Creata dalla segreteria",
        },
    )
    assert create_res.status_code == 201, create_res.text
    booking = create_res.json()["booking"]
    assert booking["customer_name"] == "Prenotazione manuale"
    assert booking["room"]["name"] == "Sala agenda"
    assert booking["table"]["name"] == "T2"
    assert booking["status"] == "confirmed"

    list_res = client.get("/api/org-admin/bookings")
    assert list_res.status_code == 200, list_res.text
    assert any(item["customer_name"] == "Prenotazione manuale" for item in list_res.json()["items"])


def test_booking_enabled_form_creates_booking_and_exposes_agenda(client, db):
    org, admin = _create_org_admin(db)
    _login_org_admin(client, db, admin.id)
    public_slug = f"prenota-cena-{uuid.uuid4().hex[:6]}"

    create_res = client.post(
        "/api/org-admin/forms",
        json={
            "title": "Prenotazione cena sociale",
            "public_slug": public_slug,
            "is_active": True,
            "visibility": "public",
            "form_type": "booking",
            "booking_enabled": True,
            "booking_requires_manual_confirmation": True,
            "booking_notification_enabled": True,
            "booking_success_message_override": "Prenotazione ricevuta, ti confermeremo a breve.",
            "booking_field_mapping": {
                "customer_name": "nome_cliente",
                "customer_email": "email",
                "booking_date": "data_prenotazione",
                "booking_time": "orario_prenotazione",
                "party_size": "numero_persone",
                "notes": "note",
            },
        },
    )
    assert create_res.status_code == 201, create_res.text
    form = create_res.json()["form"]
    form_id = form["id"]
    assert form["booking_enabled"] is True
    assert form["form_type"] == "booking"

    for index, field in enumerate(
        [
            {"field_type": "short_text", "label": "Nome cliente", "field_key": "nome_cliente"},
            {"field_type": "email", "label": "Email", "field_key": "email"},
            {"field_type": "date", "label": "Data", "field_key": "data_prenotazione"},
            {"field_type": "short_text", "label": "Orario", "field_key": "orario_prenotazione"},
            {"field_type": "number", "label": "Persone", "field_key": "numero_persone"},
            {"field_type": "long_text", "label": "Note", "field_key": "note"},
        ]
    ):
        field_res = client.post(
            f"/api/org-admin/forms/{form_id}/fields",
            json={**field, "is_required": True, "sort_order": index * 10},
        )
        assert field_res.status_code == 201, field_res.text

    submit_res = client.post(
        f"/api/forms/{org.slug}/{public_slug}/submit",
        json={
            "nome_cliente": "Giulia Bianchi",
            "email": "giulia@example.com",
            "data_prenotazione": "2026-03-25",
            "orario_prenotazione": "20:30",
            "numero_persone": 4,
            "note": "Tavolo vicino alla finestra",
        },
    )
    assert submit_res.status_code == 200, submit_res.text
    payload = submit_res.json()
    assert payload["message"] == "Prenotazione ricevuta, ti confermeremo a breve."
    assert payload["booking"]["status"] == "pending"

    verification_db = SessionLocal()
    try:
        booking = verification_db.query(Booking).filter(Booking.form_id == form_id).first()
        assert booking is not None
        assert booking.customer_name == "Giulia Bianchi"
        assert booking.customer_email == "giulia@example.com"
        assert booking.party_size == 4
        assert booking.status == "pending"
    finally:
        verification_db.close()

    list_res = client.get("/api/org-admin/bookings")
    assert list_res.status_code == 200, list_res.text
    assert list_res.json()["total"] >= 1

    day_res = client.get("/api/org-admin/bookings/agenda/day?date=2026-03-25")
    assert day_res.status_code == 200, day_res.text
    assert any(item["customer_name"] == "Giulia Bianchi" for item in day_res.json()["items"])

    booking_id = payload["booking"]["id"]
    detail_res = client.get(f"/api/org-admin/bookings/{booking_id}")
    assert detail_res.status_code == 200, detail_res.text
    assert detail_res.json()["booking"]["submission_id"] == payload["submission"]["id"]

    patch_res = client.patch(
        f"/api/org-admin/bookings/{booking_id}",
        json={"status": "confirmed"},
    )
    assert patch_res.status_code == 200, patch_res.text
    assert patch_res.json()["booking"]["status"] == "confirmed"

    submissions_res = client.get(f"/api/org-admin/forms/{form_id}/submissions")
    assert submissions_res.status_code == 200, submissions_res.text
    assert submissions_res.json()["items"][0]["booking"]["status"] == "confirmed"


def test_booking_rooms_tables_and_assignment_flow(client, db):
    org, admin = _create_org_admin(db)
    _login_org_admin(client, db, admin.id)
    public_slug = f"prenota-sala-{uuid.uuid4().hex[:6]}"

    create_form_res = client.post(
        "/api/org-admin/forms",
        json={
            "title": "Prenotazione sala eventi",
            "public_slug": public_slug,
            "is_active": True,
            "visibility": "public",
            "form_type": "booking",
            "booking_enabled": True,
            "booking_requires_manual_confirmation": True,
            "booking_field_mapping": {
                "customer_name": "nome_cliente",
                "booking_date": "data_prenotazione",
                "booking_time": "orario_prenotazione",
                "party_size": "numero_persone",
            },
        },
    )
    assert create_form_res.status_code == 201, create_form_res.text
    form_id = create_form_res.json()["form"]["id"]

    for index, field in enumerate(
        [
            {"field_type": "short_text", "label": "Nome cliente", "field_key": "nome_cliente"},
            {"field_type": "date", "label": "Data", "field_key": "data_prenotazione"},
            {"field_type": "short_text", "label": "Orario", "field_key": "orario_prenotazione"},
            {"field_type": "number", "label": "Persone", "field_key": "numero_persone"},
        ]
    ):
        field_res = client.post(
            f"/api/org-admin/forms/{form_id}/fields",
            json={**field, "is_required": True, "sort_order": index * 10},
        )
        assert field_res.status_code == 201, field_res.text

    submit_res = client.post(
        f"/api/forms/{org.slug}/{public_slug}/submit",
        json={
            "nome_cliente": "Elena Verdi",
            "data_prenotazione": "2026-03-26",
            "orario_prenotazione": "21:00",
            "numero_persone": 6,
        },
    )
    assert submit_res.status_code == 200, submit_res.text
    booking_id = submit_res.json()["booking"]["id"]

    room_res = client.post("/api/org-admin/rooms", json={"name": "Sala grande", "is_active": True})
    assert room_res.status_code == 201, room_res.text
    room_id = room_res.json()["room"]["id"]

    table_res = client.post(
        f"/api/org-admin/rooms/{room_id}/tables",
        json={
            "name": "T1",
            "capacity": 8,
            "shape": "round",
            "pos_x": 120,
            "pos_y": 160,
            "width": 100,
            "height": 100,
            "is_active": True,
            "is_out_of_service": False,
        },
    )
    assert table_res.status_code == 201, table_res.text
    table_id = table_res.json()["table"]["id"]

    assign_res = client.post(
        f"/api/org-admin/bookings/{booking_id}/assignment",
        json={"room_id": room_id, "table_id": table_id},
    )
    assert assign_res.status_code == 200, assign_res.text
    booking_payload = assign_res.json()["booking"]
    assert booking_payload["room"]["name"] == "Sala grande"
    assert booking_payload["table"]["name"] == "T1"

    map_res = client.get(f"/api/org-admin/rooms/{room_id}/map?date=2026-03-26&time=21:00")
    assert map_res.status_code == 200, map_res.text
    map_payload = map_res.json()
    assert map_payload["totals"]["reserved"] == 1
    assert map_payload["tables"][0]["active_booking"]["customer_name"] == "Elena Verdi"

    move_res = client.put(
        f"/api/org-admin/rooms/{room_id}/map",
        json={"positions": [{"id": table_id, "pos_x": 240, "pos_y": 260, "width": 110, "height": 110}]},
    )
    assert move_res.status_code == 200, move_res.text

    unassign_res = client.delete(f"/api/org-admin/bookings/{booking_id}/assignment")
    assert unassign_res.status_code == 200, unassign_res.text
    assert unassign_res.json()["booking"]["room"] is None
    assert unassign_res.json()["booking"]["table"] is None


def test_booking_form_can_auto_assign_first_available_table(client, db):
    org, admin = _create_org_admin(db)
    _login_org_admin(client, db, admin.id)
    public_slug = f"prenota-auto-assign-{uuid.uuid4().hex[:6]}"

    room_res = client.post("/api/org-admin/rooms", json={"name": "Sala auto assign", "is_active": True})
    assert room_res.status_code == 201, room_res.text
    room_id = room_res.json()["room"]["id"]

    table_res = client.post(
        f"/api/org-admin/rooms/{room_id}/tables",
        json={
            "name": "T-A1",
            "capacity": 6,
            "shape": "round",
            "pos_x": 80,
            "pos_y": 120,
            "width": 96,
            "height": 96,
            "is_active": True,
            "is_out_of_service": False,
        },
    )
    assert table_res.status_code == 201, table_res.text
    table_id = table_res.json()["table"]["id"]

    create_form_res = client.post(
        "/api/org-admin/forms",
        json={
            "title": "Prenotazione auto assign",
            "public_slug": public_slug,
            "is_active": True,
            "visibility": "public",
            "form_type": "booking",
            "booking_enabled": True,
            "booking_auto_assign_enabled": True,
            "booking_requires_manual_confirmation": False,
            "booking_field_mapping": {
                "customer_name": "nome_cliente",
                "booking_date": "data_prenotazione",
                "booking_time": "orario_prenotazione",
                "party_size": "numero_persone",
            },
        },
    )
    assert create_form_res.status_code == 201, create_form_res.text
    form_id = create_form_res.json()["form"]["id"]

    for index, field in enumerate(
        [
            {"field_type": "short_text", "label": "Nome cliente", "field_key": "nome_cliente"},
            {"field_type": "date", "label": "Data", "field_key": "data_prenotazione"},
            {"field_type": "short_text", "label": "Orario", "field_key": "orario_prenotazione"},
            {"field_type": "number", "label": "Persone", "field_key": "numero_persone"},
        ]
    ):
        field_res = client.post(
            f"/api/org-admin/forms/{form_id}/fields",
            json={**field, "is_required": True, "sort_order": index * 10},
        )
        assert field_res.status_code == 201, field_res.text

    submit_res = client.post(
        f"/api/forms/{org.slug}/{public_slug}/submit",
        json={
            "nome_cliente": "Auto Assign",
            "data_prenotazione": "2026-03-27",
            "orario_prenotazione": "20:00",
            "numero_persone": 4,
        },
    )
    assert submit_res.status_code == 200, submit_res.text
    booking = submit_res.json()["booking"]
    assert booking["status"] == "confirmed"

    verification_db = SessionLocal()
    try:
        persisted = verification_db.query(Booking).filter(Booking.id == booking["id"]).first()
        assert persisted is not None
        assert persisted.room_id == room_id
        assert persisted.table_id == table_id
    finally:
        verification_db.close()

    map_res = client.get(f"/api/org-admin/rooms/{room_id}/map?date=2026-03-27&time=20:00")
    assert map_res.status_code == 200, map_res.text
    assert map_res.json()["tables"][0]["active_booking"]["customer_name"] == "Auto Assign"

from __future__ import annotations

from datetime import datetime, timedelta
import io
import uuid

import pytest

from app.config import settings
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
    WhatsAppMessage,
)
from app.services.whatsapp_sync import get_or_create_connection
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
            "whatsapp_auto_reply_enabled": True,
            "whatsapp_auto_reply_template": "Ciao {{nome_socio}}, abbiamo registrato {{titolo_form}}.",
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
    assert form["whatsapp_auto_reply_enabled"] is True
    assert "registrato" in (form["whatsapp_auto_reply_template"] or "")

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

    time_field_res = client.post(
        f"/api/org-admin/forms/{form_id}/fields",
        json={
            "field_type": "time",
            "label": "Orario",
            "field_key": "orario",
            "is_required": True,
            "sort_order": 3,
        },
    )
    assert time_field_res.status_code == 201, time_field_res.text

    list_res = client.get("/api/org-admin/forms")
    assert list_res.status_code == 200, list_res.text
    assert list_res.json()["items"][0]["field_count"] == 4

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
            "orario": "20:30",
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
            "orario": "20:30",
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


def test_org_admin_form_payload_includes_connected_whatsapp_automations(client, db):
    org, admin = _create_org_admin(db)
    _login_org_admin(client, db, admin.id)
    public_slug = f"conferma-whatsapp-{uuid.uuid4().hex[:6]}"

    create_res = client.post(
        "/api/org-admin/forms",
        json={
            "title": "Richiesta informazioni",
            "public_slug": public_slug,
            "is_active": True,
            "visibility": "public",
        },
    )
    assert create_res.status_code == 201, create_res.text
    form_id = create_res.json()["form"]["id"]

    phone_field_res = client.post(
        f"/api/org-admin/forms/{form_id}/fields",
        json={
            "field_type": "phone",
            "label": "Telefono",
            "field_key": "telefono",
            "is_required": True,
            "sort_order": 0,
        },
    )
    assert phone_field_res.status_code == 201, phone_field_res.text

    automation_res = client.post(
        "/api/org-admin/communications/whatsapp/automations",
        json={
            "name": "WhatsApp conferma richiesta",
            "form_id": form_id,
            "source_type": "public_form",
            "trigger_event": "form_submitted",
            "recipient_type": "submitter",
            "phone_source": "form_field",
            "phone_field_key": "telefono",
            "template_name": "Conferma richiesta",
            "template_body": "Abbiamo ricevuto la tua richiesta.",
            "is_active": True,
        },
    )
    assert automation_res.status_code == 201, automation_res.text
    automation_id = automation_res.json()["automation"]["id"]

    list_res = client.get("/api/org-admin/forms")
    assert list_res.status_code == 200, list_res.text
    listed_form = next(item for item in list_res.json()["items"] if item["id"] == form_id)
    assert len(listed_form["whatsapp_automations"]) == 1
    assert listed_form["whatsapp_automations"][0]["id"] == automation_id
    assert listed_form["actions"]["connected_whatsapp_automations"][0]["template_name"] == "Conferma richiesta"

    detail_res = client.get(f"/api/org-admin/forms/{form_id}")
    assert detail_res.status_code == 200, detail_res.text
    detail_form = detail_res.json()["form"]
    assert detail_form["public_path"] == f"/forms/{org.slug}/{public_slug}"
    assert detail_form["whatsapp_automations"][0]["phone_field_key"] == "telefono"
    assert detail_form["actions"]["connected_whatsapp_automations"][0]["id"] == automation_id


def test_org_admin_form_fields_persist_multiple_builder_blocks_in_order(client, db):
    org, admin = _create_org_admin(db)
    _login_org_admin(client, db, admin.id)
    public_slug = f"sondaggio-builder-{uuid.uuid4().hex[:6]}"

    create_res = client.post(
        "/api/org-admin/forms",
        json={
            "title": "Sondaggio builder",
            "public_slug": public_slug,
            "form_type": "survey",
            "is_active": False,
            "visibility": "public",
        },
    )
    assert create_res.status_code == 201, create_res.text
    form_id = create_res.json()["form"]["id"]

    field_payloads = [
        {
            "field_type": "long_text",
            "field_key": "__ui_text__intro",
            "label": "Intro",
            "help_text": "Paragrafo modificato prima del save",
            "sort_order": 10,
        },
        {
            "field_type": "radio",
            "field_key": "__survey_rating__voto",
            "label": "Valutazione servizio",
            "help_text": "Lascia una valutazione|||META:{\"survey\":\"rating_1_5\"}",
            "options": "1, 2, 3, 4, 5",
            "sort_order": 20,
        },
        {
            "field_type": "short_text",
            "field_key": "commento_finale",
            "label": "Commento finale",
            "placeholder": "Scrivi qui",
            "is_required": True,
            "sort_order": 30,
        },
    ]
    for payload in field_payloads:
        field_res = client.post(f"/api/org-admin/forms/{form_id}/fields", json=payload)
        assert field_res.status_code == 201, field_res.text

    detail_res = client.get(f"/api/org-admin/forms/{form_id}")
    assert detail_res.status_code == 200, detail_res.text
    fields = detail_res.json()["form"]["fields"]
    assert [field["field_key"] for field in fields] == [
        "__ui_text__intro",
        "__survey_rating__voto",
        "commento_finale",
    ]
    assert fields[0]["help_text"] == "Paragrafo modificato prima del save"
    assert fields[1]["options"] == ["1", "2", "3", "4", "5"]
    assert fields[2]["is_required"] is True


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


def test_public_form_submit_sends_whatsapp_auto_reply_when_connected(client, db, monkeypatch):
    original_enabled = settings.ENABLE_WHATSAPP_EVOLUTION
    settings.ENABLE_WHATSAPP_EVOLUTION = True
    try:
        org, admin = _create_org_admin(db)
        _login_org_admin(client, db, admin.id)
        public_slug = f"richiesta-whatsapp-{uuid.uuid4().hex[:6]}"

        create_res = client.post(
            "/api/org-admin/forms",
            json={
                "title": "Richiesta prenotazione",
                "public_slug": public_slug,
                "is_active": True,
                "visibility": "public",
                "form_type": "booking",
                "booking_enabled": True,
                "whatsapp_auto_reply_enabled": True,
                "whatsapp_auto_reply_template": (
                    "Ciao {{nome_contatto}}, la tua richiesta per {{titolo_form}} del {{data_prenotazione}} "
                    "alle {{orario_prenotazione}} e stata registrata."
                ),
            },
        )
        assert create_res.status_code == 201, create_res.text
        form_id = create_res.json()["form"]["id"]

        for index, field in enumerate(
            [
                {"field_type": "short_text", "label": "Nome cliente", "field_key": "nome_cliente"},
                {"field_type": "phone", "label": "Telefono", "field_key": "telefono"},
                {"field_type": "date", "label": "Data", "field_key": "data_prenotazione"},
                {"field_type": "short_text", "label": "Orario", "field_key": "orario_prenotazione"},
            ]
        ):
            field_res = client.post(
                f"/api/org-admin/forms/{form_id}/fields",
                json={**field, "is_required": True, "sort_order": index * 10},
            )
            assert field_res.status_code == 201, field_res.text

        connection = get_or_create_connection(db, org)
        connection.status = "connected"
        connection.phone_number = "+393404244452"
        db.commit()

        sent_payloads: list[dict[str, str]] = []
        external_message_id = f"wamid-auto-{uuid.uuid4().hex[:10]}"

        class _FakeSendResult:
            def __init__(self, message_id: str):
                self.external_message_id = message_id
                self.status = "sent"
                self.raw = {"id": message_id, "status": "sent"}

        def fake_send_text(self, instance_name: str, *, number: str, text: str):
            sent_payloads.append(
                {
                    "instance_name": instance_name,
                    "number": number,
                    "text": text,
                }
            )
            return _FakeSendResult(external_message_id)

        monkeypatch.setattr(
            "app.services.whatsapp_automation.EvolutionLiteClient.send_text",
            fake_send_text,
        )

        submit_res = client.post(
            f"/api/forms/{org.slug}/{public_slug}/submit",
            json={
                "nome_cliente": "Giulia Bianchi",
                "telefono": "333 7654321",
                "data_prenotazione": "2026-03-25",
                "orario_prenotazione": "20:30",
            },
        )
        assert submit_res.status_code == 200, submit_res.text

        assert sent_payloads == [
            {
                "instance_name": f"assonam-org-{org.id}",
                "number": "+393337654321",
                "text": (
                    "Ciao Giulia Bianchi, la tua richiesta per Richiesta prenotazione del 2026-03-25 "
                    "alle 20:30 e stata registrata."
                ),
            }
        ]

        verification_db = SessionLocal()
        try:
            whatsapp_message = (
                verification_db.query(WhatsAppMessage)
                .filter(WhatsAppMessage.external_message_id == external_message_id)
                .first()
            )
            assert whatsapp_message is not None
            assert whatsapp_message.status == "sent"
            assert whatsapp_message.recipient_phone == "+393337654321"
            assert "Giulia Bianchi" in (whatsapp_message.text_body or "")
        finally:
            verification_db.close()
    finally:
        settings.ENABLE_WHATSAPP_EVOLUTION = original_enabled


def test_public_form_submit_sends_whatsapp_auto_reply_using_dynamic_phone_field_key(client, db, monkeypatch):
    original_enabled = settings.ENABLE_WHATSAPP_EVOLUTION
    settings.ENABLE_WHATSAPP_EVOLUTION = True
    try:
        org, admin = _create_org_admin(db)
        _login_org_admin(client, db, admin.id)
        public_slug = f"richiesta-whatsapp-dyn-{uuid.uuid4().hex[:6]}"

        create_res = client.post(
            "/api/org-admin/forms",
            json={
                "title": "Richiesta informazioni",
                "public_slug": public_slug,
                "is_active": True,
                "visibility": "public",
                "whatsapp_auto_reply_enabled": True,
                "whatsapp_auto_reply_template": "Ciao {{nome_contatto}}, ti scriviamo sul numero {{numero_whatsapp}}.",
            },
        )
        assert create_res.status_code == 201, create_res.text
        form_id = create_res.json()["form"]["id"]

        for index, field in enumerate(
            [
                {"field_type": "short_text", "label": "Nome", "field_key": "nome"},
                {"field_type": "phone", "label": "Telefono", "field_key": "telefono_3c52el"},
            ]
        ):
            field_res = client.post(
                f"/api/org-admin/forms/{form_id}/fields",
                json={**field, "is_required": True, "sort_order": index * 10},
            )
            assert field_res.status_code == 201, field_res.text

        connection = get_or_create_connection(db, org)
        connection.status = "connected"
        connection.phone_number = "+393404244452"
        db.commit()

        sent_payloads: list[dict[str, str]] = []

        class _FakeSendResult:
            def __init__(self, message_id: str):
                self.external_message_id = message_id
                self.status = "sent"
                self.raw = {"id": message_id, "status": "sent"}

        def fake_send_text(self, instance_name: str, *, number: str, text: str):
            sent_payloads.append(
                {
                    "instance_name": instance_name,
                    "number": number,
                    "text": text,
                }
            )
            return _FakeSendResult(f"wamid-auto-{uuid.uuid4().hex[:10]}")

        monkeypatch.setattr(
            "app.services.whatsapp_automation.EvolutionLiteClient.send_text",
            fake_send_text,
        )

        submit_res = client.post(
            f"/api/forms/{org.slug}/{public_slug}/submit",
            json={
                "nome": "Paola Verdi",
                "telefono_3c52el": "331 2223344",
            },
        )
        assert submit_res.status_code == 200, submit_res.text
        assert sent_payloads == [
            {
                "instance_name": f"assonam-org-{org.id}",
                "number": "+393312223344",
                "text": "Ciao Paola Verdi, ti scriviamo sul numero +393312223344.",
            }
        ]
    finally:
        settings.ENABLE_WHATSAPP_EVOLUTION = original_enabled


def test_public_form_submit_runs_whatsapp_automation_rules(client, db, monkeypatch):
    original_enabled = settings.ENABLE_WHATSAPP_EVOLUTION
    settings.ENABLE_WHATSAPP_EVOLUTION = True
    try:
        org, admin = _create_org_admin(db)
        _login_org_admin(client, db, admin.id)
        public_slug = f"richiesta-whatsapp-auto-{uuid.uuid4().hex[:6]}"

        create_res = client.post(
            "/api/org-admin/forms",
            json={
                "title": "Modulo test automazione",
                "public_slug": public_slug,
                "is_active": True,
                "visibility": "public",
                "whatsapp_auto_reply_enabled": False,
            },
        )
        assert create_res.status_code == 201, create_res.text
        form_id = create_res.json()["form"]["id"]

        for index, field in enumerate(
            [
                {"field_type": "short_text", "label": "Nome", "field_key": "nome"},
                {"field_type": "phone", "label": "Telefono", "field_key": "telefono_3c52el"},
            ]
        ):
            field_res = client.post(
                f"/api/org-admin/forms/{form_id}/fields",
                json={**field, "is_required": True, "sort_order": index * 10},
            )
            assert field_res.status_code == 201, field_res.text

        automation_res = client.post(
            "/api/org-admin/communications/whatsapp/automations",
            json={
                "name": "Conferma automatica",
                "form_id": form_id,
                "source_type": "public_form",
                "trigger_event": "request_received",
                "recipient_type": "submitter",
                "phone_source": "form_field",
                "phone_field_key": "telefono_3c52el",
                "template_name": "Conferma richiesta",
                "template_body": "Ciao {{nome_contatto}}, abbiamo ricevuto {{titolo_form}} sul numero {{numero_whatsapp}}.",
                "is_active": True,
            },
        )
        assert automation_res.status_code == 201, automation_res.text

        connection = get_or_create_connection(db, org)
        connection.status = "connected"
        connection.phone_number = "+393404244452"
        db.commit()

        sent_payloads: list[dict[str, str]] = []
        external_message_id = f"wamid-auto-{uuid.uuid4().hex[:10]}"

        class _FakeSendResult:
            def __init__(self, message_id: str):
                self.external_message_id = message_id
                self.status = "sent"
                self.raw = {"id": message_id, "status": "sent"}

        def fake_send_text(self, instance_name: str, *, number: str, text: str):
            sent_payloads.append(
                {
                    "instance_name": instance_name,
                    "number": number,
                    "text": text,
                }
            )
            return _FakeSendResult(external_message_id)

        monkeypatch.setattr(
            "app.services.whatsapp_automation.EvolutionLiteClient.send_text",
            fake_send_text,
        )

        submit_res = client.post(
            f"/api/forms/{org.slug}/{public_slug}/submit",
            json={
                "nome": "Luca Neri",
                "telefono_3c52el": "339 9988776",
            },
        )
        assert submit_res.status_code == 200, submit_res.text

        assert sent_payloads == [
            {
                "instance_name": f"assonam-org-{org.id}",
                "number": "+393399988776",
                "text": "Ciao Luca Neri, abbiamo ricevuto Modulo test automazione sul numero +393399988776.",
            }
        ]

        verification_db = SessionLocal()
        try:
            whatsapp_message = (
                verification_db.query(WhatsAppMessage)
                .filter(WhatsAppMessage.external_message_id == external_message_id)
                .first()
            )
            assert whatsapp_message is not None
            assert whatsapp_message.status == "sent"
            assert whatsapp_message.recipient_phone == "+393399988776"
        finally:
            verification_db.close()
    finally:
        settings.ENABLE_WHATSAPP_EVOLUTION = original_enabled


def test_booking_submit_sends_one_whatsapp_and_uses_org_event_details(client, db, monkeypatch):
    original_enabled = settings.ENABLE_WHATSAPP_EVOLUTION
    settings.ENABLE_WHATSAPP_EVOLUTION = True
    try:
        org, admin = _create_org_admin(db)
        _login_org_admin(client, db, admin.id)
        public_slug = f"evento-fisso-{uuid.uuid4().hex[:6]}"

        create_res = client.post(
            "/api/org-admin/forms",
            json={
                "title": "Prenotazione evento",
                "public_slug": public_slug,
                "is_active": True,
                "visibility": "public",
                "form_type": "booking",
                "booking_enabled": True,
                "booking_event_date": "2026-06-18",
                "booking_event_time": "21:15",
                "booking_event_details": "Ingresso principale, presentarsi 15 minuti prima.",
                "whatsapp_auto_reply_enabled": True,
                "whatsapp_auto_reply_template": "Legacy {{data_prenotazione}} {{orario_prenotazione}}",
            },
        )
        assert create_res.status_code == 201, create_res.text
        form = create_res.json()["form"]
        form_id = form["id"]
        assert form["booking_event_date"] == "2026-06-18"
        assert form["booking_event_time"] == "21:15"

        for index, field in enumerate(
            [
                {"field_type": "short_text", "label": "Nome", "field_key": "nome"},
                {"field_type": "phone", "label": "Telefono", "field_key": "telefono"},
                {"field_type": "date", "label": "Data scelta", "field_key": "data_prenotazione"},
                {"field_type": "short_text", "label": "Orario scelto", "field_key": "orario_prenotazione"},
            ]
        ):
            field_res = client.post(
                f"/api/org-admin/forms/{form_id}/fields",
                json={**field, "is_required": True, "sort_order": index * 10},
            )
            assert field_res.status_code == 201, field_res.text

        automation_res = client.post(
            "/api/org-admin/communications/whatsapp/automations",
            json={
                "name": "Prenotazione ricevuta",
                "form_id": form_id,
                "source_type": "public_form",
                "trigger_event": "booking_created",
                "recipient_type": "submitter",
                "phone_source": "form_field",
                "phone_field_key": "telefono",
                "template_name": "Prenotazione ricevuta",
                "template_body": (
                    "Ciao {{nome_contatto}}, prenotazione ricevuta per {{slot_prenotazione}}. "
                    "{{dettagli_evento}}"
                ),
                "is_active": True,
            },
        )
        assert automation_res.status_code == 201, automation_res.text

        connection = get_or_create_connection(db, org)
        connection.status = "connected"
        connection.phone_number = "+393404244452"
        db.commit()

        sent_payloads: list[dict[str, str]] = []

        class _FakeSendResult:
            def __init__(self, message_id: str):
                self.external_message_id = message_id
                self.status = "sent"
                self.raw = {"id": message_id, "status": "sent"}

        def fake_send_text(self, instance_name: str, *, number: str, text: str):
            sent_payloads.append(
                {
                    "instance_name": instance_name,
                    "number": number,
                    "text": text,
                }
            )
            return _FakeSendResult(f"wamid-booking-{uuid.uuid4().hex[:10]}")

        monkeypatch.setattr(
            "app.services.whatsapp_automation.EvolutionLiteClient.send_text",
            fake_send_text,
        )

        submit_res = client.post(
            f"/api/forms/{org.slug}/{public_slug}/submit",
            json={
                "nome": "Sara Rossi",
                "telefono": "333 1112233",
                "data_prenotazione": "2026-01-01",
                "orario_prenotazione": "10:00",
            },
        )
        assert submit_res.status_code == 200, submit_res.text
        assert sent_payloads == [
            {
                "instance_name": f"assonam-org-{org.id}",
                "number": "+393331112233",
                "text": (
                    "Ciao Sara Rossi, prenotazione ricevuta per il 2026-06-18 alle 21:15. "
                    "Ingresso principale, presentarsi 15 minuti prima."
                ),
            }
        ]

        booking = db.query(Booking).filter(Booking.form_id == form_id).one()
        assert booking.booking_date.isoformat() == "2026-06-18"
        assert booking.booking_time == "21:15"
        assert "Ingresso principale" in (booking.notes or "")
    finally:
        settings.ENABLE_WHATSAPP_EVOLUTION = original_enabled


def test_org_admin_booking_event_series_accepts_frontend_payload_and_serializes_aliases(client, db):
    org, admin = _create_org_admin(db)
    _login_org_admin(client, db, admin.id)

    create_res = client.post(
        "/api/org-admin/booking-event-series",
        json={
            "name": "Cartomante",
            "description": "Serata del lunedi",
            "recurrence_type": "weekly",
            "weekday": 0,
            "is_active": True,
            "time_slots": ["19:30", "20:00", "20:00"],
        },
    )
    assert create_res.status_code == 201, create_res.text
    series = create_res.json()["series"]
    assert series["association_id"] == org.id
    assert series["title"] == "Cartomante"
    assert series["name"] == "Cartomante"
    assert series["event_date"] is None
    assert series["specific_date"] is None
    assert [slot["time"] for slot in series["time_slots"]] == ["19:30", "20:00"]
    assert [slot["start_time"] for slot in series["time_slots"]] == ["19:30", "20:00"]

    list_res = client.get("/api/org-admin/booking-event-series")
    assert list_res.status_code == 200, list_res.text
    item = list_res.json()["items"][0]
    assert item["name"] == "Cartomante"
    assert item["time_slots"][0]["event_series_id"] == series["id"]
    assert item["time_slots"][0]["time"] == "19:30"


def test_org_admin_booking_event_series_accepts_canonical_payload(client, db):
    org, admin = _create_org_admin(db)
    _login_org_admin(client, db, admin.id)

    create_res = client.post(
        "/api/org-admin/booking-event-series",
        json={
            "title": "Cena speciale",
            "description": None,
            "recurrence_type": "date",
            "event_date": "2026-06-19",
            "is_active": True,
            "time_slots": ["21:00"],
        },
    )
    assert create_res.status_code == 201, create_res.text
    series = create_res.json()["series"]
    assert series["title"] == "Cena speciale"
    assert series["name"] == "Cena speciale"
    assert series["event_date"] == "2026-06-19"
    assert series["specific_date"] == "2026-06-19"
    assert series["time_slots"][0]["time"] == "21:00"

    public_slug = f"prenotazione-dinamica-{uuid.uuid4().hex[:6]}"
    form_res = client.post(
        "/api/org-admin/forms",
        json={
            "title": "Prenotazione dinamica",
            "public_slug": public_slug,
            "is_active": True,
            "visibility": "public",
            "form_type": "booking",
            "booking_enabled": True,
            "booking_dynamic_events_enabled": True,
        },
    )
    assert form_res.status_code == 201, form_res.text

    public_events_res = client.get(
        f"/api/forms/{org.slug}/{public_slug}/booking-events?date=2026-06-19"
    )
    assert public_events_res.status_code == 200, public_events_res.text
    public_item = public_events_res.json()["items"][0]
    assert public_item["name"] == "Cena speciale"
    assert public_item["specific_date"] == "2026-06-19"
    assert public_item["time_slots"][0]["time"] == "21:00"


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
        notification = (
            verification_db.query(OrgAdminNotification)
            .filter(
                OrgAdminNotification.admin_user_id == admin.id,
                OrgAdminNotification.org_id == org.id,
                OrgAdminNotification.type == "booking_request",
            )
            .one()
        )
        assert "Giulia Bianchi" in notification.title
        assert notification.href == f"/org-admin/prenotazioni?date=2026-03-25&bookingId={booking.id}"
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
    assert patch_res.json()["booking"]["request_status"] == "confirmed"
    assert patch_res.json()["request_decision"]["status"] == "confirmed"

    submissions_res = client.get(f"/api/org-admin/forms/{form_id}/submissions")
    assert submissions_res.status_code == 200, submissions_res.text
    assert submissions_res.json()["items"][0]["booking"]["status"] == "confirmed"
    assert submissions_res.json()["items"][0]["status"] == "confirmed"


def test_org_admin_can_review_form_submission_and_dispatch_whatsapp(client, db, monkeypatch):
    original_enabled = settings.ENABLE_WHATSAPP_EVOLUTION
    settings.ENABLE_WHATSAPP_EVOLUTION = True
    try:
        org, admin = _create_org_admin(db)
        _login_org_admin(client, db, admin.id)
        public_slug = f"review-richiesta-{uuid.uuid4().hex[:6]}"

        create_res = client.post(
            "/api/org-admin/forms",
            json={
                "title": "Prenotazione review",
                "public_slug": public_slug,
                "is_active": True,
                "visibility": "public",
                "form_type": "booking",
                "booking_enabled": True,
                "whatsapp_confirmation_template": "Conferma per {{titolo_form}} il {{data_prenotazione}} alle {{orario_prenotazione}}.",
                "whatsapp_rejection_template": "Rigetto per {{titolo_form}}. {{motivo_rigetto}}",
                "booking_field_mapping": {
                    "customer_name": "nome_cliente",
                    "customer_phone": "telefono",
                    "booking_date": "data_prenotazione",
                    "booking_time": "orario_prenotazione",
                },
            },
        )
        assert create_res.status_code == 201, create_res.text
        form_id = create_res.json()["form"]["id"]

        for index, field in enumerate(
            [
                {"field_type": "short_text", "label": "Nome cliente", "field_key": "nome_cliente"},
                {"field_type": "phone", "label": "Telefono", "field_key": "telefono"},
                {"field_type": "date", "label": "Data", "field_key": "data_prenotazione"},
                {"field_type": "short_text", "label": "Orario", "field_key": "orario_prenotazione"},
            ]
        ):
            field_res = client.post(
                f"/api/org-admin/forms/{form_id}/fields",
                json={**field, "is_required": True, "sort_order": index * 10},
            )
            assert field_res.status_code == 201, field_res.text

        for trigger_event, template_name, template_body in [
            (
                "booking_confirmed",
                "Conferma booking",
                "Conferma per {{titolo_form}} il {{data_prenotazione}} alle {{orario_prenotazione}}.",
            ),
            (
                "booking_rejected",
                "Rigetto booking",
                "Rigetto per {{titolo_form}}. {{motivo_rigetto}}",
            ),
        ]:
            automation_res = client.post(
                "/api/org-admin/communications/whatsapp/automations",
                json={
                    "name": template_name,
                    "form_id": form_id,
                    "source_type": "public_form",
                    "trigger_event": trigger_event,
                    "recipient_type": "submitter",
                    "phone_source": "form_field",
                    "phone_field_key": "telefono",
                    "template_name": template_name,
                    "template_body": template_body,
                    "is_active": True,
                },
            )
            assert automation_res.status_code == 201, automation_res.text

        connection = get_or_create_connection(db, org)
        connection.status = "connected"
        connection.phone_number = "+393404244452"
        db.commit()

        sent_payloads: list[dict[str, str]] = []

        class _FakeSendResult:
            def __init__(self, message_id: str):
                self.external_message_id = message_id
                self.status = "sent"
                self.raw = {"id": message_id, "status": "sent"}

        def fake_send_text(self, instance_name: str, *, number: str, text: str):
            sent_payloads.append({"instance_name": instance_name, "number": number, "text": text})
            return _FakeSendResult(f"wamid-review-{uuid.uuid4().hex[:10]}")

        monkeypatch.setattr(
            "app.services.whatsapp_automation.EvolutionLiteClient.send_text",
            fake_send_text,
        )

        submit_res = client.post(
            f"/api/forms/{org.slug}/{public_slug}/submit",
            json={
                "nome_cliente": "Elena Neri",
                "telefono": "333 4567890",
                "data_prenotazione": "2026-03-29",
                "orario_prenotazione": "20:15",
            },
        )
        assert submit_res.status_code == 200, submit_res.text
        submission_id = submit_res.json()["submission"]["id"]
        booking_id = submit_res.json()["booking"]["id"]
        assert submit_res.json()["submission"]["status"] == "pending"

        confirm_res = client.patch(
            f"/api/org-admin/forms/{form_id}/submissions/{submission_id}/status",
            json={"status": "confirmed"},
        )
        assert confirm_res.status_code == 200, confirm_res.text
        assert confirm_res.json()["submission"]["status"] == "confirmed"
        assert confirm_res.json()["submission"]["reviewed_by"]["id"] == admin.id
        assert confirm_res.json()["booking"]["id"] == booking_id
        assert confirm_res.json()["booking"]["status"] == "confirmed"
        assert confirm_res.json()["booking"]["request_status"] == "confirmed"
        assert confirm_res.json()["whatsapp_result"]["sent"] is True

        repeat_res = client.patch(
            f"/api/org-admin/forms/{form_id}/submissions/{submission_id}/status",
            json={"status": "confirmed"},
        )
        assert repeat_res.status_code == 200, repeat_res.text
        assert repeat_res.json()["whatsapp_result"]["sent"] is False
        assert repeat_res.json()["whatsapp_result"]["reason"] == "unchanged"
        assert len(sent_payloads) == 1
        assert sent_payloads[0]["instance_name"] == f"assonam-org-{org.id}"
        assert sent_payloads[0]["number"] == "+393334567890"
        assert "Conferma per Prenotazione review" in sent_payloads[0]["text"]

        pending_res = client.patch(
            f"/api/org-admin/forms/{form_id}/submissions/{submission_id}/status",
            json={"status": "pending"},
        )
        assert pending_res.status_code == 200, pending_res.text
        assert pending_res.json()["submission"]["status"] == "pending"
        assert pending_res.json()["whatsapp_result"]["sent"] is False
        assert pending_res.json()["whatsapp_result"]["reason"] == "unchanged"
        assert len(sent_payloads) == 1

        reject_res = client.patch(
            f"/api/org-admin/forms/{form_id}/submissions/{submission_id}/status",
            json={"status": "rejected", "reason": "Posti esauriti"},
        )
        assert reject_res.status_code == 200, reject_res.text
        assert reject_res.json()["submission"]["status"] == "rejected"
        assert reject_res.json()["submission"]["review_reason"] == "Posti esauriti"
        assert reject_res.json()["booking"]["status"] == "cancelled"
        assert reject_res.json()["booking"]["request_status"] == "rejected"
        assert reject_res.json()["whatsapp_result"]["sent"] is True
        assert len(sent_payloads) == 2
        assert "Posti esauriti" in sent_payloads[1]["text"]
    finally:
        settings.ENABLE_WHATSAPP_EVOLUTION = original_enabled


def test_org_admin_review_whatsapp_uses_automation_templates_and_payload_fallbacks(client, db, monkeypatch):
    original_enabled = settings.ENABLE_WHATSAPP_EVOLUTION
    settings.ENABLE_WHATSAPP_EVOLUTION = True
    try:
        org, admin = _create_org_admin(db)
        _login_org_admin(client, db, admin.id)
        public_slug = f"review-fallback-{uuid.uuid4().hex[:6]}"

        create_res = client.post(
            "/api/org-admin/forms",
            json={
                "title": "Prenotazione cena",
                "public_slug": public_slug,
                "is_active": True,
                "visibility": "public",
                "form_type": "booking",
                "booking_enabled": True,
                "whatsapp_confirmation_template": "Default conferma: {{riepilogo_prenotazione}}.",
                "whatsapp_rejection_template": "Default rigetto: {{motivo_rigetto}}. {{riepilogo_prenotazione}}.",
                "booking_field_mapping": {
                    "customer_name": "cliente_principale",
                    "customer_phone": "telefono_cliente",
                },
            },
        )
        assert create_res.status_code == 201, create_res.text
        form_id = create_res.json()["form"]["id"]

        for index, field in enumerate(
            [
                {"field_type": "short_text", "label": "Cliente", "field_key": "cliente_principale"},
                {"field_type": "phone", "label": "Telefono", "field_key": "telefono_cliente"},
                {"field_type": "date", "label": "Giorno prenotazione", "field_key": "giorno_evento"},
                {"field_type": "short_text", "label": "Fascia oraria", "field_key": "fascia_oraria"},
                {"field_type": "number", "label": "Coperti previsti", "field_key": "coperti_previsti"},
            ]
        ):
            field_res = client.post(
                f"/api/org-admin/forms/{form_id}/fields",
                json={**field, "is_required": True, "sort_order": index * 10},
            )
            assert field_res.status_code == 201, field_res.text

        for trigger_event, template_name, template_body in [
            (
                "booking_confirmed",
                "Conferma fallback",
                "Prenotazione confermata: {{riepilogo_prenotazione}}.",
            ),
            (
                "booking_rejected",
                "Rigetto fallback",
                "Prenotazione rigettata: {{motivo_rigetto}} {{riepilogo_prenotazione}}.",
            ),
        ]:
            automation_res = client.post(
                "/api/org-admin/communications/whatsapp/automations",
                json={
                    "name": template_name,
                    "form_id": form_id,
                    "source_type": "public_form",
                    "trigger_event": trigger_event,
                    "recipient_type": "submitter",
                    "phone_source": "form_field",
                    "phone_field_key": "telefono_cliente",
                    "template_name": template_name,
                    "template_body": template_body,
                    "is_active": True,
                },
            )
            assert automation_res.status_code == 201, automation_res.text

        connection = get_or_create_connection(db, org)
        connection.status = "connected"
        connection.phone_number = "+393404244452"
        db.commit()

        sent_payloads: list[dict[str, str]] = []

        class _FakeSendResult:
            def __init__(self, message_id: str):
                self.external_message_id = message_id
                self.status = "sent"
                self.raw = {"id": message_id, "status": "sent"}

        def fake_send_text(self, instance_name: str, *, number: str, text: str):
            sent_payloads.append({"instance_name": instance_name, "number": number, "text": text})
            return _FakeSendResult(f"wamid-review-fallback-{uuid.uuid4().hex[:10]}")

        monkeypatch.setattr(
            "app.services.whatsapp_automation.EvolutionLiteClient.send_text",
            fake_send_text,
        )

        submit_res = client.post(
            f"/api/forms/{org.slug}/{public_slug}/submit",
            json={
                "cliente_principale": "Martina Sala",
                "telefono_cliente": "339 2223344",
                "giorno_evento": "2026-04-11",
                "fascia_oraria": "21:00",
                "coperti_previsti": 5,
            },
        )
        assert submit_res.status_code == 200, submit_res.text
        submission_id = submit_res.json()["submission"]["id"]

        confirm_res = client.patch(
            f"/api/org-admin/forms/{form_id}/submissions/{submission_id}/status",
            json={
                "status": "confirmed",
                "whatsapp_message": (
                    "Prenotazione confermata per {{nome_associazione}} {{slot_prenotazione}} "
                    "per {{persone_prenotazione}}."
                ),
            },
        )
        assert confirm_res.status_code == 200, confirm_res.text
        assert confirm_res.json()["whatsapp_result"]["sent"] is True
        assert confirm_res.json()["whatsapp_result"]["trigger_event"] == "booking_confirmed"
        assert confirm_res.json()["whatsapp_result"]["sent_count"] == 1
        assert len(sent_payloads) == 1
        assert sent_payloads[0]["number"] == "+393392223344"
        assert "il 2026-04-11 alle 21:00" in sent_payloads[0]["text"]
        assert "per 5 persone" in sent_payloads[0]["text"]
        assert "Prenotazione confermata" in sent_payloads[0]["text"]

        pending_res = client.patch(
            f"/api/org-admin/forms/{form_id}/submissions/{submission_id}/status",
            json={"status": "pending"},
        )
        assert pending_res.status_code == 200, pending_res.text

        reject_res = client.patch(
            f"/api/org-admin/forms/{form_id}/submissions/{submission_id}/status",
            json={"status": "rejected", "reason": "Posti terminati"},
        )
        assert reject_res.status_code == 200, reject_res.text
        assert reject_res.json()["whatsapp_result"]["sent"] is True
        assert len(sent_payloads) == 2
        assert "Posti terminati" in sent_payloads[1]["text"]
        assert "il 2026-04-11 alle 21:00 per 5 persone" in sent_payloads[1]["text"]
    finally:
        settings.ENABLE_WHATSAPP_EVOLUTION = original_enabled


def test_legacy_form_submission_status_new_is_normalized_to_pending(client, db):
    org, admin = _create_org_admin(db)
    _login_org_admin(client, db, admin.id)
    public_slug = f"legacy-status-{uuid.uuid4().hex[:6]}"

    create_res = client.post(
        "/api/org-admin/forms",
        json={
            "title": "Legacy status form",
            "public_slug": public_slug,
            "is_active": True,
            "visibility": "public",
        },
    )
    assert create_res.status_code == 201, create_res.text
    form_id = create_res.json()["form"]["id"]

    field_res = client.post(
        f"/api/org-admin/forms/{form_id}/fields",
        json={
            "field_type": "short_text",
            "label": "Nome",
            "field_key": "nome",
            "is_required": True,
            "sort_order": 0,
        },
    )
    assert field_res.status_code == 201, field_res.text

    submit_res = client.post(
        f"/api/forms/{org.slug}/{public_slug}/submit",
        json={"nome": "Mario Legacy"},
    )
    assert submit_res.status_code == 200, submit_res.text
    submission_id = submit_res.json()["submission"]["id"]

    verification_db = SessionLocal()
    try:
        submission = verification_db.query(FormSubmission).filter(FormSubmission.id == submission_id).first()
        assert submission is not None
        submission.status = "new"
        verification_db.add(submission)
        verification_db.commit()
    finally:
        verification_db.close()

    list_res = client.get(f"/api/org-admin/forms/{form_id}/submissions")
    assert list_res.status_code == 200, list_res.text
    assert list_res.json()["items"][0]["status"] == "pending"

    detail_res = client.get(f"/api/org-admin/forms/{form_id}/submissions/{submission_id}")
    assert detail_res.status_code == 200, detail_res.text
    assert detail_res.json()["submission"]["status"] == "pending"


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

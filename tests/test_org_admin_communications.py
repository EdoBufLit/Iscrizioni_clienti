from __future__ import annotations

from datetime import datetime, timedelta
import base64
import uuid

import pytest
from sqlalchemy import func

from app.config import settings
from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    Booking,
    BookingEvent,
    EmailCampaign,
    EmailCampaignRecipient,
    EmailOutbox,
    Form,
    Member,
    OrgAdminToken,
    Organization,
    WhatsAppConnection,
)
from app.services.booking_whatsapp_reminders import (
    BOOKING_REMINDER_EVENT,
    SURVEY_DISPATCH_EVENT,
    process_booking_whatsapp_reminders,
    process_post_event_survey_whatsapp,
)
from app.services import communications_email_usage as email_usage_service
from app.services.email_campaigns import process_scheduled_campaigns
from app.services.communications_email_usage import (
    MONTHLY_OVERAGE_REPORT_EMAIL_TYPE,
    enqueue_monthly_overage_report,
)
from app.services.whatsapp_evolution import EvolutionSendTextResult
from app.utils import clear_captured_emails, get_captured_emails, hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _login_org_admin(client, db, admin_id: int) -> None:
    token_str = f"org-communications-{admin_id}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)


def _login_super_admin(client) -> None:
    client.post("/api/super-admin/auth/logout")
    response = client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    )
    assert response.status_code == 200, response.text


def _create_org_admin(db, *, communications_enabled: bool) -> tuple[Organization, AdminUser]:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Golden Age Club {suffix}",
        slug=f"communications-{suffix}",
        is_active=True,
        communications_enabled=communications_enabled,
        sender_email_local_part="golden-age-club",
        email_from_name_override="Golden Age Club",
        reply_to_email="segreteria@goldenage.it",
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    admin = AdminUser(
        email=f"communications-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return org, admin


def _create_member(
    db,
    *,
    org_id: int,
    email: str,
    status: str,
    card_year: int | None,
    card_no_seed: int,
) -> Member:
    member = Member(
        org_id=org_id,
        first_name="Mario",
        last_name="Rossi",
        email=email,
        status=status,
        card_no=card_no_seed,
        card_year=card_year,
        joined_at=datetime.utcnow(),
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def _create_sent_campaign_recipients(
    db,
    *,
    org_id: int,
    count: int,
    sent_at: datetime,
    subject: str = "Report usage",
) -> EmailCampaign:
    campaign = EmailCampaign(
        association_id=org_id,
        subject=subject,
        audience_type="active_members",
        status="sent",
        sent_at=sent_at,
    )
    db.add(campaign)
    db.flush()
    for index in range(count):
        db.add(
            EmailCampaignRecipient(
                campaign_id=campaign.id,
                association_id=org_id,
                recipient_email=f"usage-{campaign.id}-{index}@example.com",
                delivery_status="sent",
                sent_at=sent_at,
            )
        )
    db.commit()
    db.refresh(campaign)
    return campaign


def test_org_admin_communications_settings_and_test_email(client, db):
    original_mode = settings.EMAIL_MODE
    original_domain = settings.MAIL_FROM_DOMAIN
    settings.EMAIL_MODE = "test"
    settings.MAIL_FROM_DOMAIN = "notifiche.assonam.it"
    clear_captured_emails()
    try:
        org, admin = _create_org_admin(db, communications_enabled=True)
        _login_org_admin(client, db, admin.id)

        get_res = client.get("/api/org-admin/communications/settings")
        assert get_res.status_code == 200, get_res.text
        assert get_res.json()["association_email_sender"]["selected_mode"] == "association"

        put_res = client.put(
            "/api/org-admin/communications/settings",
            json={
                "sender_email_local_part": "Golden   Age Club!!!",
                "email_from_name_override": "Golden Age Club",
                "reply_to_email": "segreteria@goldenage.it",
            },
        )
        assert put_res.status_code == 200, put_res.text
        put_payload = put_res.json()
        assert put_payload["settings"]["sender_email_local_part"] == "golden-age-club"
        assert (
            put_payload["settings"]["association_email_sender"]["from_header"]
            == "Golden Age Club <golden-age-club@notifiche.assonam.it>"
        )

        test_res = client.post(
            "/api/org-admin/communications/test-email",
            json={"to_email": "destinatario@example.com"},
        )
        assert test_res.status_code == 200, test_res.text
        assert test_res.json()["provider_message_id"]
        assert test_res.json()["sender"]["selected_mode"] == "association"
        assert test_res.json()["message"] == "Email di test inviata correttamente."

        captured = get_captured_emails()
        assert len(captured) == 1
        assert captured[0]["to"] == "destinatario@example.com"
        assert captured[0]["transport"] == "mailtrap_api"
        assert captured[0]["selected_mode"] == "association"
        assert captured[0]["from_header"] == "Golden Age Club <golden-age-club@notifiche.assonam.it>"
        assert captured[0]["reply_to"] == "segreteria@goldenage.it"
    finally:
        settings.EMAIL_MODE = original_mode
        settings.MAIL_FROM_DOMAIN = original_domain
        clear_captured_emails()


def test_org_admin_communications_usage_counts_current_month_overage(client, db, monkeypatch):
    monkeypatch.setattr(email_usage_service, "COMMUNICATIONS_MONTHLY_EMAIL_LIMIT", 2)
    org, admin = _create_org_admin(db, communications_enabled=True)
    _create_sent_campaign_recipients(
        db,
        org_id=org.id,
        count=3,
        sent_at=datetime(2026, 5, 3, 10, 0, 0),
    )
    _create_sent_campaign_recipients(
        db,
        org_id=org.id,
        count=4,
        sent_at=datetime(2026, 4, 30, 10, 0, 0),
    )
    _login_org_admin(client, db, admin.id)

    res = client.get("/api/org-admin/communications/usage")
    assert res.status_code == 200, res.text
    payload = res.json()
    assert payload["included_limit"] == 2
    assert payload["used"] == 3
    assert payload["extra"] == 1
    assert payload["extra_cost_cents"] == 1


def test_monthly_communications_overage_report_includes_zero_extra_and_dedupes(
    client,
    db,
    drain_email_outbox,
    monkeypatch,
):
    original_mode = settings.EMAIL_MODE
    original_super_admin_email = settings.SUPER_ADMIN_EMAIL
    settings.EMAIL_MODE = "test"
    settings.SUPER_ADMIN_EMAIL = "super.personale@example.com"
    monkeypatch.setattr(email_usage_service, "COMMUNICATIONS_MONTHLY_EMAIL_LIMIT", 2)
    clear_captured_emails()
    try:
        org_with_extra, _ = _create_org_admin(db, communications_enabled=True)
        org_zero_extra, _ = _create_org_admin(db, communications_enabled=True)
        org_disabled, _ = _create_org_admin(db, communications_enabled=False)
        _create_sent_campaign_recipients(
            db,
            org_id=org_with_extra.id,
            count=3,
            sent_at=datetime(2026, 4, 20, 12, 0, 0),
        )
        _create_sent_campaign_recipients(
            db,
            org_id=org_disabled.id,
            count=10,
            sent_at=datetime(2026, 4, 20, 12, 0, 0),
        )

        first = enqueue_monthly_overage_report(db, now=datetime(2026, 5, 1, 8, 0, 0))
        second = enqueue_monthly_overage_report(db, now=datetime(2026, 5, 2, 8, 0, 0))
        assert first["enqueued"] is True
        assert second["enqueued"] is False

        outbox_rows = (
            db.query(EmailOutbox)
            .filter(EmailOutbox.email_type == MONTHLY_OVERAGE_REPORT_EMAIL_TYPE)
            .all()
        )
        assert len(outbox_rows) == 1
        assert outbox_rows[0].to_email == "super.personale@example.com"
        report = outbox_rows[0].payload_json["meta"]["report"]
        names = {row["org_name"]: row for row in report["rows"]}
        assert org_with_extra.name in names
        assert org_zero_extra.name in names
        assert org_disabled.name not in names
        assert names[org_with_extra.name]["extra"] == 1
        assert names[org_zero_extra.name]["extra"] == 0

        drain_email_outbox()
        captured = get_captured_emails()
        assert len(captured) == 1
        assert captured[0]["to"] == "super.personale@example.com"
        assert org_zero_extra.name in captured[0]["text_body"]
    finally:
        settings.EMAIL_MODE = original_mode
        settings.SUPER_ADMIN_EMAIL = original_super_admin_email
        clear_captured_emails()


def test_org_admin_template_library_seed_duplicate_preview_and_archive(client, db):
    org, admin = _create_org_admin(db, communications_enabled=True)
    _login_org_admin(client, db, admin.id)

    list_res = client.get("/api/org-admin/communications/templates?scope=system")
    assert list_res.status_code == 200, list_res.text
    system_items = list_res.json()["items"]
    assert len(system_items) >= 8
    welcome_template = next(item for item in system_items if item["name"] == "Benvenuto nuovo socio")

    variables_res = client.get("/api/org-admin/communications/templates/variables")
    assert variables_res.status_code == 200, variables_res.text
    placeholders = {item["placeholder"] for item in variables_res.json()["items"]}
    assert "{{nome_socio}}" in placeholders
    assert "{{link_rinnovo}}" in placeholders
    assert "{{link_form_collegato}}" in placeholders
    assert "{{telefono_socio}}" in placeholders
    assert "{{telefono_associazione}}" in placeholders
    assert "{{data_oggi}}" in placeholders

    preview_res = client.post(
        "/api/org-admin/communications/templates/preview",
        json={"template_id": welcome_template["id"]},
    )
    assert preview_res.status_code == 200, preview_res.text
    preview_payload = preview_res.json()
    assert "Mario Rossi" in preview_payload["preview"]["subject"]
    assert "{{nome_socio}}" not in (preview_payload["preview"]["body_text"] or "")

    duplicate_res = client.post(
        f"/api/org-admin/communications/templates/{welcome_template['id']}/duplicate",
        json={"name": "Benvenuto custom"},
    )
    assert duplicate_res.status_code == 201, duplicate_res.text
    duplicated = duplicate_res.json()["template"]
    assert duplicated["is_system"] is False
    assert duplicated["association_id"] == org.id

    update_res = client.put(
        f"/api/org-admin/communications/templates/{duplicated['id']}",
        json={
            "name": "Benvenuto custom aggiornato",
            "category": "onboarding",
            "subject": "Ciao {{nome_socio}}",
            "body_text": "Benvenuto in {{nome_associazione}}",
            "channel": "email",
        },
    )
    assert update_res.status_code == 200, update_res.text
    assert update_res.json()["template"]["name"] == "Benvenuto custom aggiornato"

    archive_res = client.post(f"/api/org-admin/communications/templates/{duplicated['id']}/archive")
    assert archive_res.status_code == 200, archive_res.text
    assert archive_res.json()["template"]["is_active"] is False


def test_org_admin_builder_template_assets_and_campaign_from_template(client, db):
    org, admin = _create_org_admin(db, communications_enabled=True)
    _login_org_admin(client, db, admin.id)
    png_bytes = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0n0AAAAASUVORK5CYII="
    )

    create_res = client.post(
        "/api/org-admin/communications/templates",
        json={
            "name": "Reminder rinnovo builder",
            "template_type": "renewal_reminder",
            "category": "renewal_reminder",
            "subject": "Rinnova {{nome_socio}}",
            "compiled_html": "<div><strong>Ciao {{nome_socio}}</strong><p>Vai su {{link_iscrizione}}</p></div>",
            "mjml_source": "<mjml><mj-body><mj-section><mj-column><mj-text>Ciao {{nome_socio}}</mj-text></mj-column></mj-section></mj-body></mjml>",
            "grapesjs_project_json": {"pages": [{"id": "main"}]},
            "editor_status": "ready",
            "linked_form_id": None,
        },
    )
    assert create_res.status_code == 201, create_res.text
    created_template = create_res.json()["template"]
    assert created_template["template_type"] == "renewal_reminder"
    assert created_template["editor_status"] == "ready"
    assert created_template["compiled_html"]
    assert created_template["mjml_source"]
    assert created_template["grapesjs_project_json"] == {"pages": [{"id": "main"}]}

    detail_res = client.get(f"/api/org-admin/communications/templates/{created_template['id']}")
    assert detail_res.status_code == 200, detail_res.text
    assert detail_res.json()["template"]["compiled_html"]

    upload_res = client.post(
        "/api/org-admin/communications/assets",
        data={"name": "Logo rinnovo"},
        files={"file": ("logo.png", png_bytes, "image/png")},
    )
    assert upload_res.status_code == 201, upload_res.text
    asset = upload_res.json()["asset"]
    assert asset["association_id"] == org.id
    assert asset["name"] == "Logo rinnovo"
    assert asset["public_url"].startswith("/uploads/")

    assets_res = client.get("/api/org-admin/communications/assets")
    assert assets_res.status_code == 200, assets_res.text
    assert any(item["id"] == asset["id"] for item in assets_res.json()["items"])

    campaign_res = client.post(
        "/api/org-admin/communications/campaigns/from-template",
        json={
            "template_id": created_template["id"],
            "audience_type": "active_members",
        },
    )
    assert campaign_res.status_code == 201, campaign_res.text
    campaign = campaign_res.json()["campaign"]
    assert campaign["source_template_id"] == created_template["id"]
    assert campaign["compiled_html"]
    assert campaign["mjml_source"]
    assert campaign["editor_status"] == "draft"

    delete_asset_res = client.delete(f"/api/org-admin/communications/assets/{asset['id']}")
    assert delete_asset_res.status_code == 200, delete_asset_res.text
    assert delete_asset_res.json()["deleted_asset_id"] == asset["id"]


def test_org_admin_whatsapp_automations_create_list_and_update(client, db):
    org, admin = _create_org_admin(db, communications_enabled=True)
    _login_org_admin(client, db, admin.id)
    public_slug = f"prenotazione-evento-{uuid.uuid4().hex[:6]}"

    create_form_res = client.post(
        "/api/org-admin/forms",
        json={
            "title": "Prenotazione evento",
            "public_slug": public_slug,
            "is_active": True,
            "visibility": "public",
        },
    )
    assert create_form_res.status_code == 201, create_form_res.text
    form_id = create_form_res.json()["form"]["id"]

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

    create_res = client.post(
        "/api/org-admin/communications/whatsapp/automations",
        json={
            "name": "Conferma WhatsApp evento",
            "form_id": form_id,
            "source_type": "public_form",
            "trigger_event": "form_submitted",
            "recipient_type": "submitter",
            "phone_source": "form_field",
            "phone_field_key": "telefono",
            "template_name": "Conferma prenotazione evento",
            "template_body": "Ciao {{nome_socio}}, abbiamo ricevuto la tua richiesta.",
            "is_active": True,
        },
    )
    assert create_res.status_code == 201, create_res.text
    automation = create_res.json()["automation"]
    assert automation["name"] == "Conferma WhatsApp evento"
    assert automation["form_id"] == form_id
    assert automation["phone_field_key"] == "telefono"
    assert automation["form"]["title"] == "Prenotazione evento"
    assert automation["form"]["public_path"] == f"/forms/{org.slug}/{public_slug}"

    list_res = client.get(f"/api/org-admin/communications/whatsapp/automations?form_id={form_id}")
    assert list_res.status_code == 200, list_res.text
    list_payload = list_res.json()
    assert list_payload["total"] == 1
    assert list_payload["items"][0]["id"] == automation["id"]
    assert "form_field" in list_payload["phone_source_options"]
    assert "submitter" in list_payload["recipient_options"]

    update_res = client.put(
        f"/api/org-admin/communications/whatsapp/automations/{automation['id']}",
        json={
            "name": "Reminder WhatsApp evento",
            "form_id": form_id,
            "source_type": "public_form",
            "trigger_event": "booking_created",
            "recipient_type": "custom",
            "phone_source": "custom",
            "custom_phone": "+393331234567",
            "template_name": "Reminder prenotazione evento",
            "template_body": "Ti aspettiamo all'evento.",
            "is_active": False,
        },
    )
    assert update_res.status_code == 200, update_res.text
    updated = update_res.json()["automation"]
    assert updated["name"] == "Reminder WhatsApp evento"
    assert updated["trigger_event"] == "booking_created"
    assert updated["recipient_type"] == "custom"
    assert updated["phone_source"] == "custom"
    assert updated["phone_field_key"] is None
    assert updated["custom_phone"] == "+393331234567"
    assert updated["is_active"] is False

    delete_res = client.delete(
        f"/api/org-admin/communications/whatsapp/automations/{automation['id']}"
    )
    assert delete_res.status_code == 200, delete_res.text
    assert delete_res.json()["deleted_automation_id"] == automation["id"]

    list_after_delete_res = client.get(
        f"/api/org-admin/communications/whatsapp/automations?form_id={form_id}"
    )
    assert list_after_delete_res.status_code == 200, list_after_delete_res.text
    assert list_after_delete_res.json()["total"] == 0


def test_org_admin_campaign_send_snapshots_recipients_and_updates_history(client, db, drain_email_outbox):
    original_mode = settings.EMAIL_MODE
    original_domain = settings.MAIL_FROM_DOMAIN
    settings.EMAIL_MODE = "test"
    settings.MAIL_FROM_DOMAIN = "notifiche.assonam.it"
    clear_captured_emails()
    try:
        org, admin = _create_org_admin(db, communications_enabled=True)
        _login_org_admin(client, db, admin.id)

        next_card = (db.query(func.max(Member.card_no)).filter(Member.org_id == org.id).scalar() or 7000) + 1
        _create_member(
            db,
            org_id=org.id,
            email="active.member@example.com",
            status="active",
            card_year=datetime.utcnow().year,
            card_no_seed=next_card,
        )
        _create_member(
            db,
            org_id=org.id,
            email="expired.member@example.com",
            status="active",
            card_year=datetime.utcnow().year - 1,
            card_no_seed=next_card + 1,
        )

        estimate_res = client.get(
            "/api/org-admin/communications/audience-estimate?audience_type=active_members"
        )
        assert estimate_res.status_code == 200, estimate_res.text
        assert estimate_res.json()["count"] == 1

        create_res = client.post(
            "/api/org-admin/communications/campaigns",
            json={
                "name": "Rinnovi attivi",
                "subject": "Rinnova la tua iscrizione, {{nome_socio}}",
                "body_text": "Ciao {{nome_socio}}, tessera {{numero_tessera}} in scadenza il {{data_scadenza}}",
                "audience_type": "active_members",
            },
        )
        assert create_res.status_code == 201, create_res.text
        campaign = create_res.json()["campaign"]
        assert campaign["status"] == "draft"
        campaign_id = campaign["id"]

        send_res = client.post(f"/api/org-admin/communications/campaigns/{campaign_id}/send")
        assert send_res.status_code == 200, send_res.text
        send_payload = send_res.json()
        assert send_payload["recipient_count"] == 1
        assert send_payload["campaign"]["status"] == "sending"

        drain_email_outbox()
        captured = get_captured_emails()
        assert len(captured) == 1
        assert captured[0]["to"] == "active.member@example.com"
        assert captured[0]["transport"] == "mailtrap_api"
        assert captured[0]["selected_mode"] == "association"
        assert "Mario Rossi" in captured[0]["subject"]
        assert "{{nome_socio}}" not in captured[0]["body"]
        assert str(next_card) in captured[0]["body"]

        detail_res = client.get(f"/api/org-admin/communications/campaigns/{campaign_id}")
        assert detail_res.status_code == 200, detail_res.text
        detail_payload = detail_res.json()["campaign"]
        assert detail_payload["status"] == "sent"
        assert detail_payload["recipient_count"] == 1
        assert detail_payload["recipient_status_counts"]["sent"] == 1

        recipients_res = client.get(f"/api/org-admin/communications/campaigns/{campaign_id}/recipients")
        assert recipients_res.status_code == 200, recipients_res.text
        recipients = recipients_res.json()["items"]
        assert len(recipients) == 1
        assert recipients[0]["recipient_email"] == "active.member@example.com"
        assert recipients[0]["delivery_status"] == "sent"
        assert recipients[0]["error_message"] is None

        list_res = client.get("/api/org-admin/communications/campaigns")
        assert list_res.status_code == 200, list_res.text
        assert list_res.json()["items"][0]["status"] == "sent"
    finally:
        settings.EMAIL_MODE = original_mode
        settings.MAIL_FROM_DOMAIN = original_domain
        clear_captured_emails()


def test_org_admin_campaign_supports_selected_members_and_personalized_delivery(
    client,
    db,
    drain_email_outbox,
):
    original_mode = settings.EMAIL_MODE
    original_domain = settings.MAIL_FROM_DOMAIN
    settings.EMAIL_MODE = "test"
    settings.MAIL_FROM_DOMAIN = "notifiche.assonam.it"
    clear_captured_emails()
    try:
        org, admin = _create_org_admin(db, communications_enabled=True)
        _login_org_admin(client, db, admin.id)

        base_card = (db.query(func.max(Member.card_no)).filter(Member.org_id == org.id).scalar() or 9100) + 1
        selected_a = _create_member(
            db,
            org_id=org.id,
            email="selected.one@example.com",
            status="active",
            card_year=datetime.utcnow().year,
            card_no_seed=base_card,
        )
        selected_b = _create_member(
            db,
            org_id=org.id,
            email="selected.two@example.com",
            status="active",
            card_year=datetime.utcnow().year,
            card_no_seed=base_card + 1,
        )
        _create_member(
            db,
            org_id=org.id,
            email="broadcast.only@example.com",
            status="active",
            card_year=datetime.utcnow().year,
            card_no_seed=base_card + 2,
        )

        search_res = client.get(f"/api/org-admin/communications/member-search?q={selected_a.card_no}")
        assert search_res.status_code == 200, search_res.text
        search_items = search_res.json()["items"]
        assert any(item["id"] == selected_a.id for item in search_items)

        create_res = client.post(
            "/api/org-admin/communications/campaigns",
            json={
                "name": "Invio mirato",
                "subject": "Avviso personale per {{nome_socio}}",
                "body_text": "Ciao {{nome_socio}}, la tua tessera e {{numero_tessera}} per {{nome_associazione}}",
                "audience_type": "active_members",
                "recipient_mode": "selected_members",
                "member_ids": [selected_a.id, selected_b.id],
            },
        )
        assert create_res.status_code == 201, create_res.text
        campaign = create_res.json()["campaign"]
        assert campaign["recipient_mode"] == "selected_members"
        assert campaign["selected_member_count"] == 2
        assert campaign["selected_member_ids"] == [selected_a.id, selected_b.id]
        assert campaign["target_summary"] == "2 soci selezionati"
        assert campaign["planned_recipient_count"] == 2
        campaign_id = campaign["id"]

        send_res = client.post(f"/api/org-admin/communications/campaigns/{campaign_id}/send")
        assert send_res.status_code == 200, send_res.text
        assert send_res.json()["recipient_count"] == 2

        drain_email_outbox()
        captured = get_captured_emails()
        assert len(captured) == 2
        assert {item["to"] for item in captured} == {
            "selected.one@example.com",
            "selected.two@example.com",
        }
        assert all("Golden Age Club" in item["body"] for item in captured)
        assert str(base_card) in next(item["body"] for item in captured if item["to"] == "selected.one@example.com")
        assert str(base_card + 1) in next(item["body"] for item in captured if item["to"] == "selected.two@example.com")

        detail_res = client.get(f"/api/org-admin/communications/campaigns/{campaign_id}")
        assert detail_res.status_code == 200, detail_res.text
        detail_campaign = detail_res.json()["campaign"]
        assert detail_campaign["status"] == "sent"
        assert detail_campaign["recipient_count"] == 2
        assert detail_campaign["target_summary"] == "2 soci selezionati"

        recipients_res = client.get(f"/api/org-admin/communications/campaigns/{campaign_id}/recipients")
        assert recipients_res.status_code == 200, recipients_res.text
        recipients = recipients_res.json()["items"]
        assert len(recipients) == 2
        assert {item["recipient_email"] for item in recipients} == {
            "selected.one@example.com",
            "selected.two@example.com",
        }
    finally:
        settings.EMAIL_MODE = original_mode
        settings.MAIL_FROM_DOMAIN = original_domain
        clear_captured_emails()


def test_org_admin_campaign_can_be_scheduled_with_design_and_linked_form(client, db, drain_email_outbox):
    original_mode = settings.EMAIL_MODE
    original_domain = settings.MAIL_FROM_DOMAIN
    settings.EMAIL_MODE = "test"
    settings.MAIL_FROM_DOMAIN = "notifiche.assonam.it"
    clear_captured_emails()
    try:
        org, admin = _create_org_admin(db, communications_enabled=True)
        _login_org_admin(client, db, admin.id)

        form_res = client.post(
            "/api/org-admin/forms",
            json={
                "title": "Sondaggio post evento",
                "public_slug": f"sondaggio-post-evento-{uuid.uuid4().hex[:6]}",
                "is_active": True,
                "visibility": "public",
            },
        )
        assert form_res.status_code == 201, form_res.text
        linked_form = form_res.json()["form"]

        selected_member = _create_member(
            db,
            org_id=org.id,
            email="scheduled.member@example.com",
            status="active",
            card_year=datetime.utcnow().year,
            card_no_seed=9950,
        )

        scheduled_at = (datetime.utcnow() + timedelta(minutes=30)).replace(microsecond=0)
        create_res = client.post(
            "/api/org-admin/communications/campaigns",
            json={
                "name": "Survey schedulato",
                "subject": "Feedback per {{nome_socio}}",
                "body_text": "Ciao {{nome_socio}}, lascia un feedback.",
                "audience_type": "active_members",
                "recipient_mode": "selected_members",
                "member_ids": [selected_member.id],
                "scheduled_at": scheduled_at.isoformat(),
                "linked_form_id": linked_form["id"],
                "design": {
                    "accent_color": "#123456",
                    "cta_label": "Apri il sondaggio",
                    "cta_note": "Ci aiuta a migliorare il prossimo evento.",
                },
            },
        )
        assert create_res.status_code == 201, create_res.text
        campaign = create_res.json()["campaign"]
        assert campaign["status"] == "scheduled"
        assert campaign["linked_form"]["id"] == linked_form["id"]
        assert campaign["design"]["accent_color"] == "#123456"

        stats = process_scheduled_campaigns(db, now=scheduled_at + timedelta(minutes=1))
        assert stats["processed"] == 1
        assert stats["queued_recipients"] == 1

        drain_email_outbox()
        captured = get_captured_emails()
        assert len(captured) == 1
        assert "Apri il sondaggio" in captured[0]["body"]
        assert linked_form["public_path"] in captured[0]["body"]

        detail_res = client.get(f"/api/org-admin/communications/campaigns/{campaign['id']}")
        assert detail_res.status_code == 200, detail_res.text
        assert detail_res.json()["campaign"]["status"] == "sent"
    finally:
        settings.EMAIL_MODE = original_mode
        settings.MAIL_FROM_DOMAIN = original_domain


def test_booking_whatsapp_reminder_is_automatic_and_deduped(client, db, monkeypatch):
    original_whatsapp = settings.ENABLE_WHATSAPP_EVOLUTION
    settings.ENABLE_WHATSAPP_EVOLUTION = True
    sent_messages: list[dict[str, str]] = []

    def fake_send_text(self, instance_name: str, *, number: str, text: str):
        sent_messages.append({"instance": instance_name, "number": number, "text": text})
        return EvolutionSendTextResult(
            external_message_id=f"reminder-{uuid.uuid4().hex}",
            status="sent",
            raw={},
        )

    monkeypatch.setattr("app.services.whatsapp_automation.EvolutionLiteClient.send_text", fake_send_text)
    try:
        db.query(Organization).update({Organization.booking_whatsapp_reminder_enabled: False})
        db.commit()
        org, _admin = _create_org_admin(db, communications_enabled=True)
        org.booking_whatsapp_reminder_enabled = True
        org.booking_whatsapp_reminder_hours_before = 3
        org.booking_whatsapp_reminder_template = "Reminder {{nome_contatto}} {{data_prenotazione}} {{orario_prenotazione}}"
        connection = WhatsAppConnection(
            org_id=org.id,
            instance_name=f"reminder-{org.id}",
            status="connected",
            phone_number="+390200000000",
        )
        booking = Booking(
            association_id=org.id,
            status="confirmed",
            customer_name="Giulia Bianchi",
            customer_phone="+393331234567",
            booking_date=(datetime.utcnow() + timedelta(hours=2)).date(),
            booking_time=(datetime.utcnow() + timedelta(hours=2)).strftime("%H:%M"),
            party_size=2,
            confirmed_at=datetime.utcnow(),
        )
        db.add_all([connection, booking])
        db.commit()

        stats = process_booking_whatsapp_reminders(db, now=datetime.utcnow())
        assert stats["sent"] == 1
        assert sent_messages[0]["number"] == "+393331234567"
        assert "Giulia Bianchi" in sent_messages[0]["text"]
        assert db.query(BookingEvent).filter(BookingEvent.booking_id == booking.id, BookingEvent.event_type == BOOKING_REMINDER_EVENT).count() == 1

        repeat_stats = process_booking_whatsapp_reminders(db, now=datetime.utcnow())
        assert repeat_stats["sent"] == 0
        assert len(sent_messages) == 1
    finally:
        settings.ENABLE_WHATSAPP_EVOLUTION = original_whatsapp


def test_post_event_survey_targets_only_present_bookings(db, monkeypatch):
    original_whatsapp = settings.ENABLE_WHATSAPP_EVOLUTION
    original_frontend = settings.FRONTEND_URL
    settings.ENABLE_WHATSAPP_EVOLUTION = True
    settings.FRONTEND_URL = "https://example.test"
    sent_numbers: list[str] = []

    def fake_send_text(self, instance_name: str, *, number: str, text: str):
        sent_numbers.append(number)
        assert "https://example.test/forms/" in text
        return EvolutionSendTextResult(
            external_message_id=f"survey-{uuid.uuid4().hex}",
            status="sent",
            raw={},
        )

    monkeypatch.setattr("app.services.whatsapp_automation.EvolutionLiteClient.send_text", fake_send_text)
    try:
        db.query(Form).update({Form.survey_post_event_enabled: False})
        db.commit()
        org, _admin = _create_org_admin(db, communications_enabled=True)
        connection = WhatsAppConnection(
            org_id=org.id,
            instance_name=f"survey-{org.id}",
            status="connected",
            phone_number="+390200000000",
        )
        survey = Form(
            association_id=org.id,
            title="Sondaggio evento",
            public_slug=f"sondaggio-{uuid.uuid4().hex[:6]}",
            is_active=True,
            form_type="survey",
            visibility="public",
            survey_post_event_enabled=True,
            survey_post_event_delay_hours=1,
        )
        present_booking = Booking(
            association_id=org.id,
            status="seated",
            customer_name="Presente",
            customer_phone="+393331111111",
            booking_date=(datetime.utcnow() - timedelta(hours=3)).date(),
            booking_time=(datetime.utcnow() - timedelta(hours=3)).strftime("%H:%M"),
        )
        confirmed_booking = Booking(
            association_id=org.id,
            status="confirmed",
            customer_name="Solo confermato",
            customer_phone="+393332222222",
            booking_date=(datetime.utcnow() - timedelta(hours=3)).date(),
            booking_time=(datetime.utcnow() - timedelta(hours=3)).strftime("%H:%M"),
        )
        db.add_all([connection, survey, present_booking, confirmed_booking])
        db.commit()

        stats = process_post_event_survey_whatsapp(db, now=datetime.utcnow())
        assert stats["sent"] == 1
        assert sent_numbers == ["+393331111111"]
        assert (
            db.query(BookingEvent)
            .filter(BookingEvent.booking_id == present_booking.id, BookingEvent.event_type == SURVEY_DISPATCH_EVENT)
            .count()
            == 1
        )
    finally:
        settings.ENABLE_WHATSAPP_EVOLUTION = original_whatsapp
        settings.FRONTEND_URL = original_frontend
        clear_captured_emails()


def test_template_preview_uses_explicit_linked_form_placeholder_without_auto_footer_cta(client, db):
    org, admin = _create_org_admin(db, communications_enabled=True)
    _login_org_admin(client, db, admin.id)

    form_res = client.post(
        "/api/org-admin/forms",
        json={
            "title": "Modulo CTA esplicita",
            "public_slug": f"modulo-cta-esplicita-{uuid.uuid4().hex[:6]}",
            "is_active": True,
            "visibility": "public",
        },
    )
    assert form_res.status_code == 201, form_res.text
    linked_form = form_res.json()["form"]

    explicit_preview_res = client.post(
        "/api/org-admin/communications/templates/preview",
        json={
            "subject": "Preview con form",
            "compiled_html": (
                "<div><p>Apri il modulo dal bottone principale.</p>"
                "<a href='{{link_form_collegato}}'>Vai al form</a></div>"
            ),
            "linked_form_id": linked_form["id"],
        },
    )
    assert explicit_preview_res.status_code == 200, explicit_preview_res.text
    explicit_preview = explicit_preview_res.json()["preview"]["body_html"] or ""
    assert linked_form["public_path"] in explicit_preview
    assert "Apri modulo:" not in explicit_preview

    plain_preview_res = client.post(
        "/api/org-admin/communications/templates/preview",
        json={
            "subject": "Preview senza CTA decorata",
            "compiled_html": "<div><p>Solo contenuto editoriale.</p></div>",
            "linked_form_id": linked_form["id"],
        },
    )
    assert plain_preview_res.status_code == 200, plain_preview_res.text
    plain_preview = plain_preview_res.json()["preview"]["body_html"] or ""
    assert "Apri modulo:" not in plain_preview
    assert linked_form["public_path"] not in plain_preview


def test_org_admin_campaign_selected_members_requires_non_empty_list(client, db):
    org, admin = _create_org_admin(db, communications_enabled=True)
    _login_org_admin(client, db, admin.id)

    create_res = client.post(
        "/api/org-admin/communications/campaigns",
        json={
            "name": "Invio vuoto",
            "subject": "Newsletter",
            "body_text": "Test",
            "audience_type": "active_members",
            "recipient_mode": "selected_members",
            "member_ids": [],
        },
    )
    assert create_res.status_code == 422, create_res.text
    assert "almeno un socio" in create_res.json()["detail"].lower()


def test_org_admin_campaign_selected_members_must_belong_to_association(client, db):
    org, admin = _create_org_admin(db, communications_enabled=True)
    _login_org_admin(client, db, admin.id)
    other_org, _other_admin = _create_org_admin(db, communications_enabled=True)

    foreign_member = _create_member(
        db,
        org_id=other_org.id,
        email="foreign.member@example.com",
        status="active",
        card_year=datetime.utcnow().year,
        card_no_seed=9801,
    )

    create_res = client.post(
        "/api/org-admin/communications/campaigns",
        json={
            "name": "Invio non valido",
            "subject": "Newsletter",
            "body_text": "Test",
            "audience_type": "active_members",
            "recipient_mode": "selected_members",
            "member_ids": [foreign_member.id],
        },
    )
    assert create_res.status_code == 422, create_res.text
    assert "destinatari selezionati" in create_res.json()["detail"].lower()


def test_org_admin_can_delete_draft_campaign(client, db):
    org, admin = _create_org_admin(db, communications_enabled=True)
    _login_org_admin(client, db, admin.id)

    create_res = client.post(
        "/api/org-admin/communications/campaigns",
        json={
            "name": "Bozza da eliminare",
            "subject": "Newsletter bozza",
            "body_text": "Contenuto eliminabile",
            "audience_type": "active_members",
        },
    )
    assert create_res.status_code == 201, create_res.text
    campaign_id = create_res.json()["campaign"]["id"]

    delete_res = client.delete(f"/api/org-admin/communications/campaigns/{campaign_id}")
    assert delete_res.status_code == 200, delete_res.text
    assert delete_res.json() == {"ok": True}

    detail_res = client.get(f"/api/org-admin/communications/campaigns/{campaign_id}")
    assert detail_res.status_code == 404, detail_res.text

    list_res = client.get("/api/org-admin/communications/campaigns")
    assert list_res.status_code == 200, list_res.text
    assert all(item["id"] != campaign_id for item in list_res.json()["items"])

    db.expire_all()
    assert db.query(EmailCampaign).filter(EmailCampaign.id == campaign_id).first() is None


def test_org_admin_test_email_surfaces_mailtrap_provider_error(client, db, monkeypatch):
    original_mode = settings.EMAIL_MODE
    original_domain = settings.MAIL_FROM_DOMAIN
    original_token = settings.ASSOCIATION_MAIL_API_TOKEN

    class FakeResponse:
        status_code = 403
        ok = False
        reason = "Forbidden"
        text = '{"message":"sender domain not allowed"}'

        def json(self):
            return {"message": "sender domain not allowed"}

    def fake_post(*args, **kwargs):
        return FakeResponse()

    monkeypatch.setattr("app.utils.requests.post", fake_post)

    settings.EMAIL_MODE = "normal"
    settings.MAIL_FROM_DOMAIN = "notifiche.assonam.it"
    settings.ASSOCIATION_MAIL_API_TOKEN = "invalid-token"
    clear_captured_emails()
    try:
        _org, admin = _create_org_admin(db, communications_enabled=True)
        _login_org_admin(client, db, admin.id)

        test_res = client.post(
            "/api/org-admin/communications/test-email",
            json={"to_email": "destinatario@example.com"},
        )
        assert test_res.status_code == 502, test_res.text
        assert "sender domain not allowed" in test_res.json()["detail"]
        assert get_captured_emails() == []
    finally:
        settings.EMAIL_MODE = original_mode
        settings.MAIL_FROM_DOMAIN = original_domain
        settings.ASSOCIATION_MAIL_API_TOKEN = original_token
        clear_captured_emails()


def test_org_admin_campaign_send_blocked_when_communications_disabled(client, db):
    org, admin = _create_org_admin(db, communications_enabled=False)
    _login_org_admin(client, db, admin.id)

    _create_member(
        db,
        org_id=org.id,
        email="queued.member@example.com",
        status="active",
        card_year=datetime.utcnow().year,
        card_no_seed=8101,
    )

    create_res = client.post(
        "/api/org-admin/communications/campaigns",
        json={
            "name": "Bozza bloccata",
            "subject": "Newsletter",
            "body_text": "Test",
            "audience_type": "active_members",
        },
    )
    assert create_res.status_code == 403, create_res.text
    assert "Modulo Comunicazioni non attivo" in create_res.json()["detail"]

    campaign = EmailCampaign(
        association_id=org.id,
        subject="Newsletter",
        body_text="Test",
        audience_type="active_members",
        status="draft",
        created_by_user_id=admin.id,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)

    send_res = client.post(f"/api/org-admin/communications/campaigns/{campaign.id}/send")
    assert send_res.status_code == 403, send_res.text
    assert "Modulo Comunicazioni non attivo" in send_res.json()["detail"]


def test_org_admin_cannot_toggle_communications_module_via_generic_update(client, db):
    org, admin = _create_org_admin(db, communications_enabled=False)
    _login_org_admin(client, db, admin.id)

    response = client.patch(
        "/api/org-admin/organization",
        json={"communications_enabled": True},
    )
    assert response.status_code == 200, response.text
    assert response.json()["organization"]["communications_enabled"] is False
    db.refresh(org)
    assert bool(org.communications_enabled) is False


def test_org_admin_operational_communications_endpoints_are_locked_when_module_disabled(client, db):
    org, admin = _create_org_admin(db, communications_enabled=False)
    _login_org_admin(client, db, admin.id)

    settings_res = client.get("/api/org-admin/communications/settings")
    assert settings_res.status_code == 200, settings_res.text
    assert settings_res.json()["communications_enabled"] is False

    system_templates = client.get("/api/org-admin/communications/templates?scope=system")
    assert system_templates.status_code == 200, system_templates.text
    template_id = system_templates.json()["items"][0]["id"]

    blocked_requests = [
        (
            "put",
            "/api/org-admin/communications/settings",
            {
                "sender_email_local_part": "golden-age-club",
                "email_from_name_override": "Golden Age Club",
                "reply_to_email": "segreteria@goldenage.it",
            },
        ),
        ("post", "/api/org-admin/communications/test-email", {"to_email": "destinatario@example.com"}),
        ("get", "/api/org-admin/communications/audience-estimate?audience_type=active_members", None),
        (
            "post",
            "/api/org-admin/communications/campaigns",
            {
                "name": "Draft",
                "subject": "Newsletter",
                "body_text": "Test",
                "audience_type": "active_members",
            },
        ),
        (
            "post",
            "/api/org-admin/communications/templates",
            {
                "name": "Template custom",
                "subject": "Oggetto",
                "body_text": "Ciao",
                "channel": "email",
            },
        ),
        (
            "post",
            "/api/org-admin/communications/templates/preview",
            {"template_id": template_id},
        ),
        (
            "post",
            f"/api/org-admin/communications/templates/{template_id}/duplicate",
            {"name": "Copia bloccata"},
        ),
    ]

    for method, path, payload in blocked_requests:
        if method == "get":
            response = client.get(path)
        elif method == "put":
            response = client.put(path, json=payload)
        else:
            response = client.post(path, json=payload)
        assert response.status_code == 403, (path, response.status_code, response.text)
        assert "Modulo Comunicazioni non attivo" in response.json()["detail"]


def test_super_admin_can_toggle_communications_module_for_organization(client, db):
    org, _admin = _create_org_admin(db, communications_enabled=False)
    _login_super_admin(client)

    response = client.patch(
        f"/api/super-admin/organizations/{org.id}",
        json={"communications_enabled": True},
    )
    assert response.status_code == 200, response.text
    assert response.json()["communications_enabled"] is True
    db.refresh(org)
    assert bool(org.communications_enabled) is True


def test_super_admin_can_toggle_membership_document_requirement_for_organization(client, db):
    org, _admin = _create_org_admin(db, communications_enabled=False)
    org.require_membership_document = False
    db.commit()
    _login_super_admin(client)

    response = client.patch(
        f"/api/super-admin/organizations/{org.id}",
        json={"require_membership_document": True},
    )
    assert response.status_code == 200, response.text
    assert response.json()["require_membership_document"] is True
    db.refresh(org)
    assert bool(org.require_membership_document) is True

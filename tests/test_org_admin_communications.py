from __future__ import annotations

from datetime import datetime, timedelta
import uuid

import pytest
from sqlalchemy import func

from app.config import settings
from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    Member,
    OrgAdminToken,
    Organization,
)
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


def test_org_admin_communications_settings_and_test_email(client, db, drain_email_outbox):
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
                "communications_enabled": True,
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
        assert test_res.json()["sender"]["selected_mode"] == "association"

        drain_email_outbox()
        captured = get_captured_emails()
        assert len(captured) == 1
        assert captured[0]["to"] == "destinatario@example.com"
        assert captured[0]["selected_mode"] == "association"
        assert captured[0]["from_header"] == "Golden Age Club <golden-age-club@notifiche.assonam.it>"
        assert captured[0]["reply_to"] == "segreteria@goldenage.it"
    finally:
        settings.EMAIL_MODE = original_mode
        settings.MAIL_FROM_DOMAIN = original_domain
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
    assert create_res.status_code == 201, create_res.text
    campaign_id = create_res.json()["campaign"]["id"]

    send_res = client.post(f"/api/org-admin/communications/campaigns/{campaign_id}/send")
    assert send_res.status_code == 409, send_res.text
    assert "non sono abilitate" in send_res.json()["detail"]

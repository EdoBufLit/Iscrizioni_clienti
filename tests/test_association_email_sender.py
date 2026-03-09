from __future__ import annotations

from datetime import datetime, timedelta

from app.config import settings
from app.db import SessionLocal
from app.models import AdminRole, AdminUser, OrgAdminToken, Organization
from app.services.email_outbox import build_email_payload, drain_outbox_for_tests, enqueue_email
from app.services.email_sender import (
    build_association_from_email,
    build_association_from_header,
    build_sender_payload,
    generate_email_local_part_from_name,
    sanitize_email_local_part,
)
from app.utils import clear_captured_emails, get_captured_emails, hash_token


def _login_org_admin(client, db, admin_id: int) -> None:
    token_str = f"association-email-{admin_id}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)


def test_association_email_helpers_generate_expected_sender() -> None:
    original_domain = settings.MAIL_FROM_DOMAIN
    settings.MAIL_FROM_DOMAIN = "notifiche.assonam.it"
    try:
        assert sanitize_email_local_part("Gólden   Age Club!!!") == "golden-age-club"
        assert generate_email_local_part_from_name("Città d'Argento") == "citta-d-argento"

        association = {
            "id": 17,
            "name": "Golden Age Club",
            "communications_enabled": True,
            "sender_email_local_part": None,
            "email_from_name_override": None,
        }
        assert (
            build_association_from_email(association)
            == "golden-age-club@notifiche.assonam.it"
        )
        assert (
            build_association_from_header(association)
            == "Golden Age Club <golden-age-club@notifiche.assonam.it>"
        )

        fallback_association = {
            "id": 21,
            "name": "!!!",
            "communications_enabled": True,
            "sender_email_local_part": None,
            "email_from_name_override": None,
        }
        assert build_association_from_email(fallback_association) == "org-21@notifiche.assonam.it"
    finally:
        settings.MAIL_FROM_DOMAIN = original_domain


def test_email_outbox_uses_association_sender_and_system_fallback() -> None:
    original_mode = settings.EMAIL_MODE
    original_domain = settings.MAIL_FROM_DOMAIN
    original_email_from = settings.EMAIL_FROM
    settings.EMAIL_MODE = "test"
    settings.MAIL_FROM_DOMAIN = "notifiche.assonam.it"
    settings.EMAIL_FROM = "ASSONAM <noreply@assonam.it>"
    clear_captured_emails()
    try:
        with SessionLocal() as db:
            outbox_id = enqueue_email(
                db,
                email_type="association_sender_test",
                to_email="member@example.com",
                subject="Association sender",
                payload=build_email_payload(
                    text_body="hello",
                    sender=build_sender_payload(
                        mode="association",
                        association={
                            "id": 7,
                            "name": "Golden Age Club",
                            "communications_enabled": True,
                            "sender_email_local_part": "golden age club",
                            "email_from_name_override": "Golden Age Club",
                            "reply_to_email": "segreteria@goldenage.it",
                        },
                    ),
                ),
                priority=1,
            )
            assert outbox_id
            fallback_id = enqueue_email(
                db,
                email_type="association_sender_test_fallback",
                to_email="member2@example.com",
                subject="Fallback sender",
                payload=build_email_payload(
                    text_body="hello fallback",
                    sender=build_sender_payload(
                        mode="association",
                        association={
                            "id": 8,
                            "name": "Disabled Club",
                            "communications_enabled": False,
                            "sender_email_local_part": "disabled-club",
                            "email_from_name_override": None,
                            "reply_to_email": None,
                        },
                    ),
                ),
                priority=1,
            )
            assert fallback_id
            db.commit()

        drain_outbox_for_tests()
        captured = get_captured_emails()
        assert len(captured) == 2

        association_email = next(item for item in captured if item["to"] == "member@example.com")
        assert association_email["selected_mode"] == "association"
        assert association_email["fallback_used"] is False
        assert association_email["from_email"] == "golden-age-club@notifiche.assonam.it"
        assert association_email["from_header"] == "Golden Age Club <golden-age-club@notifiche.assonam.it>"
        assert association_email["reply_to"] == "segreteria@goldenage.it"

        fallback_email = next(item for item in captured if item["to"] == "member2@example.com")
        assert fallback_email["selected_mode"] == "system"
        assert fallback_email["fallback_used"] is True
        assert fallback_email["from_email"] == "noreply@assonam.it"
        assert fallback_email["from_header"] == "ASSONAM <noreply@assonam.it>"
    finally:
        settings.EMAIL_MODE = original_mode
        settings.MAIL_FROM_DOMAIN = original_domain
        settings.EMAIL_FROM = original_email_from
        clear_captured_emails()


def test_org_admin_patch_organization_email_settings_returns_preview(client) -> None:
    db = SessionLocal()
    original_domain = settings.MAIL_FROM_DOMAIN
    settings.MAIL_FROM_DOMAIN = "notifiche.assonam.it"
    try:
        org = db.query(Organization).filter_by(slug="mail-preview-org").first()
        if not org:
            org = Organization(name="Golden Àge Club", slug="mail-preview-org", is_active=True)
            db.add(org)
            db.commit()
            db.refresh(org)

        org.communications_enabled = True
        db.commit()
        db.refresh(org)

        admin = db.query(AdminUser).filter_by(email="mail.preview.admin@example.com").first()
        if not admin:
            admin = AdminUser(
                email="mail.preview.admin@example.com",
                role=AdminRole.ORG_ADMIN,
                org_id=org.id,
                is_active=True,
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)

        _login_org_admin(client, db, admin.id)

        response = client.put(
            "/api/org-admin/communications/settings",
            json={
                "sender_email_local_part": "Gólden   Age Club!!!",
                "email_from_name_override": "Golden Age Club",
                "reply_to_email": "segreteria@goldenage.it",
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["ok"] is True
        organization = payload["settings"]
        assert organization["communications_enabled"] is True
        assert organization["sender_email_local_part"] == "golden-age-club"
        assert organization["email_from_name_override"] == "Golden Age Club"
        assert organization["reply_to_email"] == "segreteria@goldenage.it"
        assert organization["association_email_sender"]["selected_mode"] == "association"
        assert organization["association_email_sender"]["from_email"] == "golden-age-club@notifiche.assonam.it"
        assert (
            organization["association_email_sender"]["from_header"]
            == "Golden Age Club <golden-age-club@notifiche.assonam.it>"
        )
    finally:
        settings.MAIL_FROM_DOMAIN = original_domain
        db.close()

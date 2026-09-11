import json
import uuid
from datetime import datetime, timedelta

import pytest

from app.config import settings
from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    CardBatch,
    EmailOutbox,
    OrgAdminNotification,
    OrgAdminToken,
    Organization,
)
from app.services import low_cards_alerts as low_cards_alerts_service
from app.utils import clear_captured_emails, get_captured_emails, hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture(autouse=True)
def _email_mode_test():
    original_mode = settings.EMAIL_MODE
    settings.EMAIL_MODE = "test"
    clear_captured_emails()
    yield
    settings.EMAIL_MODE = original_mode
    clear_captured_emails()


def _login_super_admin(client) -> None:
    response = client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    )
    assert response.status_code == 200, response.text


def _login_org_admin(client, db, admin_id: int) -> None:
    token_str = f"notifications-admin-{admin_id}-{uuid.uuid4().hex[:6]}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    response = client.get(
        f"/api/org-admin/auth/verify?token={token_str}",
        follow_redirects=False,
    )
    assert response.status_code == 302, response.text


def _create_org_with_admin(
    db,
    *,
    accounting_enabled: bool = False,
) -> tuple[Organization, AdminUser]:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Notify Org {suffix}",
        slug=f"notify-org-{suffix}",
        email=f"notify-{suffix}@example.com",
        is_active=True,
        accounting_enabled=accounting_enabled,
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    admin = AdminUser(
        email=f"org-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return org, admin


def _build_document_upload(
    *,
    title: str,
    kind: str,
    target_mode: str,
    association_ids: list[int],
):
    return {
        "title": title,
        "description": "Documento assegnato in automatico",
        "kind": kind,
        "target_mode": target_mode,
        "association_ids": json.dumps(association_ids),
    }, {
        "file": ("documento.pdf", b"%PDF-1.4\nnotification-test\n%%EOF\n", "application/pdf")
    }


def _create_batch(db, *, org_id: int, quantity: int) -> None:
    current_year = datetime.utcnow().year
    batch = CardBatch(
        org_id=org_id,
        year=current_year,
        start_no=700000 + quantity,
        end_no=700000 + quantity + quantity - 1,
        next_no=700000 + quantity,
        is_enabled=True,
    )
    db.add(batch)
    db.commit()


def test_general_document_creates_org_admin_notification_and_email(client, db):
    org, admin = _create_org_with_admin(db)
    _login_super_admin(client)
    data, files = _build_document_upload(
        title="Circolare operativa",
        kind="general",
        target_mode="single",
        association_ids=[org.id],
    )

    response = client.post("/api/super-admin/documents", data=data, files=files)
    assert response.status_code == 200, response.text

    notifications = (
        db.query(OrgAdminNotification)
        .filter(OrgAdminNotification.admin_user_id == admin.id)
        .all()
    )
    assert len(notifications) == 1
    assert notifications[0].type == "document_general"
    assert notifications[0].href == "/org-admin/documenti"
    assert notifications[0].is_read is False

    outbox = db.query(EmailOutbox).filter(EmailOutbox.to_email == admin.email).all()
    assert len(outbox) == 1
    assert outbox[0].email_type == "document_general"
    assert "Circolare operativa" in (outbox[0].payload_json or {}).get("text_body", "")


def test_accounting_document_notification_targets_accounting_tab(client, db):
    org, admin = _create_org_with_admin(db, accounting_enabled=True)
    _login_super_admin(client)
    data, files = _build_document_upload(
        title="Bilancio Q1",
        kind="accounting",
        target_mode="single",
        association_ids=[org.id],
    )

    response = client.post("/api/super-admin/documents", data=data, files=files)
    assert response.status_code == 200, response.text

    notification = (
        db.query(OrgAdminNotification)
        .filter(OrgAdminNotification.admin_user_id == admin.id)
        .order_by(OrgAdminNotification.id.desc())
        .first()
    )
    assert notification is not None
    assert notification.type == "document_accounting"
    assert notification.href == "/org-admin/contabilita"

    outbox = db.query(EmailOutbox).filter(EmailOutbox.to_email == admin.email).all()
    assert len(outbox) == 1
    assert outbox[0].email_type == "document_accounting"


def test_general_document_email_is_delivered_to_org_admin_login_email(client, db, drain_email_outbox):
    org, admin = _create_org_with_admin(db)
    _login_super_admin(client)
    clear_captured_emails()
    data, files = _build_document_upload(
        title="Verbale assemblea",
        kind="general",
        target_mode="single",
        association_ids=[org.id],
    )

    response = client.post("/api/super-admin/documents", data=data, files=files)
    assert response.status_code == 200, response.text

    drain_email_outbox()
    captured = get_captured_emails()
    assert len(captured) == 1
    assert (captured[0]["to"] or "").lower() == admin.email.lower()
    assert "Verbale assemblea" in (captured[0]["text_body"] or "")


def test_org_admin_notification_endpoints_mark_read_and_count(client, db):
    org, admin = _create_org_with_admin(db)
    notification = OrgAdminNotification(
        admin_user_id=admin.id,
        org_id=org.id,
        type="document_general",
        title="Nuovo documento",
        body="Apri la sezione documenti.",
        href="/org-admin/documenti",
        is_read=False,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)

    _login_org_admin(client, db, admin.id)

    unread_response = client.get("/api/org-admin/notifications/unread-count")
    assert unread_response.status_code == 200, unread_response.text
    assert unread_response.json()["unread_count"] == 1

    list_response = client.get("/api/org-admin/notifications")
    assert list_response.status_code == 200, list_response.text
    assert len(list_response.json()["items"]) == 1
    assert list_response.json()["items"][0]["is_read"] is False

    mark_response = client.post(f"/api/org-admin/notifications/{notification.id}/read")
    assert mark_response.status_code == 200, mark_response.text
    assert mark_response.json()["notification"]["is_read"] is True

    read_all_response = client.post("/api/org-admin/notifications/read-all")
    assert read_all_response.status_code == 200, read_all_response.text

    db.refresh(notification)
    assert notification.is_read is True

    delete_response = client.delete(f"/api/org-admin/notifications/{notification.id}")
    assert delete_response.status_code == 200, delete_response.text
    assert delete_response.json()["deleted_notification_id"] == notification.id
    assert delete_response.json()["was_unread"] is False
    assert db.query(OrgAdminNotification).filter(OrgAdminNotification.id == notification.id).first() is None


def test_low_cards_alert_creates_single_notification_and_resets_above_threshold(db, monkeypatch):
    org, admin = _create_org_with_admin(db)
    _create_batch(db, org_id=org.id, quantity=60)

    monkeypatch.setattr(low_cards_alerts_service, "twilio_alerts_are_configured", lambda: False)
    monkeypatch.setattr(
        low_cards_alerts_service,
        "get_remaining_cards_by_org",
        lambda _db, association_ids, *, now=None: {
            association_id: 40 if association_id == org.id else 200 for association_id in association_ids
        },
    )

    first_now = datetime.utcnow()
    first_run = low_cards_alerts_service.run_low_cards_alert_job(db=db, now=first_now, force=False)
    assert first_run["sent"] == 1
    assert first_run["notifications_created"] == 1
    assert first_run["emails_queued"] == 1

    second_run = low_cards_alerts_service.run_low_cards_alert_job(
        db=db,
        now=first_now + timedelta(minutes=5),
        force=False,
    )
    assert second_run["sent"] == 0
    assert second_run["skipped_recent"] == 1

    notifications = (
        db.query(OrgAdminNotification)
        .filter(
            OrgAdminNotification.admin_user_id == admin.id,
            OrgAdminNotification.type == "low_cards",
        )
        .all()
    )
    assert len(notifications) == 1
    assert notifications[0].href == "/org-admin/tessere"
    assert db.query(EmailOutbox).filter(EmailOutbox.email_type == "low_cards").count() == 1

    monkeypatch.setattr(
        low_cards_alerts_service,
        "get_remaining_cards_by_org",
        lambda _db, association_ids, *, now=None: {association_id: 120 for association_id in association_ids},
    )
    reset_run = low_cards_alerts_service.run_low_cards_alert_job(
        db=db,
        now=first_now + timedelta(minutes=10),
        force=False,
    )
    assert reset_run["sent"] == 0
    assert reset_run["skipped_threshold"] >= 1
    db.refresh(org)
    assert org.last_low_cards_alert_at is None

    monkeypatch.setattr(
        low_cards_alerts_service,
        "get_remaining_cards_by_org",
        lambda _db, association_ids, *, now=None: {
            association_id: 35 if association_id == org.id else 200 for association_id in association_ids
        },
    )
    third_run = low_cards_alerts_service.run_low_cards_alert_job(
        db=db,
        now=first_now + timedelta(minutes=20),
        force=False,
    )
    assert third_run["sent"] == 1
    assert (
        db.query(OrgAdminNotification)
        .filter(
            OrgAdminNotification.admin_user_id == admin.id,
            OrgAdminNotification.type == "low_cards",
        )
        .count()
        == 2
    )
    assert (
        db.query(EmailOutbox)
        .filter(
            EmailOutbox.email_type == "low_cards",
            EmailOutbox.to_email == admin.email,
        )
        .count()
        == 2
    )


def test_low_cards_email_targets_org_admin_login_email(db, monkeypatch, drain_email_outbox):
    org, admin = _create_org_with_admin(db)
    org.email = "association-office@example.com"
    db.add(org)
    db.commit()
    _create_batch(db, org_id=org.id, quantity=60)

    monkeypatch.setattr(low_cards_alerts_service, "twilio_alerts_are_configured", lambda: False)
    monkeypatch.setattr(
        low_cards_alerts_service,
        "get_remaining_cards_by_org",
        lambda _db, association_ids, *, now=None: {
            association_id: 25 if association_id == org.id else 200 for association_id in association_ids
        },
    )

    clear_captured_emails()
    result = low_cards_alerts_service.run_low_cards_alert_job(
        db=db,
        now=datetime.utcnow(),
        force=False,
    )
    assert result["emails_queued"] == 1

    drain_email_outbox()
    captured = get_captured_emails()
    assert len(captured) == 1
    assert (captured[0]["to"] or "").lower() == admin.email.lower()
    assert (captured[0]["to"] or "").lower() != org.email.lower()
    assert "Tessere in esaurimento" in (captured[0]["subject"] or "")
    html_body = captured[0]["html_body"] or ""
    assert "Tessere disponibili" in html_body
    assert ">25</p>" in html_body
    assert html_body.count("<h1 ") == 1
    assert "Georgia" not in html_body
    assert "prefers-color-scheme: dark" in html_body
    assert "/org-admin/tessere" in html_body


def test_low_cards_alert_does_not_notify_orgs_that_never_had_50_cards(db, monkeypatch):
    org, admin = _create_org_with_admin(db)
    _create_batch(db, org_id=org.id, quantity=20)

    monkeypatch.setattr(low_cards_alerts_service, "twilio_alerts_are_configured", lambda: False)
    monkeypatch.setattr(
        low_cards_alerts_service,
        "get_remaining_cards_by_org",
        lambda _db, association_ids, *, now=None: {
            association_id: 0 if association_id == org.id else 200 for association_id in association_ids
        },
    )

    result = low_cards_alerts_service.run_low_cards_alert_job(
        db=db,
        now=datetime.utcnow(),
        force=False,
    )

    assert result["sent"] == 0
    assert result["notifications_created"] == 0
    assert result["emails_queued"] == 0
    assert result["skipped_never_reached_threshold"] >= 1
    assert (
        db.query(OrgAdminNotification)
        .filter(
            OrgAdminNotification.admin_user_id == admin.id,
            OrgAdminNotification.type == "low_cards",
        )
        .count()
        == 0
    )
    assert (
        db.query(EmailOutbox)
        .filter(
            EmailOutbox.email_type == "low_cards",
            EmailOutbox.to_email == admin.email,
        )
        .count()
        == 0
    )

import uuid
from datetime import datetime, timedelta

import pytest

from app.config import settings
from app.db import SessionLocal
from app.models import (
    AdminRole, AdminUser, AffiliateCommunication, AffiliateCommunicationRead,
    AffiliateCommunicationRecipient, EmailOutbox, OrgAdminNotification, OrgAdminToken,
    Organization,
)
from app.services import affiliate_communications as service
from app.utils import get_captured_emails, hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture(autouse=True)
def email_test_mode(client):
    previous = settings.EMAIL_MODE
    settings.EMAIL_MODE = "test"
    client.cookies.clear()
    yield
    client.cookies.clear()
    settings.EMAIL_MODE = previous


def super_login(client):
    client.cookies.clear()
    response = client.post("/api/super-admin/auth/login", json={"email": "admin@assonam.it", "password": "admin"})
    assert response.status_code == 200, response.text


def org_login(client, db, admin):
    client.cookies.clear()
    token = uuid.uuid4().hex
    db.add(OrgAdminToken(admin_id=admin.id, token_hash=hash_token(token), expires_at=datetime.utcnow() + timedelta(minutes=15)))
    db.commit()
    response = client.get(f"/api/org-admin/auth/verify?token={token}", follow_redirects=False)
    assert response.status_code == 302, response.text


def make_org(db, *, active=True, deleted=False, admins=1):
    suffix = uuid.uuid4().hex[:10]
    org = Organization(name=f"Circolari {suffix}", slug=f"circolari-{suffix}",
                       is_active=active, deleted_at=datetime.utcnow() if deleted else None,
                       communications_enabled=False)
    db.add(org)
    db.flush()
    accounts = [AdminUser(email=f"circolari-{suffix}-{index}@example.com", role=AdminRole.ORG_ADMIN,
                          org_id=org.id, is_active=True) for index in range(admins)]
    db.add_all(accounts)
    db.commit()
    return org, accounts


def draft(*orgs, **overrides):
    return {"subject": "Aggiornamento affiliazioni", "body": "Gentile associazione,\n\nLa comunicazione completa è qui.",
            "audience": "selected", "organization_ids": [org.id for org in orgs],
            "idempotency_key": uuid.uuid4().hex, **overrides}


def post_message(client, *orgs, **overrides):
    response = client.post("/api/super-admin/communications", json=draft(*orgs, **overrides))
    assert response.status_code == 200, response.text
    return response.json()["item"]


def test_preview_and_selected_send_deliver_only_to_active_admins(client, db, drain_email_outbox):
    org, admins = make_org(db, admins=2)
    other, _ = make_org(db)
    inactive = AdminUser(email=f"inactive-{uuid.uuid4().hex}@example.com", org_id=org.id,
                         role=AdminRole.ORG_ADMIN, is_active=False)
    deleted = AdminUser(email=f"deleted-{uuid.uuid4().hex}@example.com", org_id=org.id,
                        role=AdminRole.ORG_ADMIN, is_active=True, deleted_at=datetime.utcnow())
    db.add_all([inactive, deleted])
    db.commit()
    super_login(client)
    payload = draft(org, subject="Circolare <script>alert(1)</script>", body="Prima riga <b>testo</b>\n\nSecondo paragrafo & dettagli")
    preview = client.post("/api/super-admin/communications/preview", json=payload)
    assert preview.status_code == 200, preview.text
    assert preview.json()["organization_count"] == 1
    assert preview.json()["admin_count"] == preview.json()["email_count"] == 2
    assert db.query(EmailOutbox).count() == 0
    response = client.post("/api/super-admin/communications", json=payload)
    assert response.status_code == 200, response.text
    item = response.json()["item"]
    assert item["recipient_count"] == 1 and item["email_count"] == item["notification_count"] == 2
    notifications = db.query(OrgAdminNotification).filter_by(communication_id=item["id"]).all()
    assert {row.admin_user_id for row in notifications} == {admin.id for admin in admins}
    assert all(row.href == f"/org-admin/comunicazioni-assonam?message={item['id']}" for row in notifications)
    outbox = db.query(EmailOutbox).all()
    assert {row.to_email for row in outbox} == {admin.email for admin in admins}
    for email in outbox:
        html = email.payload_json["html_body"]
        assert "<script>" not in html and "<b>testo</b>" not in html
        assert "&lt;script&gt;" in html and "&lt;b&gt;testo&lt;/b&gt;" in html
        assert payload["body"] in email.payload_json["text_body"]
        assert email.status == "queued"
    detail = client.get(f"/api/super-admin/communications/{item['id']}").json()["item"]
    assert [row["organization_id"] for row in detail["recipients"]] == [org.id]
    assert other.id != detail["recipients"][0]["organization_id"]
    drain_email_outbox()
    assert {email["to"] for email in get_captured_emails()} == {admin.email for admin in admins}


def test_all_audience_excludes_inactive_deleted_and_snapshots_names(client, db):
    active, _ = make_org(db)
    inactive, _ = make_org(db, active=False)
    deleted, _ = make_org(db, deleted=True)
    no_admin, _ = make_org(db, admins=0)
    super_login(client)
    recipients = client.get("/api/super-admin/communications/recipients").json()["items"]
    ids = {row["id"] for row in recipients}
    assert {active.id, no_admin.id}.issubset(ids)
    assert inactive.id not in ids and deleted.id not in ids
    item = post_message(client, audience="all", expected_organization_ids=sorted(ids))
    audience = db.query(AffiliateCommunicationRecipient).filter_by(communication_id=item["id"]).all()
    assert {row.organization_id for row in audience} == ids
    old_name = active.name
    active.name = "Nome modificato dopo invio"
    db.commit()
    detail = client.get(f"/api/super-admin/communications/{item['id']}").json()["item"]
    assert next(row for row in detail["recipients"] if row["organization_id"] == active.id)["organization_name"] == old_name


@pytest.mark.parametrize("overrides", [
    {"organization_ids": []}, {"organization_ids": [987654321]},
    {"subject": " "}, {"body": "\n\n"}, {"subject": "Test\nBcc: other@example.com"},
    {"audience": "all", "organization_ids": [1]},
])
def test_validation_rejects_invalid_selection_or_content(client, db, overrides):
    org, _ = make_org(db)
    super_login(client)
    payload = draft(org, **overrides)
    response = client.post("/api/super-admin/communications", json=payload)
    assert response.status_code == 422, response.text
    assert db.query(AffiliateCommunication).filter_by(idempotency_key=payload["idempotency_key"]).count() == 0


def test_selected_inactive_org_is_rejected_and_preview_staleness_fails(client, db):
    org, _ = make_org(db, active=False)
    super_login(client)
    assert client.post("/api/super-admin/communications", json=draft(org)).status_code == 422
    org.is_active = True
    db.commit()
    response = client.post("/api/super-admin/communications", json=draft(org, expected_organization_ids=[]))
    assert response.status_code == 409
    assert db.query(EmailOutbox).count() == 0


def test_send_idempotency_and_payload_conflict(client, db):
    org, _ = make_org(db)
    super_login(client)
    payload = draft(org)
    first = client.post("/api/super-admin/communications", json=payload)
    assert first.status_code == 200, first.text
    second = client.post("/api/super-admin/communications", json=payload)
    assert second.status_code == 200, second.text
    assert second.json()["replayed"] is True
    assert first.json()["item"]["id"] == second.json()["item"]["id"]
    assert db.query(EmailOutbox).count() == 1
    assert db.query(OrgAdminNotification).filter_by(communication_id=first.json()["item"]["id"]).count() == 1
    changed = client.post("/api/super-admin/communications", json={**payload, "body": "Altro messaggio"})
    assert changed.status_code == 409


def test_authentication_tenant_isolation_and_individual_read_state(client, db):
    org, admins = make_org(db, admins=2)
    other, other_admins = make_org(db)
    assert client.get("/api/super-admin/communications").status_code == 401
    assert client.get("/api/org-admin/communications/inbox").status_code == 401
    super_login(client)
    item = post_message(client, org)
    org_login(client, db, other_admins[0])
    assert client.post("/api/super-admin/communications", json=draft(org)).status_code == 401
    assert client.get(f"/api/org-admin/communications/inbox/{item['id']}").status_code == 404
    assert client.post(f"/api/org-admin/communications/inbox/{item['id']}/read").status_code == 404
    org_login(client, db, admins[0])
    inbox = client.get("/api/org-admin/communications/inbox").json()
    assert inbox["total"] == inbox["unread_count"] == 1
    assert "recipients" not in inbox["items"][0] and "created_by_email" not in inbox["items"][0]
    response = client.post(f"/api/org-admin/communications/inbox/{item['id']}/read")
    assert response.status_code == 200, response.text
    assert response.json()["item"]["is_read"] is True
    assert client.get("/api/org-admin/notifications/unread-count").json()["unread_count"] == 0
    assert client.get("/api/org-admin/communications/inbox?unread_only=true").json()["total"] == 0
    org_login(client, db, admins[1])
    assert client.get("/api/org-admin/communications/inbox").json()["unread_count"] == 1
    org.is_active = False
    db.commit()
    assert client.get("/api/org-admin/communications/inbox").status_code == 403


def test_bell_read_all_and_delete_preserve_inbox_history(client, db):
    org, admins = make_org(db)
    super_login(client)
    first = post_message(client, org)
    second = post_message(client, org)
    org_login(client, db, admins[0])
    notification = db.query(OrgAdminNotification).filter_by(communication_id=first["id"], admin_user_id=admins[0].id).one()
    assert client.post(f"/api/org-admin/notifications/{notification.id}/read").status_code == 200
    assert client.delete(f"/api/org-admin/notifications/{notification.id}").status_code == 200
    assert client.get(f"/api/org-admin/communications/inbox/{first['id']}").json()["item"]["is_read"] is True
    assert client.post("/api/org-admin/notifications/read-all").status_code == 200
    assert client.get(f"/api/org-admin/communications/inbox/{second['id']}").json()["item"]["is_read"] is True
    assert client.get("/api/org-admin/communications/inbox").json()["total"] == 2
    assert db.query(AffiliateCommunicationRead).filter_by(admin_user_id=admins[0].id).count() == 2


def test_send_failure_rolls_back_message_audience_bell_and_email(client, db, monkeypatch):
    org, _ = make_org(db, admins=2)
    super_login(client)
    enqueue = service.enqueue_email
    calls = 0

    def fail_second(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("test outbox failure")
        return enqueue(*args, **kwargs)

    monkeypatch.setattr(service, "enqueue_email", fail_second)
    payload = draft(org)
    with pytest.raises(RuntimeError, match="test outbox failure"):
        client.post("/api/super-admin/communications", json=payload)
    assert db.query(AffiliateCommunication).filter_by(idempotency_key=payload["idempotency_key"]).count() == 0
    assert db.query(AffiliateCommunicationRecipient).filter_by(organization_id=org.id).count() == 0
    assert db.query(OrgAdminNotification).filter_by(org_id=org.id).count() == 0
    assert db.query(EmailOutbox).count() == 0


def test_purge_preserves_message_and_recipient_snapshot(client, db):
    org, admins = make_org(db)
    org_id, org_name, admin_id = org.id, org.name, admins[0].id
    super_login(client)
    item = post_message(client, org)
    org_login(client, db, admins[0])
    assert client.post(f"/api/org-admin/communications/inbox/{item['id']}/read").status_code == 200
    super_login(client)
    response = client.delete(f"/api/admin/associations/{org_id}?mode=purge&force=true")
    assert response.status_code == 200, response.text
    detail = client.get(f"/api/super-admin/communications/{item['id']}").json()["item"]
    assert detail["recipient_count"] == 1
    assert len(detail["recipients"]) == 1
    snapshot = detail["recipients"][0]
    assert snapshot["organization_id"] is None
    assert snapshot["organization_name"] == org_name
    assert snapshot["id"] > 0
    assert db.query(Organization).filter_by(id=org_id).count() == 0
    assert db.query(OrgAdminNotification).filter_by(org_id=org_id).count() == 0
    assert db.query(AffiliateCommunicationRead).filter_by(admin_user_id=admin_id).count() == 0


def test_reassigned_admin_cannot_access_previous_tenant_bell_or_inbox(client, db):
    org, admins = make_org(db)
    other, _ = make_org(db)
    super_login(client)
    item = post_message(client, org)
    notification = db.query(OrgAdminNotification).filter_by(
        communication_id=item["id"], admin_user_id=admins[0].id,
    ).one()
    admins[0].org_id = other.id
    db.commit()
    org_login(client, db, admins[0])
    assert client.get("/api/org-admin/communications/inbox").json()["total"] == 0
    assert client.get("/api/org-admin/notifications").json()["items"] == []
    assert client.get("/api/org-admin/notifications/unread-count").json()["unread_count"] == 0
    assert client.post(f"/api/org-admin/notifications/{notification.id}/read").status_code == 404
    assert client.delete(f"/api/org-admin/notifications/{notification.id}").status_code == 404
    assert client.post("/api/org-admin/notifications/read-all").json()["updated"] == 0
    assert db.query(AffiliateCommunicationRead).filter_by(
        communication_id=item["id"], admin_user_id=admins[0].id,
    ).count() == 0

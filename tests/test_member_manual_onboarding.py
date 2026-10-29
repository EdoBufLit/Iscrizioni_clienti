from datetime import datetime, timedelta
import base64
import json
import re
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func

from app.config import settings
from app.db import SessionLocal
from app.main import app
from app.models import AdminRole, AdminUser, CardBatch, EmailOutbox, EmailOutboxStatus, Member, MemberDocument, MemberStatus, Organization, OrgAdminToken, SignupSource, Token
from app.utils import hash_token


@pytest.fixture
def manual_org(client):
    db = SessionLocal()
    suffix = uuid.uuid4().hex
    org = Organization(name="Manual onboarding QA", slug=f"manual-onboarding-{suffix}", is_active=True)
    db.add(org); db.flush()
    admin = AdminUser(email=f"manual-onboarding-{suffix}@example.test", org_id=org.id,
                      role=AdminRole.ORG_ADMIN, is_active=True)
    db.add(admin); db.flush()
    token = uuid.uuid4().hex
    db.add(OrgAdminToken(admin_id=admin.id, token_hash=hash_token(token), expires_at=datetime.utcnow()+timedelta(minutes=10)))
    db.commit()
    assert client.get(f"/api/org-admin/auth/verify?token={token}", follow_redirects=False).status_code == 302
    yield db, org
    db.close()


def create_member(client, **overrides):
    payload = {"first_name": "Nuovo", "last_name": "Socio", "email": f"onboarding-{uuid.uuid4().hex}@example.com",
               "is_manual": True, "send_access_email": True}
    payload.update(overrides)
    response = client.post("/api/org-admin/members", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def test_manual_create_queues_actionable_onboarding_in_the_creation_transaction(client, manual_org):
    db, org = manual_org
    created = create_member(client)
    assert created["email_sent"] is False
    assert created["email_status"] == created["registration_email_status"] == "queued"
    member = db.get(Member, created["id"])
    assert member.org_id == org.id and member.status == MemberStatus.PENDING_DOCS
    assert member.access_email_requested and member.password_hash is None and member.card_no is None
    job = db.query(EmailOutbox).filter_by(to_email=member.email).one()
    assert job.status == EmailOutboxStatus.QUEUED.value
    assert "/completa-iscrizione#token=" in job.payload_json["text_body"]
    assert "/api/join/continue" not in job.payload_json["text_body"]
    assert "token=" not in str(created)
    assert db.query(Token).filter_by(member_id=member.id).count() == 1


@pytest.mark.parametrize("with_email", [False, True])
def test_manual_create_without_requested_invitation_does_not_send_email(client, manual_org, with_email):
    db, _org = manual_org
    created = create_member(client, send_access_email=False, email="not-requested@example.com" if with_email else None)
    assert created["email_status"] == created["registration_email_status"] == "not_requested"
    member = db.get(Member, created["id"])
    assert not member.access_email_requested
    assert db.query(Token).filter_by(member_id=member.id).count() == 0
    assert db.query(EmailOutbox).count() == 0


def test_resend_reuses_an_unsent_valid_invitation_and_throttles_delivered_mail(client, manual_org):
    db, _org = manual_org
    created = create_member(client)
    path = f"/api/org-admin/members/{created['id']}/send-onboarding"
    first = client.post(path)
    second = client.post(path)
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json() == {"ok": True, "email_sent": False, "email_status": "queued", "registration_email_status": "queued"}
    assert db.query(EmailOutbox).count() == db.query(Token).filter_by(member_id=created["id"]).count() == 1
    job = db.query(EmailOutbox).one()
    job.status = EmailOutboxStatus.SENT.value
    job.updated_at = datetime.utcnow()
    db.commit()
    response = client.post(path)
    assert response.status_code == 429, response.text
    assert db.query(EmailOutbox).count() == 1


def test_send_onboarding_recovers_a_manual_signup_created_without_an_invitation(client, manual_org):
    db, _org = manual_org
    created = create_member(client, send_access_email=False)
    response = client.post(f"/api/org-admin/members/{created['id']}/send-onboarding")
    assert response.status_code == 200, response.text
    db.expire_all()
    member = db.get(Member, created["id"])
    assert member.access_email_requested and member.status == MemberStatus.PENDING_DOCS
    assert db.query(EmailOutbox).filter_by(to_email=member.email).count() == 1


def test_active_admin_signup_without_password_can_receive_onboarding_and_detail_preserves_source(client, manual_org):
    db, org = manual_org
    member = Member(org_id=org.id, first_name="Attivo", last_name="Da completare",
                    email=f"active-onboarding-{uuid.uuid4().hex}@example.com", status=MemberStatus.ACTIVE,
                    signup_source=SignupSource.ADMIN.value, is_manual=False, card_no=990000,
                    card_year=datetime.utcnow().year, valid_until=datetime.utcnow()+timedelta(days=60))
    db.add(member); db.commit()
    detail = client.get(f"/api/org-admin/members/{member.id}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["signup_source"] == "admin" and detail.json()["is_manual"] is False
    response = client.post(f"/api/org-admin/members/{member.id}/send-onboarding")
    assert response.status_code == 200, response.text
    db.refresh(member)
    assert member.status == MemberStatus.ACTIVE and member.card_no == 990000 and member.password_hash is None
    assert db.query(EmailOutbox).filter_by(to_email=member.email).count() == 1

    member.password_hash = "existing-password-hash"
    db.commit()
    assert client.post(f"/api/org-admin/members/{member.id}/send-onboarding").status_code == 409
    assert db.query(EmailOutbox).filter_by(to_email=member.email).count() == 1


def test_send_onboarding_is_tenant_scoped_and_restricted_to_eligible_manual_members(client, manual_org):
    db, org = manual_org
    other = Organization(name="Other onboarding", slug=f"other-onboarding-{uuid.uuid4().hex}", is_active=True)
    db.add(other); db.flush()
    cases = [
        (Member(org_id=other.id, first_name="Foreign", status=MemberStatus.PENDING_DOCS, signup_source=SignupSource.ADMIN.value), 404),
        (Member(org_id=org.id, first_name="Deleted", status=MemberStatus.PENDING_DOCS, signup_source=SignupSource.ADMIN.value, deleted_at=datetime.utcnow()), 404),
        (Member(org_id=org.id, first_name="Online", status=MemberStatus.PENDING_DOCS, signup_source=SignupSource.ASSONAM_FORM.value), 409),
        (Member(org_id=org.id, first_name="Active", status=MemberStatus.ACTIVE, signup_source=SignupSource.ADMIN.value), 409),
        (Member(org_id=org.id, first_name="Rejected", status=MemberStatus.REJECTED, signup_source=SignupSource.ADMIN.value), 409),
        (Member(org_id=org.id, first_name="No email", status=MemberStatus.PENDING_DOCS, signup_source=SignupSource.ADMIN.value), 400),
    ]
    db.add_all([member for member, _status in cases]); db.commit()
    for member, expected in cases:
        response = client.post(f"/api/org-admin/members/{member.id}/send-onboarding")
        assert response.status_code == expected, response.text
    assert client.post("/api/org-admin/members/999999999/send-onboarding").status_code == 404
    assert db.query(EmailOutbox).count() == 0
    client.cookies.clear()
    assert client.post(f"/api/org-admin/members/{cases[-1][0].id}/send-onboarding").status_code == 401


def test_invitation_failure_rolls_back_member_token_and_email_together(client, manual_org, monkeypatch):
    from app.services import member_onboarding
    db, org = manual_org
    actual_queue = member_onboarding.queue_member_onboarding
    def fail_after_queue(*args, **kwargs):
        actual_queue(*args, **kwargs)
        raise RuntimeError("synthetic enqueue transaction failure")
    monkeypatch.setattr(member_onboarding, "queue_member_onboarding", fail_after_queue)
    email = f"rollback-{uuid.uuid4().hex}@example.com"
    with pytest.raises(RuntimeError, match="synthetic enqueue transaction failure"):
        client.post("/api/org-admin/members", json={"first_name": "Atomic", "last_name": "Test", "email": email, "send_access_email": True})
    assert db.query(Member).filter_by(org_id=org.id, email=email).count() == 0
    assert db.query(EmailOutbox).filter_by(to_email=email).count() == 0
    assert db.query(Token).join(Member, Member.id == Token.member_id).filter(Member.email == email).count() == 0


@pytest.mark.parametrize("scenario,expected", [("active", "active"), ("payment", "payment_pending"), ("stock", "card_stock_exhausted")])
def test_manual_decision_reports_actual_activation_outcome(client, manual_org, scenario, expected):
    db, org = manual_org
    member = Member(org_id=org.id, first_name="Decision", last_name="Outcome", status=MemberStatus.PENDING_DOCS,
                    signup_source=SignupSource.ADMIN.value, membership_type="annual")
    db.add(member)
    if scenario == "active":
        start = int(db.query(func.max(CardBatch.end_no)).scalar() or 900000) + 100
        db.add(CardBatch(org_id=org.id, year=datetime.utcnow().year, start_no=start, end_no=start+3, next_no=start))
    if scenario == "payment":
        org.payment_provider = "sumup"
        org.sumup_enabled = org.payment_required_before_card = True
    db.commit()
    response = client.post(f"/api/org-admin/members/{member.id}/decision", json={"decision": "approve"})
    assert response.status_code == 200, response.text
    assert response.json()["activation_status"] == expected
    assert response.json()["reason"] == (None if expected == "active" else expected)
    db.refresh(member)
    assert member.status == (MemberStatus.ACTIVE if expected == "active" else MemberStatus.PENDING_CARDS)
    assert db.query(EmailOutbox).count() == 0


def test_deleted_member_cannot_be_activated(client, manual_org):
    db, org = manual_org
    member = Member(org_id=org.id, first_name="Deleted", status=MemberStatus.PENDING_DOCS, deleted_at=datetime.utcnow())
    db.add(member); db.commit()
    response = client.post(f"/api/org-admin/members/{member.id}/decision", json={"decision": "approve"})
    assert response.status_code == 404
    db.refresh(member)
    assert member.status == MemberStatus.PENDING_DOCS and member.decision_at is None and member.card_no is None


def test_member_deleted_at_fulfillment_lock_is_not_issued_a_card(client, manual_org, monkeypatch):
    from app.services import membership_payments
    db, org = manual_org
    member = Member(org_id=org.id, first_name="Concurrent deletion", status=MemberStatus.PENDING_DOCS)
    start = int(db.query(func.max(CardBatch.end_no)).scalar() or 900000) + 100
    batch = CardBatch(org_id=org.id, year=datetime.utcnow().year, start_no=start, end_no=start+3, next_no=start)
    db.add_all([member, batch]); db.commit()
    actual_lock = membership_payments._lock_member_for_fulfillment
    def deleted_at_lock(session, candidate):
        locked = actual_lock(session, candidate)
        locked.deleted_at = datetime.utcnow()
        return locked
    monkeypatch.setattr(membership_payments, "_lock_member_for_fulfillment", deleted_at_lock)
    response = client.post(f"/api/org-admin/members/{member.id}/decision", json={"decision": "approve"})
    assert response.status_code == 404, response.text
    db.refresh(member); db.refresh(batch)
    assert member.status == MemberStatus.PENDING_DOCS and member.card_no is None and member.decision_at is None
    assert batch.next_no == start
    assert db.query(EmailOutbox).count() == 0


def test_manual_signup_onboarding_then_admin_activation_allows_normal_member_login(client, manual_org, monkeypatch, tmp_path):
    """Exercise the API boundary between pending onboarding and a real account."""
    db, org = manual_org
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path / "uploads"))
    org.require_membership_document = True
    org.auto_approve_signup = False
    org.payment_required_before_card = False
    start = int(db.query(func.max(CardBatch.end_no)).scalar() or 900000) + 100
    db.add(CardBatch(org_id=org.id, year=datetime.utcnow().year, start_no=start, end_no=start+3, next_no=start))
    db.commit()

    created = create_member(client)
    member_id = created["id"]
    assert created["email_status"] == created["registration_email_status"] == "queued"
    invitation = db.query(EmailOutbox).filter_by(to_email=created["email"]).one()
    assert invitation.email_type == "member_manual_onboarding"
    token = re.search(r"#token=([^\s]+)", invitation.payload_json["text_body"]).group(1)
    password = "SyntheticOnboardingComplete123!"

    # Separate cookie jars ensure an admin session never authorizes member work.
    member_client = TestClient(app)
    try:
        entered = member_client.post("/api/member/onboarding/session", json={"token": token})
        assert entered.status_code == 200, entered.text
        assert member_client.get("/api/auth/me").status_code == 401
        assert member_client.get("/api/member/documents").status_code == 401
        completed = member_client.post("/api/member/onboarding/complete", data={"new_password": password},
            files={"identity_document": ("identity.pdf", b"%PDF-1.4\nsynthetic identity document", "application/pdf")})
        assert completed.status_code == 200, completed.text
        assert completed.json()["completed"] is True
        assert completed.json()["member"]["is_active"] is False
        session_cookie = member_client.cookies.get("session")
        limited_session = json.loads(base64.b64decode(session_cookie.split(".", 1)[0]))
        assert "member_onboarding" in limited_session
        assert "member_id" not in limited_session and "member_auth_version" not in limited_session
        assert member_client.get("/api/auth/me").status_code == 401
        blocked = member_client.post("/api/auth/login", data={"email": created["email"], "password": password})
        assert blocked.status_code == 403, blocked.text

        db.expire_all()
        member = db.get(Member, member_id)
        assert member.status == MemberStatus.PENDING_DOCS and member.card_no is None and member.password_hash
        document = db.query(MemberDocument).filter_by(member_id=member_id, doc_type="identity").one()
        reviewed = client.post(f"/api/org-admin/documents/{document.id}/approve")
        assert reviewed.status_code == 200, reviewed.text
        db.refresh(member)
        assert member.status == MemberStatus.PENDING_DOCS and member.card_no is None
        assert db.query(EmailOutbox).filter_by(to_email=created["email"]).count() == 1

        decision = client.post(f"/api/org-admin/members/{member_id}/decision", json={"decision": "approve"})
        assert decision.status_code == 200, decision.text
        assert decision.json()["activation_status"] == "active" and decision.json()["reason"] is None
        db.refresh(member)
        assert member.status == MemberStatus.ACTIVE and member.card_no == start and not member.access_email_requested
        repeated = client.post(f"/api/org-admin/members/{member_id}/decision", json={"decision": "approve"})
        assert repeated.status_code == 200, repeated.text
        db.expire_all()
        jobs = db.query(EmailOutbox).filter_by(to_email=created["email"]).all()
        assert len(jobs) == 2
        assert {job.email_type for job in jobs} == {"member_manual_onboarding", "member_card_ready"}
        assert len({job.dedupe_key for job in jobs}) == 2
        assert all(job.status == EmailOutboxStatus.QUEUED.value for job in jobs)

        login = member_client.post("/api/auth/login", data={"email": created["email"], "password": password})
        assert login.status_code == 200 and login.json()["authenticated"] is True, login.text
        me = member_client.get("/api/auth/me")
        assert me.status_code == 200, me.text
        assert me.json()["id"] == member_id and me.json()["card_no"] == start and me.json()["card_status"] == "attiva"
    finally:
        member_client.close()

from datetime import datetime, timedelta
import uuid

import pytest

from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    AffiliationApplication,
    Organization,
    OrgAdminToken,
    Referral,
    ReferralStatus,
)
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _login_super_admin(client):
    client.post("/api/super-admin/auth/logout")
    response = client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    )
    assert response.status_code == 200, response.text


def _login_org_admin(client, db, admin_id: int):
    token_str = f"referral-org-admin-{admin_id}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=20),
    )
    db.add(token)
    db.commit()
    verify = client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)
    assert verify.status_code in (302, 307), verify.text


def _patch_required_fields(client, token: str, *, email: str, payment_method: str):
    response = client.patch(
        f"/api/affiliazione/draft/{token}",
        json={
            "organization_name": f"Associazione Referral {uuid.uuid4().hex[:8]}",
            "organization_legal_name": f"Associazione Referral Legale {uuid.uuid4().hex[:8]}",
            "address_line1": "Via Referral 1",
            "city": "Roma",
            "province": "RM",
            "postal_code": "00100",
            "country": "Italy",
            "applicant_full_name": "Mario Rossi",
            "applicant_email": email,
            "applicant_phone": "+3906000000",
            "payment_method": payment_method,
            "manual_contact": "Segreteria ASSONAM",
        },
    )
    assert response.status_code == 200, response.text


def _replace_required_people(client, token: str):
    response = client.put(
        f"/api/affiliazione/draft/{token}/people",
        json={
            "items": [
                {
                    "role": "presidente",
                    "full_name": "Mario Rossi",
                    "email": "presidente@example.com",
                    "phone": "+3906111111",
                },
                {
                    "role": "segretario",
                    "full_name": "Giulia Bianchi",
                    "email": "segretario@example.com",
                    "phone": "+3906222222",
                },
                {
                    "role": "tesoriere",
                    "full_name": "Luca Verdi",
                    "email": "tesoriere@example.com",
                    "phone": "+3906333333",
                },
            ]
        },
    )
    assert response.status_code == 200, response.text


def _upload_required_docs(client, token: str):
    pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
    for doc_type in [
        "statuto",
        "atto_costitutivo",
        "documento_presidente",
        "codice_fiscale_presidente",
        "documento_vicepresidente",
        "documento_segretario_tesoriere",
    ]:
        response = client.post(
            f"/api/affiliazione/draft/{token}/documents",
            data={"doc_type": doc_type},
            files={"file": (f"{doc_type}.pdf", pdf_bytes, "application/pdf")},
        )
        assert response.status_code == 200, response.text


def test_referral_lifecycle_to_rewarded(client, db):
    suffix = uuid.uuid4().hex[:8]
    referrer_org = Organization(
        name=f"Referrer Club {suffix}",
        slug=f"referrer-{suffix}",
        is_active=True,
    )
    db.add(referrer_org)
    db.commit()
    db.refresh(referrer_org)

    referrer_admin = AdminUser(
        email=f"referrer-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=referrer_org.id,
        is_active=True,
    )
    db.add(referrer_admin)
    db.commit()
    db.refresh(referrer_admin)

    applicant_email = f"affiliate-{suffix}@example.com"
    create_response = client.post(
        "/api/affiliazione/draft",
        json={
            "applicant_email": applicant_email,
            "referral_slug": referrer_org.slug,
        },
    )
    assert create_response.status_code == 200, create_response.text
    draft_payload = create_response.json()
    token = draft_payload["public_token"]
    application_id = int(draft_payload["id"])

    referral_payload = draft_payload.get("referral")
    assert isinstance(referral_payload, dict)
    assert referral_payload["referrer_org_slug"] == referrer_org.slug
    assert referral_payload["status"] == ReferralStatus.PENDING.value

    _patch_required_fields(client, token, email=applicant_email, payment_method="cash")
    _replace_required_people(client, token)
    _upload_required_docs(client, token)

    submit_response = client.post(f"/api/affiliazione/draft/{token}/submit")
    assert submit_response.status_code == 200, submit_response.text

    _login_super_admin(client)

    detail_before = client.get(f"/api/super-admin/affiliations/{application_id}")
    assert detail_before.status_code == 200, detail_before.text
    for document in detail_before.json().get("documents", []):
        review_response = client.post(
            f"/api/super-admin/affiliations/{application_id}/documents/{document['id']}/review",
            json={"status": "approved", "notes": "Documento ok"},
        )
        assert review_response.status_code == 200, review_response.text

    verify_payment = client.post(
        f"/api/super-admin/affiliations/{application_id}/payment/verify",
        json={"verified": True, "notes": "Pagamento verificato"},
    )
    assert verify_payment.status_code == 200, verify_payment.text

    approve_response = client.post(
        f"/api/super-admin/affiliations/{application_id}/approve",
        json={"notes": "Approvazione referral test"},
    )
    assert approve_response.status_code == 200, approve_response.text

    referral_db = (
        db.query(Referral)
        .filter(Referral.application_id == application_id)
        .first()
    )
    assert referral_db is not None
    assert referral_db.status == ReferralStatus.APPROVED.value
    assert referral_db.approved_at is not None

    client.post("/api/org-admin/auth/logout")
    _login_org_admin(client, db, referrer_admin.id)

    summary_response = client.get("/api/org-admin/referrals/summary")
    assert summary_response.status_code == 200, summary_response.text
    summary_payload = summary_response.json()
    assert summary_payload["stats"]["sent"] >= 1
    assert summary_payload["stats"]["approved"] >= 1
    assert summary_payload["stats"]["rewarded"] >= 0
    assert len(summary_payload["pending_reward_referrals"]) >= 1

    pending_referral_id = int(summary_payload["pending_reward_referrals"][0]["id"])
    spin_response = client.post(f"/api/org-admin/referrals/{pending_referral_id}/spin")
    assert spin_response.status_code == 200, spin_response.text
    spin_payload = spin_response.json()
    assert spin_payload["status"] == ReferralStatus.REWARDED.value
    assert spin_payload["reward"]["title"]
    assert "super admin" in spin_payload["message"].lower()

    refreshed_summary_response = client.get("/api/org-admin/referrals/summary")
    assert refreshed_summary_response.status_code == 200, refreshed_summary_response.text
    refreshed_summary = refreshed_summary_response.json()
    assert refreshed_summary["stats"]["rewarded"] >= 1
    assert all(
        item["status"] != ReferralStatus.APPROVED.value
        for item in refreshed_summary["pending_reward_referrals"]
    )

    referral_db = db.query(Referral).filter(Referral.id == pending_referral_id).first()
    assert referral_db is not None
    assert referral_db.status == ReferralStatus.REWARDED.value
    assert referral_db.reward_title is not None
    assert referral_db.reward_delivery_timing is not None


def test_org_admin_can_create_referral_invite(client, db):
    suffix = uuid.uuid4().hex[:8]
    referrer_org = Organization(
        name=f"Org Invite {suffix}",
        slug=f"org-invite-{suffix}",
        is_active=True,
    )
    db.add(referrer_org)
    db.commit()
    db.refresh(referrer_org)

    referrer_admin = AdminUser(
        email=f"org-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=referrer_org.id,
        is_active=True,
    )
    db.add(referrer_admin)
    db.commit()
    db.refresh(referrer_admin)

    client.post("/api/org-admin/auth/logout")
    _login_org_admin(client, db, referrer_admin.id)

    invited_email = f"invited-{suffix}@example.com"
    invite_response = client.post(
        "/api/org-admin/referrals/invite",
        json={
            "applicant_email": invited_email,
            "organization_name": f"Associazione Invitata {suffix}",
            "notes": "Invito da dashboard org admin",
        },
    )
    assert invite_response.status_code == 200, invite_response.text
    invite_payload = invite_response.json()
    assert invite_payload["ok"] is True
    assert invite_payload["status"] == "draft"
    assert "token=" in invite_payload["invite_url"]
    assert invite_payload["referral_id"] is not None

    application = (
        db.query(AffiliationApplication)
        .filter(AffiliationApplication.id == int(invite_payload["application_id"]))
        .first()
    )
    assert application is not None
    assert application.status == "draft"
    assert (application.applicant_email or "").lower() == invited_email

    referral = (
        db.query(Referral)
        .filter(Referral.application_id == application.id)
        .first()
    )
    assert referral is not None
    assert referral.referrer_org_id == referrer_org.id
    assert referral.status == ReferralStatus.PENDING.value

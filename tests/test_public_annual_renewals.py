from datetime import date, datetime, timedelta
from decimal import Decimal
from urllib.parse import parse_qs, urlparse
import re
import uuid

import pytest
from sqlalchemy import func

from app.db import SessionLocal
from app.models import AnnualMembershipTerm, CardBatch, EmailOutbox, Member, MemberDocument, MemberStatus, MembershipPayment, Organization, Token
from app.security import get_password_hash, verify_password
from app.services.membership_payments import encrypt_sumup_api_key
from tests.signup_payloads import build_join_submit_data


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _cardholder(db, *, status=MemberStatus.ACTIVE, online=False):
    suffix = uuid.uuid4().hex[:12]
    year = datetime.utcnow().year
    org = Organization(name=f"Rinnovi pubblici {suffix}", slug=f"public-renewal-{suffix}", is_active=True,
                       auto_approve_signup=True, membership_fee_amount=Decimal("25.00") if online else Decimal("0.00"), membership_fee_currency="EUR")
    if online:
        org.payment_provider = "sumup"
        org.payment_required_before_card = True
        org.sumup_enabled = True
        org.sumup_api_key_encrypted = encrypt_sumup_api_key("qa-key")
        org.membership_payment_label = "Quota annuale"
        org.payment_button_label = "Paga con carta"
    db.add(org)
    db.flush()
    last = int(db.query(func.max(CardBatch.end_no)).scalar() or 200000) + 10
    db.add(CardBatch(org_id=org.id, year=year, start_no=last, end_no=last + 3, next_no=last))
    member = Member(org_id=org.id, first_name="Nome originale", last_name="Storico", email=f"renew-{suffix}@example.com",
                    phone="original-phone", fiscal_code=f"QA{suffix[:10].upper()}", password_hash=get_password_hash("Original123!"),
                    card_no=last - 1, card_year=year - 1, status=status, membership_type="annual", joined_at=datetime(year - 1, 2, 1), internal_notes="Nota conservata")
    db.add(member)
    db.flush()
    db.add(AnnualMembershipTerm(org_id=org.id, member_id=member.id, membership_year=year - 1,
                               starts_on=date(year - 1, 1, 1), valid_through=date(year, 1, 1),
                               status="expired", card_no=member.card_no, card_year=member.card_year, fee_amount=Decimal("25.00"), currency="EUR", source="test"))
    doc = MemberDocument(member_id=member.id, doc_type="identity", rel_path="qa/keep-original.pdf", original_filename="original.pdf", mime_type="application/pdf", size_bytes=5, status="approved")
    db.add(doc)
    db.commit()
    return org, member, doc


def _logout(client):
    client.post("/api/auth/logout")
    client.post("/api/org-admin/auth/logout")


def _last_link(db, member):
    db.expire_all()
    mail = db.query(EmailOutbox).filter(EmailOutbox.to_email == member.email).order_by(EmailOutbox.created_at.desc()).first()
    assert mail is not None
    text = mail.payload_json["text_body"]
    link = re.search(r"https?://\S+", text).group(0)
    return parse_qs(urlparse(link).query), mail


def test_public_renewal_link_requires_proof_and_scopes_to_organization(client, db):
    _logout(client)
    org, member, doc = _cardholder(db)
    baseline = (member.password_hash, member.auth_version, member.card_year)
    assert client.get(f"/api/join/{org.slug}/renewal").status_code == 401
    assert client.post(f"/api/join/{org.slug}/renewal/confirm").status_code == 401
    response = client.post(f"/api/join/{org.slug}/renewal/request", data={"email": member.email.upper()})
    unknown = client.post(f"/api/join/{org.slug}/renewal/request", data={"email": "unknown@example.com"})
    assert response.status_code == unknown.status_code == 200
    assert response.json() == unknown.json()
    query, mail = _last_link(db, member)
    assert set(query) == {"token"}
    assert f"/api/join/{org.slug}/renewal/verify?token=" in mail.payload_json["text_body"]
    assert "/auth/verify" not in mail.payload_json["text_body"]
    assert mail.payload_json["meta"]["member_id"] == member.id
    assert db.query(AnnualMembershipTerm).filter_by(member_id=member.id).count() == 1
    assert (member.password_hash, member.auth_version, member.card_year) == baseline
    assert db.get(MemberDocument, doc.id).status == "approved"
    # A rapid retry queues neither another proof nor another email.
    client.post(f"/api/join/{org.slug}/renewal/request", data={"email": member.email})
    assert db.query(EmailOutbox).filter_by(to_email=member.email).count() == 1
    assert db.query(Token).filter_by(member_id=member.id).count() == 1


@pytest.mark.parametrize("status", [MemberStatus.ACTIVE, MemberStatus.EXPIRED])
def test_verified_public_renewal_keeps_same_member_and_document_history(client, db, status):
    _logout(client)
    org, member, doc = _cardholder(db, status=status)
    original = (member.id, member.first_name, member.last_name, member.phone, member.fiscal_code, member.password_hash, member.auth_version, member.joined_at, member.internal_notes)
    client.post(f"/api/join/{org.slug}/renewal/request", data={"email": member.email})
    query, _mail = _last_link(db, member)
    token = query["token"][0]
    access = client.get(f"/api/join/{org.slug}/renewal/verify?token={token}", follow_redirects=False)
    assert access.status_code == 302
    assert access.headers["location"] == f"/associazioni/{org.slug}/iscrizione?rinnovo=1"
    assert "no-store" in access.headers["cache-control"]
    context = client.get(f"/api/join/{org.slug}/renewal")
    assert context.status_code == 200
    assert context.json()["membership"]["can_renew"] is True
    response = client.post(f"/api/join/{org.slug}/renewal/confirm")
    assert response.status_code == 200, response.text
    assert response.json()["term"]["membership_year"] == datetime.utcnow().year
    assert response.json()["term"]["card_no"] is not None
    db.expire_all()
    member = db.get(Member, original[0])
    assert (member.id, member.first_name, member.last_name, member.phone, member.fiscal_code, member.password_hash, member.auth_version, member.joined_at, member.internal_notes) == original
    assert db.query(Member).filter_by(org_id=org.id).count() == 1
    assert db.query(MemberDocument).filter_by(member_id=member.id).count() == 1
    assert db.get(MemberDocument, doc.id).rel_path == "qa/keep-original.pdf"
    assert db.query(AnnualMembershipTerm).filter_by(member_id=member.id).count() == 2
    # Proof was single-use; no new authenticated client can reuse it.
    _logout(client)
    replay = client.get(f"/api/join/{org.slug}/renewal/verify?token={token}", follow_redirects=False)
    assert replay.headers["location"] == f"/associazioni/{org.slug}/iscrizione?rinnovo=1&link=expired"
    assert client.get(f"/api/join/{org.slug}/renewal").status_code == 401


def test_public_renewal_proof_wrong_tenant_is_not_consumed_and_redirect_is_fixed(client, db):
    _logout(client)
    org, member, _doc = _cardholder(db)
    other_org, _other_member, _doc = _cardholder(db)
    client.post(f"/api/join/{org.slug}/renewal/request", data={"email": member.email})
    query, _mail = _last_link(db, member)
    token = query["token"][0]
    wrong_tenant = client.get(f"/api/join/{other_org.slug}/renewal/verify?token={token}", follow_redirects=False)
    assert wrong_tenant.status_code == 302
    assert wrong_tenant.headers["location"] == f"/associazioni/{other_org.slug}/iscrizione?rinnovo=1&link=expired"
    db.expire_all()
    proof = db.query(Token).filter_by(member_id=member.id).one()
    assert proof.used_at is None
    assert client.get(f"/api/join/{org.slug}/renewal").status_code == 401
    valid = client.get(f"/api/join/{org.slug}/renewal/verify?token={token}&next=https%3A%2F%2Fevil.example", follow_redirects=False)
    assert valid.headers["location"] == f"/associazioni/{org.slug}/iscrizione?rinnovo=1"
    assert client.get(f"/api/join/{org.slug}/renewal").status_code == 200
    assert db.query(AnnualMembershipTerm).filter_by(member_id=member.id).count() == 1


@pytest.mark.parametrize("invalid_reason", ["expired", "revoked_credentials", "rejected_member"])
def test_public_renewal_proof_revalidates_expiry_credentials_and_member_state(client, db, invalid_reason):
    _logout(client)
    org, member, _doc = _cardholder(db)
    client.post(f"/api/join/{org.slug}/renewal/request", data={"email": member.email})
    query, _mail = _last_link(db, member)
    token = query["token"][0]
    proof = db.query(Token).filter_by(member_id=member.id).one()
    if invalid_reason == "expired":
        proof.expires_at = datetime.utcnow() - timedelta(seconds=1)
    elif invalid_reason == "revoked_credentials":
        member.auth_version += 1
    else:
        member.status = MemberStatus.REJECTED
    db.commit()
    invalid = client.get(f"/api/join/{org.slug}/renewal/verify?token={token}", follow_redirects=False)
    assert invalid.headers["location"] == f"/associazioni/{org.slug}/iscrizione?rinnovo=1&link=expired"
    assert client.get(f"/api/join/{org.slug}/renewal").status_code == 401
    db.expire_all()
    assert db.get(Token, proof.id).used_at is None
    assert db.query(AnnualMembershipTerm).filter_by(member_id=member.id).count() == 1


def test_full_wizard_wrong_password_queues_renewal_without_overwriting_profile(client, db):
    _logout(client)
    org, member, doc = _cardholder(db)
    data = build_join_submit_data(email=member.email, first_name="Attacker", last_name="Changed")
    data["password"] = "NewUnrelated123!"
    response = client.post(f"/api/join/{org.slug}/submit", data=data, files={"id_document": ("replacement.pdf", b"%PDF-1.4 fake", "application/pdf")})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "renewal_verification_required"
    db.expire_all()
    member = db.get(Member, member.id)
    assert member.first_name == "Nome originale"
    assert member.phone == "original-phone"
    assert verify_password("Original123!", member.password_hash)
    assert db.get(MemberDocument, doc.id).rel_path == "qa/keep-original.pdf"
    assert db.query(MemberDocument).filter_by(member_id=member.id).count() == 1
    assert db.query(AnnualMembershipTerm).filter_by(member_id=member.id).count() == 1


def test_full_wizard_with_existing_password_renews_instead_of_recreating(client, db):
    _logout(client)
    org, member, doc = _cardholder(db)
    data = build_join_submit_data(email=member.email, first_name="Changed", last_name="Ignored")
    data["password"] = "Original123!"
    response = client.post(f"/api/join/{org.slug}/submit", data=data)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "renewal_requested"
    assert response.json()["term"]["membership_year"] == datetime.utcnow().year
    db.expire_all()
    assert db.get(Member, member.id).first_name == "Nome originale"
    assert db.query(Member).filter_by(org_id=org.id).count() == 1
    assert db.query(AnnualMembershipTerm).filter_by(member_id=member.id).count() == 2
    assert client.get(f"/api/join/{org.slug}/renewal").status_code == 200


def test_public_renewal_cannot_use_a_different_associations_session(client, db):
    _logout(client)
    org, member, _doc = _cardholder(db)
    other_org, other_member, _doc = _cardholder(db)
    response = client.post("/api/auth/login", data={"email": other_member.email, "password": "Original123!"})
    assert response.status_code == 200
    assert response.json()["authenticated"] is True
    assert client.get(f"/api/join/{org.slug}/renewal").status_code == 401
    assert client.post(f"/api/join/{org.slug}/renewal/confirm").status_code == 401
    assert client.get(f"/api/join/{other_org.slug}/renewal").status_code == 200
    # Requesting the other club's renewal for this email produces no email.
    result = client.post(f"/api/join/{other_org.slug}/renewal/request", data={"email": member.email})
    assert result.status_code == 200
    assert db.query(EmailOutbox).filter_by(to_email=member.email).count() == 0


@pytest.mark.parametrize("password", ["Wrong123!", "Original123!"])
def test_online_signup_for_existing_cardholder_uses_renewal_payment_policy(client, db, monkeypatch, password):
    _logout(client)
    org, member, _doc = _cardholder(db, online=True)
    monkeypatch.setattr("app.routes.membership_payments.create_sumup_hosted_checkout", lambda **_kw: pytest.fail("Must not create an initial signup checkout"))
    data = build_join_submit_data(email=member.email, first_name="Ignored")
    data["password"] = password
    response = client.post(f"/api/public/orgs/{org.slug}/membership-payment/create-checkout", data=data)
    assert response.status_code == 200, response.text
    result = response.json()
    if password == "Original123!":
        assert result["status"] == "renewal_requested"
        assert result["checkout_required"] is True
        assert result["term"]["status"] == "payment_pending"
        assert result["term"]["card_no"] is None
        assert result["term"]["fee_amount"] == 25
    else:
        assert result["status"] == "renewal_verification_required"
    db.expire_all()
    assert db.query(MembershipPayment).filter_by(socio_id=member.id).count() == 0
    assert db.get(Member, member.id).first_name == "Nome originale"
    assert db.query(Member).filter_by(org_id=org.id).count() == 1


@pytest.mark.parametrize("route,existing_type,requested_type", [
    ("submit", "annual", "temporary"),
    ("checkout", "annual", "temporary"),
    ("submit", "temporary", "temporary"),
    ("submit", "temporary", "annual"),
])
def test_changing_card_type_in_full_signup_cannot_overwrite_existing_cardholder(client, db, route, existing_type, requested_type):
    _logout(client)
    org, member, doc = _cardholder(db, online=route == "checkout")
    member.membership_type = existing_type
    db.commit()
    data = build_join_submit_data(email=member.email, first_name="Must not overwrite")
    data.update(password="Original123!", membership_type=requested_type)
    url = f"/api/join/{org.slug}/submit" if route == "submit" else f"/api/public/orgs/{org.slug}/membership-payment/create-checkout"
    response = client.post(url, data=data, files={"id_document": ("replacement.pdf", b"%PDF-1.4 fake", "application/pdf")})
    assert response.status_code == 409, response.text
    assert "area riservata" in response.json()["detail"]
    db.expire_all()
    assert db.get(Member, member.id).first_name == "Nome originale"
    assert db.get(Member, member.id).membership_type == existing_type
    assert db.get(MemberDocument, doc.id).rel_path == "qa/keep-original.pdf"
    assert db.query(Member).filter_by(org_id=org.id).count() == 1
    assert db.query(MemberDocument).filter_by(member_id=member.id).count() == 1
    assert db.query(AnnualMembershipTerm).filter_by(member_id=member.id).count() == 1

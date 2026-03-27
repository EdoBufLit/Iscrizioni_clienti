from datetime import datetime
from decimal import Decimal
import uuid

import pytest

from app.db import SessionLocal
from app.models import (
    CardBatch,
    Member,
    MemberStatus,
    MembershipPayment,
    MembershipPaymentStatus,
    Organization,
)
from app.security import get_password_hash
from app.services.membership_payments import (
    create_sumup_hosted_checkout,
    encrypt_sumup_api_key,
)
from tests.signup_payloads import build_join_submit_data


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _login_super_admin(client):
    client.post("/api/super-admin/auth/logout")
    response = client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    )
    assert response.status_code == 200, response.text


def _build_sumup_org(db, slug: str) -> Organization:
    org = db.query(Organization).filter_by(slug=slug).first()
    if not org:
        org = Organization(
            name=f"SumUp {slug}",
            slug=slug,
            is_active=True,
            statute_version="v1",
            privacy_version="v1",
            statute_pdf_path=f"{slug}/statute.pdf",
        )
        db.add(org)
        db.flush()
    org.deleted_at = None
    org.payment_provider = "sumup"
    org.payment_required_before_card = True
    org.membership_payment_label = "Quota associativa annuale"
    org.membership_fee_amount = Decimal("25.00")
    org.membership_fee_currency = "EUR"
    org.payment_button_label = "Paga con carta"
    org.sumup_enabled = True
    org.sumup_api_key_encrypted = encrypt_sumup_api_key("sumup-db-key-1234")
    org.sumup_api_key_last4 = "1234"
    org.sumup_api_key_configured_at = datetime.utcnow()
    db.commit()
    db.refresh(org)
    return org


def _create_member(db, org: Organization, email: str) -> Member:
    member = Member(
        org_id=org.id,
        first_name="Mario",
        last_name="Rossi",
        email=email,
        password_hash=get_password_hash("Pass1234!"),
        status=MemberStatus.PENDING_VERIFICATION,
        signup_ip="127.0.0.1",
        signup_user_agent="pytest",
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def test_super_admin_sumup_settings_store_key_encrypted_and_hide_plaintext(client, db, monkeypatch):
    _login_super_admin(client)
    org = _build_sumup_org(db, f"sumup-settings-{uuid.uuid4().hex[:8]}")

    monkeypatch.setattr(
        "app.routes.super_admin.verify_sumup_api_key",
        lambda api_key: {"merchant_code": "merchant-1", "api_key_seen": api_key},
    )

    response = client.post(
        f"/api/super-admin/organizations/{org.id}/sumup-api-key",
        json={"api_key": "sumup-live-key-9999"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["sumup_api_key_configured"] is True
    assert payload["sumup_api_key_last4"] == "9999"
    assert "api_key" not in payload

    settings = client.get(f"/api/super-admin/organizations/{org.id}/membership-payment-settings")
    assert settings.status_code == 200, settings.text
    settings_payload = settings.json()
    assert settings_payload["sumup_api_key_configured"] is True
    assert settings_payload["sumup_api_key_last4"] == "9999"
    assert "sumup-live-key-9999" not in settings.text

    db.refresh(org)
    assert org.sumup_api_key_encrypted is not None
    assert "sumup-live-key-9999" not in org.sumup_api_key_encrypted


def test_create_sumup_hosted_checkout_uses_org_db_api_key(db, monkeypatch):
    org = _build_sumup_org(db, f"sumup-service-{uuid.uuid4().hex[:8]}")
    member = _create_member(db, org, f"svc-{uuid.uuid4().hex[:8]}@example.com")
    payment = MembershipPayment(
        org_id=org.id,
        socio_id=member.id,
        provider="sumup",
        amount=Decimal("25.00"),
        currency="EUR",
        status=MembershipPaymentStatus.PENDING.value,
        source="sumup",
        checkout_reference=f"svc-{uuid.uuid4().hex[:8]}",
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    seen_headers = []

    class DummyResponse:
        def __init__(self, status_code, payload):
            self.status_code = status_code
            self._payload = payload
            self.text = "ok"

        def json(self):
            return self._payload

    def fake_request(method, url, headers=None, json=None, timeout=None):
        seen_headers.append(headers or {})
        if url.endswith("/me"):
            return DummyResponse(200, {"merchant_code": "merchant-xyz"})
        return DummyResponse(
            200,
            {
                "id": "checkout-new",
                "hosted_checkout_url": "https://sumup.example/checkout-new",
            },
        )

    monkeypatch.setattr("app.services.membership_payments.requests.request", fake_request)

    payload = create_sumup_hosted_checkout(
        org=org,
        member=member,
        payment=payment,
        redirect_url="https://frontend.example/result",
        return_url="https://backend.example/api/webhooks/sumup",
    )

    assert payload["id"] == "checkout-new"
    assert len(seen_headers) == 2
    assert all(headers["Authorization"] == "Bearer sumup-db-key-1234" for headers in seen_headers)


def test_create_checkout_does_not_reuse_expired_checkout(client, db, monkeypatch):
    org = _build_sumup_org(db, f"sumup-expired-{uuid.uuid4().hex[:8]}")
    member = _create_member(db, org, f"expired-{uuid.uuid4().hex[:8]}@example.com")
    old_payment = MembershipPayment(
        org_id=org.id,
        socio_id=member.id,
        provider="sumup",
        amount=Decimal("25.00"),
        currency="EUR",
        status=MembershipPaymentStatus.PENDING.value,
        source="sumup",
        checkout_reference=f"old-ref-{uuid.uuid4().hex[:8]}",
        sumup_checkout_id="old-checkout",
        hosted_checkout_url="https://sumup.example/old",
    )
    db.add(old_payment)
    db.commit()
    db.refresh(old_payment)

    monkeypatch.setattr(
        "app.routes.membership_payments.verify_sumup_checkout",
        lambda org, payment: {"status": "EXPIRED", "id": payment.sumup_checkout_id},
    )
    monkeypatch.setattr(
        "app.routes.membership_payments.create_sumup_hosted_checkout",
        lambda **kwargs: {
            "id": "checkout-fresh",
            "hosted_checkout_url": "https://sumup.example/fresh",
        },
    )

    payload = build_join_submit_data(
        first_name="Mario",
        last_name="Rossi",
        email=member.email,
        accept_statute="true",
        accept_privacy="true",
    )
    payload["password"] = "Pass1234!"

    response = client.post(
        f"/api/public/orgs/{org.slug}/membership-payment/create-checkout",
        data=payload,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["hosted_checkout_url"] == "https://sumup.example/fresh"

    db.refresh(old_payment)
    assert old_payment.status == MembershipPaymentStatus.EXPIRED.value
    new_payment = (
        db.query(MembershipPayment)
        .filter(MembershipPayment.socio_id == member.id)
        .order_by(MembershipPayment.id.desc())
        .first()
    )
    assert new_payment.id != old_payment.id
    assert new_payment.sumup_checkout_id == "checkout-fresh"


def test_sumup_webhook_verifies_checkout_before_completion_and_is_idempotent(client, db, monkeypatch):
    org = _build_sumup_org(db, f"sumup-webhook-{uuid.uuid4().hex[:8]}")
    batch = CardBatch(org_id=org.id, start_no=800, end_no=810, next_no=800)
    db.add(batch)
    member = Member(
        org_id=org.id,
        first_name="Webhook",
        last_name="Member",
        email=f"webhook-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=get_password_hash("Pass1234!"),
        status=MemberStatus.PENDING_CARDS,
        decision_at=datetime.utcnow(),
        decision_by_admin_id=1,
        payment_required=True,
        payment_status=MembershipPaymentStatus.PENDING.value,
        signup_ip="127.0.0.1",
        signup_user_agent="pytest",
    )
    db.add(member)
    db.flush()
    payment = MembershipPayment(
        org_id=org.id,
        socio_id=member.id,
        provider="sumup",
        amount=Decimal("25.00"),
        currency="EUR",
        status=MembershipPaymentStatus.PENDING.value,
        source="sumup",
        checkout_reference=f"webhook-ref-{uuid.uuid4().hex[:8]}",
        sumup_checkout_id="webhook-checkout",
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    db.refresh(member)

    verify_calls = {"count": 0}

    def fake_verify(org_arg, payment_arg):
      verify_calls["count"] += 1
      return {"status": "PAID", "id": payment_arg.sumup_checkout_id}

    monkeypatch.setattr("app.routes.membership_payments.verify_sumup_checkout", fake_verify)

    first = client.post("/api/webhooks/sumup", json={"id": "webhook-checkout"})
    second = client.post("/api/webhooks/sumup", json={"id": "webhook-checkout"})

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert verify_calls["count"] == 2

    db.refresh(payment)
    db.refresh(member)
    assert payment.status == MembershipPaymentStatus.COMPLETED.value
    assert member.payment_status == MembershipPaymentStatus.COMPLETED.value
    assert member.card_no == 800
    assert member.status == MemberStatus.ACTIVE


def test_join_submit_legacy_endpoint_is_blocked_when_online_payment_required(client, db):
    org = _build_sumup_org(db, f"sumup-join-{uuid.uuid4().hex[:8]}")
    payload = build_join_submit_data(
        email=f"join-{uuid.uuid4().hex[:8]}@example.com",
        accept_statute="true",
        accept_privacy="true",
    )
    response = client.post(f"/api/join/{org.slug}/submit", data=payload)
    assert response.status_code == 400, response.text
    assert "Paga con carta" in response.json()["detail"]

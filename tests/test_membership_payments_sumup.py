from datetime import datetime, timedelta, timezone
from decimal import Decimal
import uuid

import pytest

from app.db import SessionLocal
from app.models import (
    AnnualMembershipTerm,
    CardBatch,
    Member,
    MemberStatus,
    MembershipPayment,
    MembershipPaymentStatus,
    Organization,
)
from app.security import get_password_hash, verify_password
from app.services.membership_payments import (
    create_sumup_hosted_checkout,
    encrypt_sumup_api_key,
    maybe_fulfill_member_card,
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


def _build_sumup_org(db, slug: str, *, cards: int = 20) -> Organization:
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
    if cards:
        db.add(CardBatch(
            org_id=org.id,
            year=datetime.utcnow().year,
            start_no=90000,
            end_no=90000 + cards - 1,
            next_no=90000,
        ))
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
        reservation_expires_at=datetime(2026, 9, 7, 12, 15, tzinfo=timezone.utc),
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    seen_headers = []
    seen_payloads = []

    class DummyResponse:
        def __init__(self, status_code, payload):
            self.status_code = status_code
            self._payload = payload
            self.text = "ok"

        def json(self):
            return self._payload

    def fake_request(method, url, headers=None, json=None, timeout=None):
        seen_headers.append(headers or {})
        if json is not None:
            seen_payloads.append(json)
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
    assert seen_payloads[0]["valid_until"] == "2026-09-07T12:15:00Z"


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
        lambda org, payment: {"status": "EXPIRED", "id": payment.sumup_checkout_id, "transactions": []},
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


def test_new_checkout_keeps_password_flow_and_requires_status_cookie(
    client,
    db,
    monkeypatch,
):
    org = _build_sumup_org(db, f"sumup-capability-{uuid.uuid4().hex[:8]}")
    monkeypatch.setattr(
        "app.routes.membership_payments.create_sumup_hosted_checkout",
        lambda **kwargs: {
            "id": "checkout-capability",
            "hosted_checkout_url": "https://sumup.example/capability",
        },
    )
    email = f"capability-{uuid.uuid4().hex[:8]}@example.com"
    signup = build_join_submit_data(
        email=email,
        accept_statute="true",
        accept_privacy="true",
    )
    signup["password"] = "CheckoutPass123!"

    checkout = client.post(
        f"/api/public/orgs/{org.slug}/membership-payment/create-checkout",
        data=signup,
    )

    assert checkout.status_code == 200, checkout.text
    payment_id = checkout.json()["payment_id"]
    payment = db.query(MembershipPayment).filter(MembershipPayment.id == payment_id).one()
    member = db.query(Member).filter(Member.id == payment.socio_id).one()
    assert verify_password("CheckoutPass123!", member.password_hash)
    assert payment.status_token_hash
    assert payment.status_token_expires_at

    cookie_name = f"membership_payment_status_{payment_id}"
    cookie_path = f"/api/public/membership-payments/{payment_id}/status"
    cookie_value = client.cookies.get(cookie_name)
    assert cookie_value
    assert cookie_value not in payment.status_token_hash
    set_cookie = checkout.headers.get("set-cookie", "")
    assert cookie_name in set_cookie
    assert "HttpOnly" in set_cookie
    assert "SameSite=lax" in set_cookie
    assert "Path=/api/public" in set_cookie

    authorized = client.get(cookie_path)
    assert authorized.status_code == 200, authorized.text
    assert authorized.json()["payment_status"] == MembershipPaymentStatus.PENDING.value

    client.cookies.delete(cookie_name, path="/api/public")
    unauthorized = client.get(cookie_path)
    assert unauthorized.status_code == 404


def test_checkout_retry_reuses_broad_capability_without_rotating_it(
    client,
    db,
    monkeypatch,
):
    org = _build_sumup_org(db, f"sumup-retry-{uuid.uuid4().hex[:8]}")
    create_calls = []

    def fake_create(**kwargs):
        create_calls.append(kwargs["payment"].id)
        return {
            "id": "checkout-retry",
            "hosted_checkout_url": "https://sumup.example/retry",
        }

    monkeypatch.setattr(
        "app.routes.membership_payments.create_sumup_hosted_checkout",
        fake_create,
    )
    monkeypatch.setattr(
        "app.routes.membership_payments.verify_sumup_checkout",
        lambda org, payment: {"status": "PENDING", "id": payment.sumup_checkout_id},
    )
    email = f"retry-{uuid.uuid4().hex[:8]}@example.com"
    signup = build_join_submit_data(
        email=email,
        accept_statute="true",
        accept_privacy="true",
    )
    signup["password"] = "CheckoutPass123!"

    first = client.post(
        f"/api/public/orgs/{org.slug}/membership-payment/create-checkout",
        data=signup,
    )
    assert first.status_code == 200, first.text
    payment_id = first.json()["payment_id"]
    payment = db.query(MembershipPayment).filter_by(id=payment_id).one()
    first_hash = payment.status_token_hash

    retry_payload = dict(signup)
    retry_payload.pop("password")
    retry_payload["phone"] = "3339998888"
    retried = client.post(
        f"/api/public/orgs/{org.slug}/membership-payment/create-checkout",
        data=retry_payload,
    )

    assert retried.status_code == 200, retried.text
    assert retried.json() == first.json()
    db.refresh(payment)
    assert payment.status_token_hash == first_hash
    assert create_calls == [payment_id]
    member = db.query(Member).filter_by(id=payment.socio_id).one()
    assert member.phone == "3339998888"


def test_unauthenticated_checkout_retry_cannot_rotate_token_or_overwrite_member(
    client,
    db,
    monkeypatch,
):
    org = _build_sumup_org(db, f"sumup-takeover-{uuid.uuid4().hex[:8]}")
    monkeypatch.setattr(
        "app.routes.membership_payments.create_sumup_hosted_checkout",
        lambda **kwargs: {
            "id": "checkout-takeover",
            "hosted_checkout_url": "https://sumup.example/takeover",
        },
    )
    monkeypatch.setattr(
        "app.routes.membership_payments.verify_sumup_checkout",
        lambda org, payment: {"status": "PENDING", "id": payment.sumup_checkout_id},
    )
    email = f"takeover-{uuid.uuid4().hex[:8]}@example.com"
    signup = build_join_submit_data(
        email=email,
        phone="3331112222",
        accept_statute="true",
        accept_privacy="true",
    )
    signup["password"] = "CheckoutPass123!"
    first = client.post(
        f"/api/public/orgs/{org.slug}/membership-payment/create-checkout",
        data=signup,
    )
    assert first.status_code == 200, first.text
    payment = db.query(MembershipPayment).filter_by(id=first.json()["payment_id"]).one()
    member = db.query(Member).filter_by(id=payment.socio_id).one()
    first_hash = payment.status_token_hash

    # The shared TestClient can retain an admin/member session from earlier
    # tests. Clear every capability so this retry is genuinely anonymous.
    client.cookies.clear()
    unauthenticated_retry = dict(signup)
    unauthenticated_retry.pop("password")
    unauthenticated_retry["phone"] = "3330000000"
    retried = client.post(
        f"/api/public/orgs/{org.slug}/membership-payment/create-checkout",
        data=unauthenticated_retry,
    )

    assert retried.status_code == 200, retried.text
    assert "set-cookie" not in retried.headers
    db.refresh(payment)
    db.refresh(member)
    assert payment.status_token_hash == first_hash
    assert member.phone == "3331112222"

    conflicting_identity = build_join_submit_data(
        first_name="Luigi",
        email=email,
        accept_statute="true",
        accept_privacy="true",
    )
    conflict = client.post(
        f"/api/public/orgs/{org.slug}/membership-payment/create-checkout",
        data=conflicting_identity,
    )
    assert conflict.status_code == 409
    db.refresh(payment)
    db.refresh(member)
    assert payment.status_token_hash == first_hash
    assert member.first_name == "Mario"


def test_checkout_does_not_replace_preexisting_member_password(client, db, monkeypatch):
    org = _build_sumup_org(db, f"sumup-password-{uuid.uuid4().hex[:8]}")
    member = _create_member(db, org, f"existing-{uuid.uuid4().hex[:8]}@example.com")
    original_hash = member.password_hash
    monkeypatch.setattr(
        "app.routes.membership_payments.create_sumup_hosted_checkout",
        lambda **kwargs: {
            "id": "checkout-existing-password",
            "hosted_checkout_url": "https://sumup.example/existing-password",
        },
    )
    signup = build_join_submit_data(
        email=member.email,
        accept_statute="true",
        accept_privacy="true",
    )
    signup["password"] = "ReplacementPass123!"

    checkout = client.post(
        f"/api/public/orgs/{org.slug}/membership-payment/create-checkout",
        data=signup,
    )

    assert checkout.status_code == 200, checkout.text
    db.refresh(member)
    assert member.password_hash == original_hash
    assert verify_password("Pass1234!", member.password_hash)
    assert not verify_password("ReplacementPass123!", member.password_hash)


def test_legacy_status_access_expires_after_compatibility_window(client, db):
    org = _build_sumup_org(db, f"sumup-legacy-{uuid.uuid4().hex[:8]}")
    member = _create_member(db, org, f"legacy-{uuid.uuid4().hex[:8]}@example.com")
    payment = MembershipPayment(
        org_id=org.id,
        socio_id=member.id,
        provider="sumup",
        amount=Decimal("25.00"),
        currency="EUR",
        status=MembershipPaymentStatus.PENDING.value,
        source="sumup",
        checkout_reference=f"legacy-{uuid.uuid4().hex[:8]}",
        sumup_checkout_id="legacy-checkout",
        created_at=datetime.now(timezone.utc) - timedelta(days=8),
        status_token_expires_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    response = client.get(f"/api/public/membership-payments/{payment.id}/status")
    assert response.status_code == 404


def test_recent_legacy_status_is_claimed_only_by_original_browser_context(client, db):
    org = _build_sumup_org(db, f"sumup-legacy-claim-{uuid.uuid4().hex[:8]}")
    email = f"legacy-claim-{uuid.uuid4().hex[:8]}@example.com"
    member = _create_member(db, org, email)
    member.signup_ip = "testclient"
    member.signup_user_agent = "legacy-owner-browser"
    payment = MembershipPayment(
        org_id=org.id,
        socio_id=member.id,
        provider="sumup",
        amount=Decimal("25.00"),
        currency="EUR",
        status=MembershipPaymentStatus.PENDING.value,
        source="sumup",
        checkout_reference=f"legacy-claim-{uuid.uuid4().hex[:8]}",
        sumup_checkout_id="legacy-claim-checkout",
        created_at=datetime.now(timezone.utc),
        status_token_expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    blocked = client.get(
        f"/api/public/membership-payments/{payment.id}/status",
        headers={"user-agent": "different-browser"},
    )
    assert blocked.status_code == 404
    db.refresh(payment)
    assert payment.status_token_hash is None

    claimed = client.get(
        f"/api/public/membership-payments/{payment.id}/status",
        headers={"user-agent": "legacy-owner-browser"},
    )
    assert claimed.status_code == 200, claimed.text
    db.refresh(payment)
    assert payment.status_token_hash
    assert payment.status_token_expires_at

    # Once upgraded, technical context is no longer the credential: the
    # HttpOnly random capability is, so ordinary network/UA changes keep working.
    resumed = client.get(
        f"/api/public/membership-payments/{payment.id}/status",
        headers={"user-agent": "browser-after-network-change"},
    )
    assert resumed.status_code == 200, resumed.text


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
    annual_term = (
        db.query(AnnualMembershipTerm)
        .filter_by(member_id=member.id, membership_year=member.card_year)
        .one()
    )
    assert annual_term.card_no == 800
    assert annual_term.valid_through.isoformat() == f"{member.card_year + 1}-01-01"


def test_sumup_webhook_queues_standard_card_email_and_status_exposes_card_page(
    client, db, monkeypatch
):
    org = _build_sumup_org(db, f"sumup-ready-{uuid.uuid4().hex[:8]}")
    batch = CardBatch(org_id=org.id, start_no=900, end_no=910, next_no=900)
    db.add(batch)
    member = Member(
        org_id=org.id,
        first_name="Ready",
        last_name="Member",
        email=f"ready-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=get_password_hash("Pass1234!"),
        status=MemberStatus.PENDING_CARDS,
        decision_at=datetime.utcnow(),
        decision_by_admin_id=1,
        payment_required=True,
        payment_status=MembershipPaymentStatus.PENDING.value,
        # Represents an in-flight checkout created before the capability
        # migration and returning in the same browser context.
        signup_ip="testclient",
        signup_user_agent="testclient",
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
        checkout_reference=f"ready-ref-{uuid.uuid4().hex[:8]}",
        sumup_checkout_id="ready-checkout",
        status_token_expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    monkeypatch.setattr(
        "app.routes.membership_payments.verify_sumup_checkout",
        lambda org_arg, payment_arg: {"status": "PAID", "id": payment_arg.sumup_checkout_id},
    )

    email_calls: list[dict[str, object]] = []

    def fake_queue_member_card_email(db_arg, request_arg, member_id, **kwargs):
        email_calls.append({"member_id": member_id, **kwargs})
        return {"sent": False, "queued": True, "reason": "queued", "outbox_id": "outbox-1"}

    monkeypatch.setattr(
        "app.services.membership_payments.queue_member_card_email",
        fake_queue_member_card_email,
    )

    webhook = client.post("/api/webhooks/sumup", json={"id": "ready-checkout"})
    assert webhook.status_code == 200, webhook.text
    assert len(email_calls) == 1
    assert email_calls[0]["member_id"] == member.id
    assert email_calls[0]["require_approved_document"] is False
    assert email_calls[0]["email_type"] == "member_card_active"
    assert f"/associazioni/{org.slug}/tessera?card_token=" in str(
        email_calls[0]["card_view_url_override"]
    )

    status_response = client.get(f"/api/public/membership-payments/{payment.id}/status")
    assert status_response.status_code == 200, status_response.text
    payload = status_response.json()
    assert payload["payment_status"] == MembershipPaymentStatus.COMPLETED.value
    assert payload["card_status"] == "issued"
    assert payload["active_card_page_url"]
    assert f"/associazioni/{org.slug}/tessera?card_token=" in payload["active_card_page_url"]
    assert payload["card_download_url"].endswith(".pdf")
    assert payload["card_wallet_google_url"].endswith("/wallet/google")


def test_fulfillment_refreshes_stale_member_before_allocating_second_card(db):
    org = _build_sumup_org(db, f"sumup-stale-{uuid.uuid4().hex[:8]}")
    org.auto_approve_signup = True
    year = datetime.utcnow().year
    batch = CardBatch(org_id=org.id, year=year, start_no=1200, end_no=1210, next_no=1200)
    db.add(batch)
    member = Member(
        org_id=org.id,
        first_name="Race",
        last_name="Member",
        email=f"race-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=get_password_hash("Pass1234!"),
        status=MemberStatus.PENDING_CARDS,
        payment_required=True,
        payment_status=MembershipPaymentStatus.COMPLETED.value,
        payment_completed_at=datetime.utcnow(),
        signup_ip="127.0.0.1",
        signup_user_agent="pytest",
    )
    db.add(member)
    db.commit()
    member_id = member.id
    org_id = org.id
    batch_id = batch.id

    stale_db = SessionLocal()
    stale_db.expire_on_commit = False
    writer_db = SessionLocal()
    check_db = SessionLocal()
    try:
        stale_member = stale_db.query(Member).filter(Member.id == member_id).first()
        stale_org = stale_db.query(Organization).filter(Organization.id == org_id).first()
        assert stale_member is not None
        assert stale_org is not None
        assert stale_member.card_no is None
        stale_db.commit()

        live_member = writer_db.query(Member).filter(Member.id == member_id).first()
        live_batch = writer_db.query(CardBatch).filter(CardBatch.id == batch_id).first()
        assert live_member is not None
        assert live_batch is not None
        live_member.card_no = 1200
        live_member.card_year = year
        live_member.batch_id = live_batch.id
        live_member.status = MemberStatus.ACTIVE
        live_member.joined_at = datetime.utcnow()
        live_batch.next_no = 1201
        writer_db.commit()

        result = maybe_fulfill_member_card(
            db=stale_db,
            member=stale_member,
            org=stale_org,
            request=None,
        )
        stale_db.commit()

        refreshed_member = check_db.query(Member).filter(Member.id == member_id).first()
        refreshed_batch = check_db.query(CardBatch).filter(CardBatch.id == batch_id).first()
        assert refreshed_member is not None
        assert refreshed_batch is not None
        assert result.issued_card is False
        assert result.reason == "already_fulfilled"
        assert refreshed_member.card_no == 1200
        assert refreshed_batch.next_no == 1201
    finally:
        stale_db.close()
        writer_db.close()
        check_db.close()


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

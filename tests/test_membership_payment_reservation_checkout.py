from datetime import datetime
from decimal import Decimal
import uuid

from fastapi import HTTPException
from starlette.requests import Request
import pytest

from app.db import SessionLocal
from app.models import CardBatch, EmailOutbox, Member, MemberStatus, MembershipPayment
from app.services.membership_payments import apply_membership_payment_completion, maybe_fulfill_member_card
from app.services.renewals import create_renewal_checkout, ensure_renewal_term
from tests.signup_payloads import build_join_submit_data
from tests.test_annual_renewals import _build_member_and_source
from tests.test_membership_payments_sumup import _build_sumup_org


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


def _org(db, *, cards=1, auto_approve=True):
    org = _build_sumup_org(db, f"reserve-{uuid.uuid4().hex[:10]}", cards=cards)
    org.auto_approve_signup = auto_approve
    db.commit()
    return org


def _signup(client, org, *, email=None):
    return client.post(
        f"/api/public/orgs/{org.slug}/membership-payment/create-checkout",
        data=build_join_submit_data(email=email or f"reserve-{uuid.uuid4().hex[:10]}@example.com"),
    )


def _mock_create(monkeypatch, calls):
    def create(**kwargs):
        payment = kwargs["payment"]
        calls.append(payment.id)
        return {
            "id": f"reserved-checkout-{payment.id}",
            "hosted_checkout_url": f"https://sumup.example/reserved/{payment.id}",
        }
    monkeypatch.setattr("app.routes.membership_payments.create_sumup_hosted_checkout", create)


def _paid(monkeypatch):
    monkeypatch.setattr(
        "app.routes.membership_payments.verify_sumup_checkout",
        lambda org, payment: {"id": payment.sumup_checkout_id, "status": "PAID"},
    )


def test_no_stock_blocks_checkout_before_provider_call(client, db, monkeypatch):
    org = _org(db, cards=0)
    calls = []
    _mock_create(monkeypatch, calls)
    response = _signup(client, org)
    assert response.status_code == 409, response.text
    assert response.json()["detail"] == "Tessere esaurite: pagamento online temporaneamente non disponibile."
    assert calls == []
    assert db.query(MembershipPayment).filter_by(org_id=org.id).count() == 0


def test_last_card_is_durable_before_provider_and_cannot_be_reserved_twice(client, db, monkeypatch):
    org = _org(db)
    observed = []

    def create(**kwargs):
        with SessionLocal() as check:
            payment = check.get(MembershipPayment, kwargs["payment"].id)
            assert payment is not None
            assert payment.reservation_state == "held"
            assert payment.reserved_card_no == 90000
            assert payment.member.card_no is None
            assert payment.reservation_expires_at is not None
            observed.append(payment.id)
        return {"id": "last-card-checkout", "hosted_checkout_url": "https://sumup.example/last"}

    monkeypatch.setattr("app.routes.membership_payments.create_sumup_hosted_checkout", create)
    first = _signup(client, org)
    second = _signup(client, org)
    assert first.status_code == 200, first.text
    assert second.status_code == 409, second.text
    assert len(observed) == 1
    assert db.query(MembershipPayment).filter_by(org_id=org.id).count() == 1


def test_paid_webhook_consumes_exact_reservation_once(client, db, monkeypatch):
    org = _org(db)
    calls = []
    _mock_create(monkeypatch, calls)
    checkout = _signup(client, org)
    assert checkout.status_code == 200, checkout.text
    payment = db.get(MembershipPayment, checkout.json()["payment_id"])
    reserved_no = payment.reserved_card_no
    _paid(monkeypatch)
    for _ in range(2):
        response = client.post("/api/webhooks/sumup", json={"id": payment.sumup_checkout_id})
        assert response.status_code == 200, response.text
    db.expire_all()
    assert payment.reservation_state == "consumed"
    assert payment.status == "completed"
    assert payment.member.card_no == reserved_no
    assert payment.member.status == MemberStatus.ACTIVE
    assert len(calls) == 1
    assert db.query(EmailOutbox).filter_by(to_email=payment.member.email, email_type="member_card_active").count() == 1


def test_paid_reservation_waits_for_approval_without_consuming(client, db, monkeypatch):
    org = _org(db, auto_approve=False)
    _mock_create(monkeypatch, [])
    checkout = _signup(client, org)
    assert checkout.status_code == 200, checkout.text
    payment = db.get(MembershipPayment, checkout.json()["payment_id"])
    _paid(monkeypatch)
    response = client.post("/api/webhooks/sumup", json={"id": payment.sumup_checkout_id})
    assert response.status_code == 200, response.text
    db.expire_all()
    assert payment.status == "completed"
    assert payment.reservation_state == "held"
    assert payment.member.card_no is None
    payment.member.decision_at = datetime.utcnow()
    result = maybe_fulfill_member_card(db=db, member=payment.member, org=org)
    db.commit()
    assert result.issued_card is True
    assert payment.member.card_no == payment.reserved_card_no
    assert payment.reservation_state == "consumed"


def test_uncertain_creation_retains_hold_and_retry_never_posts_twice(client, db, monkeypatch):
    org = _org(db)
    email = f"timeout-{uuid.uuid4().hex[:10]}@example.com"
    calls = []

    def timeout(**kwargs):
        calls.append(kwargs["payment"].id)
        raise HTTPException(status_code=502, detail="Errore comunicazione con SumUp.")

    monkeypatch.setattr("app.routes.membership_payments.create_sumup_hosted_checkout", timeout)
    monkeypatch.setattr("app.services.card_reservations.ensure_checkout_reference_recovered", lambda *args, **kwargs: False)
    first = _signup(client, org, email=email)
    assert first.status_code == 502, first.text
    payment = db.query(MembershipPayment).filter_by(org_id=org.id).one()
    cookie_name = f"membership_payment_status_{payment.id}"
    assert client.cookies.get(cookie_name)
    assert payment.reservation_state == "held"
    assert payment.sumup_checkout_id is None
    assert payment.raw_create_response["creation_error"]["status_code"] == 502
    second = _signup(client, org, email=email)
    assert second.status_code == 409, second.text
    assert len(calls) == 1
    assert db.query(MembershipPayment).filter_by(org_id=org.id).count() == 1


def test_incomplete_creation_keeps_provider_identity_for_reconciliation(client, db, monkeypatch):
    org = _org(db)
    monkeypatch.setattr(
        "app.routes.membership_payments.create_sumup_hosted_checkout",
        lambda **kwargs: {"id": "partial-checkout"},
    )
    response = _signup(client, org)
    assert response.status_code == 502, response.text
    payment = db.query(MembershipPayment).filter_by(org_id=org.id).one()
    assert payment.sumup_checkout_id == "partial-checkout"
    assert payment.raw_create_response == {"id": "partial-checkout"}
    assert payment.reservation_state == "held"


def test_delayed_pending_webhook_does_not_regress_completed_payment(client, db, monkeypatch):
    org = _org(db)
    _mock_create(monkeypatch, [])
    checkout = _signup(client, org)
    assert checkout.status_code == 200, checkout.text
    payment = db.get(MembershipPayment, checkout.json()["payment_id"])
    _paid(monkeypatch)
    assert client.post("/api/webhooks/sumup", json={"id": payment.sumup_checkout_id}).status_code == 200
    monkeypatch.setattr(
        "app.routes.membership_payments.verify_sumup_checkout",
        lambda org, payment: {"id": payment.sumup_checkout_id, "status": "PENDING"},
    )
    assert client.post("/api/webhooks/sumup", json={"id": payment.sumup_checkout_id}).status_code == 200
    db.expire_all()
    assert payment.status == "completed"
    assert payment.member.payment_status == "completed"
    assert payment.reservation_state == "consumed"


@pytest.mark.parametrize("manually_issued_first", [False, True])
def test_renewal_reserves_and_consumes_target_year_without_replacing_current_card(db, monkeypatch, manually_issued_first):
    org = _org(db, cards=0)
    year = datetime.utcnow().year
    member, _ = _build_member_and_source(db, org=org, year=year, card_no=88000)
    term, _ = ensure_renewal_term(db, member=member)
    db.add(CardBatch(org_id=org.id, year=year + 1, start_no=95000, end_no=95001, next_no=95000))
    db.commit()

    def create(**kwargs):
        with SessionLocal() as check:
            payment = check.get(MembershipPayment, kwargs["payment"].id)
            assert payment.reserved_card_year == year + 1
            assert payment.reserved_card_no == 95000
            assert payment.reservation_state == "held"
            assert payment.member.card_no == 88000
        return {"id": "renewal-reserved", "hosted_checkout_url": "https://sumup.example/renewal"}

    monkeypatch.setattr("app.services.renewals.create_sumup_hosted_checkout", create)
    request = Request({"type": "http", "scheme": "http", "server": ("testserver", 80), "path": "/", "headers": []})
    payment = create_renewal_checkout(db, member=member, term=term, request=request)
    if manually_issued_first:
        from app.services.renewals import allocate_renewal_card
        assert allocate_renewal_card(db, term=term, approved_without_payment=True)
        db.commit()
        assert term.card_no == 95001
    result = apply_membership_payment_completion(
        db=db, payment=payment, member=member, org=org, verified_payload={"id": payment.sumup_checkout_id, "status": "PAID"}
    )
    db.commit()
    assert result.issued_card is (not manually_issued_first)
    assert payment.reservation_state == ("released" if manually_issued_first else "consumed")
    assert term.card_no == (95001 if manually_issued_first else 95000)
    assert term.card_year == year + 1
    assert member.card_no == 88000
    assert member.card_year == year

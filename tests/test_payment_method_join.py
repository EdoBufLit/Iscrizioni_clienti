from datetime import datetime

import pytest

from app.db import SessionLocal
from app.models import Member, Organization, PaymentMethod
from tests.signup_payloads import build_join_submit_data


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _ensure_org(db, slug: str) -> Organization:
    org = db.query(Organization).filter_by(slug=slug).first()
    if not org:
        org = Organization(
            name="Payment Method Org",
            slug=slug,
            statute_version="v1",
            privacy_version="v1",
            statute_pdf_path=f"{slug}/statute.pdf",
            is_active=True,
        )
        db.add(org)
        db.commit()
        db.refresh(org)
        return org

    changed = False
    if not org.statute_pdf_path:
        org.statute_pdf_path = f"{slug}/statute.pdf"
        changed = True
    if not org.statute_version:
        org.statute_version = "v1"
        changed = True
    if not org.privacy_version:
        org.privacy_version = "v1"
        changed = True
    if changed:
        db.commit()
        db.refresh(org)
    return org


def _join_submit(client, org_slug: str, email: str, payment_method: str | None):
    data = build_join_submit_data(
        first_name="Pay",
        last_name="Method",
        email=email,
        phone="333111222",
        payment_method=payment_method or "CASH",
        accept_statute="true",
        accept_privacy="true",
    )
    if payment_method is None:
        data.pop("payment_method", None)
    return client.post(f"/api/join/{org_slug}/submit", data=data)


def test_join_submit_cash_saves_payment_method(client, db):
    org = _ensure_org(db, "payment-method-org")
    email = f"cash-{int(datetime.utcnow().timestamp() * 1000)}@example.com"

    resp = _join_submit(client, org.slug, email, "CASH")
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "received"

    member = (
        db.query(Member)
        .filter(Member.org_id == org.id, Member.email == email)
        .order_by(Member.id.desc())
        .first()
    )
    assert member is not None
    assert member.payment_method == PaymentMethod.CASH


def test_join_submit_bonifico_saves_payment_method(client, db):
    org = _ensure_org(db, "payment-method-org")
    email = f"bonifico-{int(datetime.utcnow().timestamp() * 1000)}@example.com"

    resp = _join_submit(client, org.slug, email, "BONIFICO")
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "received"

    member = (
        db.query(Member)
        .filter(Member.org_id == org.id, Member.email == email)
        .order_by(Member.id.desc())
        .first()
    )
    assert member is not None
    assert member.payment_method == PaymentMethod.BONIFICO


def test_join_submit_without_payment_method_returns_400(client, db):
    org = _ensure_org(db, "payment-method-org")
    email = f"missing-method-{int(datetime.utcnow().timestamp() * 1000)}@example.com"

    resp = _join_submit(client, org.slug, email, None)
    assert resp.status_code == 400, resp.text
    payload = resp.json()
    assert "Modalita di pagamento obbligatoria" in payload.get("detail", "")

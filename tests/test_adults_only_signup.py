from datetime import date, datetime
from decimal import Decimal
import uuid

import pytest

from app.db import SessionLocal
from app.models import Organization
from app.services.membership_payments import encrypt_sumup_api_key
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
            name=f"Adults Only {slug}",
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

    org.deleted_at = None
    org.is_active = True
    if not org.statute_pdf_path:
        org.statute_pdf_path = f"{slug}/statute.pdf"
    if not org.statute_version:
        org.statute_version = "v1"
    if not org.privacy_version:
        org.privacy_version = "v1"
    db.commit()
    db.refresh(org)
    return org


def test_public_detail_exposes_adults_only_flag(client, db):
    org = _ensure_org(db, f"adults-only-detail-{uuid.uuid4().hex[:8]}")
    org.adults_only_banner_enabled = True
    db.commit()
    db.refresh(org)

    response = client.get(f"/api/organizations/{org.slug}")

    assert response.status_code == 200, response.text
    assert response.json()["adults_only_banner_enabled"] is True


def test_join_submit_rejects_underage_when_adults_only_flag_enabled(client, db):
    org = _ensure_org(db, f"adults-only-join-{uuid.uuid4().hex[:8]}")
    org.adults_only_banner_enabled = True
    db.commit()
    db.refresh(org)

    underage_birth_date = date.today().replace(year=date.today().year - 17)
    payload = build_join_submit_data(
        first_name="Mario",
        last_name="Minore",
        email=f"underage-{uuid.uuid4().hex[:8]}@example.com",
        birth_date=underage_birth_date,
        payment_method="CASH",
        accept_statute="true",
        accept_privacy="true",
    )

    response = client.post(f"/api/join/{org.slug}/submit", data=payload)

    assert response.status_code == 400, response.text
    assert "maggiori di 18 anni" in response.json()["detail"]


def test_membership_checkout_rejects_underage_when_adults_only_flag_enabled(client, db):
    org = _ensure_org(db, f"adults-only-sumup-{uuid.uuid4().hex[:8]}")
    org.adults_only_banner_enabled = True
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

    underage_birth_date = date.today().replace(year=date.today().year - 17)
    payload = build_join_submit_data(
        first_name="Giulia",
        last_name="Minore",
        email=f"checkout-underage-{uuid.uuid4().hex[:8]}@example.com",
        birth_date=underage_birth_date,
        accept_statute="true",
        accept_privacy="true",
    )
    payload["password"] = "Pass1234!"

    response = client.post(
        f"/api/public/orgs/{org.slug}/membership-payment/create-checkout",
        data=payload,
    )

    assert response.status_code == 400, response.text
    assert "maggiori di 18 anni" in response.json()["detail"]

from datetime import date, datetime

import pytest

from app.db import SessionLocal
from app.models import Member, MemberStatus, Organization
from app.services.fiscal_code import calculate_fiscal_code
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
            name=f"CF Org {slug}",
            slug=slug,
            privacy_version="v1",
            statute_version="v1",
            statute_pdf_path=f"{slug}/statute.pdf",
            is_active=True,
        )
        db.add(org)
        db.commit()
        db.refresh(org)
        return org

    org.is_active = True
    org.privacy_version = org.privacy_version or "v1"
    org.statute_version = org.statute_version or "v1"
    org.statute_pdf_path = org.statute_pdf_path or f"{slug}/statute.pdf"
    db.commit()
    db.refresh(org)
    return org


def test_search_municipalities_returns_known_match(client):
    response = client.get("/api/municipalities?q=roma")
    assert response.status_code == 200, response.text
    items = response.json()
    assert any(item["name"] == "Roma" and item["code"] == "H501" for item in items)


def test_join_submit_rejects_formally_invalid_fiscal_code(client, db):
    org = _ensure_org(db, "cf-invalid-submit-org")
    email = f"cf-invalid-{int(datetime.utcnow().timestamp() * 1000)}@example.com"
    valid_fiscal_code = calculate_fiscal_code(
        first_name="Mario",
        last_name="Rossi",
        birth_date=date(1990, 1, 1),
        gender="M",
        birth_place_code="H501",
    )
    invalid_fiscal_code = f"{valid_fiscal_code[:-1]}A"

    response = client.post(
        f"/api/join/{org.slug}/submit",
        data=build_join_submit_data(
            email=email,
            fiscal_code=invalid_fiscal_code,
        ),
    )
    assert response.status_code == 400, response.text
    assert "Codice fiscale non valido" in response.json()["detail"]


def test_join_submit_accepts_formal_mismatch_and_persists_birth_fields(client, db):
    org = _ensure_org(db, "cf-mismatch-submit-org")
    email = f"cf-mismatch-{int(datetime.utcnow().timestamp() * 1000)}@example.com"
    mismatched_but_valid_code = calculate_fiscal_code(
        first_name="Mario",
        last_name="Rossi",
        birth_date=date(1990, 1, 1),
        gender="F",
        birth_place_code="F205",
    )

    response = client.post(
        f"/api/join/{org.slug}/submit",
        data=build_join_submit_data(
            email=email,
            fiscal_code=mismatched_but_valid_code,
        ),
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "received"
    assert "fiscal_code_mismatch" in payload.get("warnings", [])

    member = (
        db.query(Member)
        .filter(Member.org_id == org.id, Member.email == email)
        .order_by(Member.id.desc())
        .first()
    )
    assert member is not None
    assert member.status == MemberStatus.PENDING_VERIFICATION
    assert member.birth_place == "Roma"
    assert member.birth_place_code == "H501"
    assert member.gender == "M"
    assert member.birth_date == date(1990, 1, 1)

"""Tests for signup bug fixes: statute-optional orgs, inactive orgs, all slugs."""

from datetime import datetime

import pytest

from app.db import SessionLocal
from app.models import Organization, Member, SignupSource
from tests.signup_payloads import build_join_submit_data


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _ensure_org(db, slug: str, *, statute: bool = True, active: bool = True) -> Organization:
    org = db.query(Organization).filter_by(slug=slug).first()
    if not org:
        org = Organization(
            name=f"Test Org {slug}",
            slug=slug,
            statute_version="v1" if statute else None,
            privacy_version="v1",
            statute_pdf_path=f"{slug}/statute.pdf" if statute else None,
            is_active=active,
        )
        db.add(org)
        db.commit()
        db.refresh(org)
        return org

    changed = False
    if statute and not org.statute_pdf_path:
        org.statute_pdf_path = f"{slug}/statute.pdf"
        org.statute_version = "v1"
        changed = True
    if not statute and org.statute_pdf_path:
        org.statute_pdf_path = None
        org.statute_version = None
        changed = True
    if org.is_active != active:
        org.is_active = active
        changed = True
    if not org.privacy_version:
        org.privacy_version = "v1"
        changed = True
    if changed:
        db.commit()
        db.refresh(org)
    return org


def _submit(client, slug: str, email: str, accept_statute: str = "true"):
    return client.post(
        f"/api/join/{slug}/submit",
        data=build_join_submit_data(
            first_name="Test",
            last_name="User",
            email=email,
            payment_method="CASH",
            accept_statute=accept_statute,
            accept_privacy="true",
        ),
    )


def test_org_without_statute_allows_signup(client, db):
    """Organizations without a statute should allow signup without accept_statute."""
    org = _ensure_org(db, "no-statute-test-org", statute=False)
    email = f"nostat-{int(datetime.utcnow().timestamp() * 1000)}@example.com"

    resp = _submit(client, org.slug, email, accept_statute="false")
    assert resp.status_code == 200, f"Expected 200 but got {resp.status_code}: {resp.text}"
    assert resp.json()["status"] == "received"


def test_org_with_statute_requires_acceptance(client, db):
    """Organizations WITH a statute must have accept_statute=true."""
    org = _ensure_org(db, "has-statute-test-org", statute=True)
    email = f"statreq-{int(datetime.utcnow().timestamp() * 1000)}@example.com"

    resp = _submit(client, org.slug, email, accept_statute="false")
    assert resp.status_code == 400
    assert "statuto" in resp.json()["detail"].lower()


def test_inactive_org_blocks_signup(client, db):
    """Inactive organizations should block signup."""
    org = _ensure_org(db, "inactive-test-org", active=False)
    email = f"inactive-{int(datetime.utcnow().timestamp() * 1000)}@example.com"

    resp = _submit(client, org.slug, email)
    assert resp.status_code == 400
    assert "attiva" in resp.json()["detail"].lower()


def test_nonexistent_slug_returns_404(client):
    """Non-existent org slug should return 404."""
    resp = _submit(client, "nonexistent-org-slug-xyz", "test@example.com")
    assert resp.status_code == 404


def test_all_active_orgs_accept_signup(client, db):
    """Verify that ALL active organizations can accept a signup submission."""
    # Session-scoped TestClient can keep admin cookies from previous tests.
    client.post("/api/org-admin/auth/logout")
    client.post("/api/super-admin/auth/logout")

    orgs = db.query(Organization).filter(Organization.is_active.is_(True)).all()
    if not orgs:
        pytest.skip("No active organizations in test DB")

    results = []
    for org in orgs:
        email = f"allorg-{org.slug}-{int(datetime.utcnow().timestamp() * 1000)}@example.com"
        accept = "true" if org.statute_pdf_path else "false"
        resp = _submit(client, org.slug, email, accept_statute=accept)
        # Should be 200 (received) or 409 (already exists) - NOT 400/500
        ok = resp.status_code in (200, 409)
        results.append((org.slug, resp.status_code, ok))

    failures = [(slug, code) for slug, code, ok in results if not ok]
    assert not failures, f"These orgs failed signup: {failures}"


def test_request_id_header_present(client, db):
    """All API responses should include X-Request-Id header."""
    resp = client.get("/health")
    assert "x-request-id" in resp.headers, "Missing X-Request-Id header"
    assert len(resp.headers["x-request-id"]) > 0


def test_web_register_sets_signup_source_assonam_form(client, db):
    org = _ensure_org(db, "register-source-test-org", statute=False)
    email = f"register-source-{int(datetime.utcnow().timestamp() * 1000)}@example.com"

    resp = client.post(
        "/api/auth/register",
        data={
            "email": email,
            "password": "TestPass123!",
            "first_name": "Mario",
            "last_name": "Rossi",
            "org_slug": org.slug,
        },
    )
    assert resp.status_code == 200, resp.text

    member = db.query(Member).filter(Member.org_id == org.id, Member.email == email).first()
    assert member is not None
    assert member.signup_source == SignupSource.ASSONAM_FORM.value


def test_web_register_rejects_short_member_password(client, db):
    org = _ensure_org(db, "register-password-min-test-org", statute=False)

    resp = client.post(
        "/api/auth/register",
        data={
            "email": f"short-password-{int(datetime.utcnow().timestamp() * 1000)}@example.com",
            "password": "short",
            "first_name": "Mario",
            "last_name": "Rossi",
            "org_slug": org.slug,
        },
    )

    assert resp.status_code == 400, resp.text
    assert "almeno 8 caratteri" in resp.text

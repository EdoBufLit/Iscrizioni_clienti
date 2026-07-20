from datetime import datetime, timedelta
from io import BytesIO

import pytest
from PIL import Image

from app.db import SessionLocal
from app.models import Member, MemberStatus, Organization
from app.security import get_password_hash
from app.services.annual_memberships import sync_annual_membership_term
from app.services.card_verification import build_card_verification_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _ensure_active_member(db):
    current_year = datetime.utcnow().year
    org = db.query(Organization).filter_by(slug="card-verify-org").first()
    if not org:
        org = Organization(name="Card Verify Org", slug="card-verify-org", is_active=True)
        db.add(org)
        db.commit()
        db.refresh(org)
    org.club_display_name = "Golden Age Club - Speakeasy"
    org.card_logo_url = "https://cdn.example.com/golden-age.png"

    email = "card.verify.member@example.com"
    member = db.query(Member).filter_by(email=email).first()
    if not member:
        member = Member(
            org_id=org.id,
            first_name="Luca",
            last_name="Bianchi",
            email=email,
            password_hash=get_password_hash("TestPass123!"),
            status=MemberStatus.ACTIVE,
            payment_status="manual_completed",
            card_is_paid=True,
            card_no=9876,
            card_year=current_year,
            joined_at=datetime(current_year, 1, 5),
            payment_completed_at=datetime(current_year, 1, 5),
            card_paid_at=datetime(current_year, 1, 5),
            card_payment_status="manual_completed",
            signup_ip="127.0.0.1",
            signup_user_agent="pytest",
        )
        db.add(member)
    else:
        member.org_id = org.id
        member.first_name = "Luca"
        member.last_name = "Bianchi"
        member.password_hash = get_password_hash("TestPass123!")
        member.status = MemberStatus.ACTIVE
        member.payment_status = "manual_completed"
        member.card_is_paid = True
        member.card_no = 9876
        member.card_year = current_year
        member.joined_at = datetime(current_year, 1, 5)
        member.payment_completed_at = datetime(current_year, 1, 5)
        member.card_paid_at = datetime(current_year, 1, 5)
        member.card_payment_status = "manual_completed"
        member.deleted_at = None

    db.commit()
    db.refresh(org)
    db.refresh(member)
    return org, member


def test_member_card_verification_payload_and_endpoint(client, db):
    org, member = _ensure_active_member(db)

    login_res = client.post("/api/auth/login", data={"email": member.email, "password": "TestPass123!"})
    assert login_res.status_code == 200

    me_res = client.get("/api/auth/me")
    assert me_res.status_code == 200
    me_data = me_res.json()

    assert me_data["card_no"] == 9876
    assert me_data["card"]["number"] == 9876
    assert me_data["card"]["year"] == datetime.utcnow().year
    assert me_data["card"]["status"] == "attiva"
    assert me_data["card"]["verification_url"]

    verify_url = me_data["card"]["verification_url"]
    verify_path = verify_url.replace("http://localhost:8000", "")
    verify_res = client.get(verify_path)
    assert verify_res.status_code == 200

    verify_data = verify_res.json()
    assert verify_data["valid"] is True
    assert verify_data["card"]["number"] == 9876
    assert verify_data["card"]["year"] == datetime.utcnow().year
    assert verify_data["card"]["status"] == "attiva"
    assert verify_data["organization"]["name"] in {
        org.name,
        org.club_display_name,
    }
    assert verify_data["payment"]["is_paid"] is True
    assert verify_data["payment"]["label"] == "Pagata"


def test_member_card_verify_html_response_for_browser(client, db):
    org, member = _ensure_active_member(db)
    token = build_card_verification_token(
        member_id=member.id,
        org_id=org.id,
        card_number=member.card_no,
        card_year=member.card_year,
    )

    res = client.get(
        f"/api/cards/verify/{token}",
        headers={"Accept": "text/html"},
    )
    assert res.status_code == 200
    assert "text/html" in res.headers.get("content-type", "")
    assert "TESSERA ATTIVA" in res.text
    assert "Stato pagamento: Pagata" in res.text
    assert "Mostra dati tecnici (JSON)" in res.text


def test_member_card_verify_invalid_token(client):
    res = client.get("/api/cards/verify/not-a-valid-token")
    assert res.status_code == 404


def test_member_card_qr_png_is_generated_locally(client, db):
    org, member = _ensure_active_member(db)
    token = build_card_verification_token(
        member_id=member.id,
        org_id=org.id,
        card_number=member.card_no,
        card_year=member.card_year,
    )

    response = client.get(f"/api/cards/{token}/qr.png")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/png")
    assert response.headers["cross-origin-resource-policy"] == "cross-origin"
    assert response.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(response.content) > 500
    image = Image.open(BytesIO(response.content)).convert("L")
    minimum, maximum = image.getextrema()
    assert minimum == 0
    assert maximum == 255


def test_member_card_qr_png_rejects_invalid_token(client):
    response = client.get("/api/cards/not-a-valid-token/qr.png")
    assert response.status_code == 404


def test_annual_history_cannot_reactivate_a_rejected_member(client, db):
    org, member = _ensure_active_member(db)
    term = sync_annual_membership_term(db, member, source="verification-regression")
    assert term is not None
    member.status = MemberStatus.REJECTED
    db.commit()
    token = build_card_verification_token(
        member_id=member.id,
        org_id=org.id,
        card_number=member.card_no,
        card_year=member.card_year,
    )

    response = client.get(f"/api/cards/verify/{token}?format=json")

    assert response.status_code == 200
    assert response.json()["valid"] is False
    assert response.json()["reason"] == "not_approved"


def test_annual_history_cannot_override_expired_temporary_conversion(client, db):
    org, member = _ensure_active_member(db)
    term = sync_annual_membership_term(db, member, source="verification-regression")
    assert term is not None
    member.membership_type = "temporary"
    member.valid_from = datetime.utcnow() - timedelta(hours=4)
    member.valid_until = datetime.utcnow() - timedelta(hours=1)
    db.commit()
    token = build_card_verification_token(
        member_id=member.id,
        org_id=org.id,
        card_number=member.card_no,
        card_year=member.card_year,
    )

    response = client.get(f"/api/cards/verify/{token}?format=json")

    assert response.status_code == 200
    assert response.json()["valid"] is False
    assert response.json()["reason"] == "expired"


def test_public_org_info_endpoint_returns_safe_branding_fields(client, db):
    org, _member = _ensure_active_member(db)

    res = client.get(f"/api/public/orgs/{org.slug}")
    assert res.status_code == 200, res.text
    payload = res.json()

    assert payload["slug"] == org.slug
    assert payload["club_display_name"] == "Golden Age Club - Speakeasy"
    assert payload["card_logo_url"] == "https://cdn.example.com/golden-age.png"
    assert payload["wallet_enabled"] is False


def test_public_org_info_uses_oasi2_logo_fallback_when_card_logo_missing(client, db):
    slug = "oasi-2"
    org = db.query(Organization).filter_by(slug=slug).first()
    if not org:
        org = Organization(name="Golden Age Oasi 2", slug=slug, is_active=True)
        db.add(org)
        db.commit()
        db.refresh(org)

    org.deleted_at = None
    org.is_active = True
    org.card_logo_url = None
    org.logo_path = None
    db.commit()

    res = client.get(f"/api/public/orgs/{slug}")
    assert res.status_code == 200, res.text
    payload = res.json()
    assert payload["club_display_name"] == "Golden Age Club - Speakeasy"
    assert payload["card_logo_url"].endswith("/static/card-logos/oasi-2.png")


def test_member_card_download_page_and_wallet_placeholder_endpoints(client, db):
    org, member = _ensure_active_member(db)
    token = build_card_verification_token(
        member_id=member.id,
        org_id=org.id,
        card_number=member.card_no,
        card_year=member.card_year,
    )

    download_res = client.get(f"/api/cards/{token}/download")
    assert download_res.status_code == 200, download_res.text
    assert "text/html" in download_res.headers.get("content-type", "")
    assert "Scarica tessera (PDF)" in download_res.text
    assert "Golden Age Club - Speakeasy" in download_res.text

    pdf_hint_res = client.get(f"/api/cards/{token}/download?format=pdf")
    assert pdf_hint_res.status_code == 200, pdf_hint_res.text
    assert "PDF server-side non configurato" in pdf_hint_res.text

    direct_pdf_res = client.get(f"/api/cards/{token}/download.pdf")
    assert direct_pdf_res.status_code == 200, direct_pdf_res.text
    assert direct_pdf_res.headers["content-type"].startswith("application/pdf")
    assert "attachment;" in direct_pdf_res.headers["content-disposition"]
    assert direct_pdf_res.content.startswith(b"%PDF-")

    apple_res = client.get(f"/api/cards/{token}/wallet/apple")
    assert apple_res.status_code == 404
    assert apple_res.json()["detail"] == "Wallet non configurato"

    google_res = client.get(f"/api/cards/{token}/wallet/google")
    assert google_res.status_code == 404
    assert google_res.json()["detail"] == "Wallet non configurato"


def test_temporary_member_card_verification_exposes_real_expiry_and_type(client, db):
    org, member = _ensure_active_member(db)
    valid_until = datetime.utcnow().replace(microsecond=0) + timedelta(hours=6)
    member.membership_type = "temporary"
    member.valid_from = datetime.utcnow().replace(microsecond=0)
    member.valid_until = valid_until
    db.commit()
    db.refresh(member)

    token = build_card_verification_token(
        member_id=member.id,
        org_id=org.id,
        card_number=member.card_no,
        card_year=member.card_year,
    )

    verify_res = client.get(f"/api/cards/verify/{token}")
    assert verify_res.status_code == 200, verify_res.text
    payload = verify_res.json()
    assert payload["valid"] is True
    assert payload["card"]["membership_type"] == "temporary"
    assert payload["card"]["valid_until"] is not None

    html_res = client.get(
        f"/api/cards/verify/{token}",
        headers={"Accept": "text/html"},
    )
    assert html_res.status_code == 200
    assert "Tipo tessera:</strong> Temporanea" in html_res.text
    assert "Scadenza reale" in html_res.text

import uuid

import pytest

from app.db import SessionLocal
from app.models import AdminRole, AdminUser, Organization


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


def _create_draft(client, email: str) -> dict:
    response = client.post(
        "/api/affiliazione/draft",
        json={"applicant_email": email},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _patch_required_fields(client, token: str, *, email: str, payment_method: str):
    response = client.patch(
        f"/api/affiliazione/draft/{token}",
        json={
            "organization_name": f"Associazione Test {uuid.uuid4().hex[:8]}",
            "organization_legal_name": f"Associazione Legale {uuid.uuid4().hex[:8]}",
            "address_line1": "Via Test 1",
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
    ]:
        response = client.post(
            f"/api/affiliazione/draft/{token}/documents",
            data={"doc_type": doc_type},
            files={"file": (f"{doc_type}.pdf", pdf_bytes, "application/pdf")},
        )
        assert response.status_code == 200, response.text


def test_affiliation_submit_requires_documents(client):
    email = f"draft-missing-docs-{uuid.uuid4().hex[:10]}@example.com"
    draft = _create_draft(client, email=email)
    token = draft["public_token"]

    _patch_required_fields(
        client,
        token,
        email=email,
        payment_method="cash",
    )
    _replace_required_people(client, token)

    response = client.post(f"/api/affiliazione/draft/{token}/submit")
    assert response.status_code == 422, response.text
    detail = response.json().get("detail") or {}
    issues = detail.get("issues") if isinstance(detail, dict) else []
    assert any(str(item.get("field", "")).startswith("documents.") for item in issues)


def test_affiliation_stripe_checkout_disabled_returns_503(client):
    email = f"draft-stripe-disabled-{uuid.uuid4().hex[:10]}@example.com"
    draft = _create_draft(client, email=email)
    token = draft["public_token"]

    response = client.post(f"/api/affiliazione/draft/{token}/stripe/checkout")
    assert response.status_code == 503, response.text
    assert (
        response.json().get("detail")
        == "Stripe non configurato. Usa Bonifico o Contanti."
    )


def test_affiliation_stripe_payment_selection_rejected_when_disabled(client):
    email = f"draft-stripe-selection-{uuid.uuid4().hex[:10]}@example.com"
    draft = _create_draft(client, email=email)
    token = draft["public_token"]

    response = client.patch(
        f"/api/affiliazione/draft/{token}",
        json={"payment_method": "stripe"},
    )
    assert response.status_code == 400, response.text
    assert (
        response.json().get("detail")
        == "Pagamento con carta non disponibile. Seleziona Bonifico o Contanti."
    )


def test_affiliation_approve_requires_docs_and_payment_verification(client, db):
    email = f"draft-approve-{uuid.uuid4().hex[:10]}@example.com"
    draft = _create_draft(client, email=email)
    token = draft["public_token"]
    application_id = int(draft["id"])

    _patch_required_fields(
        client,
        token,
        email=email,
        payment_method="cash",
    )
    _replace_required_people(client, token)
    _upload_required_docs(client, token)

    submit_response = client.post(f"/api/affiliazione/draft/{token}/submit")
    assert submit_response.status_code == 200, submit_response.text
    submit_payload = submit_response.json()
    assert submit_payload["status"] == "under_review"
    assert submit_payload["payment_status"] == "payment_under_review"

    _login_super_admin(client)

    blocked_approval = client.post(
        f"/api/super-admin/affiliations/{application_id}/approve",
        json={"notes": "Tentativo senza verifiche"},
    )
    assert blocked_approval.status_code == 409, blocked_approval.text

    detail_response = client.get(f"/api/super-admin/affiliations/{application_id}")
    assert detail_response.status_code == 200, detail_response.text
    detail_payload = detail_response.json()

    for document in detail_payload.get("documents", []):
        review_response = client.post(
            f"/api/super-admin/affiliations/{application_id}/documents/{document['id']}/review",
            json={"status": "approved", "notes": "Documento ok"},
        )
        assert review_response.status_code == 200, review_response.text

    verify_payment = client.post(
        f"/api/super-admin/affiliations/{application_id}/payment/verify",
        json={"verified": True, "notes": "Pagamento manuale verificato"},
    )
    assert verify_payment.status_code == 200, verify_payment.text
    assert verify_payment.json()["payment_status"] == "verified"

    approve_response = client.post(
        f"/api/super-admin/affiliations/{application_id}/approve",
        json={"notes": "Approvata dopo verifiche complete"},
    )
    assert approve_response.status_code == 200, approve_response.text
    approve_payload = approve_response.json()
    assert approve_payload["status"] == "approved"
    assert approve_payload["approved_org_id"]
    assert approve_payload["org_admin_id"]

    organization = (
        db.query(Organization)
        .filter(Organization.id == int(approve_payload["approved_org_id"]))
        .first()
    )
    assert organization is not None

    org_admin = (
        db.query(AdminUser)
        .filter(
            AdminUser.org_id == organization.id,
            AdminUser.role == AdminRole.ORG_ADMIN,
        )
        .first()
    )
    assert org_admin is not None
    assert (org_admin.email or "").lower() == email.lower()

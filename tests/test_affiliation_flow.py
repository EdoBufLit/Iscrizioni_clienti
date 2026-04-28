import uuid
from pathlib import Path

import pytest

from app.config import settings
from app.db import SessionLocal
from app.models import AdminRole, AdminUser, Organization
from app.models_affiliation import AffiliationVideoMode, VideoJob, VideoJobStatus


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


def test_affiliation_draft_exposes_configured_fee(client, monkeypatch):
    monkeypatch.setattr(settings, "STRIPE_AFFILIATION_PRICE_CENTS", 12345, raising=False)
    monkeypatch.setattr(settings, "AFFILIATION_FEE_CURRENCY", "EUR", raising=False)

    draft = _create_draft(client, email=f"fee-{uuid.uuid4().hex[:10]}@example.com")

    assert draft["payment_amount_cents"] == 12345
    assert draft["payment_config"]["fee_amount_cents"] == 12345
    assert draft["payment_config"]["fee_amount"] == 123.45
    assert draft["payment_config"]["fee_currency"] == "EUR"
    assert draft["payment_config"]["payment_enabled"] is True


def test_affiliation_draft_handles_missing_fee_without_ready_payment(client, monkeypatch):
    monkeypatch.setattr(settings, "STRIPE_AFFILIATION_PRICE_CENTS", 0, raising=False)

    draft = _create_draft(client, email=f"missing-fee-{uuid.uuid4().hex[:10]}@example.com")

    assert draft["payment_amount_cents"] == 0
    assert draft["payment_config"]["fee_amount_cents"] is None
    assert draft["payment_config"]["fee_amount"] is None
    assert draft["payment_config"]["payment_enabled"] is False


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
        "documento_vicepresidente",
        "documento_segretario_tesoriere",
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


def test_super_admin_can_delete_draft_affiliation(client):
    email = f"draft-delete-{uuid.uuid4().hex[:10]}@example.com"
    draft = _create_draft(client, email=email)
    application_id = int(draft["id"])

    _login_super_admin(client)

    delete_response = client.delete(f"/api/super-admin/affiliations/{application_id}")
    assert delete_response.status_code == 200, delete_response.text
    payload = delete_response.json()
    assert payload.get("ok") is True
    assert int(payload.get("deleted_id")) == application_id

    detail_response = client.get(f"/api/super-admin/affiliations/{application_id}")
    assert detail_response.status_code == 404, detail_response.text


def test_super_admin_affiliation_views_redact_public_token(client):
    email = f"draft-admin-redaction-{uuid.uuid4().hex[:10]}@example.com"
    draft = _create_draft(client, email=email)
    application_id = int(draft["id"])

    _login_super_admin(client)

    list_response = client.get(
        "/api/super-admin/affiliations",
        params={"q": email, "page_size": 100},
    )
    assert list_response.status_code == 200, list_response.text
    items = list_response.json()["items"]
    current_item = next(item for item in items if int(item["id"]) == application_id)
    assert current_item["public_token"] is None

    detail_response = client.get(f"/api/super-admin/affiliations/{application_id}")
    assert detail_response.status_code == 200, detail_response.text
    detail_payload = detail_response.json()
    assert detail_payload["public_token"] is None
    assert detail_payload["resume_url"] is None
    assert (
        detail_payload["payment_config"]["reference_code"]
        == f"AFF-{application_id:06d}"
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


def test_affiliation_draft_reports_video_ready_when_latest_job_failed_but_file_exists(
    client,
    db,
    tmp_path,
    monkeypatch,
):
    email = f"draft-video-ready-{uuid.uuid4().hex[:10]}@example.com"
    draft = _create_draft(client, email=email)
    token = draft["public_token"]
    application_id = int(draft["id"])

    video_dir = tmp_path / "welcome"
    video_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "AFFILIATION_VIDEO_OUTPUT_DIR", str(video_dir), raising=False)

    db.add(
        VideoJob(
            application_id=application_id,
            mode=AffiliationVideoMode.REVIEW.value,
            status=VideoJobStatus.FAILED.value,
            error_text="Old renderer failure",
        )
    )
    db.commit()

    expected_file = Path(settings.AFFILIATION_VIDEO_OUTPUT_DIR) / f"{application_id}.mp4"
    expected_file.write_bytes(b"fake-mp4")

    response = client.get(f"/api/affiliazione/draft/{token}")
    assert response.status_code == 200, response.text
    payload = response.json()

    assert payload["latest_video_job"]["status"] == "failed"
    assert payload["welcome_video_ready"] is True
    assert payload["welcome_video_url"] == f"/videos/welcome/{application_id}.mp4"
    assert payload["welcome_video_error"] is None


def test_affiliation_draft_reports_video_not_ready_when_file_missing(
    client,
    db,
    tmp_path,
    monkeypatch,
):
    email = f"draft-video-missing-{uuid.uuid4().hex[:10]}@example.com"
    draft = _create_draft(client, email=email)
    token = draft["public_token"]
    application_id = int(draft["id"])

    video_dir = tmp_path / "welcome-missing"
    video_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "AFFILIATION_VIDEO_OUTPUT_DIR", str(video_dir), raising=False)

    db.add(
        VideoJob(
            application_id=application_id,
            mode=AffiliationVideoMode.REVIEW.value,
            status=VideoJobStatus.DONE.value,
            output_rel_path=f"welcome/{application_id}.mp4",
        )
    )
    db.commit()

    response = client.get(f"/api/affiliazione/draft/{token}")
    assert response.status_code == 200, response.text
    payload = response.json()

    assert payload["welcome_video_ready"] is False
    assert payload["welcome_video_url"] == f"/videos/welcome/{application_id}.mp4"
    assert payload["welcome_video_error"] is None


def test_affiliation_create_reuses_recent_application_by_identity(client):
    email = f"draft-reuse-{uuid.uuid4().hex[:10]}@example.com"
    organization_name = f"Associazione Riuso {uuid.uuid4().hex[:8]}"

    first_response = client.post(
        "/api/affiliazione/draft",
        json={
            "applicant_email": email,
            "organization_name": organization_name,
        },
    )
    assert first_response.status_code == 200, first_response.text
    first_payload = first_response.json()

    second_response = client.post(
        "/api/affiliazione/draft",
        json={
            "applicant_email": email.upper(),
            "organization_name": f"  {organization_name}  ",
        },
    )
    assert second_response.status_code == 200, second_response.text
    second_payload = second_response.json()

    assert second_payload["id"] == first_payload["id"]
    assert second_payload["public_token"] == first_payload["public_token"]


def test_affiliation_submit_is_idempotent_on_retry(client, db):
    email = f"draft-submit-idempotent-{uuid.uuid4().hex[:10]}@example.com"
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

    first_submit = client.post(f"/api/affiliazione/draft/{token}/submit")
    assert first_submit.status_code == 200, first_submit.text

    second_submit = client.post(f"/api/affiliazione/draft/{token}/submit")
    assert second_submit.status_code == 200, second_submit.text
    second_payload = second_submit.json()

    assert second_payload["application"]["id"] == application_id
    assert second_payload["status"] == "under_review"

    video_jobs = (
        db.query(VideoJob)
        .filter(VideoJob.application_id == application_id)
        .order_by(VideoJob.id.asc())
        .all()
    )
    assert len(video_jobs) == 1

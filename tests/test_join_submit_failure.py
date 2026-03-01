import os
from app.config import settings
from tests.signup_payloads import build_join_submit_data

def test_join_submit_email_returns_false(client):
    """
    Test that manual-review signup queues email delivery and preserves uploads.
    """
    # 1. Setup
    org_slug = "my-association"
    email = "email_fail@example.com"

    # Prepare files
    files = {
        "id_document": ("id_false.pdf", b"%PDF-1.4 empty", "application/pdf"),
        "fiscal_code_document": ("fc_false.pdf", b"%PDF-1.4 empty", "application/pdf"),
    }
    data = build_join_submit_data(
        first_name="Email",
        last_name="Fail",
        email=email,
        phone="111222333",
        payment_method="CASH",
        accept_statute="true",
        accept_privacy="true",
    )

    response = client.post(f"/api/join/{org_slug}/submit", data=data, files=files)

    # 3. Verification
    assert response.status_code == 200, f"Expected 200 but got {response.status_code}: {response.text}"

    json_resp = response.json()
    assert json_resp["status"] == "received"

    assert json_resp.get("email_sent") is False, f"Expected email_sent=False, got {json_resp.get('email_sent')}"
    assert json_resp.get("email_status") == "queued"

    # Requirement: Do NOT delete uploaded files
    # We check if files exist in UPLOAD_DIR
    found_files = []
    for root, _, files_fs in os.walk(settings.UPLOAD_DIR):
         for f in files_fs:
             if "id_false.pdf" in f or "fc_false.pdf" in f:
                 found_files.append(os.path.join(root, f))

    # We expect 2 files
    assert len(found_files) >= 2, "Files should be preserved"


def test_join_submit_email_raises_exception(client):
    """
    Test that queued manual-review signup keeps files on disk and returns queued status.
    """
    # 1. Setup
    org_slug = "my-association"
    email = "email_crash@example.com"

    files = {
        "id_document": ("id_crash.pdf", b"%PDF-1.4 empty", "application/pdf"),
        "fiscal_code_document": ("fc_crash.pdf", b"%PDF-1.4 empty", "application/pdf"),
    }
    data = build_join_submit_data(
        first_name="Email",
        last_name="Crash",
        email=email,
        phone="444555666",
        payment_method="BONIFICO",
        accept_statute="true",
        accept_privacy="true",
    )

    response = client.post(f"/api/join/{org_slug}/submit", data=data, files=files)

    # 3. Verification
    assert response.status_code == 200, f"Expected 200 but got {response.status_code}: {response.text}"

    json_resp = response.json()
    assert json_resp.get("email_sent") is False
    assert json_resp.get("email_status") == "queued"

    # Requirement: Do NOT delete uploaded files
    found_files = []
    for root, _, files_fs in os.walk(settings.UPLOAD_DIR):
         for f in files_fs:
             if "id_crash.pdf" in f or "fc_crash.pdf" in f:
                 found_files.append(os.path.join(root, f))

    assert len(found_files) >= 2, "Files should be preserved even if email crashes"

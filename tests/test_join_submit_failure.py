import pytest
from unittest.mock import patch
import os
import shutil
from app.config import settings

def test_join_submit_email_returns_false(client):
    """
    Test that if email sending returns False, the endpoint still returns 200 OK
    with email_sent: False in response, and files are preserved.
    """
    # 1. Setup
    org_slug = "my-association"
    email = "email_fail@example.com"

    # Prepare files
    files = {
        "id_document": ("id_false.pdf", b"%PDF-1.4 empty", "application/pdf"),
        "fiscal_code_document": ("fc_false.pdf", b"%PDF-1.4 empty", "application/pdf"),
    }
    data = {
        "first_name": "Email",
        "last_name": "Fail",
        "email": email,
        "phone": "111222333",
        "fiscal_code": "MLFAIL80A01H501Z",
        "payment_method": "CASH",
        "accept_statute": "true",
        "accept_privacy": "true",
    }

    # 2. Mock send_email to return False
    with patch("app.routes.join.send_email", return_value=False):
        response = client.post(f"/api/join/{org_slug}/submit", data=data, files=files)

    # 3. Verification
    assert response.status_code == 200, f"Expected 200 but got {response.status_code}: {response.text}"

    json_resp = response.json()
    assert json_resp["status"] == "received"

    # Requirement: Return "email_sent": False
    # Currently this will fail (field missing)
    assert json_resp.get("email_sent") is False, f"Expected email_sent=False, got {json_resp.get('email_sent')}"

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
    Test that if email sending raises Exception, the endpoint returns 200 OK
    (handled gracefully), and files are preserved (critical fix).
    """
    # 1. Setup
    org_slug = "my-association"
    email = "email_crash@example.com"

    files = {
        "id_document": ("id_crash.pdf", b"%PDF-1.4 empty", "application/pdf"),
        "fiscal_code_document": ("fc_crash.pdf", b"%PDF-1.4 empty", "application/pdf"),
    }
    data = {
        "first_name": "Email",
        "last_name": "Crash",
        "email": email,
        "phone": "444555666",
        "fiscal_code": "CRASH80A01H501Z",
        "payment_method": "BONIFICO",
        "accept_statute": "true",
        "accept_privacy": "true",
    }

    # 2. Mock send_email to raise Exception
    with patch("app.routes.join.send_email", side_effect=Exception("SMTP Boom")):
        response = client.post(f"/api/join/{org_slug}/submit", data=data, files=files)

    # 3. Verification
    # Currently this will fail (returns 500)
    assert response.status_code == 200, f"Expected 200 but got {response.status_code}: {response.text}"

    json_resp = response.json()
    assert json_resp.get("email_sent") is False

    # Requirement: Do NOT delete uploaded files
    found_files = []
    for root, _, files_fs in os.walk(settings.UPLOAD_DIR):
         for f in files_fs:
             if "id_crash.pdf" in f or "fc_crash.pdf" in f:
                 found_files.append(os.path.join(root, f))

    # Currently this will fail (files deleted by exception handler)
    assert len(found_files) >= 2, "Files should be preserved even if email crashes"

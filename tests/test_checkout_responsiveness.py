from concurrent.futures import ThreadPoolExecutor
from threading import Event
from uuid import uuid4

import pytest

from app.config import settings
from app.db import SessionLocal
from app.routes import membership_payments
from tests.signup_payloads import build_join_submit_data
from tests.test_membership_payments_sumup import _build_sumup_org


@pytest.mark.parametrize("blocked_operation", ["allocation-lock", "upload-read"])
def test_blocked_checkout_keeps_version_and_health_responsive(
    client, monkeypatch, tmp_path, blocked_operation
):
    with SessionLocal() as db:
        org = _build_sumup_org(db, f"responsive-{uuid4().hex[:10]}", cards=1)
        org_slug = org.slug

    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    blocked = Event()
    release = Event()
    provider_calls = []

    def pause():
        blocked.set()
        if not release.wait(timeout=5):
            raise AssertionError("checkout was not released by the responsiveness probe")

    if blocked_operation == "allocation-lock":
        real_lock = membership_payments.lock_card_allocation

        def blocked_lock(*args, **kwargs):
            pause()
            return real_lock(*args, **kwargs)

        monkeypatch.setattr(membership_payments, "lock_card_allocation", blocked_lock)
    else:
        real_save = membership_payments.save_upload_file_sync

        def blocked_upload(upload_file, **kwargs):
            # The multipart parser must spool this >1 MB upload to disk, the
            # path that formerly yielded while an allocation lock was held.
            assert upload_file.file._rolled
            pause()
            return real_save(upload_file, **kwargs)

        monkeypatch.setattr(membership_payments, "save_upload_file_sync", blocked_upload)

    def create_checkout(**kwargs):
        provider_calls.append(kwargs["payment"].id)
        return {
            "id": f"responsive-checkout-{kwargs['payment'].id}",
            "hosted_checkout_url": "https://sumup.example/responsive-checkout",
        }

    monkeypatch.setattr(membership_payments, "create_sumup_hosted_checkout", create_checkout)
    data = build_join_submit_data(email=f"responsive-{uuid4().hex[:10]}@example.com")
    files = None
    if blocked_operation == "upload-read":
        files = {
            "id_document": (
                "identity.pdf",
                b"%PDF-1.7\n" + b"x" * (1024 * 1024 + 4096),
                "application/pdf",
            )
        }

    # A context-managed TestClient uses a single ASGI portal for every request.
    # Running clients with separate portals would hide an event-loop freeze.
    assert client.portal is not None
    with ThreadPoolExecutor(max_workers=3) as pool:
        checkout = pool.submit(
            client.post,
            f"/api/public/orgs/{org_slug}/membership-payment/create-checkout",
            data=data,
            files=files,
        )
        try:
            assert blocked.wait(timeout=2), "checkout did not reach the blocking operation"
            version_probe = pool.submit(client.get, "/version")
            health_probe = pool.submit(client.get, "/health")
            version = version_probe.result(timeout=1)
            health = health_probe.result(timeout=1)

            assert version.status_code == 200, version.text
            assert health.status_code == 200, health.text
            assert health.json()["db"] is True
            assert not checkout.done(), "probe must finish while checkout is still blocked"
            assert not release.is_set()
        finally:
            release.set()

        response = checkout.result(timeout=3)

    assert response.status_code == 200, response.text
    assert len(provider_calls) == 1

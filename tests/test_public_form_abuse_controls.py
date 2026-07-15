import uuid
from concurrent.futures import ThreadPoolExecutor

from app.config import settings
from app.db import SessionLocal
from app.models import Form as AssociationForm
from app.models import FormSubmission, IngestRateLimit, Organization
from app.services.db_rate_limit import enforce_db_rate_limit


def test_db_rate_limiter_does_not_commit_pending_business_changes() -> None:
    db = SessionLocal()
    verifier = None
    suffix = uuid.uuid4().hex[:8]
    original_name = f"Rate Limit Org {suffix}"
    bucket = f"test:transaction-isolation:{suffix}"
    try:
        organization = Organization(
            name=original_name,
            slug=f"rate-limit-org-{suffix}",
            is_active=True,
        )
        db.add(organization)
        db.commit()
        db.refresh(organization)

        organization.name = f"Pending Name {suffix}"
        assert db.is_modified(organization)

        enforce_db_rate_limit(
            db,
            bucket=bucket,
            client_ip="203.0.113.10",
            window_seconds=300,
            max_requests=10,
        )

        verifier = SessionLocal()
        persisted = verifier.get(Organization, organization.id)
        assert persisted is not None
        assert persisted.name == original_name
        assert (
            verifier.query(IngestRateLimit)
            .filter(
                IngestRateLimit.org_slug == bucket,
                IngestRateLimit.client_ip == "203.0.113.10",
            )
            .count()
            == 1
        )

        db.rollback()
        db.refresh(organization)
        assert organization.name == original_name
    finally:
        if verifier is not None:
            verifier.close()
        db.close()


def test_db_rate_limiter_counts_parallel_requests_atomically() -> None:
    suffix = uuid.uuid4().hex[:8]
    bucket = f"test:parallel:{suffix}"
    client_ip = "198.51.100.20"

    def consume_one_slot() -> None:
        caller_db = SessionLocal()
        try:
            enforce_db_rate_limit(
                caller_db,
                bucket=bucket,
                client_ip=client_ip,
                window_seconds=300,
                max_requests=100,
            )
        finally:
            caller_db.close()

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(lambda _index: consume_one_slot(), range(12)))

    verifier = SessionLocal()
    try:
        row = (
            verifier.query(IngestRateLimit)
            .filter(
                IngestRateLimit.org_slug == bucket,
                IngestRateLimit.client_ip == client_ip,
            )
            .one()
        )
        assert row.request_count == 12
    finally:
        verifier.close()


def test_public_form_submit_remains_unchanged_until_clear_abuse(client) -> None:
    client.cookies.clear()
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:8]
    old_max = settings.PUBLIC_FORM_RATE_LIMIT_MAX_REQUESTS
    old_window = settings.PUBLIC_FORM_RATE_LIMIT_WINDOW_SECONDS
    try:
        organization = Organization(
            name=f"Public Form Rate Org {suffix}",
            slug=f"public-form-rate-{suffix}",
            is_active=True,
            communications_enabled=True,
        )
        db.add(organization)
        db.flush()
        public_form = AssociationForm(
            association_id=organization.id,
            title="Richiesta informazioni",
            public_slug=f"richiesta-{suffix}",
            is_active=True,
            visibility="public",
            success_message="Richiesta ricevuta.",
            allow_multiple_submissions=True,
            notify_admin_on_submit=False,
            send_user_confirmation=False,
        )
        db.add(public_form)
        db.commit()
        db.refresh(public_form)

        settings.PUBLIC_FORM_RATE_LIMIT_MAX_REQUESTS = 2
        settings.PUBLIC_FORM_RATE_LIMIT_WINDOW_SECONDS = 300

        scoped = client.post(
            f"/api/forms/{organization.slug}/{public_form.public_slug}/submit",
            json={},
        )
        legacy = client.post(
            f"/api/forms/{public_form.public_slug}/submit",
            json={},
        )
        blocked = client.post(
            f"/api/forms/{organization.slug}/{public_form.public_slug}/submit",
            json={},
        )

        assert scoped.status_code == 200, scoped.text
        assert legacy.status_code == 200, legacy.text
        for response in (scoped, legacy):
            payload = response.json()
            assert payload["ok"] is True
            assert payload["message"] == "Richiesta ricevuta."
            assert payload["submission"]["form_id"] == public_form.id
            assert payload["booking"] is None
        assert blocked.status_code == 429, blocked.text
        assert blocked.json()["detail"] == "Too many requests"

        db.expire_all()
        assert (
            db.query(FormSubmission)
            .filter(FormSubmission.form_id == public_form.id)
            .count()
            == 2
        )
    finally:
        settings.PUBLIC_FORM_RATE_LIMIT_MAX_REQUESTS = old_max
        settings.PUBLIC_FORM_RATE_LIMIT_WINDOW_SECONDS = old_window
        db.close()

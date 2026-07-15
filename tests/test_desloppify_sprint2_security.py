from datetime import timedelta
from pathlib import Path

from app import security
from app.services import card_image, card_verification, email_outbox, member_card_delivery
from app.services import org_admin_welcome_guide
from app.workers import affiliation_video_worker


def test_security_constants_are_public_identifiers_not_secrets():
    assert security.INTEGRATION_API_KEY_HEADER == "X-ASSONAM-API-KEY"
    assert card_verification._TOKEN_PREFIX == "card-verify-v1"


def test_affiliation_video_ready_marker_is_container_local_tmp_path():
    marker = affiliation_video_worker.READY_MARKER_PATH

    assert marker.is_absolute()
    assert marker.name == "worker.ready"
    assert "tmp" in marker.as_posix().lower()


def test_email_backoff_jitter_is_non_security_and_bounded(monkeypatch):
    monkeypatch.setattr(email_outbox.random, "uniform", lambda _low, _high: 1.0)

    before = email_outbox.utcnow_aware()
    retry_at = email_outbox.compute_backoff(1)
    after = email_outbox.utcnow_aware()

    assert before + timedelta(seconds=29) <= retry_at <= after + timedelta(seconds=31)


def test_card_image_logs_logo_failure_without_breaking_generation(tmp_path, caplog):
    broken_logo = tmp_path / "broken-logo.png"
    broken_logo.write_text("not an image", encoding="utf-8")

    caplog.set_level("WARNING", logger="app.services.card_image")
    png = card_image.generate_card_image_bytes(
        member_full_name="Mario Rossi",
        organization_name="Test Org",
        club_display_name="Test Club",
        organization_slug="test-org",
        card_number=123,
        card_year=2026,
        card_status="attiva",
        membership_type_label="Annuale",
        org_logo_path=str(broken_logo),
        assonam_logo_path=None,
    )

    assert png.startswith(b"\x89PNG")
    assert "Unable to paste card logo" in caplog.text
    assert "error_type=UnidentifiedImageError" in caplog.text
    assert str(broken_logo) not in caplog.text


class _NoLockQuery:
    def with_for_update(self):
        raise RuntimeError("row locking unavailable")

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return None


class _NoLockDb:
    def query(self, *_args, **_kwargs):
        return _NoLockQuery()


def test_member_card_delivery_logs_lock_fallback(caplog):
    caplog.set_level("DEBUG", logger="app.services.member_card_delivery")

    result = member_card_delivery.maybe_send_member_card_ready_email(
        _NoLockDb(),
        request=object(),
        member_id=123,
    )

    assert result == {"sent": False, "reason": "member_not_found"}
    assert "proceeding without row lock" in caplog.text


def test_org_admin_welcome_pdf_logs_logo_failure(tmp_path, monkeypatch, caplog):
    fake_logo = tmp_path / "logo-transparent.png"
    fake_logo.write_text("not an image", encoding="utf-8")

    monkeypatch.setattr(org_admin_welcome_guide, "_static_path", lambda _name: str(fake_logo))

    def fail_image_reader(_path):
        raise RuntimeError("invalid image")

    monkeypatch.setattr(org_admin_welcome_guide, "ImageReader", fail_image_reader)
    caplog.set_level("WARNING", logger="app.services.org_admin_welcome_guide")

    pdf = org_admin_welcome_guide.generate_org_admin_welcome_guide_pdf(
        organization_name="Test Org",
        invite_url="https://example.test/invite",
        bot_number="+39 02 9991 4307",
    )

    assert pdf.startswith(b"%PDF")
    assert "Unable to draw org admin welcome guide logo" in caplog.text
    assert "error_type=RuntimeError" in caplog.text
    assert str(fake_logo) not in caplog.text

from pathlib import Path
from types import SimpleNamespace

import pytest

from app.config import settings
from app.models import Organization
from app.routes.org_admin import _serialize_org_membership_settings
from app.routes.org_admin import _resolve_org_logo_disk_path as admin_logo
from app.routes.public import _resolve_logo_disk_path as public_logo
from app.services.integration_issuer import _resolve_org_logo_disk_path as integration_logo
from app.services.member_card_delivery import _resolve_org_logo_disk_path as delivery_logo
from app.services.org_branding import GOLDEN_AGE_CARD_LOGO_URL, resolve_card_logo_disk_path, resolve_card_logo_url


@pytest.mark.parametrize("slug", ["oasi-2", "golden-age-club"])
def test_every_default_card_channel_uses_the_same_golden_age_asset(slug, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    (tmp_path / "old-public-logo.png").write_bytes(b"old-logo")
    org = SimpleNamespace(slug=slug, card_logo_url=None, logo_path="old-public-logo.png")
    url = resolve_card_logo_url(org, base_url="https://example.invalid")
    paths = [resolver(org) for resolver in (resolve_card_logo_disk_path, admin_logo, public_logo, integration_logo, delivery_logo)]
    assert url == "https://example.invalid" + GOLDEN_AGE_CARD_LOGO_URL
    assert len(set(paths)) == 1
    assert Path(paths[0]).is_file()
    assert Path(paths[0]).name == url.rsplit("/", 1)[1]


@pytest.mark.parametrize("slug", ["oasi-2", "another-club"])
def test_explicit_uploaded_card_logo_remains_authoritative(slug, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    (tmp_path / "card.png").write_bytes(b"uploaded")
    org = SimpleNamespace(slug=slug, card_logo_url="/uploads/card.png", logo_path="other.png")
    assert resolve_card_logo_url(org) == "/uploads/card.png"
    assert Path(resolve_card_logo_disk_path(org)) == tmp_path / "card.png"


def test_other_association_keeps_its_own_public_logo(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    (tmp_path / "other.png").write_bytes(b"other")
    org = SimpleNamespace(slug="another-club", card_logo_url=None, logo_path="other.png")
    assert resolve_card_logo_url(org) == "/api/organizations/another-club/logo"
    assert Path(resolve_card_logo_disk_path(org)) == tmp_path / "other.png"


def test_missing_organization_has_no_logo():
    assert resolve_card_logo_disk_path(None) is None
    assert resolve_card_logo_url(None) is None


@pytest.mark.parametrize("slug", ["oasi-2", "golden-age-club"])
def test_admin_card_preview_receives_effective_logo_for_locked_design(slug):
    settings = _serialize_org_membership_settings(Organization(slug=slug, name="Golden Age"))
    assert settings["card_style_locked"] is True
    assert settings["card_logo_url"] == GOLDEN_AGE_CARD_LOGO_URL

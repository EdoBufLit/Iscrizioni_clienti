from pathlib import Path

from app.config import settings
from app.db import SessionLocal
from app.models import Organization


def _ensure_org(
    slug: str,
    *,
    name: str,
    logo_path: str | None = None,
) -> Organization:
    db = SessionLocal()
    try:
        org = db.query(Organization).filter(Organization.slug == slug).first()
        if org is None:
            org = Organization(
                name=name,
                slug=slug,
                privacy_version="v1",
                is_active=True,
                logo_path=logo_path,
            )
            db.add(org)
        else:
            org.name = name
            org.is_active = True
            org.deleted_at = None
            org.privacy_version = org.privacy_version or "v1"
            org.logo_path = logo_path
        db.commit()
        db.refresh(org)
        return org
    finally:
        db.close()


def test_public_signup_page_renders_org_specific_meta_with_fallback_image(client):
    slug = "meta-fallback-org"
    org_name = "Circolo Test Meta"
    _ensure_org(slug, name=org_name, logo_path=None)

    response = client.get(f"/associazioni/{slug}/iscrizione")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert '<meta charset="UTF-8" />' in response.text
    assert f"<title>Iscriviti ora a {org_name}</title>" in response.text
    assert (
        f'<meta name="description" content="Tesseramento online {org_name}" />'
        in response.text
    )
    assert (
        f'<meta property="og:title" content="Iscriviti ora a {org_name}" />'
        in response.text
    )
    assert (
        f'<meta property="og:description" content="Tesseramento online {org_name}" />'
        in response.text
    )
    assert (
        f'<meta property="og:url" content="http://testserver/associazioni/{slug}/iscrizione" />'
        in response.text
    )
    assert '<meta property="og:type" content="website" />' in response.text
    assert '<meta name="twitter:card" content="summary_large_image" />' in response.text
    assert (
        f'<meta name="twitter:title" content="Iscriviti ora a {org_name}" />'
        in response.text
    )
    assert (
        f'<meta name="twitter:description" content="Tesseramento online {org_name}" />'
        in response.text
    )
    assert (
        '<meta property="og:image" content="http://testserver/logo.jpg" />'
        in response.text
    )
    assert (
        '<meta name="twitter:image" content="http://testserver/logo.jpg" />'
        in response.text
    )
    assert "Portale di gestione associativa ASSO.N.A.M." not in response.text
    assert "â€" not in response.text
    assert "Â" not in response.text
    assert "Ã" not in response.text


def test_public_signup_page_prefers_org_logo_for_social_image(client):
    slug = "meta-logo-org"
    logo_rel_path = f"{slug}/logo.png"
    logo_disk_path = Path(settings.UPLOAD_DIR) / logo_rel_path
    logo_disk_path.parent.mkdir(parents=True, exist_ok=True)
    logo_disk_path.write_bytes(b"not-a-real-png-but-present-on-disk")
    _ensure_org(slug, name="Circolo Con Logo", logo_path=logo_rel_path)

    response = client.get(f"/associazioni/{slug}/iscrizione")

    assert response.status_code == 200
    expected_logo_url = f"http://testserver/api/organizations/{slug}/logo"
    assert f'<meta property="og:image" content="{expected_logo_url}" />' in response.text
    assert (
        f'<meta name="twitter:image" content="{expected_logo_url}" />'
        in response.text
    )

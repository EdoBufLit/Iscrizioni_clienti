"""Create local Golden Age previews with synthetic data; never sends mail or uses a DB."""

from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ.setdefault("SECRET_KEY", "preview-only-not-a-production-secret")

from app.email_templates.member_card_email import build_member_card_email
from app.routes.public import _render_card_download_html
from app.services.card_image import generate_card_image_bytes
from app.services.card_pdf import generate_card_pdf_bytes
from app.services.qr_code import generate_qr_png_bytes


def main() -> None:
    out = ROOT / "output" / "golden-age-preview-20260921"
    out.mkdir(parents=True, exist_ok=True)
    logo = ROOT / "app/static/card-logos/golden-age-20260921.png"
    assonam = ROOT / "frontend/public/logo-transparent.png"
    (out / "logo.png").write_bytes(logo.read_bytes())
    (out / "assonam.png").write_bytes(assonam.read_bytes())
    verification = "https://example.invalid/verifica-demo"
    (out / "qr.png").write_bytes(generate_qr_png_bytes(verification))
    data = dict(
        member_full_name="Giulia Rossi", organization_name="Golden Age Club",
        club_display_name="Golden Age Club - Speakeasy", organization_slug="oasi-2",
        card_number=12345, card_year=2026, card_status="attiva", membership_type_label="Annuale",
        org_logo_path=str(logo), assonam_logo_path=str(assonam),
    )
    (out / "tessera-fronte.png").write_bytes(generate_card_image_bytes(**data))
    (out / "tessera-golden-age.pdf").write_bytes(generate_card_pdf_bytes(**data, verification_url=verification))
    (out / "tessera-nome-lungo.png").write_bytes(generate_card_image_bytes(**{
        **data, "member_full_name": "Alessandra Maria Giuseppina Della Rovere",
    }))

    # Compare against the actual pre-change renderer and logo, with the same demo data.
    old_namespace: dict = {}
    exec(subprocess.check_output(["git", "show", "4eed20c:app/services/card_image.py"], cwd=ROOT).decode("utf-8"), old_namespace)
    (out / "tessera-prima.png").write_bytes(old_namespace["generate_card_image_bytes"](**{
        **data, "org_logo_path": str(ROOT / "app/static/card-logos/oasi-2.png"),
    }))

    email_data = dict(
        member_full_name=data["member_full_name"], organization_name=data["organization_name"],
        club_display_name=data["club_display_name"], organization_slug=data["organization_slug"],
        card_number=data["card_number"], card_year=data["card_year"],
        verification_url=verification, download_url="tessera-golden-age.pdf",
        magic_link_url="https://example.invalid/area-socio-demo", assonam_logo_url="assonam.png",
        qr_image_url="qr.png", organization_logo_url="logo.png",
    )
    for name, cid in [("email", "preview-card"), ("email-fallback", None)]:
        _, html = build_member_card_email(**email_data, card_image_cid=cid)
        (out / f"{name}.html").write_text(html.replace("cid:preview-card", "tessera-fronte.png"), encoding="utf-8")
    download = _render_card_download_html(
        token="demo", is_valid=True, inactive_reason="", checked_at=datetime(2026, 9, 21, 12),
        organization_slug="oasi-2", organization_name=data["organization_name"],
        club_display_name=data["club_display_name"], member_first_name="Giulia", member_last_name="Rossi",
        card_number=12345, card_year=2026, membership_type_text="Annuale", valid_until_text="31/12/2026",
        verification_url=verification, download_url="tessera-golden-age.pdf",
        assonam_logo_url="assonam.png", organization_logo_url="logo.png", requested_pdf_format=False,
    )
    (out / "download.html").write_text(download, encoding="utf-8")
    print(out)


if __name__ == "__main__":
    main()

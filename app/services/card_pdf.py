"""Server-side PDF generator for membership cards — bordeaux theme."""
from __future__ import annotations

import io
import os

from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

# ─── Bordeaux palette ──────────────────────────────────────────────────────────
_BDX_DARK   = HexColor("#3a0015")
_BDX_MID    = Color(0.353, 0.031, 0.157, 0.7)
_BDX_LIGHT  = Color(0.45, 0.05, 0.20, 0.5)
_BDX_BACK   = HexColor("#2a0010")
_BDX_BACK2  = Color(0.40, 0.04, 0.18, 0.5)
_GOLD       = HexColor("#c6a04f")
_GOLD_BRT   = HexColor("#d4b45c")
_GOLD_DIV   = Color(0.776, 0.627, 0.310, 0.3)
_WHITE      = HexColor("#ffffff")
_CREAM      = HexColor("#fdf6e3")
_MUTED      = HexColor("#c9a8b0")
_STATUS_OK  = HexColor("#4ade80")
_STATUS_ERR = HexColor("#f87171")
_OASI2_LOGO_SHIFT_X = -4

# ─── Card geometry on A4 ──────────────────────────────────────────────────────
_PAGE_W, _PAGE_H = A4  # 595.27 × 841.89 pt
_CARD_W = 510.0
_CARD_H = _CARD_W / 1.586          # ≈ 321 pt
_CARD_X = (_PAGE_W - _CARD_W) / 2  # horizontal center
_CARD_Y = (_PAGE_H - _CARD_H) / 2  # vertical center
_R = 14  # corner radius


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _logo_dims(path: str, max_w: float, max_h: float) -> tuple[float, float]:
    """Return draw dimensions that fit logo within max_w × max_h preserving ratio."""
    try:
        from PIL import Image as PILImage
        with PILImage.open(path) as img:
            iw, ih = img.size
            ratio = min(max_w / iw, max_h / ih)
            return iw * ratio, ih * ratio
    except Exception:
        return max_w * 0.8, max_h * 0.8


def _make_opacity_png(path: str, opacity: float, scale: int = 2) -> io.BytesIO | None:
    """Return PNG bytes of image rendered at given opacity (0-1)."""
    try:
        from PIL import Image as PILImage
        with PILImage.open(path) as img:
            img = img.convert("RGBA")
            img.thumbnail(
                (int(img.width * scale), int(img.height * scale)),
                PILImage.LANCZOS,
            )
            r, g, b, a = img.split()
            a = a.point(lambda p: int(p * opacity))
            img = PILImage.merge("RGBA", (r, g, b, a))
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)
            return buf
    except Exception:
        return None


def _draw_bg(
    c: canvas.Canvas,
    x: float,
    y: float,
    w: float,
    h: float,
    *,
    is_back: bool = False,
    is_oasi2: bool = False,
) -> None:
    """Draw bordeaux gradient background (simulated with layered rects)."""
    base = _BDX_BACK if is_back else _BDX_DARK
    c.setFillColor(base)
    c.roundRect(x, y, w, h, radius=_R, fill=1, stroke=0)

    if is_oasi2 and not is_back:
        return

    mid = _BDX_BACK2 if is_back else _BDX_MID
    c.setFillColor(mid)
    c.rect(x + w * 0.2, y, w * 0.6, h, fill=1, stroke=0)

    light = _BDX_BACK2 if is_back else _BDX_LIGHT
    c.setFillColor(light)
    c.rect(x + w * 0.35, y + h * 0.15, w * 0.3, h * 0.7, fill=1, stroke=0)

    # Clip rounded corners back
    c.setFillColor(Color(1, 1, 1, 0))  # transparent — use clipping path
    # Redraw clipping: the rects above go outside the rounded rect corners.
    # Simplest fix: draw solid rounded rect in the very base colour on top of corners
    # (only corners need to be covered — we accept the slight colour variation)


def _draw_border(c: canvas.Canvas, x: float, y: float, w: float, h: float) -> None:
    c.setStrokeColor(_GOLD)
    c.setLineWidth(0.8)
    c.roundRect(x, y, w, h, radius=_R, fill=0, stroke=1)


def _draw_gold_bar(
    c: canvas.Canvas,
    x: float,
    y: float,
    w: float,
    h: float,
    *,
    thickness: float = 3.0,
) -> None:
    c.setFillColor(_GOLD)
    c.rect(x, y + h - thickness, w, thickness, fill=1, stroke=0)


def _label(c: canvas.Canvas, text: str, x: float, y: float, size: float = 7.5) -> None:
    c.setFillColor(_MUTED)
    c.setFont("Helvetica-Bold", size)
    c.drawString(x, y, text.upper())


def _divider(c: canvas.Canvas, x: float, y: float, w: float) -> None:
    c.setStrokeColor(_GOLD_DIV)
    c.setLineWidth(0.6)
    c.line(x, y, x + w, y)


def _chip(c: canvas.Canvas, x: float, y: float) -> None:
    """Draw decorative gold EMV chip."""
    cw, ch = 44, 30
    c.setFillColor(_GOLD)
    c.roundRect(x, y, cw, ch, radius=4, fill=1, stroke=0)
    # Horizontal stripe
    c.setFillColor(Color(1, 1, 1, 0.2))
    c.rect(x + 4, y + ch / 2 - 1.5, cw - 8, 3, fill=1, stroke=0)
    # Vertical stripes
    for sx in range(int(x) + 6, int(x) + cw - 6, 9):
        c.rect(sx, y + 4, 3, ch - 8, fill=1, stroke=0)


def _generate_qr_reader(url: str) -> ImageReader:
    """Return an ImageReader for a QR code of the given URL."""
    import qrcode
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=12, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    pil_img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    pil_img.save(buf, format="PNG")
    buf.seek(0)
    return ImageReader(buf)


# ─── Front page ───────────────────────────────────────────────────────────────

def _draw_front(
    c: canvas.Canvas,
    *,
    member_full_name: str,
    organization_name: str,
    club_display_name: str,
    organization_slug: str | None,
    card_number: int,
    card_year: int,
    card_status: str,
    org_logo_path: str | None,
    assonam_logo_path: str | None,
) -> None:
    x, y, w, h = _CARD_X, _CARD_Y, _CARD_W, _CARD_H
    norm_slug = (organization_slug or "").strip().lower()
    is_oasi2 = norm_slug == "oasi-2"
    assoc_label = club_display_name if is_oasi2 else organization_name

    # Background
    _draw_bg(c, x, y, w, h, is_oasi2=is_oasi2)
    _draw_gold_bar(c, x, y, w, h, thickness=1.2 if is_oasi2 else 3.0)
    _draw_border(c, x, y, w, h)

    # Watermark logo (all orgs except oasi-2)
    if org_logo_path and os.path.exists(org_logo_path) and not is_oasi2:
        wm_buf = _make_opacity_png(org_logo_path, opacity=0.09)
        if wm_buf:
            wm_reader = ImageReader(wm_buf)
            wm_w, wm_h = _logo_dims(org_logo_path, w * 0.55, h * 0.55)
            c.drawImage(
                wm_reader,
                x + (w - wm_w) / 2,
                y + (h - wm_h) / 2,
                wm_w, wm_h,
                mask="auto",
                preserveAspectRatio=True,
            )

    # Org logo in top area (always visible, no watermark style)
    if org_logo_path and os.path.exists(org_logo_path):
        if is_oasi2:
            lw, lh = _logo_dims(org_logo_path, 170, 54)
            # Slight left nudge requested by customer for oasi-2.
            logo_x = x + (w - lw) / 2 + _OASI2_LOGO_SHIFT_X
            logo_y = y + h - lh - 10
        else:
            lw, lh = _logo_dims(org_logo_path, 140, 32)
            logo_x = x + (w - lw) / 2
            logo_y = y + h - 3 - lh - 6
        c.drawImage(
            org_logo_path,
            logo_x,
            logo_y,
            lw,
            lh,
            mask="auto",
            preserveAspectRatio=True,
        )

    # ASSONAM logo top-right
    if assonam_logo_path and os.path.exists(assonam_logo_path):
        lw, lh = _logo_dims(assonam_logo_path, 110, 44)
        c.drawImage(
            assonam_logo_path,
            x + w - lw - 14,
            y + h - lh - 12,
            lw, lh,
            mask="auto",
            preserveAspectRatio=True,
        )

    # ── Header (top-left block) ──
    hdr_y = y + h - 60  # baseline of year

    _label(c, "Tessera Socio", x + 18, hdr_y + 28, size=8)
    c.setFillColor(_GOLD_BRT)
    c.setFont("Helvetica-Bold", 26)
    c.drawString(x + 18, hdr_y, str(card_year))

    # Status badge
    ok = card_status == "attiva"
    c.setFillColor(_STATUS_OK if ok else _STATUS_ERR)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x + 18, hdr_y - 16, "ATTIVA" if ok else "NON ATTIVA")

    # ── Body ──
    body_y = y + h * 0.44

    _label(c, "Nome e cognome", x + 18, body_y + 20, size=7.5)
    c.setFillColor(_WHITE)
    c.setFont("Helvetica-Bold", 19)
    c.drawString(x + 18, body_y - 2, (member_full_name or "—")[:38])

    _label(c, "Associazione", x + 18, body_y - 24, size=7.5)
    c.setFillColor(_CREAM)
    c.setFont("Helvetica", 12)
    c.drawString(x + 18, body_y - 40, (assoc_label or organization_name or "—")[:50])

    # ── Footer ──
    foot_y = y + 22
    _divider(c, x + 12, foot_y + 34, w - 24)

    _label(c, "N. Tessera", x + 18, foot_y + 26, size=7.5)
    c.setFillColor(_GOLD_BRT)
    c.setFont("Courier-Bold", 18)
    c.drawString(x + 18, foot_y + 4, str(card_number))

    # Chip bottom-right
    _chip(c, x + w - 62, foot_y + 2)


# ─── Back page ────────────────────────────────────────────────────────────────

def _draw_back(
    c: canvas.Canvas,
    *,
    member_full_name: str,
    organization_name: str,
    card_number: int,
    card_year: int,
    card_status: str,
    verification_url: str,
) -> None:
    x, y, w, h = _CARD_X, _CARD_Y, _CARD_W, _CARD_H

    _draw_bg(c, x, y, w, h, is_back=True)
    _draw_gold_bar(c, x, y, w, h)
    _draw_border(c, x, y, w, h)

    # QR code
    qr_size = min(h * 0.58, 175)
    qr_reader = _generate_qr_reader(verification_url)

    # White plate behind QR
    pad = 10
    plate_w = qr_size + pad * 2
    plate_h = qr_size + pad * 2
    plate_x = x + (w - plate_w) / 2
    plate_y = y + (h * 0.54) - plate_h / 2 + 8

    c.setFillColor(_WHITE)
    c.roundRect(plate_x, plate_y, plate_w, plate_h, radius=8, fill=1, stroke=0)
    c.drawImage(qr_reader, plate_x + pad, plate_y + pad, qr_size, qr_size)

    # ── Data rows below QR ──
    row_y = plate_y - 12
    col_l = x + w * 0.10
    col_r = x + w * 0.48

    rows = [
        ("N. Tessera", str(card_number), True),
        ("Anno", str(card_year), True),
        ("Stato", "Attiva" if card_status == "attiva" else "Non attiva", False),
        ("Socio", (member_full_name or "—")[:28], False),
        ("Associazione", (organization_name or "—")[:28], False),
    ]
    for i, (lbl, val, gold) in enumerate(rows):
        ry = row_y - i * 17
        _label(c, lbl, col_l, ry, size=6.5)
        c.setFillColor(_GOLD_BRT if gold else _CREAM)
        c.setFont("Helvetica-Bold" if gold else "Helvetica", 8)
        c.drawString(col_r, ry, val)

    # Verification URL (tiny, bottom)
    c.setFillColor(_MUTED)
    c.setFont("Helvetica", 5.5)
    c.drawCentredString(x + w / 2, y + 8, verification_url[:80])


# ─── Public API ───────────────────────────────────────────────────────────────

def generate_card_pdf_bytes(
    *,
    member_full_name: str,
    organization_name: str,
    club_display_name: str,
    organization_slug: str | None,
    card_number: int,
    card_year: int,
    card_status: str,
    verification_url: str,
    org_logo_path: str | None,
    assonam_logo_path: str | None,
) -> bytes:
    """Generate a 2-page PDF (front + back) in bordeaux theme."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    # Page 1 — Front
    _draw_front(
        c,
        member_full_name=member_full_name,
        organization_name=organization_name,
        club_display_name=club_display_name,
        organization_slug=organization_slug,
        card_number=card_number,
        card_year=card_year,
        card_status=card_status,
        org_logo_path=org_logo_path,
        assonam_logo_path=assonam_logo_path,
    )
    c.showPage()

    # Page 2 — Back
    _draw_back(
        c,
        member_full_name=member_full_name,
        organization_name=organization_name,
        card_number=card_number,
        card_year=card_year,
        card_status=card_status,
        verification_url=verification_url,
    )
    c.showPage()
    c.save()

    buf.seek(0)
    return buf.read()

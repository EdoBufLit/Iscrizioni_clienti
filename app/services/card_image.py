"""Server-side PNG generator for membership card front — bordeaux theme."""
from __future__ import annotations

import io
import os

# ─── Palette (RGB tuples, 0–255) ──────────────────────────────────────────────
_BDX_DARK  = (58, 0, 21)       # #3a0015
_BDX_MID   = (90, 8, 40)       # #5a0828
_BDX_ACC   = (115, 13, 52)     # slightly lighter
_GOLD      = (198, 160, 79)    # #c6a04f
_GOLD_BRT  = (212, 180, 92)    # #d4b45c
_WHITE     = (255, 255, 255)
_CREAM     = (253, 246, 227)
_MUTED     = (201, 168, 176)
_GREEN     = (74, 222, 128)
_RED       = (248, 113, 113)

# Canvas dimensions  (credit-card ratio 1.586 : 1 × 10)
_W = 856
_H = 540


def _load_font(size: int, bold: bool = False) -> "ImageFont.FreeTypeFont | ImageFont.ImageFont":
    from PIL import ImageFont
    candidates: list[str] = []
    if bold:
        candidates = [
            "DejaVuSans-Bold.ttf",
            "arialbd.ttf",
            "Arial Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        ]
    else:
        candidates = [
            "DejaVuSans.ttf",
            "arial.ttf",
            "Arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    try:
        return ImageFont.load_default(size=size)  # Pillow ≥ 10
    except Exception:
        return ImageFont.load_default()


def _paste_logo(
    img: "Image.Image",
    logo_path: str,
    max_w: int,
    max_h: int,
    dest_x: int,
    dest_y: int,
    opacity: float = 1.0,
) -> None:
    """Paste logo onto img at (dest_x, dest_y), fitting within max_w × max_h."""
    from PIL import Image
    try:
        logo = Image.open(logo_path).convert("RGBA")
        logo.thumbnail((max_w, max_h), Image.LANCZOS)
        if opacity < 1.0:
            r, g, b, a = logo.split()
            a = a.point(lambda p: int(p * opacity))
            logo = Image.merge("RGBA", (r, g, b, a))
        # Centre within the allocated box
        px = dest_x + (max_w - logo.width) // 2
        py = dest_y + (max_h - logo.height) // 2
        img.paste(logo, (px, py), logo)
    except Exception:
        pass  # logo loading is best-effort


def generate_card_image_bytes(
    *,
    member_full_name: str,
    organization_name: str,
    club_display_name: str,
    card_number: int,
    card_year: int,
    card_status: str,
    org_logo_path: str | None,
    assonam_logo_path: str | None,
) -> bytes:
    """Return PNG bytes of the card front in bordeaux theme."""
    from PIL import Image, ImageDraw

    img = Image.new("RGBA", (_W, _H), _BDX_DARK)

    # ── Simulated gradient (layered semi-transparent rects) ──────────────────
    ov = Image.new("RGBA", (_W, _H), (0, 0, 0, 0))
    ov_d = ImageDraw.Draw(ov)
    ov_d.rectangle([_W // 4, 0, _W * 3 // 4, _H], fill=(*_BDX_MID, 160))
    ov_d.rectangle([_W // 3, _H // 5, _W * 2 // 3, _H * 4 // 5], fill=(*_BDX_ACC, 120))
    img = Image.alpha_composite(img, ov)

    # ── Watermark logo ────────────────────────────────────────────────────────
    if org_logo_path and os.path.exists(org_logo_path):
        wm = int(min(_W, _H) * 0.52)
        _paste_logo(img, org_logo_path, wm, wm, (_W - wm) // 2, (_H - wm) // 2, opacity=0.09)

    draw = ImageDraw.Draw(img)

    # ── Gold top bar ──────────────────────────────────────────────────────────
    draw.rectangle([0, 0, _W, 6], fill=_GOLD)

    # ── ASSONAM logo top-right ────────────────────────────────────────────────
    if assonam_logo_path and os.path.exists(assonam_logo_path):
        _paste_logo(img, assonam_logo_path, 150, 72, _W - 168, 16, opacity=1.0)
        draw = ImageDraw.Draw(img)

    # ── Org logo top-centre (small, non-watermark display) ────────────────────
    if org_logo_path and os.path.exists(org_logo_path):
        _paste_logo(img, org_logo_path, 200, 52, (_W - 200) // 2, 16, opacity=0.95)
        draw = ImageDraw.Draw(img)

    # ── "TESSERA SOCIO" label ─────────────────────────────────────────────────
    draw.text((28, 28), "TESSERA SOCIO", font=_load_font(18, bold=True), fill=(*_GOLD, 200))

    # ── Year ─────────────────────────────────────────────────────────────────
    draw.text((28, 52), str(card_year), font=_load_font(60, bold=True), fill=_GOLD_BRT)

    # ── Status ───────────────────────────────────────────────────────────────
    ok = card_status == "attiva"
    status_color = _GREEN if ok else _RED
    status_label = "● ATTIVA" if ok else "● NON ATTIVA"
    draw.text((28, 124), status_label, font=_load_font(20, bold=True), fill=status_color)

    # ── Name label + value ────────────────────────────────────────────────────
    mid_y = _H // 2
    draw.text((28, mid_y - 8), "NOME E COGNOME", font=_load_font(17, bold=True), fill=_MUTED)
    safe_name = (member_full_name or "—")[:32]
    draw.text((28, mid_y + 16), safe_name, font=_load_font(44, bold=True), fill=_WHITE)

    # ── Association label + value ─────────────────────────────────────────────
    draw.text((28, mid_y + 72), "ASSOCIAZIONE", font=_load_font(17, bold=True), fill=_MUTED)
    safe_assoc = (organization_name or "—")[:40]
    draw.text((28, mid_y + 94), safe_assoc, font=_load_font(28), fill=_CREAM)

    # ── Gold divider ──────────────────────────────────────────────────────────
    div_y = _H - 112
    draw.rectangle([20, div_y, _W - 20, div_y + 1], fill=(*_GOLD, 80))

    # ── Card number label + value ─────────────────────────────────────────────
    draw.text((28, _H - 102), "N. TESSERA", font=_load_font(17, bold=True), fill=_MUTED)
    draw.text((28, _H - 78), str(card_number), font=_load_font(44, bold=True), fill=_GOLD_BRT)

    # ── Gold chip (bottom-right) ──────────────────────────────────────────────
    cx, cy, cw, ch = _W - 84, _H - 72, 68, 46
    draw.rounded_rectangle([cx, cy, cx + cw, cy + ch], radius=6, fill=_GOLD)
    # Horizontal line
    draw.rectangle([cx + 4, cy + ch // 2 - 2, cx + cw - 4, cy + ch // 2 + 2], fill=(*_GOLD_BRT, 100))
    # Vertical stripes
    for sx in range(cx + 8, cx + cw - 8, 10):
        draw.rectangle([sx, cy + 5, sx + 4, cy + ch - 5], fill=(*_GOLD_BRT, 90))

    # ── Gold bottom-bar (subtle) ──────────────────────────────────────────────
    draw.rectangle([0, _H - 4, _W, _H], fill=(*_GOLD, 100))

    # Output as RGB PNG
    result = img.convert("RGB")
    buf = io.BytesIO()
    result.save(buf, format="PNG", optimize=True)
    buf.seek(0)
    return buf.read()

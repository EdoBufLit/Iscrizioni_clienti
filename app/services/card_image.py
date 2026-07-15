"""Server-side PNG generator for membership card front."""

from __future__ import annotations

import io
import logging
import os
import re

# Palette (RGB)
_BDX_DARK = (58, 0, 21)  # #3a0015
_BDX_MID = (90, 8, 40)
_BDX_ACC = (115, 13, 52)
_GOLD = (198, 160, 79)  # #c6a04f
_GOLD_BRT = (212, 180, 92)  # #d4b45c
_WHITE = (255, 255, 255)
_CREAM = (253, 246, 227)
_MUTED = (201, 168, 176)
_GREEN = (74, 222, 128)
_RED = (248, 113, 113)
_OASI2_LOGO_SHIFT_X = -4
logger = logging.getLogger(__name__)

# Credit-card ratio canvas (1.586 : 1)
_W = 856
_H = 540
_LEGACY_CARD_SLUGS = {"oasi-2", "golden-age-club"}

_DEFAULT_CARD_STYLE: dict[str, object] = {
    "primary_color": "#5A001F",
    "secondary_color": "#2A0010",
    "accent_color": "#D4B45C",
    "text_color": "#FFFFFF",
    "muted_text_color": "#F5D66D",
    "font_family": "classic",
    "surface_pattern": "geometric",
    "logo_mode": "watermark",
    "logo_position": "top-right",
    "logo_opacity": 0.18,
    "logo_blend": "normal",
    "remove_logo_background": False,
    "back_title": "Verifica tessera",
    "back_body": "",
    "back_show_member": True,
}


def _load_font(
    size: int, bold: bool = False
) -> "ImageFont.FreeTypeFont | ImageFont.ImageFont":
    from PIL import ImageFont

    candidates: list[str]
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
        except Exception as exc:
            logger.debug(
                "Unable to load card font candidate size=%s bold=%s error_type=%s",
                size,
                bold,
                type(exc).__name__,
            )
            continue

    try:
        return ImageFont.load_default(size=size)
    except Exception as exc:
        logger.debug(
            "Unable to load sized default card font size=%s error_type=%s",
            size,
            type(exc).__name__,
        )
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
    """Paste logo onto img at (dest_x, dest_y), fitting within max_w x max_h."""
    from PIL import Image

    try:
        logo = Image.open(logo_path).convert("RGBA")
        logo.thumbnail((max_w, max_h), Image.LANCZOS)
        if opacity < 1.0:
            r, g, b, a = logo.split()
            a = a.point(lambda p: int(p * opacity))
            logo = Image.merge("RGBA", (r, g, b, a))

        px = dest_x + (max_w - logo.width) // 2
        py = dest_y + (max_h - logo.height) // 2
        img.paste(logo, (px, py), logo)
    except Exception as exc:
        logger.warning(
            "Unable to paste card logo error_type=%s",
            type(exc).__name__,
        )


def _normalize_hex(value: object, fallback: str) -> str:
    raw = str(value or "").strip()
    if re.fullmatch(r"#[0-9a-fA-F]{6}", raw):
        return raw.upper()
    return fallback


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = _normalize_hex(value, "#000000").lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def _card_style(card_style: dict[str, object] | None) -> dict[str, object]:
    merged = dict(_DEFAULT_CARD_STYLE)
    if isinstance(card_style, dict):
        for key in merged:
            if key in card_style:
                merged[key] = card_style[key]
    for key in ["primary_color", "secondary_color", "accent_color", "text_color", "muted_text_color"]:
        merged[key] = _normalize_hex(merged.get(key), str(_DEFAULT_CARD_STYLE[key]))
    try:
        merged["logo_opacity"] = max(0.0, min(1.0, float(merged.get("logo_opacity", 0.18))))
    except (TypeError, ValueError):
        merged["logo_opacity"] = 0.18
    return merged


def _is_legacy_card(slug: str | None) -> bool:
    return (slug or "").strip().lower() in _LEGACY_CARD_SLUGS


def _font_for_style(style: dict[str, object], size: int, *, bold: bool = False):
    # Keep server generation deterministic with bundled/common fonts.
    return _load_font(size, bold=bold)


def _draw_fit_text(
    draw: "ImageDraw.ImageDraw",
    xy: tuple[int, int],
    text: str,
    *,
    max_width: int,
    size: int,
    fill: tuple[int, int, int] | tuple[int, int, int, int],
    style: dict[str, object],
    bold: bool = False,
    min_size: int = 14,
) -> int:
    safe = (text or "-").strip() or "-"
    current = size
    while current > min_size:
        font = _font_for_style(style, current, bold=bold)
        bbox = draw.textbbox((0, 0), safe, font=font)
        if bbox[2] - bbox[0] <= max_width:
            draw.text(xy, safe, font=font, fill=fill)
            return current
        current -= 2
    font = _font_for_style(style, current, bold=bold)
    ellipsis = "..."
    while safe and draw.textbbox((0, 0), safe + ellipsis, font=font)[2] > max_width:
        safe = safe[:-1]
    draw.text(xy, (safe + ellipsis) if safe else "-", font=font, fill=fill)
    return current


def _remove_light_background(logo: "Image.Image") -> "Image.Image":
    from PIL import Image

    logo = logo.convert("RGBA")
    data = []
    for r, g, b, a in logo.getdata():
        if a and r > 232 and g > 232 and b > 232:
            data.append((r, g, b, 0))
        else:
            data.append((r, g, b, a))
    cleaned = Image.new("RGBA", logo.size)
    cleaned.putdata(data)
    return cleaned


def _load_logo_for_card(path: str, *, remove_background: bool = False) -> "Image.Image | None":
    from PIL import Image

    try:
        logo = Image.open(path).convert("RGBA")
        return _remove_light_background(logo) if remove_background else logo
    except Exception as exc:
        logger.warning(
            "Unable to paste card logo error_type=%s",
            type(exc).__name__,
        )
        return None


def _paste_logo_image(
    img: "Image.Image",
    logo: "Image.Image",
    box: tuple[int, int, int, int],
    *,
    opacity: float,
) -> None:
    from PIL import Image

    max_w, max_h = box[2], box[3]
    logo = logo.copy()
    logo.thumbnail((max_w, max_h), Image.LANCZOS)
    if opacity < 1.0:
        r, g, b, a = logo.split()
        a = a.point(lambda p: int(p * opacity))
        logo = Image.merge("RGBA", (r, g, b, a))
    px = box[0] + (max_w - logo.width) // 2
    py = box[1] + (max_h - logo.height) // 2
    img.paste(logo, (px, py), logo)


def _draw_luxury_background(
    img: "Image.Image",
    draw: "ImageDraw.ImageDraw",
    style: dict[str, object],
) -> None:
    primary = _hex_to_rgb(str(style["primary_color"]))
    secondary = _hex_to_rgb(str(style["secondary_color"]))
    accent = _hex_to_rgb(str(style["accent_color"]))
    for y in range(_H):
        t = y / max(1, _H - 1)
        r = int(primary[0] * (1 - t) + secondary[0] * t)
        g = int(primary[1] * (1 - t) + secondary[1] * t)
        b = int(primary[2] * (1 - t) + secondary[2] * t)
        draw.line([(0, y), (_W, y)], fill=(r, g, b, 255))
    if style.get("surface_pattern") != "none":
        from PIL import Image, ImageDraw

        pattern = Image.new("RGBA", (_W, _H), (0, 0, 0, 0))
        pattern_draw = ImageDraw.Draw(pattern)
        for offset in range(-_H, _W, 76):
            pattern_draw.line([(offset, 0), (offset + _H, _H)], fill=(*accent, 18), width=1)
            pattern_draw.line([(offset + 42, 0), (offset + _H + 42, _H)], fill=(*accent, 10), width=1)
        for offset in range(0, _W, 104):
            pattern_draw.line([(offset, 0), (offset - _H // 2, _H)], fill=(*accent, 8), width=1)
        img.alpha_composite(pattern)
    draw.rounded_rectangle([5, 5, _W - 6, _H - 6], radius=34, outline=(*accent, 210), width=3)
    draw.rounded_rectangle([8, 8, _W - 9, _H - 9], radius=31, outline=(*accent, 54), width=1)
    draw.line([(0, 3), (_W, 3)], fill=(*accent, 180), width=3)


def _draw_gold_curve(draw: "ImageDraw.ImageDraw", style: dict[str, object]) -> None:
    accent = _hex_to_rgb(str(style["accent_color"]))
    primary = _hex_to_rgb(str(style["primary_color"]))
    secondary = _hex_to_rgb(str(style["secondary_color"]))
    shadow = tuple(max(0, c - 48) for c in primary)
    draw.polygon(
        [(_W - 360, _H), (_W, _H), (_W, 266), (_W - 112, 306), (_W - 226, 424)],
        fill=(*shadow, 125),
    )
    draw.polygon(
        [(_W - 320, _H), (_W, _H), (_W, 302), (_W - 88, 334), (_W - 190, 444)],
        fill=(*secondary, 165),
    )
    draw.arc([_W - 356, 154, _W + 366, _H + 342], 196, 285, fill=(*accent, 245), width=5)
    draw.arc([_W - 348, 161, _W + 353, _H + 326], 196, 285, fill=(*accent, 105), width=2)
    for x in range(_W - 138, _W - 24, 18):
        y = _H - 128 + (x - (_W - 138)) // 4
        draw.ellipse([x, y, x + 2, y + 2], fill=(*accent, 68))


def _draw_chip(draw: "ImageDraw.ImageDraw", x: int, y: int, scale: float = 1.0) -> None:
    accent = _GOLD_BRT
    cw, ch = int(90 * scale), int(70 * scale)
    draw.rounded_rectangle([x, y, x + cw, y + ch], radius=int(11 * scale), fill=accent, outline=(143, 103, 35), width=2)
    for i in range(1, 4):
        yy = y + int(ch * i / 4)
        draw.line([(x + 8, yy), (x + cw - 8, yy)], fill=(161, 119, 41), width=1)
    for i in range(1, 4):
        xx = x + int(cw * i / 4)
        draw.line([(xx, y + 8), (xx, y + ch - 8)], fill=(248, 218, 126), width=1)


def _draw_embossed_text(
    draw: "ImageDraw.ImageDraw",
    xy: tuple[int, int],
    text: str,
    *,
    font: "ImageFont.FreeTypeFont | ImageFont.ImageFont",
    fill: tuple[int, int, int],
    shadow: tuple[int, int, int] | None = None,
    highlight: tuple[int, int, int] | None = None,
) -> None:
    shadow = shadow or tuple(max(0, c - 86) for c in fill)
    highlight = highlight or tuple(min(255, c + 46) for c in fill)
    x, y = xy
    draw.text((x + 3, y + 4), text, font=font, fill=(*shadow, 150))
    draw.text((x + 1, y + 1), text, font=font, fill=(*shadow, 88))
    draw.text((x - 1, y - 1), text, font=font, fill=(*highlight, 115))
    draw.text((x, y), text, font=font, fill=fill)


def _generate_standard_front_image(
    *,
    member_full_name: str,
    organization_name: str,
    club_display_name: str,
    organization_slug: str | None,
    card_number: int,
    card_year: int,
    card_status: str,
    membership_type_label: str | None,
    org_logo_path: str | None,
    assonam_logo_path: str | None,
    card_style: dict[str, object] | None,
) -> "Image.Image":
    from PIL import Image, ImageDraw

    style = _card_style(card_style)
    img = Image.new("RGBA", (_W, _H), _hex_to_rgb(str(style["primary_color"])))
    draw = ImageDraw.Draw(img)
    text = _hex_to_rgb(str(style["text_color"]))
    muted = _hex_to_rgb(str(style["muted_text_color"]))
    accent = _hex_to_rgb(str(style["accent_color"]))
    association_label = club_display_name or organization_name

    _draw_luxury_background(img, draw, style)
    _draw_gold_curve(draw, style)

    logo = None
    if org_logo_path and os.path.exists(org_logo_path):
        logo = _load_logo_for_card(org_logo_path, remove_background=bool(style.get("remove_logo_background")))
    if logo is not None:
        mode = str(style.get("logo_mode") or "watermark")
        position = str(style.get("logo_position") or "top-right")
        opacity = float(style.get("logo_opacity") or 0.18)
        if mode in {"watermark", "both"}:
            _paste_logo_image(img, logo, (_W // 2 - 170, _H // 2 - 150, 340, 260), opacity=max(0.05, min(opacity, 0.34)))
        if mode in {"visible", "both"}:
            boxes = {
                "top-left": (70, 34, 150, 70),
                "top-right": (_W - 260, 34, 150, 70),
                "bottom-left": (70, _H - 118, 150, 70),
                "bottom-right": (_W - 260, _H - 118, 150, 70),
                "center": (_W // 2 - 90, 38, 180, 76),
            }
            _paste_logo_image(img, logo, boxes.get(position, boxes["top-right"]), opacity=0.98)

    if assonam_logo_path and os.path.exists(assonam_logo_path):
        _paste_logo(img, assonam_logo_path, 130, 78, _W - 180, 38, opacity=1.0)
        draw = ImageDraw.Draw(img)

    draw.text((72, 58), "TESSERA SOCIO", font=_font_for_style(style, 30, bold=True), fill=muted)
    _draw_embossed_text(draw, (72, 96), str(card_year), font=_font_for_style(style, 92, bold=True), fill=accent)
    badge_fill = _hex_to_rgb("#0B633E") if card_status == "attiva" else _hex_to_rgb("#8F1D2D")
    badge_text = "ATTIVA" if card_status == "attiva" else "NON ATTIVA"
    draw.rounded_rectangle([74, 206, 184, 240], radius=16, fill=badge_fill, outline=accent, width=2)
    draw.text((94, 212), badge_text, font=_font_for_style(style, 20, bold=True), fill=(255, 238, 159))
    if (membership_type_label or "").strip().lower() == "temporanea":
        draw.text((198, 214), "TEMPORANEA", font=_font_for_style(style, 18, bold=True), fill=muted)

    draw.text((72, 268), "NOME E COGNOME", font=_font_for_style(style, 21, bold=True), fill=muted)
    _draw_fit_text(draw, (72, 299), member_full_name or "-", max_width=424, size=44, fill=text, style=style, bold=True, min_size=24)
    draw.line([(72, 362), (206, 362)], fill=accent, width=2)
    draw.polygon([(220, 356), (227, 362), (220, 368), (213, 362)], fill=accent)
    draw.line([(236, 362), (378, 362)], fill=accent, width=2)
    draw.text((72, 392), "ASSOCIAZIONE", font=_font_for_style(style, 19, bold=True), fill=muted)
    _draw_fit_text(draw, (72, 419), association_label or "-", max_width=462, size=25, fill=text, style=style, min_size=15)
    draw.text((72, 466), "N. TESSERA", font=_font_for_style(style, 18, bold=True), fill=muted)
    _draw_embossed_text(draw, (72, 484), str(card_number), font=_font_for_style(style, 34, bold=True), fill=accent)
    _draw_chip(draw, _W - 176, _H - 138, scale=0.95)
    return img


def _generate_standard_back_image(
    *,
    member_full_name: str,
    organization_name: str,
    card_number: int,
    card_year: int,
    card_status: str,
    verification_url: str,
    membership_type_label: str | None,
    valid_until_text: str | None,
    org_logo_path: str | None,
    assonam_logo_path: str | None,
    card_style: dict[str, object] | None,
) -> "Image.Image":
    from PIL import Image, ImageDraw
    import qrcode

    style = _card_style(card_style)
    img = Image.new("RGBA", (_W, _H), _hex_to_rgb(str(style["secondary_color"])))
    draw = ImageDraw.Draw(img)
    text = _hex_to_rgb(str(style["text_color"]))
    muted = _hex_to_rgb(str(style["muted_text_color"]))
    accent = _hex_to_rgb(str(style["accent_color"]))
    _draw_luxury_background(img, draw, style)

    if org_logo_path and os.path.exists(org_logo_path) and str(style.get("logo_mode")) in {"watermark", "both"}:
        logo = _load_logo_for_card(org_logo_path, remove_background=bool(style.get("remove_logo_background")))
        if logo is not None:
            _paste_logo_image(img, logo, (_W - 310, 34, 210, 90), opacity=max(0.08, min(float(style.get("logo_opacity") or 0.18), 0.28)))
    if assonam_logo_path and os.path.exists(assonam_logo_path):
        _paste_logo(img, assonam_logo_path, 118, 66, _W - 166, 32, opacity=0.94)
        draw = ImageDraw.Draw(img)

    title = str(style.get("back_title") or "Verifica tessera")
    body = str(style.get("back_body") or "")
    draw.text((62, 72), title.upper(), font=_font_for_style(style, 28, bold=True), fill=muted)
    if body.strip():
        _draw_fit_text(draw, (62, 116), body, max_width=330, size=22, fill=text, style=style, min_size=14)

    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=9, border=1)
    qr.add_data(verification_url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGBA").resize((238, 238), Image.NEAREST)
    plate = [62, 176, 326, 440]
    draw.rounded_rectangle(plate, radius=20, fill=(255, 255, 255), outline=(*accent, 210), width=3)
    img.paste(qr_img, (75, 189), qr_img)

    info_x = 370
    rows = [
        ("N. tessera", str(card_number)),
        ("Anno", str(card_year)),
        ("Tipo", membership_type_label or "Annuale"),
        ("Scadenza", valid_until_text or "-"),
        ("Stato", "Attiva" if card_status == "attiva" else "Non attiva"),
    ]
    if bool(style.get("back_show_member", True)):
        rows.extend([("Socio", member_full_name or "-"), ("Associazione", organization_name or "-")])
    y = 172
    for label, value in rows:
        draw.text((info_x, y), label.upper(), font=_font_for_style(style, 14, bold=True), fill=muted)
        _draw_fit_text(draw, (info_x, y + 18), value, max_width=_W - info_x - 54, size=20, fill=text, style=style, bold=label in {"N. tessera", "Anno"}, min_size=11)
        y += 48
    draw.text((62, _H - 36), verification_url[:96], font=_font_for_style(style, 11), fill=(255, 255, 255, 150))
    return img


def _image_to_png_bytes(img: "Image.Image") -> bytes:
    result = img.convert("RGB")
    output = io.BytesIO()
    result.save(output, format="PNG", optimize=True)
    output.seek(0)
    return output.read()


def generate_card_image_bytes(
    *,
    member_full_name: str,
    organization_name: str,
    club_display_name: str,
    organization_slug: str | None = None,
    card_number: int,
    card_year: int,
    card_status: str,
    membership_type_label: str | None = None,
    org_logo_path: str | None,
    assonam_logo_path: str | None,
    card_style: dict[str, object] | None = None,
) -> bytes:
    """Return PNG bytes of the card front in bordeaux theme."""
    from PIL import Image, ImageDraw

    normalized_slug = (organization_slug or "").strip().lower()
    is_oasi2 = normalized_slug == "oasi-2"
    association_label = club_display_name or organization_name

    if not _is_legacy_card(normalized_slug):
        return _image_to_png_bytes(
            _generate_standard_front_image(
                member_full_name=member_full_name,
                organization_name=organization_name,
                club_display_name=club_display_name,
                organization_slug=organization_slug,
                card_number=card_number,
                card_year=card_year,
                card_status=card_status,
                membership_type_label=membership_type_label,
                org_logo_path=org_logo_path,
                assonam_logo_path=assonam_logo_path,
                card_style=card_style,
            )
        )

    img = Image.new("RGBA", (_W, _H), _BDX_DARK)

    if not is_oasi2:
        overlay = Image.new("RGBA", (_W, _H), (0, 0, 0, 0))
        overlay_draw = ImageDraw.Draw(overlay)
        overlay_draw.rectangle([_W // 4, 0, _W * 3 // 4, _H], fill=(*_BDX_MID, 160))
        overlay_draw.rectangle(
            [_W // 3, _H // 5, _W * 2 // 3, _H * 4 // 5], fill=(*_BDX_ACC, 120)
        )
        img = Image.alpha_composite(img, overlay)

    if not is_oasi2 and org_logo_path and os.path.exists(org_logo_path):
        wm = int(min(_W, _H) * 0.52)
        _paste_logo(
            img, org_logo_path, wm, wm, (_W - wm) // 2, (_H - wm) // 2, opacity=0.09
        )

    draw = ImageDraw.Draw(img)

    # Thin separators (monochrome-safe for oasi-2)
    draw.rectangle([0, 0, _W, 2], fill=_GOLD)
    draw.rectangle([0, _H - 2, _W, _H], fill=(*_GOLD, 120))

    # ASSONAM logo top-right
    if assonam_logo_path and os.path.exists(assonam_logo_path):
        _paste_logo(img, assonam_logo_path, 150, 72, _W - 168, 14, opacity=1.0)
        draw = ImageDraw.Draw(img)

    # Organization logo in top area (no watermark in oasi-2)
    if org_logo_path and os.path.exists(org_logo_path):
        if is_oasi2:
            logo_box_w = 270
            logo_box_x = int(((_W - logo_box_w) / 2) + _OASI2_LOGO_SHIFT_X)
            _paste_logo(
                img, org_logo_path, logo_box_w, 78, logo_box_x, 14, opacity=0.99
            )
        else:
            _paste_logo(img, org_logo_path, 200, 52, (_W - 200) // 2, 14, opacity=0.95)
        draw = ImageDraw.Draw(img)

    # Header
    draw.text(
        (28, 28), "TESSERA SOCIO", font=_load_font(18, bold=True), fill=(*_GOLD, 205)
    )
    draw.text((28, 52), str(card_year), font=_load_font(60, bold=True), fill=_GOLD_BRT)
    if (membership_type_label or "").strip().lower() == "temporanea":
        draw.text((28, 118), "TEMPORANEA", font=_load_font(18, bold=True), fill=_CREAM)

    is_active = card_status == "attiva"
    status_color = _GREEN if is_active else _RED
    status_label = "ATTIVA" if is_active else "NON ATTIVA"
    draw.text(
        (28, 148 if (membership_type_label or "").strip().lower() == "temporanea" else 124),
        status_label,
        font=_load_font(20, bold=True),
        fill=status_color,
    )

    # Body
    mid_y = _H // 2
    draw.text(
        (28, mid_y - 8), "NOME E COGNOME", font=_load_font(17, bold=True), fill=_MUTED
    )
    safe_name = (member_full_name or "-")[:32]
    draw.text((28, mid_y + 16), safe_name, font=_load_font(44, bold=True), fill=_WHITE)

    draw.text(
        (28, mid_y + 72), "ASSOCIAZIONE", font=_load_font(17, bold=True), fill=_MUTED
    )
    safe_assoc = (association_label or organization_name or "-")[:40]
    draw.text((28, mid_y + 94), safe_assoc, font=_load_font(28), fill=_CREAM)

    # Footer
    divider_y = _H - 112
    draw.rectangle([20, divider_y, _W - 20, divider_y + 1], fill=(*_GOLD, 80))

    draw.text((28, _H - 102), "N. TESSERA", font=_load_font(17, bold=True), fill=_MUTED)
    draw.text(
        (28, _H - 78), str(card_number), font=_load_font(44, bold=True), fill=_GOLD_BRT
    )

    # Decorative chip
    chip_x, chip_y, chip_w, chip_h = _W - 84, _H - 72, 68, 46
    draw.rounded_rectangle(
        [chip_x, chip_y, chip_x + chip_w, chip_y + chip_h], radius=6, fill=_GOLD
    )
    draw.rectangle(
        [
            chip_x + 4,
            chip_y + chip_h // 2 - 2,
            chip_x + chip_w - 4,
            chip_y + chip_h // 2 + 2,
        ],
        fill=(*_GOLD_BRT, 100),
    )
    for stripe_x in range(chip_x + 8, chip_x + chip_w - 8, 10):
        draw.rectangle(
            [stripe_x, chip_y + 5, stripe_x + 4, chip_y + chip_h - 5],
            fill=(*_GOLD_BRT, 90),
        )

    result = img.convert("RGB")
    output = io.BytesIO()
    result.save(output, format="PNG", optimize=True)
    output.seek(0)
    return output.read()


def generate_card_back_image_bytes(
    *,
    member_full_name: str,
    organization_name: str,
    organization_slug: str | None = None,
    card_number: int,
    card_year: int,
    card_status: str,
    verification_url: str,
    membership_type_label: str | None = None,
    valid_until_text: str | None = None,
    org_logo_path: str | None,
    assonam_logo_path: str | None,
    card_style: dict[str, object] | None = None,
) -> bytes:
    """Return PNG bytes of the card back with fixed QR and configurable copy."""
    if _is_legacy_card(organization_slug):
        # Legacy customers keep the existing PDF back design; this helper is for the
        # new standard/template preview.
        card_style = dict(card_style or {})
    return _image_to_png_bytes(
        _generate_standard_back_image(
            member_full_name=member_full_name,
            organization_name=organization_name,
            card_number=card_number,
            card_year=card_year,
            card_status=card_status,
            verification_url=verification_url,
            membership_type_label=membership_type_label,
            valid_until_text=valid_until_text,
            org_logo_path=org_logo_path,
            assonam_logo_path=assonam_logo_path,
            card_style=card_style,
        )
    )

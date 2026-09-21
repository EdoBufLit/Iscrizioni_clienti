"""Render geometry checks for the complete Golden Age mark and long member data."""

import io
import re

import pytest
from PIL import Image, ImageDraw
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from app.services import card_image, card_pdf


@pytest.fixture
def brand_mark(tmp_path):
    path = tmp_path / "brand-mark.png"
    # A distinctive opaque color lets us measure the actual rasterized mark,
    # including accidental opacity changes, without depending on its artwork.
    Image.new("RGBA", (1349, 1000), (23, 219, 241, 255)).save(path)
    return str(path)


def member_data(slug, brand_mark, *, long_text=False):
    return dict(
        member_full_name="W" * 44 if long_text else "Mario Rossi",
        organization_name="Golden Age Club",
        club_display_name="W" * 100 if long_text else "Golden Age Club - Speakeasy",
        organization_slug=slug,
        card_number=123456,
        card_year=2026,
        card_status="attiva",
        membership_type_label="Annuale",
        org_logo_path=brand_mark,
        assonam_logo_path=None,
    )


@pytest.mark.parametrize("slug", ["oasi-2", "golden-age-club"])
def test_png_mark_is_large_centered_opaque_and_clear_of_member_rows(slug, brand_mark):
    image = Image.open(io.BytesIO(card_image.generate_card_image_bytes(**member_data(slug, brand_mark))))
    assert image.size == (856, 540)
    mark_mask = Image.new("1", image.size)
    mark_mask.putdata([pixel == (23, 219, 241) for pixel in image.getdata()])
    bounds = mark_mask.getbbox()
    assert bounds is not None, "The original opaque logo colors must survive rendering"
    left, top, right, bottom = bounds
    width, height = right - left, bottom - top
    assert abs(width / height - 1.349) < 0.01
    assert abs((left + right) / 2 - image.width / 2) <= 1
    assert height >= image.height * 0.4
    assert 8 <= top and bottom <= 248  # before the member label at y=262


@pytest.mark.parametrize("slug", ["oasi-2", "golden-age-club"])
def test_png_long_names_and_club_names_stay_inside_card(slug, brand_mark, monkeypatch):
    drawn_text = []
    original = ImageDraw.ImageDraw.text

    def record_text(self, xy, text, *args, **kwargs):
        if text.startswith("W"):
            drawn_text.append((xy, text, self.textbbox(xy, text, font=kwargs["font"])))
        return original(self, xy, text, *args, **kwargs)

    monkeypatch.setattr(ImageDraw.ImageDraw, "text", record_text)
    card_image.generate_card_image_bytes(**member_data(slug, brand_mark, long_text=True))

    assert len(drawn_text) == 2
    assert drawn_text[0][1] == "W" * 44  # fit first, rather than cut off by character count
    assert drawn_text[1][1].endswith("...")
    for _, _, (left, top, right, bottom) in drawn_text:
        assert 28 <= left < right <= 828
        assert 280 <= top < bottom < 428  # the footer starts at y=428


@pytest.mark.parametrize("slug", ["oasi-2", "golden-age-club"])
def test_pdf_front_fits_mark_and_long_text_and_keeps_verification_back(slug, brand_mark, monkeypatch):
    images = []
    texts = []
    qr_urls = []
    original_image = canvas.Canvas.drawImage
    original_string = canvas.Canvas.drawString
    original_qr = card_pdf._generate_qr_reader

    def record_image(self, image, x, y, width=None, height=None, *args, **kwargs):
        images.append((self.getPageNumber(), image, x, y, width, height))
        return original_image(self, image, x, y, width, height, *args, **kwargs)

    def record_string(self, x, y, text, *args, **kwargs):
        texts.append((self.getPageNumber(), x, y, text, self._fontname, self._fontsize))
        return original_string(self, x, y, text, *args, **kwargs)

    def record_qr(url):
        qr_urls.append(url)
        return original_qr(url)

    monkeypatch.setattr(canvas.Canvas, "drawImage", record_image)
    monkeypatch.setattr(canvas.Canvas, "drawString", record_string)
    monkeypatch.setattr(card_pdf, "_generate_qr_reader", record_qr)
    verification_url = "https://example.invalid/verifica-demo"
    pdf = card_pdf.generate_card_pdf_bytes(
        **member_data(slug, brand_mark, long_text=True), verification_url=verification_url,
    )

    assert pdf.startswith(b"%PDF-")
    assert len(re.findall(rb"/Type /Page\b", pdf)) == 2
    mark = next(image for image in images if image[0] == 1 and image[1] == brand_mark)
    _, _, x, y, width, height = mark
    assert abs(width / height - 1.349) < 0.001
    assert x + width / 2 == pytest.approx(card_pdf._PAGE_W / 2)
    assert height >= card_pdf._CARD_H * 0.4
    assert y + height <= card_pdf._CARD_Y + card_pdf._CARD_H - 8
    assert y >= card_pdf._CARD_Y + card_pdf._CARD_H * 0.44 + 28

    member_rows = [row for row in texts if row[0] == 1 and row[3].startswith("W")]
    assert len(member_rows) == 2
    assert member_rows[0][3] == "W" * 44
    assert member_rows[1][3].endswith("...")
    for _, x, _, text, font_name, size in member_rows:
        assert x >= card_pdf._CARD_X + 18
        assert x + stringWidth(text, font_name, size) <= card_pdf._CARD_X + card_pdf._CARD_W - 18 + 0.001

    assert qr_urls == [verification_url]
    assert any(page == 2 and width == height and width >= 170 for page, _, _, _, width, height in images)
    back_texts = [row for row in texts if row[0] == 2]
    assert len(back_texts) >= 14
    for _, x, y, text, font_name, size in back_texts:
        assert card_pdf._CARD_Y + 7 <= y <= card_pdf._CARD_Y + card_pdf._CARD_H - 10
        assert x >= card_pdf._CARD_X + 18
        assert x + stringWidth(text, font_name, size) <= card_pdf._CARD_X + card_pdf._CARD_W - 18 + 0.001

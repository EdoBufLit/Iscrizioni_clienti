from __future__ import annotations

import io
import logging
import os
import re
from textwrap import wrap

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app.config import settings
from app.services.system_email_layout import build_system_email_html
from app.services.email_outbox import build_email_payload

logger = logging.getLogger(__name__)

_BRAND = colors.HexColor("#0f5c58")
_BRAND_DARK = colors.HexColor("#113335")
_MINT = colors.HexColor("#66d7c8")
_INK = colors.HexColor("#13202f")
_MUTED = colors.HexColor("#64748b")
_PAPER = colors.HexColor("#f8fafc")
_LINE = colors.HexColor("#d9e4e8")
_WARN = colors.HexColor("#b45309")
_ACCENT = colors.HexColor("#f97316")
_DEFAULT_BOT_NUMBER = "+390299914307"


def resolve_assonam_whatsapp_bot_number() -> str:
    raw = (
        settings.ASSONAM_WHATSAPP_BOT_NUMBER
        or settings.TWILIO_WHATSAPP_FROM
        or _DEFAULT_BOT_NUMBER
    )
    cleaned = str(raw or "").strip().replace("whatsapp:", "")
    digits = re.sub(r"\D+", "", cleaned)
    if not digits:
        digits = re.sub(r"\D+", "", _DEFAULT_BOT_NUMBER)
    if digits.startswith("00"):
        digits = digits[2:]
    if not digits.startswith("39") and len(digits) <= 10:
        digits = f"39{digits}"
    return f"+{digits}"


def format_whatsapp_number_for_display(number: str) -> str:
    digits = re.sub(r"\D+", "", number)
    if digits.startswith("39") and len(digits) > 2:
        national = digits[2:]
        return f"+39 {national[:2]} {national[2:6]} {national[6:]}" if len(national) > 6 else f"+39 {national}"
    return number


def build_org_admin_welcome_email_payload(
    *,
    organization_name: str,
    invite_url: str,
    meta: dict | None = None,
) -> dict:
    bot_number = resolve_assonam_whatsapp_bot_number()
    display_bot = format_whatsapp_number_for_display(bot_number)
    pdf_bytes = generate_org_admin_welcome_guide_pdf(
        organization_name=organization_name,
        invite_url=invite_url,
        bot_number=display_bot,
    )
    return build_email_payload(
        text_body=build_org_admin_welcome_text(
            organization_name=organization_name,
            invite_url=invite_url,
            bot_number=display_bot,
        ),
        html_body=build_org_admin_welcome_html(
            organization_name=organization_name,
            invite_url=invite_url,
            bot_number=display_bot,
        ),
        attachments=[
            {
                "filename": "guida-assonam-area-admin.pdf",
                "content_type": "application/pdf",
                "data": pdf_bytes,
            }
        ],
        meta={"guide": "org_admin_welcome_v1", **(meta or {})},
    )


def build_org_admin_welcome_text(
    *,
    organization_name: str,
    invite_url: str,
    bot_number: str,
) -> str:
    return (
        f"Ciao, sei stato invitato come amministratore di {organization_name} su ASSO.N.A.M.\n\n"
        f"Accedi qui: {invite_url}\n\n"
        "In breve:\n"
        f"- Per richiedere nuove tessere scrivi al bot WhatsApp {bot_number} oppure contatta un admin ASSO.N.A.M.\n"
        "- Quando le tessere stanno finendo riceverai un avviso via WhatsApp dallo stesso bot e via email.\n"
        "- Nell'area riservata puoi gestire soci, tessere, inviti, documenti, prenotazioni e impostazioni.\n"
        "- Il modulo Comunicazioni costa 150 euro aggiuntivi e abilita campagne email, form pubblici, sondaggi e WhatsApp.\n\n"
        "Trovi la guida completa allegata in PDF."
    )


def build_org_admin_welcome_html(
    *,
    organization_name: str,
    invite_url: str,
    bot_number: str,
) -> str:
    return build_system_email_html(
        title="Benvenuto nell'area amministratore",
        eyebrow="Il tuo accesso ASSO.N.A.M.",
        organization_name=organization_name or "la tua associazione",
        preheader="Il tuo accesso alla piattaforma e la guida rapida per iniziare.",
        body="Ora puoi gestire la tua associazione dalla piattaforma. La guida completa è allegata in PDF: qui trovi le informazioni per iniziare.",
        cta_url=invite_url,
        cta_label="Accedi all'area riservata",
        details=[
            ("Nuove tessere", f"Scrivi al bot WhatsApp {bot_number} oppure contatta un admin ASSO.N.A.M."),
            ("Avviso scorte", "Quando le tessere stanno finendo arriva un avviso via WhatsApp dallo stesso bot e via email."),
            ("Area riservata", "Gestisci soci, tessere, inviti, documenti, prenotazioni, contabilità e dati associazione."),
            ("Modulo Comunicazioni", "Modulo opzionale da 150 euro: campagne email, form pubblici, sondaggi e WhatsApp."),
        ],
    )


def _static_path(filename: str) -> str:
    return os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "public", filename)
    )


def _draw_wrapped(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    *,
    max_chars: int = 72,
    leading: float = 13,
    font: str = "Helvetica",
    size: float = 9.5,
    color=colors.HexColor("#13202f"),
) -> float:
    c.setFillColor(color)
    c.setFont(font, size)
    for line in wrap(text, width=max_chars):
        c.drawString(x, y, line)
        y -= leading
    return y


def _draw_card(
    c: canvas.Canvas,
    x: float,
    y: float,
    w: float,
    h: float,
    *,
    title: str,
    text: str,
    icon: str,
    accent=_BRAND,
) -> None:
    c.setFillColor(colors.white)
    c.setStrokeColor(_LINE)
    c.roundRect(x, y, w, h, 12, fill=1, stroke=1)
    c.setFillColor(accent)
    c.circle(x + 24, y + h - 28, 14, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(x + 24, y + h - 33, icon)
    c.setFillColor(_INK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x + 46, y + h - 24, title)
    _draw_wrapped(c, text, x + 18, y + h - 50, max_chars=46, leading=12, size=9, color=_MUTED)


def _draw_step_illustration(c: canvas.Canvas, x: float, y: float, label: str, number: str) -> None:
    c.setFillColor(_PAPER)
    c.setStrokeColor(_LINE)
    c.roundRect(x, y, 126, 54, 10, fill=1, stroke=1)
    c.setFillColor(_MINT)
    c.circle(x + 24, y + 27, 14, fill=1, stroke=0)
    c.setFillColor(_BRAND_DARK)
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(x + 24, y + 23, number)
    c.setFillColor(_INK)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x + 46, y + 31, label)
    c.setFillColor(_MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(x + 46, y + 18, "clicca, controlla, salva")


def generate_org_admin_welcome_guide_pdf(
    *,
    organization_name: str,
    invite_url: str,
    bot_number: str,
) -> bytes:
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    page_w, page_h = A4
    margin = 42

    c.setFillColor(_BRAND_DARK)
    c.rect(0, page_h - 150, page_w, 150, fill=1, stroke=0)
    logo_path = _static_path("logo-transparent.png")
    if os.path.exists(logo_path):
        try:
            c.drawImage(ImageReader(logo_path), margin, page_h - 92, 88, 52, mask="auto", preserveAspectRatio=True)
        except Exception as exc:
            logger.warning(
                "Unable to draw org admin welcome guide logo error_type=%s",
                type(exc).__name__,
            )
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 24)
    c.drawString(margin, page_h - 116, "Guida rapida ASSO.N.A.M.")
    c.setFont("Helvetica", 11)
    c.setFillColor(colors.HexColor("#d7f5f1"))
    c.drawString(margin, page_h - 135, f"Per amministratori di {organization_name or 'associazione'}")

    y = page_h - 184
    c.setFillColor(_INK)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(margin, y, "Le 4 cose da sapere subito")
    y -= 18
    _draw_wrapped(
        c,
        "ASSO.N.A.M. ti aiuta a gestire soci, tessere e comunicazioni da un'unica area riservata. "
        "La guida è breve: segui i riquadri e usa il link ricevuto nella mail per entrare.",
        margin,
        y,
        max_chars=86,
        leading=13,
        size=10,
        color=_MUTED,
    )

    card_w = (page_w - margin * 2 - 16) / 2
    top_y = page_h - 335
    _draw_card(
        c,
        margin,
        top_y,
        card_w,
        96,
        title="1. Entra nell'area riservata",
        text="Apri il link della mail. Da lì trovi Panoramica, Soci, Tessere, Inviti, Prenotazioni, Documenti, Contabilità e Associazione.",
        icon="1",
        accent=_BRAND,
    )
    _draw_card(
        c,
        margin + card_w + 16,
        top_y,
        card_w,
        96,
        title="2. Richiedi nuove tessere",
        text=f"Quando servono nuove tessere, scrivi al bot WhatsApp {bot_number} oppure contatta un admin ASSO.N.A.M.",
        icon="2",
        accent=_ACCENT,
    )
    _draw_card(
        c,
        margin,
        top_y - 112,
        card_w,
        96,
        title="3. Avvisi automatici",
        text="Quando le tessere stanno finendo ricevi un avviso via WhatsApp dallo stesso bot e anche via email.",
        icon="3",
        accent=_WARN,
    )
    _draw_card(
        c,
        margin + card_w + 16,
        top_y - 112,
        card_w,
        96,
        title="4. Comunicazioni",
        text="Modulo opzionale da 150 euro: campagne email, form pubblici, sondaggi e messaggi WhatsApp collegati ai tuoi contatti.",
        icon="4",
        accent=_MINT,
    )

    y = top_y - 154
    c.setFillColor(_INK)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(margin, y, "Come funziona l'area riservata")
    y -= 26
    _draw_step_illustration(c, margin, y - 54, "Soci", "A")
    _draw_step_illustration(c, margin + 138, y - 54, "Tessere", "B")
    _draw_step_illustration(c, margin + 276, y - 54, "Documenti", "C")
    _draw_step_illustration(c, margin + 414, y - 54, "Comunicazioni", "D")

    y -= 86
    bullets = [
        "Soci: controlli le iscrizioni, apri il profilo, aggiorni i dati e segui lo stato.",
        "Tessere: vedi lotti disponibili, tessere emesse e disponibilità residua.",
        "Inviti: gestisci richieste e referral collegati alla tua associazione.",
        "Prenotazioni: se usi sale e tavoli, controlli calendario, mappa e richieste.",
        "Documenti e Contabilità: trovi file condivisi e movimenti quando il modulo è attivo.",
        "Associazione: aggiorni impostazioni, dati pubblici e regole operative.",
    ]
    c.setFont("Helvetica", 9.5)
    for item in bullets:
        c.setFillColor(_BRAND)
        c.circle(margin + 4, y + 3, 2.4, fill=1, stroke=0)
        y = _draw_wrapped(c, item, margin + 14, y, max_chars=92, leading=12, size=9.5, color=_INK)
        y -= 4

    y -= 6
    c.setFillColor(colors.HexColor("#fff7ed"))
    c.setStrokeColor(colors.HexColor("#fed7aa"))
    c.roundRect(margin, y - 58, page_w - margin * 2, 58, 12, fill=1, stroke=1)
    c.setFillColor(_WARN)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin + 16, y - 20, "Numero bot WhatsApp")
    c.setFillColor(_INK)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(margin + 16, y - 42, bot_number)
    c.setFont("Helvetica", 9)
    c.setFillColor(_MUTED)
    c.drawString(margin + 170, y - 36, "Scrivi qui per richiedere nuove tessere quando ne hai bisogno.")

    c.setFillColor(_MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(margin, 28, "Guida inviata automaticamente ai nuovi amministratori ASSO.N.A.M. insieme al link di accesso.")
    c.showPage()

    c.save()
    return buffer.getvalue()

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import html
import re
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models import EmailTemplate


EMAIL_TEMPLATE_CHANNEL = "email"
EMAIL_TEMPLATE_SCOPE_ALL = "all"
EMAIL_TEMPLATE_SCOPE_SYSTEM = "system"
EMAIL_TEMPLATE_SCOPE_ASSOCIATION = "association"
EMAIL_TEMPLATE_TYPE_NEWSLETTER = "newsletter"
EMAIL_TEMPLATE_TYPE_EVENT = "event"
EMAIL_TEMPLATE_TYPE_RENEWAL_REMINDER = "renewal_reminder"
EMAIL_TEMPLATE_TYPE_BOOKING_CONFIRMATION = "booking_confirmation"
EMAIL_TEMPLATE_TYPE_BOOKING_REJECTION = "booking_rejection"
EMAIL_TEMPLATE_TYPE_GENERIC_NOTICE = "generic_notice"
EMAIL_TEMPLATE_TYPES = {
    EMAIL_TEMPLATE_TYPE_NEWSLETTER,
    EMAIL_TEMPLATE_TYPE_EVENT,
    EMAIL_TEMPLATE_TYPE_RENEWAL_REMINDER,
    EMAIL_TEMPLATE_TYPE_BOOKING_CONFIRMATION,
    EMAIL_TEMPLATE_TYPE_BOOKING_REJECTION,
    EMAIL_TEMPLATE_TYPE_GENERIC_NOTICE,
}
EMAIL_EDITOR_STATUS_DRAFT = "draft"
EMAIL_EDITOR_STATUS_READY = "ready"
EMAIL_EDITOR_STATUSES = {
    EMAIL_EDITOR_STATUS_DRAFT,
    EMAIL_EDITOR_STATUS_READY,
}
ALLOWED_TEMPLATE_SCOPES = {
    EMAIL_TEMPLATE_SCOPE_ALL,
    EMAIL_TEMPLATE_SCOPE_SYSTEM,
    EMAIL_TEMPLATE_SCOPE_ASSOCIATION,
}
ALLOWED_TEMPLATE_CHANNELS = {EMAIL_TEMPLATE_CHANNEL}
_TEMPLATE_VARIABLE_PATTERN = re.compile(r"{{\s*([a-zA-Z0-9_]+)\s*}}")

AVAILABLE_TEMPLATE_VARIABLES = [
    {
        "key": "nome_socio",
        "placeholder": "{{nome_socio}}",
        "label": "Nome socio",
        "description": "Nome del socio o del destinatario principale.",
        "example": "Mario",
    },
    {
        "key": "cognome_socio",
        "placeholder": "{{cognome_socio}}",
        "label": "Cognome socio",
        "description": "Cognome del socio o del destinatario principale.",
        "example": "Mario Rossi",
    },
    {
        "key": "nome_associazione",
        "placeholder": "{{nome_associazione}}",
        "label": "Nome associazione",
        "description": "Nome dell'associazione mittente.",
        "example": "Golden Age Club",
    },
    {
        "key": "numero_tessera",
        "placeholder": "{{numero_tessera}}",
        "label": "Numero tessera",
        "description": "Numero tessera del socio se disponibile.",
        "example": "12345",
    },
    {
        "key": "data_scadenza",
        "placeholder": "{{data_scadenza}}",
        "label": "Data scadenza",
        "description": "Data di scadenza della tessera o del rinnovo.",
        "example": "31/12/2026",
    },
    {
        "key": "email_socio",
        "placeholder": "{{email_socio}}",
        "label": "Email socio",
        "description": "Email del socio o del submitter.",
        "example": "mario.rossi@example.com",
    },
    {
        "key": "link_iscrizione",
        "placeholder": "{{link_iscrizione}}",
        "label": "Link iscrizione",
        "description": "Link pubblico all'iscrizione o al rinnovo.",
        "example": "https://app.assonam.it/associazioni/golden-age-club/iscrizione",
    },
    {
        "key": "link_evento",
        "placeholder": "{{link_evento}}",
        "label": "Link evento",
        "description": "Link all'evento, pagina pubblica o CTA associata.",
        "example": "https://app.assonam.it/associazioni/golden-age-club",
    },
    {
        "key": "nome_evento",
        "placeholder": "{{nome_evento}}",
        "label": "Nome evento",
        "description": "Titolo evento o appuntamento.",
        "example": "Assemblea soci 2026",
    },
    {
        "key": "data_evento",
        "placeholder": "{{data_evento}}",
        "label": "Data evento",
        "description": "Data o slot evento/prenotazione.",
        "example": "12 aprile 2026 - 20:30",
    },
    {
        "key": "stato_prenotazione",
        "placeholder": "{{stato_prenotazione}}",
        "label": "Stato prenotazione",
        "description": "Stato della richiesta o prenotazione.",
        "example": "confirmed",
    },
    {
        "key": "messaggio_org",
        "placeholder": "{{messaggio_org}}",
        "label": "Messaggio org",
        "description": "Nota libera aggiunta dall'associazione.",
        "example": "Ti aspettiamo con 15 minuti di anticipo.",
    },
    {
        "key": "link_rinnovo",
        "placeholder": "{{link_rinnovo}}",
        "label": "Link rinnovo",
        "description": "Alias legacy del link iscrizione/rinnovo.",
        "example": "https://app.assonam.it/associazioni/golden-age-club/iscrizione",
    },
    {
        "key": "link_documento",
        "placeholder": "{{link_documento}}",
        "label": "Link documento",
        "description": "Alias legacy del link evento/documento.",
        "example": "https://app.assonam.it/associazioni/golden-age-club",
    },
    {
        "key": "titolo_form",
        "placeholder": "{{titolo_form}}",
        "label": "Titolo form",
        "description": "Titolo del form o workflow che ha generato il messaggio.",
        "example": "Prenotazione tavolo",
    },
    {
        "key": "email_destinatario",
        "placeholder": "{{email_destinatario}}",
        "label": "Email destinatario",
        "description": "Alias legacy dell'email socio.",
        "example": "mario.rossi@example.com",
    },
]

DEFAULT_EMAIL_DESIGN = {
    "accent_color": "#0f766e",
    "button_color": "#0f766e",
    "hide_logo": False,
    "logo_url": "",
    "hero_image_url": "",
    "content_image_url": "",
    "email_title": "",
    "cta_label": "",
    "cta_note": "",
    "cta_kind": "none",
    "cta_url": "",
    "layout_key": "modern",
    "show_association_name": True,
    "font_preset": "modern_sans",
    "cta_style": "solid",
    "secondary_image_url": "",
    "highlight_title": "",
    "highlight_body": "",
    "event_details": "",
    "signature_name": "",
    "signature_role": "",
    "final_note": "",
    "style_preset": "istituzionale",
    "button_style": "pill",
    "hero_kicker": "",
    "hero_title": "",
    "highlight_box": "",
    "signature": "",
    "section_order": [
        "hero",
        "body",
        "cta",
        "highlight",
        "event",
        "signature",
        "final_note",
    ],
}

EMAIL_SECTION_KEYS = (
    "hero",
    "body",
    "cta",
    "highlight",
    "event",
    "signature",
    "final_note",
)


def plain_text_to_html(value: str) -> str:
    normalized = value.replace("\r\n", "\n")
    blocks = [block.strip() for block in normalized.split("\n\n")]
    paragraphs = [block for block in blocks if block]
    if not paragraphs:
        return ""
    return "".join(
        f"<p>{html.escape(paragraph).replace(chr(10), '<br />')}</p>"
        for paragraph in paragraphs
    )


def _system_template(
    *,
    name: str,
    category: str,
    template_type: str,
    subject: str,
    body_text: str,
) -> dict[str, str]:
    return {
        "name": name,
        "category": category,
        "template_type": template_type,
        "editor_status": EMAIL_EDITOR_STATUS_READY,
        "subject": subject,
        "body_text": body_text,
        "body_html": plain_text_to_html(body_text),
        "compiled_html": plain_text_to_html(body_text),
    }


SYSTEM_EMAIL_TEMPLATES = [
    _system_template(
        name="Benvenuto nuovo socio",
        category="onboarding",
        template_type=EMAIL_TEMPLATE_TYPE_NEWSLETTER,
        subject="Benvenuto in {{nome_associazione}}, {{nome_socio}}",
        body_text=(
            "Ciao {{nome_socio}},\n\n"
            "benvenuto in {{nome_associazione}}.\n"
            "La tua tessera numero {{numero_tessera}} e stata registrata correttamente.\n\n"
            "Per eventuali aggiornamenti puoi usare questo link: {{link_documento}}"
        ),
    ),
    _system_template(
        name="Iscrizione approvata",
        category="membership",
        template_type=EMAIL_TEMPLATE_TYPE_GENERIC_NOTICE,
        subject="Iscrizione approvata per {{nome_socio}}",
        body_text=(
            "Ciao {{nome_socio}},\n\n"
            "la tua iscrizione a {{nome_associazione}} e stata approvata.\n"
            "La tua tessera numero {{numero_tessera}} e attiva fino al {{data_scadenza}}."
        ),
    ),
    _system_template(
        name="Tessera disponibile",
        category="membership",
        template_type=EMAIL_TEMPLATE_TYPE_GENERIC_NOTICE,
        subject="La tua tessera {{numero_tessera}} e disponibile",
        body_text=(
            "Ciao {{nome_socio}},\n\n"
            "la tua tessera di {{nome_associazione}} e disponibile.\n"
            "Numero tessera: {{numero_tessera}}\n"
            "Scadenza: {{data_scadenza}}"
        ),
    ),
    _system_template(
        name="Rinnovo quota in scadenza",
        category="renewal",
        template_type=EMAIL_TEMPLATE_TYPE_RENEWAL_REMINDER,
        subject="Rinnovo in scadenza per {{nome_socio}}",
        body_text=(
            "Ciao {{nome_socio}},\n\n"
            "la tua quota associativa per {{nome_associazione}} scade il {{data_scadenza}}.\n"
            "Puoi procedere dal link seguente: {{link_rinnovo}}"
        ),
    ),
    _system_template(
        name="Sollecito quota gentile",
        category="renewal",
        template_type=EMAIL_TEMPLATE_TYPE_RENEWAL_REMINDER,
        subject="Promemoria gentile rinnovo quota",
        body_text=(
            "Ciao {{nome_socio}},\n\n"
            "ti ricordiamo gentilmente che la quota di {{nome_associazione}} e in scadenza il {{data_scadenza}}.\n"
            "Se vuoi rinnovare ora, trovi il link qui: {{link_rinnovo}}"
        ),
    ),
    _system_template(
        name="Convocazione assemblea",
        category="assembly",
        template_type=EMAIL_TEMPLATE_TYPE_EVENT,
        subject="Convocazione assemblea {{nome_associazione}}",
        body_text=(
            "Ciao {{nome_socio}},\n\n"
            "sei convocato all'assemblea di {{nome_associazione}}.\n"
            "Puoi consultare materiale o allegati qui: {{link_documento}}"
        ),
    ),
    _system_template(
        name="Documento disponibile",
        category="documents",
        template_type=EMAIL_TEMPLATE_TYPE_GENERIC_NOTICE,
        subject="Nuovo documento disponibile per {{nome_socio}}",
        body_text=(
            "Ciao {{nome_socio}},\n\n"
            "e disponibile un nuovo documento relativo a {{nome_associazione}}.\n"
            "Puoi consultarlo qui: {{link_documento}}"
        ),
    ),
    _system_template(
        name="Avviso evento",
        category="events",
        template_type=EMAIL_TEMPLATE_TYPE_EVENT,
        subject="Nuovo avviso evento da {{nome_associazione}}",
        body_text=(
            "Ciao {{nome_socio}},\n\n"
            "ti segnaliamo un nuovo evento organizzato da {{nome_associazione}}.\n"
            "Maggiori dettagli sono disponibili qui: {{link_documento}}"
        ),
    ),
    _system_template(
        name="Newsletter base",
        category="newsletter",
        template_type=EMAIL_TEMPLATE_TYPE_NEWSLETTER,
        subject="Aggiornamenti da {{nome_associazione}}",
        body_text=(
            "Ciao {{nome_socio}},\n\n"
            "ecco gli aggiornamenti piu importanti della settimana da {{nome_associazione}}.\n\n"
            "{{messaggio_org}}"
        ),
    ),
    _system_template(
        name="Reminder rinnovo",
        category="renewal",
        template_type=EMAIL_TEMPLATE_TYPE_RENEWAL_REMINDER,
        subject="Reminder rinnovo {{nome_associazione}}",
        body_text=(
            "Ciao {{nome_socio}},\n\n"
            "ti ricordiamo che il rinnovo della tua iscrizione e in scadenza.\n"
            "Puoi completarlo qui: {{link_iscrizione}}"
        ),
    ),
    _system_template(
        name="Conferma prenotazione",
        category="booking",
        template_type=EMAIL_TEMPLATE_TYPE_BOOKING_CONFIRMATION,
        subject="Prenotazione confermata - {{nome_associazione}}",
        body_text=(
            "Ciao {{nome_socio}},\n\n"
            "la tua prenotazione per {{nome_evento}} e stata confermata.\n"
            "Dettagli: {{data_evento}}\n"
            "Stato: {{stato_prenotazione}}"
        ),
    ),
    _system_template(
        name="Rigetto prenotazione",
        category="booking",
        template_type=EMAIL_TEMPLATE_TYPE_BOOKING_REJECTION,
        subject="Prenotazione non confermata - {{nome_associazione}}",
        body_text=(
            "Ciao {{nome_socio}},\n\n"
            "la tua richiesta per {{nome_evento}} non puo essere confermata.\n"
            "{{messaggio_org}}"
        ),
    ),
    _system_template(
        name="Invito evento",
        category="events",
        template_type=EMAIL_TEMPLATE_TYPE_EVENT,
        subject="Invito: {{nome_evento}}",
        body_text=(
            "Ciao {{nome_socio}},\n\n"
            "sei invitato a {{nome_evento}}.\n"
            "Quando: {{data_evento}}\n"
            "Apri i dettagli qui: {{link_evento}}"
        ),
    ),
]


@dataclass(frozen=True)
class RenderedTemplateContent:
    subject: str
    body_html: str | None
    body_text: str | None
    context: dict[str, str]


def _normalize_text(value: str | None) -> str | None:
    cleaned = str(value or "").strip()
    return cleaned or None


def _normalize_color(value: Any) -> str | None:
    normalized = _normalize_text(value)
    if normalized is None:
        return None
    cleaned = normalized.lower()
    if re.fullmatch(r"#[0-9a-f]{6}", cleaned) or re.fullmatch(r"#[0-9a-f]{3}", cleaned):
        return cleaned
    return None


def normalize_email_design(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return dict(DEFAULT_EMAIL_DESIGN)
    cta_kind = (_normalize_text(value.get("cta_kind")) or DEFAULT_EMAIL_DESIGN["cta_kind"]).lower()
    if cta_kind not in {"none", "form", "document", "renewal", "custom"}:
        cta_kind = DEFAULT_EMAIL_DESIGN["cta_kind"]
    layout_key = (_normalize_text(value.get("layout_key")) or DEFAULT_EMAIL_DESIGN["layout_key"]).lower()
    layout_key = {
        "essential": "modern",
        "invitation": "event",
        "renewal": "reminder",
        "istituzionale": "institutional",
        "moderno": "modern",
        "elegante": "elegant",
        "evento": "event",
    }.get(layout_key, layout_key)
    if layout_key not in {"institutional", "modern", "elegant", "event", "reminder"}:
        layout_key = DEFAULT_EMAIL_DESIGN["layout_key"]
    font_preset = (_normalize_text(value.get("font_preset")) or DEFAULT_EMAIL_DESIGN["font_preset"]).lower()
    font_preset = {
        "classico": "classic",
        "editoriale": "editorial",
        "pulito": "modern_sans",
    }.get(font_preset, font_preset)
    if font_preset not in {"modern_sans", "editorial", "classic"}:
        font_preset = DEFAULT_EMAIL_DESIGN["font_preset"]
    cta_style = (_normalize_text(value.get("cta_style")) or DEFAULT_EMAIL_DESIGN["cta_style"]).lower()
    if cta_style not in {"solid", "soft", "outline", "shadow"}:
        cta_style = DEFAULT_EMAIL_DESIGN["cta_style"]
    style_preset = (_normalize_text(value.get("style_preset")) or DEFAULT_EMAIL_DESIGN["style_preset"]).lower()
    if style_preset not in {"istituzionale", "moderno", "elegante", "evento", "reminder"}:
        style_preset = DEFAULT_EMAIL_DESIGN["style_preset"]
    button_style = (_normalize_text(value.get("button_style")) or DEFAULT_EMAIL_DESIGN["button_style"]).lower()
    if button_style not in {"pill", "morbido", "solido"}:
        button_style = DEFAULT_EMAIL_DESIGN["button_style"]
    raw_section_order = value.get("section_order")
    section_order: list[str] = []
    if isinstance(raw_section_order, list):
        for item in raw_section_order:
            normalized_item = _normalize_text(item)
            if normalized_item in EMAIL_SECTION_KEYS and normalized_item not in section_order:
                section_order.append(normalized_item)
    if "body" not in section_order:
        section_order.insert(0, "body")
    return {
        "accent_color": _normalize_color(value.get("accent_color")) or DEFAULT_EMAIL_DESIGN["accent_color"],
        "button_color": _normalize_color(value.get("button_color")) or _normalize_color(value.get("accent_color")) or DEFAULT_EMAIL_DESIGN["button_color"],
        "hide_logo": bool(value.get("hide_logo")),
        "logo_url": _normalize_text(value.get("logo_url")) or "",
        "hero_image_url": _normalize_text(value.get("hero_image_url")) or "",
        "content_image_url": _normalize_text(value.get("content_image_url")) or "",
        "email_title": (_normalize_text(value.get("email_title")) or "")[:180],
        "cta_label": (_normalize_text(value.get("cta_label")) or "")[:120],
        "cta_note": (_normalize_text(value.get("cta_note")) or "")[:240],
        "cta_kind": cta_kind,
        "cta_url": (_normalize_text(value.get("cta_url")) or "")[:2000],
        "layout_key": layout_key,
        "show_association_name": bool(
            DEFAULT_EMAIL_DESIGN["show_association_name"]
            if value.get("show_association_name") is None
            else value.get("show_association_name")
        ),
        "font_preset": font_preset,
        "cta_style": cta_style,
        "secondary_image_url": _normalize_text(value.get("secondary_image_url")) or "",
        "highlight_title": (_normalize_text(value.get("highlight_title")) or "")[:180],
        "highlight_body": (_normalize_text(value.get("highlight_body")) or "")[:1000],
        "event_details": (_normalize_text(value.get("event_details")) or "")[:1400],
        "signature_name": (_normalize_text(value.get("signature_name")) or "")[:120],
        "signature_role": (_normalize_text(value.get("signature_role")) or "")[:180],
        "final_note": (_normalize_text(value.get("final_note")) or "")[:500],
        "style_preset": style_preset,
        "button_style": button_style,
        "hero_kicker": (_normalize_text(value.get("hero_kicker")) or "")[:120],
        "hero_title": (_normalize_text(value.get("hero_title")) or "")[:200],
        "highlight_box": (_normalize_text(value.get("highlight_box")) or "")[:1000],
        "signature": (_normalize_text(value.get("signature")) or "")[:500],
        "section_order": section_order,
    }


def html_to_plain_text(value: str) -> str:
    normalized = re.sub(r"<\s*br\s*/?\s*>", "\n", value, flags=re.IGNORECASE)
    normalized = re.sub(r"</\s*p\s*>", "\n\n", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"<[^>]+>", "", normalized)
    normalized = html.unescape(normalized)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def normalize_template_bodies(
    *,
    body_html: str | None,
    body_text: str | None,
) -> tuple[str | None, str | None]:
    normalized_html = _normalize_text(body_html)
    normalized_text = _normalize_text(body_text)
    if normalized_html is None and normalized_text is None:
        raise HTTPException(
            status_code=422,
            detail="Inserisci il contenuto del template in HTML o testo semplice.",
        )
    if normalized_html is None and normalized_text is not None:
        normalized_html = plain_text_to_html(normalized_text)
    if normalized_text is None and normalized_html is not None:
        normalized_text = html_to_plain_text(normalized_html)
    return normalized_html, normalized_text


def normalize_template_scope(value: str | None) -> str:
    normalized = _normalize_text(value) or EMAIL_TEMPLATE_SCOPE_ALL
    normalized = normalized.lower()
    if normalized not in ALLOWED_TEMPLATE_SCOPES:
        raise HTTPException(status_code=422, detail="Filtro template non valido.")
    return normalized


def normalize_template_channel(value: str | None) -> str:
    normalized = (_normalize_text(value) or EMAIL_TEMPLATE_CHANNEL).lower()
    if normalized not in ALLOWED_TEMPLATE_CHANNELS:
        raise HTTPException(status_code=422, detail="Channel template non valido.")
    return normalized


def normalize_email_template_type(value: str | None) -> str:
    normalized = (_normalize_text(value) or EMAIL_TEMPLATE_TYPE_GENERIC_NOTICE).lower()
    aliases = {
        "events": EMAIL_TEMPLATE_TYPE_EVENT,
        "eventi": EMAIL_TEMPLATE_TYPE_EVENT,
        "event": EMAIL_TEMPLATE_TYPE_EVENT,
        "newsletter": EMAIL_TEMPLATE_TYPE_NEWSLETTER,
        "renewal": EMAIL_TEMPLATE_TYPE_RENEWAL_REMINDER,
        "reminder": EMAIL_TEMPLATE_TYPE_RENEWAL_REMINDER,
        "booking": EMAIL_TEMPLATE_TYPE_GENERIC_NOTICE,
        "booking_confirmation": EMAIL_TEMPLATE_TYPE_BOOKING_CONFIRMATION,
        "booking_rejection": EMAIL_TEMPLATE_TYPE_BOOKING_REJECTION,
        "generic": EMAIL_TEMPLATE_TYPE_GENERIC_NOTICE,
        "generic_notice": EMAIL_TEMPLATE_TYPE_GENERIC_NOTICE,
        "custom": EMAIL_TEMPLATE_TYPE_GENERIC_NOTICE,
        "membership": EMAIL_TEMPLATE_TYPE_GENERIC_NOTICE,
        "documents": EMAIL_TEMPLATE_TYPE_GENERIC_NOTICE,
        "assembly": EMAIL_TEMPLATE_TYPE_EVENT,
        "onboarding": EMAIL_TEMPLATE_TYPE_NEWSLETTER,
    }
    resolved = aliases.get(normalized, normalized)
    if resolved not in EMAIL_TEMPLATE_TYPES:
        raise HTTPException(status_code=422, detail="Tipo template non valido.")
    return resolved


def normalize_email_editor_status(value: str | None) -> str:
    normalized = (_normalize_text(value) or EMAIL_EDITOR_STATUS_DRAFT).lower()
    if normalized not in EMAIL_EDITOR_STATUSES:
        raise HTTPException(status_code=422, detail="Stato editoriale non valido.")
    return normalized


def build_template_context(
    *,
    association: Any = None,
    member: Any = None,
    fake: bool = False,
    extra_context: dict[str, str] | None = None,
) -> dict[str, str]:
    association_name = _normalize_text(getattr(association, "name", None) if association is not None else None) or "ASSONAM"
    association_slug = _normalize_text(getattr(association, "slug", None) if association is not None else None)
    base_url = (settings.FRONTEND_URL or settings.BASE_URL or "").strip().rstrip("/")

    first_name = _normalize_text(getattr(member, "first_name", None) if member is not None else None)
    last_name = _normalize_text(getattr(member, "last_name", None) if member is not None else None)
    full_name = " ".join(part for part in [first_name, last_name] if part).strip() or ""
    recipient_email = _normalize_text(getattr(member, "email", None) if member is not None else None) or ""
    card_no = getattr(member, "card_no", None) if member is not None else None
    card_year = getattr(member, "card_year", None) if member is not None else None

    if fake:
        first_name = first_name or "Mario"
        last_name = last_name or "Rossi"
        full_name = full_name or "Mario Rossi"
        recipient_email = recipient_email or "mario.rossi@example.com"
        card_no = card_no or 12345
        card_year = card_year or datetime.utcnow().year

    expiry = f"31/12/{int(card_year)}" if card_year else ""
    if base_url and association_slug:
        signup_link = f"{base_url}/associazioni/{association_slug}/iscrizione"
        document_link = f"{base_url}/associazioni/{association_slug}"
    else:
        signup_link = ""
        document_link = ""

    context = {
        "nome_socio": full_name,
        "cognome_socio": last_name or "",
        "nome_associazione": association_name,
        "email_socio": recipient_email,
        "numero_tessera": str(card_no or ""),
        "data_scadenza": expiry,
        "link_iscrizione": signup_link,
        "link_rinnovo": signup_link,
        "link_evento": document_link,
        "link_documento": document_link,
        "nome_evento": "",
        "data_evento": "",
        "stato_prenotazione": "",
        "messaggio_org": "",
        "titolo_form": "",
        "email_destinatario": recipient_email,
    }
    for key, value in (extra_context or {}).items():
        normalized_key = _normalize_text(key)
        if not normalized_key:
            continue
        context[normalized_key] = str(value or "")
    return context


def render_template_string(
    value: str | None,
    *,
    context: dict[str, str],
    escape_html_values: bool = False,
) -> str | None:
    if value is None:
        return None

    def _replace(match: re.Match[str]) -> str:
        key = match.group(1).strip()
        replacement = str(context.get(key) or "")
        return html.escape(replacement, quote=True) if escape_html_values else replacement

    return _TEMPLATE_VARIABLE_PATTERN.sub(_replace, value)


def render_template_content(
    *,
    subject: str,
    body_html: str | None,
    body_text: str | None,
    association: Any = None,
    member: Any = None,
    fake: bool = False,
    extra_context: dict[str, str] | None = None,
) -> RenderedTemplateContent:
    context = build_template_context(
        association=association,
        member=member,
        fake=fake,
        extra_context=extra_context,
    )
    return RenderedTemplateContent(
        subject=render_template_string(subject, context=context) or "",
        body_html=render_template_string(
            body_html,
            context=context,
            escape_html_values=True,
        ),
        body_text=render_template_string(body_text, context=context),
        context=context,
    )


def build_linked_form_url(*, association: Any = None, linked_form: Any = None) -> str | None:
    if linked_form is None:
        return None
    org_slug = _normalize_text(getattr(association, "slug", None) if association is not None else None)
    form_slug = _normalize_text(getattr(linked_form, "public_slug", None))
    base_url = (settings.FRONTEND_URL or settings.BASE_URL or "").strip().rstrip("/")
    if not base_url or not form_slug:
        return None
    if org_slug:
        return f"{base_url}/forms/{org_slug}/{form_slug}"
    return f"{base_url}/forms/{form_slug}"


def decorate_rendered_email(
    rendered: RenderedTemplateContent,
    *,
    association: Any = None,
    design: dict[str, Any] | None = None,
    linked_form: Any = None,
) -> RenderedTemplateContent:
    resolved_design = normalize_email_design(design)
    accent_color = resolved_design["accent_color"]
    button_color = resolved_design["button_color"] or accent_color
    logo_url = "" if resolved_design["hide_logo"] else (resolved_design["logo_url"] or _normalize_text(getattr(association, "logo_url", None)))
    hero_image_url = resolved_design["hero_image_url"]
    content_image_url = resolved_design["content_image_url"]
    hero_kicker = resolved_design["hero_kicker"]
    hero_title = resolved_design["hero_title"]
    email_title = hero_title or resolved_design["email_title"]
    layout_key = resolved_design["layout_key"]
    font_preset = resolved_design["font_preset"]
    cta_style = resolved_design["cta_style"]
    style_preset = str(resolved_design.get("style_preset") or "istituzionale").lower()
    button_style = str(resolved_design.get("button_style") or "pill").lower()
    association_name = _normalize_text(getattr(association, "name", None) if association is not None else None) or "ASSONAM"
    linked_form_url = build_linked_form_url(association=association, linked_form=linked_form)
    cta_kind = resolved_design["cta_kind"]
    raw_cta_url = render_template_string(
        resolved_design["cta_url"],
        context=rendered.context,
    ) or ""
    cta_url = ""
    if cta_kind == "form":
        cta_url = linked_form_url or raw_cta_url
    elif cta_kind == "document":
        cta_url = raw_cta_url or str(rendered.context.get("link_documento") or "")
    elif cta_kind == "renewal":
        cta_url = raw_cta_url or str(rendered.context.get("link_rinnovo") or "")
    elif cta_kind == "custom":
        cta_url = raw_cta_url
    elif linked_form_url:
        cta_url = linked_form_url
    cta_label = resolved_design["cta_label"]
    if not cta_label and cta_url:
        if cta_kind == "renewal":
            cta_label = "Rinnova ora"
        elif cta_kind == "document":
            cta_label = "Apri documento"
        elif cta_kind == "custom":
            cta_label = "Apri link"
        elif linked_form is not None:
            cta_label = f"Apri modulo: {getattr(linked_form, 'title', '')}".strip(": ")
    cta_note = resolved_design["cta_note"]
    body_html = rendered.body_html or plain_text_to_html(rendered.body_text or "")
    body_text = rendered.body_text or html_to_plain_text(rendered.body_html or "")

    cta_html = ""
    cta_text = ""
    note_html = f"<p style=\"margin:16px 0 0;color:#475569;font-size:14px\">{html.escape(cta_note)}</p>" if cta_note else ""
    hero_html = (
        f"<div style=\"height:180px;background:url('{html.escape(hero_image_url, quote=True)}') center/cover no-repeat;"
        f"border-radius:24px 24px 0 0\"></div>"
        if hero_image_url
        else ""
    )
    logo_html = (
        f"<img src=\"{html.escape(logo_url, quote=True)}\" alt=\"{html.escape(association_name)}\" "
        f"style=\"max-height:44px;max-width:160px;display:block\" />"
        if logo_url
        else ""
    )
    association_name_html = (
        f"<div style=\"font-size:18px;font-weight:700;color:#0f172a\">{html.escape(association_name)}</div>"
        if resolved_design["show_association_name"]
        else ""
    )
    surface_tint = {
        "istituzionale": "#f8fafc",
        "moderno": "#f0fdfa",
        "elegante": "#faf7f2",
        "evento": "#fff7ed",
        "reminder": "#fffbeb",
    }.get(style_preset, "#f8fafc")
    layout_styles = {
        "modern": {
            "outer_bg": "#f3f7f9",
            "card_bg": "#ffffff",
            "border": "#dce7ec",
            "badge_bg": "#ecfeff",
            "badge_fg": accent_color,
        },
        "institutional": {
            "outer_bg": "#eef2ff",
            "card_bg": "#ffffff",
            "border": "#cbd5e1",
            "badge_bg": "#e2e8f0",
            "badge_fg": "#334155",
        },
        "elegant": {
            "outer_bg": "#faf7f2",
            "card_bg": "#fffdf9",
            "border": "#e7dcc8",
            "badge_bg": "#f4ead8",
            "badge_fg": "#8a5a24",
        },
        "event": {
            "outer_bg": "#fff7ed",
            "card_bg": "#ffffff",
            "border": "#fed7aa",
            "badge_bg": "#ffedd5",
            "badge_fg": "#c2410c",
        },
        "reminder": {
            "outer_bg": "#eff6ff",
            "card_bg": "#ffffff",
            "border": "#bfdbfe",
            "badge_bg": "#dbeafe",
            "badge_fg": "#1d4ed8",
        },
    }.get(layout_key, {
        "outer_bg": "#f3f7f9",
        "card_bg": "#ffffff",
        "border": "#dce7ec",
        "badge_bg": "#ecfeff",
        "badge_fg": accent_color,
    })
    button_radius = {
        "pill": "999px",
        "morbido": "18px",
        "solido": "10px",
    }.get(button_style, "999px")
    cta_style_map = {
        "solid": f"display:inline-block;padding:12px 20px;border-radius:{button_radius};background:{button_color};color:#ffffff;text-decoration:none;font-weight:700",
        "soft": f"display:inline-block;padding:12px 20px;border-radius:{button_radius};background:{layout_styles['badge_bg']};color:{button_color};text-decoration:none;font-weight:700;border:1px solid {button_color}22",
        "outline": f"display:inline-block;padding:12px 20px;border-radius:{button_radius};background:#ffffff;color:{button_color};text-decoration:none;font-weight:700;border:1px solid {button_color}",
        "shadow": f"display:inline-block;padding:12px 20px;border-radius:{button_radius};background:{button_color};color:#ffffff;text-decoration:none;font-weight:700;box-shadow:0 12px 28px {button_color}33",
    }
    if cta_url and cta_label:
        cta_html = (
            f"<div style=\"margin-top:24px\">"
            f"<a href=\"{html.escape(cta_url, quote=True)}\" "
            f"style=\"{cta_style_map.get(cta_style, cta_style_map['solid'])}\">"
            f"{html.escape(cta_label)}</a></div>"
        )
        cta_text = f"\n\n{cta_label}: {cta_url}"
    font_styles = {
        "modern_sans": {
            "outer": "'Aptos','Segoe UI',Arial,sans-serif",
            "title": "'Aptos','Segoe UI',Arial,sans-serif",
            "body_size": "15px",
        },
        "editorial": {
            "outer": "Georgia,'Times New Roman',serif",
            "title": "Georgia,'Times New Roman',serif",
            "body_size": "16px",
        },
        "classic": {
            "outer": "'Trebuchet MS','Verdana',Arial,sans-serif",
            "title": "'Trebuchet MS','Verdana',Arial,sans-serif",
            "body_size": "15px",
        },
    }.get(font_preset, {
        "outer": "'Aptos','Segoe UI',Arial,sans-serif",
        "title": "'Aptos','Segoe UI',Arial,sans-serif",
        "body_size": "15px",
    })
    title_html = (
        f"<h1 style=\"margin:0 0 18px;font-size:30px;line-height:1.15;color:#0f172a;font-weight:800;font-family:{font_styles['title']}\">"
        f"{html.escape(email_title)}</h1>"
        if email_title
        else ""
    )
    kicker_html = (
        f"<div style=\"font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:{accent_color};font-weight:700;margin-bottom:10px\">"
        f"{html.escape(hero_kicker)}</div>"
        if hero_kicker
        else ""
    )
    secondary_image_url = resolved_design["secondary_image_url"]
    highlight_title = resolved_design["highlight_title"]
    highlight_body = resolved_design["highlight_body"]
    highlight_box = resolved_design["highlight_box"]
    event_details = resolved_design["event_details"]
    signature_name = resolved_design["signature_name"]
    signature_role = resolved_design["signature_role"]
    signature = resolved_design["signature"]
    final_note = resolved_design["final_note"]
    content_image_html = (
        f"<div style=\"margin:24px 0\"><img src=\"{html.escape(content_image_url, quote=True)}\" alt=\"\" "
        f"style=\"display:block;width:100%;border-radius:20px;max-height:280px;object-fit:cover\" /></div>"
        if content_image_url
        else ""
    )
    secondary_image_html = (
        f"<div style=\"margin:0 0 24px\"><img src=\"{html.escape(secondary_image_url, quote=True)}\" alt=\"Visual\" "
        "style=\"width:100%;display:block;border-radius:18px\" /></div>"
        if secondary_image_url
        else ""
    )
    legacy_highlight_html = (
        f"<div style=\"margin:0 0 24px;padding:18px 20px;border-radius:18px;background:{layout_styles['badge_bg']};border:1px solid {layout_styles['border']}\">"
        f"<div style=\"font-size:16px;font-weight:800;color:#0f172a;margin-bottom:8px\">{html.escape(highlight_title or 'In evidenza')}</div>"
        f"<div style=\"color:#334155;font-size:14px;line-height:1.7\">{html.escape(highlight_body)}</div></div>"
        if highlight_body
        else ""
    )
    modern_highlight_html = (
        f"<div style=\"margin:24px 0;padding:18px 20px;border-radius:20px;background:{surface_tint};"
        f"border:1px solid rgba(15,23,42,0.08);color:#0f172a;font-weight:600\">{html.escape(highlight_box)}</div>"
        if highlight_box
        else ""
    )
    highlight_html = modern_highlight_html or legacy_highlight_html
    event_html = (
        f"<div style=\"margin:0 0 24px;padding:18px 20px;border-radius:18px;background:#ffffff;border:1px dashed {layout_styles['border']}\">"
        f"<div style=\"font-size:12px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:{layout_styles['badge_fg']};margin-bottom:10px\">Dettagli evento</div>"
        f"<div style=\"color:#0f172a;font-size:14px;line-height:1.75;white-space:pre-line\">{html.escape(event_details)}</div></div>"
        if event_details
        else ""
    )
    signature_role_html = (
        f"<div style=\"color:#64748b\">{html.escape(signature_role)}</div>"
        if signature_role
        else ""
    )
    signature_html = (
        f"<div style=\"margin:28px 0 0;color:#0f172a;font-size:15px;line-height:1.6\">"
        f"<div style=\"font-weight:700\">{html.escape(signature_name)}</div>"
        f"{signature_role_html}"
        "</div>"
        if signature_name
        else ""
    )
    if signature:
        signature_html = (
            f"<p style=\"margin:28px 0 0;color:#0f172a;font-weight:600;white-space:pre-line\">{html.escape(signature)}</p>"
        )
    final_note_html = (
        f"<div style=\"margin-top:24px;padding-top:18px;border-top:1px solid {layout_styles['border']};color:#64748b;font-size:13px;line-height:1.7\">{html.escape(final_note)}</div>"
        if final_note
        else ""
    )
    section_order = normalize_email_design({"section_order": resolved_design.get("section_order")}).get(
        "section_order",
        DEFAULT_EMAIL_DESIGN["section_order"],
    )
    section_html = {
        "hero": f"{kicker_html}{title_html}{content_image_html}{secondary_image_html}",
        "body": f"<div style=\"color:#0f172a;font-size:{font_styles['body_size']};line-height:1.7\">{body_html}</div>",
        "cta": f"{note_html}{cta_html}",
        "highlight": highlight_html,
        "event": event_html,
        "signature": signature_html,
        "final_note": final_note_html,
    }
    ordered_sections = "".join(section_html[key] for key in section_order if section_html.get(key))
    wrapped_html = (
        f"<div style=\"margin:0;padding:24px;background:{layout_styles['outer_bg']};font-family:{font_styles['outer']}\">"
        f"<div style=\"max-width:640px;margin:0 auto;background:{layout_styles['card_bg']};border:1px solid {layout_styles['border']};"
        "border-radius:24px;overflow:hidden;box-shadow:0 18px 48px rgba(15,23,42,0.08)\">"
        f"{hero_html}"
        f"<div style=\"padding:32px\">"
        f"<div style=\"display:flex;align-items:center;gap:16px;margin-bottom:24px\">{logo_html}{association_name_html}</div>"
        f"{ordered_sections}"
        "</div></div></div>"
    )
    return RenderedTemplateContent(
        subject=rendered.subject,
        body_html=wrapped_html,
        body_text=f"{email_title}\n\n{body_text}{cta_text}".strip() if email_title else f"{body_text}{cta_text}".strip(),
        context=rendered.context,
    )


def seed_system_email_templates(db: Session) -> int:
    existing_names = {
        row[0]
        for row in db.query(EmailTemplate.name)
        .filter(EmailTemplate.is_system.is_(True), EmailTemplate.channel == EMAIL_TEMPLATE_CHANNEL)
        .all()
    }
    created = 0
    now = datetime.utcnow()
    for template in SYSTEM_EMAIL_TEMPLATES:
        if template["name"] in existing_names:
            continue
        db.add(
            EmailTemplate(
                association_id=None,
                is_system=True,
                name=template["name"],
                category=template["category"],
                template_type=normalize_email_template_type(template.get("template_type")),
                subject=template["subject"],
                body_html=template["body_html"],
                body_text=template["body_text"],
                editor_status=normalize_email_editor_status(template.get("editor_status")),
                mjml_source=template.get("mjml_source"),
                compiled_html=template.get("compiled_html"),
                channel=EMAIL_TEMPLATE_CHANNEL,
                is_active=True,
                created_by_user_id=None,
                created_at=now,
                updated_at=now,
            )
        )
        created += 1
    if created:
        db.flush()
    return created

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
        "description": "Nome e cognome del socio destinatario.",
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
        "key": "link_rinnovo",
        "placeholder": "{{link_rinnovo}}",
        "label": "Link rinnovo",
        "description": "Link di rinnovo o iscrizione dell'associazione.",
        "example": "https://app.assonam.it/associazioni/golden-age-club/iscrizione",
    },
    {
        "key": "link_documento",
        "placeholder": "{{link_documento}}",
        "label": "Link documento",
        "description": "Link al documento o alla pagina associazione.",
        "example": "https://app.assonam.it/associazioni/golden-age-club",
    },
]


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
    subject: str,
    body_text: str,
) -> dict[str, str]:
    return {
        "name": name,
        "category": category,
        "subject": subject,
        "body_text": body_text,
        "body_html": plain_text_to_html(body_text),
    }


SYSTEM_EMAIL_TEMPLATES = [
    _system_template(
        name="Benvenuto nuovo socio",
        category="onboarding",
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
        subject="Nuovo avviso evento da {{nome_associazione}}",
        body_text=(
            "Ciao {{nome_socio}},\n\n"
            "ti segnaliamo un nuovo evento organizzato da {{nome_associazione}}.\n"
            "Maggiori dettagli sono disponibili qui: {{link_documento}}"
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


def build_template_context(
    *,
    association: Any = None,
    member: Any = None,
    fake: bool = False,
) -> dict[str, str]:
    association_name = _normalize_text(getattr(association, "name", None) if association is not None else None) or "ASSONAM"
    association_slug = _normalize_text(getattr(association, "slug", None) if association is not None else None)
    base_url = (settings.FRONTEND_URL or settings.BASE_URL or "").strip().rstrip("/")

    first_name = _normalize_text(getattr(member, "first_name", None) if member is not None else None)
    last_name = _normalize_text(getattr(member, "last_name", None) if member is not None else None)
    full_name = " ".join(part for part in [first_name, last_name] if part).strip() or ""
    card_no = getattr(member, "card_no", None) if member is not None else None
    card_year = getattr(member, "card_year", None) if member is not None else None

    if fake:
        full_name = full_name or "Mario Rossi"
        card_no = card_no or 12345
        card_year = card_year or datetime.utcnow().year

    expiry = f"31/12/{int(card_year)}" if card_year else ""
    if base_url and association_slug:
        renewal_link = f"{base_url}/associazioni/{association_slug}/iscrizione"
        document_link = f"{base_url}/associazioni/{association_slug}"
    else:
        renewal_link = ""
        document_link = ""

    return {
        "nome_socio": full_name,
        "nome_associazione": association_name,
        "numero_tessera": str(card_no or ""),
        "data_scadenza": expiry,
        "link_rinnovo": renewal_link,
        "link_documento": document_link,
    }


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
) -> RenderedTemplateContent:
    context = build_template_context(association=association, member=member, fake=fake)
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
                subject=template["subject"],
                body_html=template["body_html"],
                body_text=template["body_text"],
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

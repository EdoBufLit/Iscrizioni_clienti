"""Versioned, bounded communication content; no author-supplied HTML or CSS."""

from __future__ import annotations

import json
import re
from html import escape
from typing import Annotated, Literal
from urllib.parse import unquote, urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

STORAGE_PREFIX = "[[ASSONAM_RICH_MESSAGE_V1]]\n"
MAX_TEXT_LENGTH = 20000
MAX_STORED_LENGTH = 160000
STYLES = {
    "standard": ("Comunicazione", "#006358", "#eef7f5"),
    "notice": ("Avviso", "#955f0b", "#fff7e7"),
    "status": ("Stato dei servizi", "#006358", "#eef7f5"),
    "news": ("Novità della piattaforma", "#305e9a", "#edf4ff"),
}


def safe_content_url(value: str, *, image: bool = False) -> str:
    value = value.strip()
    if not value or len(value) > 2048 or re.search(r"[\s\x00-\x1f\x7f]", value):
        raise ValueError("Inserisci un indirizzo HTTPS valido.")
    try:
        parsed = urlsplit(value)
        if not image and parsed.scheme == "mailto" and not parsed.netloc and not parsed.query and not parsed.fragment:
            if re.fullmatch(r"[^@\s:]+@[^@\s:]+\.[^@\s:]+", parsed.path):
                return value
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError()
        _port = parsed.port
        if image and not re.search(r"\.(?:png|jpe?g|gif|webp|avif)$", unquote(parsed.path), re.I):
            raise ValueError("Le immagini devono essere PNG, JPG, GIF, WebP o AVIF con un indirizzo HTTPS.")
    except ValueError as exc:
        raise ValueError(str(exc) or "Inserisci un indirizzo HTTPS valido.") from exc
    return value


class ContentSpan(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    text: str = Field(max_length=MAX_TEXT_LENGTH)
    bold: bool = False
    italic: bool = False
    underline: bool = False
    highlight: bool = False
    href: str | None = Field(default=None, max_length=2048)

    @field_validator("href")
    @classmethod
    def validate_href(cls, value):
        return safe_content_url(value) if value is not None else None


class TextBlock(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    type: Literal["paragraph", "heading", "quote", "bullet", "ordered"]
    spans: list[ContentSpan] = Field(min_length=1, max_length=100)


class ImageBlock(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    type: Literal["image"]
    src: str = Field(max_length=2048)
    alt: str = Field(min_length=1, max_length=240)

    @field_validator("src")
    @classmethod
    def validate_src(cls, value):
        return safe_content_url(value, image=True)

    @field_validator("alt")
    @classmethod
    def validate_alt(cls, value):
        if not value.strip():
            raise ValueError("Descrivi l'immagine per chi non può visualizzarla.")
        return value.strip()


ContentBlock = Annotated[TextBlock | ImageBlock, Field(discriminator="type")]


class CommunicationDocument(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    version: Literal[1]
    style: Literal["standard", "notice", "status", "news"] = "standard"
    blocks: list[ContentBlock] = Field(min_length=1, max_length=80)

    @field_validator("version", mode="before")
    @classmethod
    def validate_version(cls, value):
        if type(value) is not int or value != 1:
            raise ValueError("Versione del messaggio non supportata.")
        return value

    @model_validator(mode="after")
    def bounded_content(self):
        images = sum(isinstance(block, ImageBlock) for block in self.blocks)
        spans = sum(len(block.spans) for block in self.blocks if isinstance(block, TextBlock))
        if images > 6 or spans > 1000 or len(document_text(self)) > MAX_TEXT_LENGTH:
            raise ValueError("Il messaggio può contenere al massimo 20.000 caratteri, 80 blocchi e 6 immagini.")
        return self


def document_text(document: CommunicationDocument) -> str:
    return "\n\n".join(
        f"{block.alt} ({block.src})" if isinstance(block, ImageBlock)
        else "".join(span.text for span in block.spans)
        for block in document.blocks
    ).strip()


def document_payload(document: CommunicationDocument) -> dict:
    return {**document.model_dump(exclude_defaults=True), "version": 1, "style": document.style}


def encode_communication_body(body: str, document: CommunicationDocument | dict | None = None) -> str:
    if document is None:
        if body.startswith(STORAGE_PREFIX):
            raise ValueError("Formato del messaggio non valido.")
        return body
    parsed = document if isinstance(document, CommunicationDocument) else CommunicationDocument.model_validate(document)
    if body.strip() != document_text(parsed):
        raise ValueError("Il testo del messaggio non corrisponde all'anteprima. Aggiorna il contenuto e riprova.")
    stored = STORAGE_PREFIX + json.dumps(document_payload(parsed), ensure_ascii=False, separators=(",", ":"))
    if len(stored) > MAX_STORED_LENGTH:
        raise ValueError("Il messaggio formattato è troppo lungo.")
    return stored


def decode_communication_body(stored: str) -> tuple[str, CommunicationDocument | None]:
    if stored.startswith(STORAGE_PREFIX) and len(stored) <= MAX_STORED_LENGTH:
        try:
            document = CommunicationDocument.model_validate(json.loads(stored[len(STORAGE_PREFIX):]))
            return document_text(document), document
        except (ValueError, TypeError):
            pass
    return stored, None


def document_email_html(document: CommunicationDocument) -> str:
    """Render only validated semantic nodes, with fixed email-safe styling."""
    # Revalidate even internal callers; HTML never comes from a request directly.
    document = CommunicationDocument.model_validate(document.model_dump())
    label, color, surface = STYLES[document.style]
    blocks = []
    if document.style != "standard":
        blocks.append(f'<p style="margin:0 0 20px;padding:10px 14px;background:{surface};color:{color};border-left:3px solid {color};font-weight:700;">{escape(label)}</p>')
    for block in document.blocks:
        if isinstance(block, ImageBlock):
            blocks.append(f'<p style="margin:20px 0;"><img src="{escape(block.src, quote=True)}" alt="{escape(block.alt, quote=True)}" width="520" style="display:block;width:100%;max-width:520px;height:auto;border-radius:10px;border:0;" /></p>')
            continue
        content = ""
        for span in block.spans:
            text = escape(span.text).replace("\n", "<br>")
            for active, tag in ((span.bold, "strong"), (span.italic, "em"), (span.underline, "u")):
                if active:
                    text = f"<{tag}>{text}</{tag}>"
            if span.highlight:
                text = f'<mark style="background:#fff0b8;color:#362b12;padding:0 2px;">{text}</mark>'
            if span.href:
                text = f'<a href="{escape(span.href, quote=True)}" style="color:#006358;text-decoration:underline;">{text}</a>'
            content += text
        if block.type == "heading":
            blocks.append(f'<h2 class="email-ink" style="margin:24px 0 12px;font-size:21px;line-height:29px;color:#172b4d;">{content}</h2>')
        elif block.type == "quote":
            blocks.append(f'<blockquote class="email-ink" style="margin:16px 0;padding:12px 16px;border-left:3px solid {color};background:{surface};color:#172b4d;">{content}</blockquote>')
        elif block.type in {"bullet", "ordered"}:
            tag = "ul" if block.type == "bullet" else "ol"
            if blocks and blocks[-1].endswith(f"</{tag}>"):
                blocks[-1] = blocks[-1][:-len(tag)-3] + f"<li>{content}</li></{tag}>"
            else:
                blocks.append(f'<{tag} style="margin:12px 0;padding-left:25px;"><li>{content}</li></{tag}>')
        else:
            blocks.append(f'<p style="margin:0 0 14px;">{content or "<br>"}</p>')
    return "".join(blocks)

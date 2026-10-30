import json

import pytest
from pydantic import ValidationError

from app.services.communication_content import (
    CommunicationDocument, STORAGE_PREFIX, decode_communication_body, document_email_html,
    document_text, encode_communication_body, safe_content_url,
)


def rich_document(**changes):
    return {"version": 1, "style": "notice", "blocks": [
        {"type": "heading", "spans": [{"text": "Un aggiornamento ✨", "bold": True}]},
        {"type": "paragraph", "spans": [{"text": "<script>alert(1)</script>", "italic": True},
            {"text": " Leggi qui", "href": "https://assonam.it/servizi"}]},
        {"type": "bullet", "spans": [{"text": "Primo punto", "highlight": True}]},
        {"type": "bullet", "spans": [{"text": "Secondo punto"}]},
        {"type": "image", "src": "https://assonam.it/static/example.png", "alt": "Novità & servizi"},
    ], **changes}


def test_rich_round_trip_is_bounded_and_keeps_plain_text_fallback():
    document = CommunicationDocument.model_validate(rich_document())
    body = document_text(document)
    stored = encode_communication_body(body, document)
    assert stored.startswith(STORAGE_PREFIX)
    assert json.loads(stored[len(STORAGE_PREFIX):])["version"] == 1
    decoded_body, decoded_document = decode_communication_body(stored)
    assert decoded_body == body and decoded_document == document
    assert "Primo punto\n\nSecondo punto" in body
    assert "Novità & servizi (https://assonam.it/static/example.png)" in body


def test_email_uses_only_allowlisted_nodes_and_escaped_text():
    document = CommunicationDocument.model_validate(rich_document())
    html = document_email_html(document)
    assert "<strong>Un aggiornamento ✨</strong>" in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html and "<script>" not in html
    assert '<a href="https://assonam.it/servizi"' in html
    assert 'alt="Novità &amp; servizi"' in html
    assert html.count("<ul ") == html.count("</ul>") == 1 and html.count("<li>") == 2
    assert "Avviso" in html and "<mark " in html


@pytest.mark.parametrize("value,image", [
    ("javascript:alert(1)", False), ("data:text/html,test", False),
    ("http://example.com/a.png", True), ("//example.com/a.png", True),
    ("https://example.com/a.svg", True), ("https://example.com/a.%73vg", True),
    ("data:image/png;base64,abcd", True), ("https://user:pass@example.com/a.png", True),
    ("https://example.com/a.png\nonerror=1", True),
    ("mailto:a@example.com?bcc=other@example.com", False), ("https://[broken/a.png", True),
])
def test_urls_reject_scripts_svg_credentials_and_unsafe_schemes(value, image):
    with pytest.raises(ValueError):
        safe_content_url(value, image=image)


@pytest.mark.parametrize("patch", [
    {"version": True}, {"version": "1"}, {"version": 2}, {"style": "custom"},
    {"css": "color:red"}, {"blocks": []},
    {"blocks": [{"type": "paragraph", "spans": [{"text": "test", "bold": "true"}]}]},
    {"blocks": [{"type": "paragraph", "spans": [{"text": "test", "onclick": "alert(1)"}]}]},
    {"blocks": [{"type": "html", "html": "<script>test</script>"}]},
    {"blocks": [{"type": "image", "src": "https://example.com/a.png", "alt": " "}]},
    {"blocks": [{"type": "image", "src": "https://example.com/a.svg", "alt": "Test"}]},
    {"blocks": [{"type": "paragraph", "spans": [{"text": "test", "href": "javascript:alert(1)"}]}]},
])
def test_schema_rejects_extra_fields_invalid_marks_and_unsupported_nodes(patch):
    with pytest.raises(ValidationError):
        CommunicationDocument.model_validate(rich_document(**patch))


def test_document_limits_and_plain_body_consistency():
    paragraph = {"type": "paragraph", "spans": [{"text": "Test"}]}
    image = {"type": "image", "src": "https://example.com/a.png", "alt": "Test"}
    for blocks in [[paragraph] * 81, [image] * 7,
                   [{"type": "paragraph", "spans": [{"text": "x" * 20000}]}, paragraph],
                   [{"type": "paragraph", "spans": [{"text": "x"}] * 100}] * 11]:
        with pytest.raises(ValidationError):
            CommunicationDocument.model_validate(rich_document(blocks=blocks))
    with pytest.raises(ValueError, match="non corrisponde"):
        encode_communication_body("Testo differente", rich_document())
    with pytest.raises(ValueError, match="Formato"):
        encode_communication_body(STORAGE_PREFIX + "{}")


def test_legacy_plain_messages_remain_plain_and_corrupt_stored_content_is_not_executed():
    text = "Prima riga <b>non HTML</b>\n\nSeconda riga"
    assert encode_communication_body(text) == text
    assert decode_communication_body(text) == (text, None)
    corrupted = STORAGE_PREFIX + '{"blocks":[{"type":"html","body":"<script>"}]}'
    assert decode_communication_body(corrupted) == (corrupted, None)

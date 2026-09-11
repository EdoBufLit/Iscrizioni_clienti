from html.parser import HTMLParser

import pytest

from app.services.system_email_layout import build_system_email_html


class _EmailMarkup(HTMLParser):
    def __init__(self, markup):
        super().__init__()
        self.tags = []
        self.links = []
        self.text = []
        self.feed(markup)

    def handle_starttag(self, tag, attrs):
        self.tags.append(tag)
        if tag == "a":
            self.links.append(dict(attrs).get("href"))

    def handle_data(self, data):
        self.text.append(data)


def test_system_email_escapes_content_and_preserves_action_url():
    untrusted = '<img src=x onerror="alert(1)"> & Associazione'
    url = "https://example.com/area?token=one&next=%2Fdocumenti"
    markup = build_system_email_html(
        title=untrusted,
        eyebrow=untrusted,
        organization_name=untrusted,
        body=f"Prima riga\n{untrusted}",
        preheader=untrusted,
        cta_url=url,
        cta_label=untrusted,
        metric_value="0",
        metric_label="Tessere disponibili",
        details=[(untrusted, untrusted)],
        footer=untrusted,
    )
    parsed = _EmailMarkup(markup)
    assert "img" not in parsed.tags
    assert "script" not in parsed.tags
    assert parsed.tags.count("h1") == 1
    assert parsed.links == [url, url]
    assert "br" in parsed.tags
    assert "0" in parsed.text
    assert untrusted in "".join(parsed.text)


@pytest.mark.parametrize("url", ["javascript:alert(1)", "data:text/html,<script>x</script>", "//evil.example/x", "https://[invalid"])
def test_system_email_does_not_create_unsafe_links(url):
    parsed = _EmailMarkup(build_system_email_html(title="Avviso", body="Testo", cta_url=url, cta_label="Apri"))
    assert parsed.links == []


def test_system_email_preserves_root_relative_fallback_and_no_action_messages():
    with_action = _EmailMarkup(build_system_email_html(
        title="Avviso", body="Testo", cta_url="/org-admin/tessere", cta_label="Apri tessere",
    ))
    assert with_action.links == ["/org-admin/tessere", "/org-admin/tessere"]
    no_action = _EmailMarkup(build_system_email_html(title="Sicurezza", body="Inserisci il codice", metric_value="001245"))
    assert no_action.links == []
    assert "001245" in no_action.text

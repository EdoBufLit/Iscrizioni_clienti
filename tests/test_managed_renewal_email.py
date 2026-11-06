from html.parser import HTMLParser
from sqlalchemy import create_engine, text

from app.services.email_templates import SYSTEM_EMAIL_TEMPLATES, decorate_rendered_email, plain_text_to_html, render_template_content
from app.services.managed_renewal_email import LEGACY_RENEWAL_PRESETS, MANAGED_RENEWAL_MARKER, refresh_untouched_system_renewal_templates


class Markup(HTMLParser):
    def __init__(self, markup):
        super().__init__(); self.text = []; self.links = []; self.tags = []; self.feed(markup)
    def handle_data(self, data): self.text.append(data)
    def handle_starttag(self, tag, attrs):
        self.tags.append(tag)
        if tag == "a": self.links.append(dict(attrs).get("href"))


def test_new_system_renewal_presets_have_one_clear_action_and_plain_text_fallback():
    presets = [template for template in SYSTEM_EMAIL_TEMPLATES if template["template_type"] == "renewal_reminder"]
    assert len(presets) == 3
    for template in presets:
        url = "https://example.test/iscrizione/club?context=synthetic-long-renewal-link"
        rendered = render_template_content(subject=template["subject"], body_html=template["body_html"], body_text=template["body_text"], fake=True, extra_context={"link_rinnovo": url, "link_iscrizione": url})
        decorated = decorate_rendered_email(rendered)
        assert decorated == rendered
        parsed = Markup(decorated.body_html)
        assert len(parsed.links) == 1
        assert parsed.links[0] in decorated.body_text
        assert parsed.links[0] not in "".join(parsed.text)
        assert "Continua il rinnovo" in "".join(parsed.text)
        assert parsed.tags.count("h1") == 1 and "table" in parsed.tags
        assert MANAGED_RENEWAL_MARKER in decorated.body_html


def test_backfill_refreshes_only_exact_untouched_global_system_originals():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE email_templates(id INTEGER PRIMARY KEY, association_id INTEGER, is_system BOOLEAN, channel TEXT, name TEXT, subject TEXT, body_text TEXT, body_html TEXT, compiled_html TEXT, category TEXT, template_type TEXT, design_json JSON, grapesjs_project_json JSON, mjml_source TEXT, linked_form_id INTEGER)")
        connection.exec_driver_sql("CREATE TABLE email_campaigns(id INTEGER PRIMARY KEY, body_html TEXT)")
        name, subject, body = LEGACY_RENEWAL_PRESETS[0]
        old_html = plain_text_to_html(body)
        original = dict(association_id=None, is_system=True, channel="email", name=name, subject=subject, body_text=body, body_html=old_html, compiled_html=old_html, category="renewal", template_type="renewal_reminder", design_json=None, grapesjs_project_json=None, mjml_source=None, linked_form_id=None)
        variants = [original, {**original, "association_id": 4, "is_system": False}, {**original, "body_text": body + "\nTesto modificato"}, {**original, "design_json": "{}"}, {**original, "compiled_html": "<p>Personalizzato</p>"}, {**original, "grapesjs_project_json": "{}"}, {**original, "linked_form_id": 5}]
        columns = list(original)
        statement = text(f"INSERT INTO email_templates({','.join(columns)}) VALUES({','.join(':'+column for column in columns)})")
        for item in variants: connection.execute(statement, item)
        connection.execute(text("INSERT INTO email_campaigns(id,body_html) VALUES(1,:html)"), {"html": old_html})
        assert refresh_untouched_system_renewal_templates(connection) == 1
        assert refresh_untouched_system_renewal_templates(connection) == 0
        rows = connection.execute(text("SELECT id,body_html FROM email_templates ORDER BY id")).all()
        assert MANAGED_RENEWAL_MARKER in rows[0].body_html
        assert all(row.body_html == old_html for row in rows[1:])
        assert connection.execute(text("SELECT body_html FROM email_campaigns")).scalar_one() == old_html
    engine.dispose()

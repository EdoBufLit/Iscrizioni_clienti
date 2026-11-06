"""Canonical system presets; edited templates and campaign snapshots are never rewritten."""
from __future__ import annotations

import re
from sqlalchemy import MetaData, Table, and_, select, update
from app.services.system_email_layout import build_system_email_html

MANAGED_RENEWAL_MARKER = "<!-- assonam:managed-renewal-email:v1 -->"
LEGACY_RENEWAL_PRESETS = (
    ("Rinnovo quota in scadenza", "Rinnovo in scadenza per {{nome_socio}}", "Ciao {{nome_socio}},\n\nla tua quota associativa per {{nome_associazione}} scade il {{data_scadenza}}.\nPuoi procedere dal link seguente: {{link_rinnovo}}"),
    ("Sollecito quota gentile", "Promemoria gentile rinnovo quota", "Ciao {{nome_socio}},\n\nti ricordiamo gentilmente che la quota di {{nome_associazione}} e in scadenza il {{data_scadenza}}.\nSe vuoi rinnovare ora, trovi il link qui: {{link_rinnovo}}"),
    ("Reminder rinnovo", "Reminder rinnovo {{nome_associazione}}", "Ciao {{nome_socio}},\n\nti ricordiamo che il rinnovo della tua iscrizione e in scadenza.\nPuoi completarlo qui: {{link_iscrizione}}"),
)


def canonical_renewal_preset_html(subject: str, body_text: str) -> str:
    body = re.sub(r"(?:Puoi procedere dal link seguente:|Se vuoi rinnovare ora, trovi il link qui:|Puoi completarlo qui:)\s*{{(?:link_rinnovo|link_iscrizione)}}", "Usa il pulsante qui sotto per continuare il rinnovo.", body_text)
    placeholder = "/__managed_renewal_action__"
    markup = build_system_email_html(title=subject, eyebrow="Rinnovo tessera", organization_name="{{nome_associazione}}", body=body,
        cta_url=placeholder, cta_label="Continua il rinnovo", footer="Comunicazione della tua associazione. Se hai già completato il rinnovo, contatta la segreteria per verificare lo stato della quota.")
    # Keep the textual alternative unchanged. HTML variables are escaped at render time.
    # A single action is sufficient in the managed preset; no redundant fallback CTA.
    markup = re.sub(r'<p class="email-muted" style="margin:18px 0 0;.*?</p>', "", markup, flags=re.DOTALL)
    return MANAGED_RENEWAL_MARKER + markup.replace(placeholder, "{{link_rinnovo}}")


def refresh_untouched_system_renewal_templates(connection) -> int:
    from app.services.email_templates import plain_text_to_html
    table = Table("email_templates", MetaData(), autoload_with=connection)
    changed = 0
    for name, subject, body_text in LEGACY_RENEWAL_PRESETS:
        old_html = plain_text_to_html(body_text)
        conditions = and_(table.c.is_system.is_(True), table.c.association_id.is_(None), table.c.channel == "email",
            table.c.name == name, table.c.subject == subject, table.c.body_text == body_text, table.c.body_html == old_html,
            table.c.compiled_html == old_html, table.c.category == "renewal", table.c.template_type == "renewal_reminder",
            table.c.design_json.is_(None), table.c.grapesjs_project_json.is_(None), table.c.mjml_source.is_(None), table.c.linked_form_id.is_(None))
        markup = canonical_renewal_preset_html(subject, body_text)
        changed += connection.execute(update(table).where(conditions).values(body_html=markup, compiled_html=markup)).rowcount
    return changed

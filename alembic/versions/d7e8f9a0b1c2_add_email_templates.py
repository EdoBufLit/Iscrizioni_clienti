"""add email templates

Revision ID: d7e8f9a0b1c2
Revises: c6d7e8f9a0b1
Create Date: 2026-03-09 18:05:00.000000
"""

from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d7e8f9a0b1c2"
down_revision: Union[str, Sequence[str], None] = "c6d7e8f9a0b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SYSTEM_TEMPLATES = [
    {
        "name": "Benvenuto nuovo socio",
        "category": "onboarding",
        "subject": "Benvenuto in {{nome_associazione}}, {{nome_socio}}",
        "body_text": (
            "Ciao {{nome_socio}},\n\n"
            "benvenuto in {{nome_associazione}}.\n"
            "La tua tessera numero {{numero_tessera}} e stata registrata correttamente.\n\n"
            "Per eventuali aggiornamenti puoi usare questo link: {{link_documento}}"
        ),
        "body_html": (
            "<p>Ciao {{nome_socio}},</p>"
            "<p>benvenuto in {{nome_associazione}}.<br />"
            "La tua tessera numero {{numero_tessera}} e stata registrata correttamente.</p>"
            "<p>Per eventuali aggiornamenti puoi usare questo link: {{link_documento}}</p>"
        ),
    },
    {
        "name": "Iscrizione approvata",
        "category": "membership",
        "subject": "Iscrizione approvata per {{nome_socio}}",
        "body_text": (
            "Ciao {{nome_socio}},\n\n"
            "la tua iscrizione a {{nome_associazione}} e stata approvata.\n"
            "La tua tessera numero {{numero_tessera}} e attiva fino al {{data_scadenza}}."
        ),
        "body_html": (
            "<p>Ciao {{nome_socio}},</p>"
            "<p>la tua iscrizione a {{nome_associazione}} e stata approvata.<br />"
            "La tua tessera numero {{numero_tessera}} e attiva fino al {{data_scadenza}}.</p>"
        ),
    },
    {
        "name": "Tessera disponibile",
        "category": "membership",
        "subject": "La tua tessera {{numero_tessera}} e disponibile",
        "body_text": (
            "Ciao {{nome_socio}},\n\n"
            "la tua tessera di {{nome_associazione}} e disponibile.\n"
            "Numero tessera: {{numero_tessera}}\n"
            "Scadenza: {{data_scadenza}}"
        ),
        "body_html": (
            "<p>Ciao {{nome_socio}},</p>"
            "<p>la tua tessera di {{nome_associazione}} e disponibile.</p>"
            "<p>Numero tessera: {{numero_tessera}}<br />Scadenza: {{data_scadenza}}</p>"
        ),
    },
    {
        "name": "Rinnovo quota in scadenza",
        "category": "renewal",
        "subject": "Rinnovo in scadenza per {{nome_socio}}",
        "body_text": (
            "Ciao {{nome_socio}},\n\n"
            "la tua quota associativa per {{nome_associazione}} scade il {{data_scadenza}}.\n"
            "Puoi procedere dal link seguente: {{link_rinnovo}}"
        ),
        "body_html": (
            "<p>Ciao {{nome_socio}},</p>"
            "<p>la tua quota associativa per {{nome_associazione}} scade il {{data_scadenza}}.</p>"
            "<p>Puoi procedere dal link seguente: {{link_rinnovo}}</p>"
        ),
    },
    {
        "name": "Sollecito quota gentile",
        "category": "renewal",
        "subject": "Promemoria gentile rinnovo quota",
        "body_text": (
            "Ciao {{nome_socio}},\n\n"
            "ti ricordiamo gentilmente che la quota di {{nome_associazione}} e in scadenza il {{data_scadenza}}.\n"
            "Se vuoi rinnovare ora, trovi il link qui: {{link_rinnovo}}"
        ),
        "body_html": (
            "<p>Ciao {{nome_socio}},</p>"
            "<p>ti ricordiamo gentilmente che la quota di {{nome_associazione}} e in scadenza il {{data_scadenza}}.</p>"
            "<p>Se vuoi rinnovare ora, trovi il link qui: {{link_rinnovo}}</p>"
        ),
    },
    {
        "name": "Convocazione assemblea",
        "category": "assembly",
        "subject": "Convocazione assemblea {{nome_associazione}}",
        "body_text": (
            "Ciao {{nome_socio}},\n\n"
            "sei convocato all'assemblea di {{nome_associazione}}.\n"
            "Puoi consultare materiale o allegati qui: {{link_documento}}"
        ),
        "body_html": (
            "<p>Ciao {{nome_socio}},</p>"
            "<p>sei convocato all'assemblea di {{nome_associazione}}.</p>"
            "<p>Puoi consultare materiale o allegati qui: {{link_documento}}</p>"
        ),
    },
    {
        "name": "Documento disponibile",
        "category": "documents",
        "subject": "Nuovo documento disponibile per {{nome_socio}}",
        "body_text": (
            "Ciao {{nome_socio}},\n\n"
            "e disponibile un nuovo documento relativo a {{nome_associazione}}.\n"
            "Puoi consultarlo qui: {{link_documento}}"
        ),
        "body_html": (
            "<p>Ciao {{nome_socio}},</p>"
            "<p>e disponibile un nuovo documento relativo a {{nome_associazione}}.</p>"
            "<p>Puoi consultarlo qui: {{link_documento}}</p>"
        ),
    },
    {
        "name": "Avviso evento",
        "category": "events",
        "subject": "Nuovo avviso evento da {{nome_associazione}}",
        "body_text": (
            "Ciao {{nome_socio}},\n\n"
            "ti segnaliamo un nuovo evento organizzato da {{nome_associazione}}.\n"
            "Maggiori dettagli sono disponibili qui: {{link_documento}}"
        ),
        "body_html": (
            "<p>Ciao {{nome_socio}},</p>"
            "<p>ti segnaliamo un nuovo evento organizzato da {{nome_associazione}}.</p>"
            "<p>Maggiori dettagli sono disponibili qui: {{link_documento}}</p>"
        ),
    },
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "email_templates" not in tables:
        op.create_table(
            "email_templates",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "association_id",
                sa.Integer(),
                sa.ForeignKey("organizations.id"),
                nullable=True,
            ),
            sa.Column(
                "is_system",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("category", sa.String(), nullable=True),
            sa.Column("subject", sa.String(), nullable=False),
            sa.Column("body_html", sa.Text(), nullable=True),
            sa.Column("body_text", sa.Text(), nullable=True),
            sa.Column(
                "channel",
                sa.String(),
                nullable=False,
                server_default=sa.text("'email'"),
            ),
            sa.Column(
                "is_active",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
            sa.Column(
                "created_by_user_id",
                sa.Integer(),
                sa.ForeignKey("admin_users.id"),
                nullable=True,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )

    inspector = sa.inspect(bind)
    indexes = (
        {index["name"] for index in inspector.get_indexes("email_templates")}
        if "email_templates" in set(inspector.get_table_names()) | {"email_templates"}
        else set()
    )
    for index_name, columns in [
        ("ix_email_templates_association_id", ["association_id"]),
        ("ix_email_templates_is_system", ["is_system"]),
        ("ix_email_templates_category", ["category"]),
        ("ix_email_templates_channel", ["channel"]),
        ("ix_email_templates_is_active", ["is_active"]),
        ("ix_email_templates_created_by_user_id", ["created_by_user_id"]),
        ("ix_email_templates_created_at", ["created_at"]),
    ]:
        if index_name not in indexes:
            op.create_index(index_name, "email_templates", columns, unique=False)

    now = datetime.utcnow()
    for template in SYSTEM_TEMPLATES:
        existing_id = bind.execute(
            sa.text(
                """
                SELECT id
                  FROM email_templates
                 WHERE is_system = :is_system
                   AND name = :name
                 LIMIT 1
                """
            ),
            {"is_system": True, "name": template["name"]},
        ).scalar()
        if existing_id is not None:
            continue
        bind.execute(
            sa.text(
                """
                INSERT INTO email_templates (
                    association_id,
                    is_system,
                    name,
                    category,
                    subject,
                    body_html,
                    body_text,
                    channel,
                    is_active,
                    created_by_user_id,
                    created_at,
                    updated_at
                ) VALUES (
                    NULL,
                    :is_system,
                    :name,
                    :category,
                    :subject,
                    :body_html,
                    :body_text,
                    :channel,
                    :is_active,
                    NULL,
                    :created_at,
                    :updated_at
                )
                """
            ),
            {
                "is_system": True,
                "name": template["name"],
                "category": template["category"],
                "subject": template["subject"],
                "body_html": template["body_html"],
                "body_text": template["body_text"],
                "channel": "email",
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            },
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "email_templates" in tables:
        indexes = {index["name"] for index in inspector.get_indexes("email_templates")}
        for index_name in [
            "ix_email_templates_created_at",
            "ix_email_templates_created_by_user_id",
            "ix_email_templates_is_active",
            "ix_email_templates_channel",
            "ix_email_templates_category",
            "ix_email_templates_is_system",
            "ix_email_templates_association_id",
        ]:
            if index_name in indexes:
                op.drop_index(index_name, table_name="email_templates")
        op.drop_table("email_templates")

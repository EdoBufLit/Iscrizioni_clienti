"""Presentation for member account links; callers own tokens, sender and delivery."""

from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from app.config import settings
from app.services.org_branding import resolve_club_display_name
from app.services.system_email_layout import build_system_email_html

if TYPE_CHECKING:
    from app.models import Member


def build_member_access_email_html(
    member: Member,
    link: str,
    *,
    purpose: Literal["access", "reset", "renewal"] = "access",
    registered: bool = False,
) -> str:
    """Use a readable action instead of displaying a long authentication URL."""
    name = str(member.first_name or "").strip()
    greeting = f"Ciao {name}," if name else "Ciao,"
    organization = resolve_club_display_name(member.organization)
    title = "Accedi alla tua area socio"
    label = "Accedi all’area socio"
    body = "Usa il pulsante qui sotto per aprire la tua area riservata e consultare la tessera, i documenti e le prenotazioni."
    if registered:
        body = "La tua iscrizione è stata registrata. " + body
    if purpose == "reset":
        title = "Scegli una nuova password"
        label = "Reimposta la password"
        body = "Abbiamo ricevuto una richiesta di recupero della password della tua area socio. Usa il pulsante qui sotto per sceglierne una nuova."
    elif purpose == "renewal":
        title = "Rinnova la tua tessera"
        label = "Continua il rinnovo"
        body = "Accedi per rinnovare la tessera senza ripetere l’iscrizione. La tua anagrafica e il tuo account saranno conservati. Il rinnovo richiederà la tua conferma e seguirà le condizioni dell’associazione."
    return build_system_email_html(
        title=title,
        preheader=f"{title}. Il tuo link personale è pronto.",
        eyebrow="Area socio",
        organization_name=organization,
        body=f"{greeting}\n\n{body}",
        cta_url=link,
        cta_label=label,
        footer=(
            f"Il link è personale, monouso e scade tra {settings.LOGIN_TOKEN_EXPIRE_MINUTES} minuti. "
            "Non condividerlo. Se non hai richiesto tu questa email, puoi ignorarla."
        ),
    )

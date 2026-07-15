from __future__ import annotations

import html

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.middleware import get_client_ip
from app.models import Organization
from app.services.marketing_consent import (
    resolve_marketing_unsubscribe_member,
    revoke_email_marketing_consent,
)


router = APIRouter()

_NO_STORE_HEADERS = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
}


def _render_page(
    *,
    title: str,
    message: str,
    organization_name: str | None = None,
    show_form: bool = False,
    status_code: int = 200,
) -> HTMLResponse:
    safe_title = html.escape(title)
    safe_message = html.escape(message)
    safe_org = html.escape(organization_name or "l'associazione")
    form = (
        """
        <form method="post">
          <button type="submit">Disattiva le email promozionali</button>
        </form>
        """
        if show_form
        else ""
    )
    body = f"""<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <meta name="referrer" content="no-referrer" />
  <title>{safe_title}</title>
  <style>
    :root {{ color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    body {{ margin: 0; background: #f4f7f8; color: #17252a; }}
    main {{ width: min(36rem, calc(100% - 2rem)); margin: 10vh auto; padding: 2rem; box-sizing: border-box; background: #fff; border: 1px solid #d7e1e4; border-radius: 1rem; box-shadow: 0 1rem 3rem rgba(23,37,42,.08); }}
    h1 {{ margin-top: 0; font-size: clamp(1.5rem, 5vw, 2rem); }}
    p {{ line-height: 1.6; }}
    .org {{ color: #52666d; }}
    button {{ margin-top: 1rem; width: 100%; border: 0; border-radius: .75rem; padding: .9rem 1.1rem; background: #0f766e; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }}
    button:hover {{ background: #115e59; }}
    button:focus-visible {{ outline: 3px solid #f59e0b; outline-offset: 3px; }}
  </style>
</head>
<body>
  <main>
    <h1>{safe_title}</h1>
    <p>{safe_message}</p>
    <p class="org">Preferenze email per {safe_org}.</p>
    {form}
  </main>
</body>
</html>"""
    return HTMLResponse(
        content=body,
        status_code=status_code,
        headers=_NO_STORE_HEADERS,
    )


def _resolve_context(db: Session, token: str):
    member = resolve_marketing_unsubscribe_member(db, token=token)
    if member is None:
        return None, None
    organization = (
        db.query(Organization).filter(Organization.id == member.org_id).first()
    )
    return member, organization


@router.get("/email-preferences/unsubscribe/{token}", response_class=HTMLResponse)
def confirm_email_marketing_unsubscribe(
    token: str,
    db: Session = Depends(get_db),
):
    member, organization = _resolve_context(db, token)
    if member is None:
        return _render_page(
            title="Link non valido",
            message="Non è stato possibile verificare questo link di disiscrizione.",
            status_code=400,
        )
    organization_name = organization.name if organization is not None else None
    if not bool(member.marketing_email_consent):
        return _render_page(
            title="Email promozionali già disattivate",
            message="Non riceverai altre email promozionali tramite questo consenso.",
            organization_name=organization_name,
        )
    return _render_page(
        title="Disattiva le email promozionali",
        message="Conferma la revoca. Le comunicazioni di servizio necessarie resteranno attive.",
        organization_name=organization_name,
        show_form=True,
    )


@router.post("/email-preferences/unsubscribe/{token}", response_class=HTMLResponse)
def submit_email_marketing_unsubscribe(
    request: Request,
    token: str,
    db: Session = Depends(get_db),
):
    member, organization = _resolve_context(db, token)
    if member is None:
        return _render_page(
            title="Link non valido",
            message="Non è stato possibile verificare questo link di disiscrizione.",
            status_code=400,
        )
    organization_name = organization.name if organization is not None else None
    revoke_email_marketing_consent(
        db,
        member=member,
        client_ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return _render_page(
        title="Email promozionali disattivate",
        message="La preferenza è stata aggiornata. Non riceverai altre email promozionali tramite questo consenso.",
        organization_name=organization_name,
    )

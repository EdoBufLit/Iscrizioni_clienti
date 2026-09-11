"""Shared presentation for service emails; callers retain delivery and text fallbacks."""

from __future__ import annotations

from html import escape
from typing import Iterable
from urllib.parse import urlsplit


def _text(value: object) -> str:
    return escape(str(value or ""), quote=True)


def _lines(value: object) -> str:
    return _text(value).replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br>")


def build_system_email_html(
    *,
    title: str,
    body: str,
    preheader: str = "",
    eyebrow: str = "",
    organization_name: str = "",
    cta_url: str = "",
    cta_label: str = "",
    metric_value: str | None = None,
    metric_label: str = "",
    details: Iterable[tuple[str, str]] = (),
    footer: str = "",
) -> str:
    """Render escaped plain text in a responsive, Outlook-compatible table layout.

    No user-authored HTML is accepted. The primary URL may be HTTP(S) or a
    root-relative application route; other schemes are not rendered as links.
    """
    url = (cta_url or "").strip()
    try:
        parsed_url = urlsplit(url)
        safe_url = _text(url) if (
            (parsed_url.scheme in {"http", "https"} and parsed_url.netloc)
            or (url.startswith("/") and not url.startswith("//"))
        ) else ""
    except ValueError:
        safe_url = ""
    category = (
        f'<p class="email-accent" style="margin:0 0 12px;color:#2459c4;font-size:12px;'
        f'line-height:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">{_text(eyebrow)}</p>'
        if eyebrow else ""
    )
    organization = (
        f'<p class="email-muted" style="margin:12px 0 0;color:#536178;font-size:14px;line-height:22px;">{_text(organization_name)}</p>'
        if organization_name else ""
    )
    metric = ""
    if metric_value is not None:
        metric = f"""
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
          <tr><td class="email-panel" bgcolor="#eff5ff" style="padding:22px 24px;background-color:#eff5ff;border:1px solid #d7e5ff;border-radius:12px;">
            <p class="email-accent" style="margin:0;color:#2459c4;font-size:46px;line-height:52px;font-weight:700;letter-spacing:-1px;">{_text(str(metric_value))}</p>
            <p class="email-ink" style="margin:4px 0 0;color:#172b4d;font-size:14px;line-height:22px;font-weight:700;">{_text(metric_label)}</p>
          </td></tr>
        </table>"""
    detail_rows = "".join(
        f'<tr><td class="email-rule" style="padding:14px 0;border-bottom:1px solid #e4eaf2;">'
        f'<p class="email-muted" style="margin:0 0 4px;font-size:12px;line-height:18px;color:#536178;">{_text(label)}</p>'
        f'<p class="email-ink" style="margin:0;font-size:15px;line-height:23px;color:#172b4d;">{_lines(value)}</p>'
        '</td></tr>'
        for label, value in details
    )
    detail_table = (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">{detail_rows}</table>'
        if detail_rows else ""
    )
    cta = ""
    if safe_url and cta_label:
        cta = f"""
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;max-width:100%;">
          <tr><td class="email-button" align="center" bgcolor="#2459c4" style="background-color:#2459c4;border-radius:8px;mso-padding-alt:15px 24px;">
            <a class="email-button" href="{safe_url}" style="display:inline-block;padding:15px 24px;border:1px solid #2459c4;border-radius:8px;background-color:#2459c4;color:#ffffff;font-size:15px;line-height:22px;font-weight:700;text-decoration:none;text-align:center;mso-padding-alt:0;">{_text(cta_label)}</a>
          </td></tr>
        </table>
        <p class="email-muted" style="margin:18px 0 0;color:#536178;font-size:12px;line-height:19px;">Se il pulsante non funziona, <a class="email-accent" href="{safe_url}" style="color:#2459c4;text-decoration:underline;">apri questo link</a>.</p>"""
    footer_text = footer or "Messaggio automatico di servizio da ASSO.N.A.M."
    return f"""<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>{_text(title)}</title>
  <style>
    :root {{ color-scheme: light dark; supported-color-schemes: light dark; }}
    body, table, td, p, a, h1 {{ font-family: Arial, Helvetica, sans-serif !important; }}
    table {{ border-spacing:0; }}
    @media only screen and (max-width: 620px) {{
      .email-outer {{ padding:16px 10px !important; }}
      .email-content {{ padding:28px 22px !important; }}
      .email-brand {{ padding:20px 22px !important; }}
      .email-title {{ font-size:26px !important; line-height:32px !important; }}
    }}
    @media (prefers-color-scheme: dark) {{
      .email-canvas {{ background-color:#101a2b !important; }}
      .email-card {{ background-color:#19263a !important; border-color:#35435b !important; }}
      .email-brand {{ background-color:#12203a !important; }}
      .email-ink {{ color:#f0f5ff !important; }}
      .email-muted {{ color:#bac9de !important; }}
      .email-accent {{ color:#a4c4ff !important; }}
      .email-panel {{ background-color:#213653 !important; border-color:#3d5476 !important; }}
      .email-rule {{ border-color:#35435b !important; }}
      .email-button {{ background-color:#316bde !important; border-color:#316bde !important; color:#ffffff !important; }}
    }}
  </style>
</head>
<body class="email-canvas" style="margin:0;padding:0;width:100%;background-color:#f1f5fa;color:#172b4d;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;line-height:1px;color:#f1f5fa;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">{_text(preheader or title)}</div>
  <table role="presentation" class="email-canvas" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5fa" style="background-color:#f1f5fa;">
    <tr><td class="email-outer" align="center" style="padding:40px 16px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" class="email-card" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:600px;width:100%;table-layout:fixed;background-color:#ffffff;border:1px solid #dfe7f1;border-radius:16px;overflow:hidden;">
        <tr><td class="email-brand" bgcolor="#172b4d" style="padding:22px 32px;background-color:#172b4d;border-radius:15px 15px 0 0;">
          <p style="margin:0;color:#ffffff;font-size:18px;line-height:24px;letter-spacing:2px;font-weight:700;">ASSO.N.A.M.</p>
        </td></tr>
        <tr><td class="email-content" style="padding:32px;overflow-wrap:anywhere;word-wrap:break-word;">
          {category}
          <h1 class="email-title email-ink" style="margin:0;color:#172b4d;font-size:30px;line-height:37px;letter-spacing:-0.6px;font-weight:700;">{_text(title)}</h1>
          {organization}
          {metric}
          <p class="email-ink" style="margin:24px 0 0;color:#172b4d;font-size:16px;line-height:26px;">{_lines(body)}</p>
          {detail_table}
          {cta}
        </td></tr>
        <tr><td class="email-content email-rule" style="padding:20px 32px;border-top:1px solid #e4eaf2;">
          <p class="email-muted" style="margin:0;color:#536178;font-size:12px;line-height:20px;">{_lines(footer_text)}</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>"""

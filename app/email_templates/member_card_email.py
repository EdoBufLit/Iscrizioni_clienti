import html
from urllib.parse import quote_plus


def build_member_card_email(
    *,
    member_full_name: str,
    organization_name: str,
    club_display_name: str,
    organization_slug: str | None = None,
    card_number: int,
    card_year: int,
    verification_url: str,
    download_url: str,
    magic_link_url: str,
    assonam_logo_url: str,
    organization_logo_url: str | None = None,
) -> tuple[str, str]:
    normalized_org_slug = (organization_slug or "").strip().lower()
    is_oasi2_card = normalized_org_slug == "oasi-2"

    safe_name = html.escape(member_full_name or "")
    safe_club = html.escape(club_display_name or organization_name or "")
    association_label = club_display_name if is_oasi2_card else organization_name
    safe_association = html.escape((association_label or "").strip())
    safe_card_number = html.escape(str(card_number))
    safe_card_year = html.escape(str(card_year))
    safe_verification_url = html.escape(verification_url)
    safe_download_url = html.escape(download_url)
    safe_magic_link_url = html.escape(magic_link_url)
    safe_assonam_logo_url = html.escape(assonam_logo_url)
    safe_org_logo_url = html.escape(organization_logo_url) if organization_logo_url else ""
    qr_url = (
        "https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=0&data="
        f"{quote_plus(verification_url)}"
    )
    safe_qr_url = html.escape(qr_url)

    card_background_style = (
        "border-radius:22px;overflow:hidden;"
        "background:linear-gradient(135deg,#0b2e2c 0%,#143f3c 45%,#0f3a37 100%);"
        "box-shadow:0 16px 40px rgba(6,33,31,0.28);"
    )
    if is_oasi2_card and safe_org_logo_url:
        card_background_style = (
            "border-radius:22px;overflow:hidden;"
            "background-color:#0f3a37;"
            f"background-image:linear-gradient(135deg,rgba(11,46,44,0.94) 0%,rgba(20,63,60,0.92) 45%,rgba(15,58,55,0.94) 100%),url('{safe_org_logo_url}');"
            "background-repeat:no-repeat,no-repeat;"
            "background-position:center center,center center;"
            "background-size:cover,58% auto;"
            "box-shadow:0 16px 40px rgba(6,33,31,0.28);"
        )

    org_logo_header_block = ""
    if safe_org_logo_url and not is_oasi2_card:
        org_logo_header_block = f"""
                  <tr>
                    <td align="center" style="padding:14px 24px 2px 24px;">
                      <img src="{safe_org_logo_url}" alt="Logo associazione" style="height:44px;max-width:220px;object-fit:contain;" />
                    </td>
                  </tr>
        """

    org_logo_header_inline = ""
    if safe_org_logo_url and is_oasi2_card:
        org_logo_header_inline = (
            f'<img src="{safe_org_logo_url}" alt="Logo associazione" '
            'style="height:30px;max-width:110px;object-fit:contain;opacity:0.92;margin-right:10px;" />'
        )

    text_body = (
        "La tua tessera digitale e pronta.\n\n"
        f"Club: {club_display_name}\n"
        f"Socio: {member_full_name}\n"
        f"Associazione: {association_label or organization_name}\n"
        f"Tessera n.: {card_number}\n"
        f"Anno: {card_year}\n\n"
        f"Scarica tessera: {download_url}\n"
        f"Accedi area riservata: {magic_link_url}\n"
        f"Verifica tessera: {verification_url}\n"
    )

    html_body = f"""\
<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tessera socio</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f6f6;font-family:Arial,sans-serif;color:#123330;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;">
            <tr>
              <td style="padding:0 16px 8px 16px;text-align:center;">
                <p style="margin:0;font-size:20px;font-weight:700;color:#0f2d2a;">{safe_club}</p>
                <p style="margin:8px 0 0 0;font-size:14px;color:#2b4b49;">La tua tessera digitale e pronta.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="{card_background_style}">
                  {org_logo_header_block}
                  <tr>
                    <td style="padding:18px 24px;border-top:3px solid #c6a04f;border-bottom:1px solid rgba(198,160,79,0.25);">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td valign="top">
                            <p style="margin:0;font-size:11px;letter-spacing:2px;color:#c6a04f;text-transform:uppercase;">Tessera socio</p>
                            <p style="margin:4px 0 0 0;font-size:28px;font-weight:700;color:#d4b45c;">{safe_card_year}</p>
                          </td>
                          <td align="right" valign="top">
                            {org_logo_header_inline}
                            <img src="{safe_assonam_logo_url}" alt="Logo ASSONAM" style="height:52px;max-width:180px;object-fit:contain;" />
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 24px 12px 24px;">
                      <p style="margin:0;font-size:11px;letter-spacing:1.5px;color:#8aaba8;text-transform:uppercase;">Nome e cognome</p>
                      <p style="margin:8px 0 0 0;font-size:30px;line-height:1.15;color:#ffffff !important;-webkit-text-fill-color:#ffffff !important;font-weight:700;">{safe_name}</p>
                      <p style="margin:16px 0 0 0;font-size:11px;letter-spacing:1.5px;color:#8aaba8;text-transform:uppercase;">Associazione</p>
                      <p style="margin:6px 0 0 0;font-size:16px;color:#c6d8d6;">{safe_association}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:14px 24px 24px 24px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid rgba(198,160,79,0.25);padding-top:12px;">
                        <tr>
                          <td valign="bottom">
                            <p style="margin:0;font-size:11px;letter-spacing:1.5px;color:#8aaba8;text-transform:uppercase;">N. Tessera</p>
                            <p style="margin:6px 0 0 0;font-family:Courier New,monospace;font-size:22px;font-weight:700;letter-spacing:2px;color:#d4b45c;">{safe_card_number}</p>
                          </td>
                          <td align="right">
                            <span style="display:inline-block;width:54px;height:36px;border-radius:8px;background:linear-gradient(145deg,#d4b45c 0%,#a8883a 50%,#d4b45c 100%);"></span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:18px;border:1px solid #dde7e6;">
                  <tr>
                    <td align="center" style="padding:20px 20px 10px 20px;">
                      <img src="{safe_qr_url}" alt="QR verifica tessera" style="width:170px;height:170px;border-radius:14px;background:#ffffff;padding:8px;border:1px solid #dbe3e1;" />
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding:8px 24px 22px 24px;">
                      <a href="{safe_download_url}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#0f5b53;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;margin:0 6px 10px 6px;">
                        Scarica tessera
                      </a>
                      <a href="{safe_magic_link_url}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#0b3c75;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;margin:0 6px 10px 6px;">
                        Accedi area riservata
                      </a>
                      <a href="{safe_verification_url}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#f2f6f5;border:1px solid #ccd9d7;color:#123330;text-decoration:none;font-size:14px;font-weight:700;margin:0 6px 10px 6px;">
                        Verifica tessera
                      </a>
                      <p style="margin:8px 0 0 0;font-size:12px;color:#5b706d;">Usa il QR per mostrare la validita della tessera.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""
    return text_body, html_body

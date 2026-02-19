import html
from urllib.parse import quote_plus


def build_member_card_email(
    *,
    member_full_name: str,
    organization_name: str,
    card_number: int,
    card_year: int,
    verification_url: str,
    magic_link_url: str,
    logo_url: str,
) -> tuple[str, str]:
    safe_name = html.escape(member_full_name or "")
    safe_org = html.escape(organization_name or "")
    safe_card_number = html.escape(str(card_number))
    safe_card_year = html.escape(str(card_year))
    safe_verification_url = html.escape(verification_url)
    safe_magic_link_url = html.escape(magic_link_url)
    safe_logo_url = html.escape(logo_url)
    qr_url = (
        "https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=0&data="
        f"{quote_plus(verification_url)}"
    )

    text_body = (
        "Benvenuto in ASSO.N.A.M.\n\n"
        f"Socio: {member_full_name}\n"
        f"Associazione: {organization_name}\n"
        f"Tessera n.: {card_number}\n"
        f"Anno: {card_year}\n\n"
        f"Accedi area riservata: {magic_link_url}\n"
        f"Verifica tessera: {verification_url}\n"
    )

    html_body = f"""\
<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tessera socio ASSO.N.A.M.</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f6f6;font-family:Arial,sans-serif;color:#123330;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;">
            <tr>
              <td style="padding:0 16px 20px 16px;text-align:center;">
                <p style="margin:0 0 10px 0;font-size:14px;color:#2b4b49;">La tua tessera digitale e pronta.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:22px;overflow:hidden;background:linear-gradient(135deg,#0b2e2c 0%,#143f3c 45%,#0f3a37 100%);box-shadow:0 16px 40px rgba(6,33,31,0.28);">
                  <tr>
                    <td style="padding:22px 24px;border-top:3px solid #c6a04f;border-bottom:1px solid rgba(198,160,79,0.25);">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td valign="top">
                            <p style="margin:0;font-size:11px;letter-spacing:2px;color:#c6a04f;text-transform:uppercase;">Tessera socio</p>
                            <p style="margin:4px 0 0 0;font-size:28px;font-weight:700;color:#d4b45c;">{safe_card_year}</p>
                          </td>
                          <td align="right" valign="top">
                            <img src="{safe_logo_url}" alt="Logo ASSO.N.A.M." style="height:52px;max-width:220px;object-fit:contain;" />
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 24px 12px 24px;">
                      <p style="margin:0;font-size:11px;letter-spacing:1.5px;color:#8aaba8;text-transform:uppercase;">Nome e cognome</p>
                      <p style="margin:8px 0 0 0;font-size:28px;line-height:1.15;color:#101010 !important;-webkit-text-fill-color:#101010 !important;font-weight:700;font-family:Georgia,serif;">{safe_name}</p>
                      <p style="margin:16px 0 0 0;font-size:11px;letter-spacing:1.5px;color:#8aaba8;text-transform:uppercase;">Associazione</p>
                      <p style="margin:6px 0 0 0;font-size:16px;color:#c6d8d6;">{safe_org}</p>
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
                      <img src="{qr_url}" alt="QR verifica tessera" style="width:170px;height:170px;border-radius:14px;background:#ffffff;padding:8px;border:1px solid #dbe3e1;" />
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding:8px 24px 22px 24px;">
                      <a href="{safe_magic_link_url}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#0f5b53;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;margin:0 6px 10px 6px;">
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

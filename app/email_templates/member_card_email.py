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
    card_image_cid: str | None = None,
) -> tuple[str, str]:
    """Build member card email (text + HTML).

    If *card_image_cid* is provided, the HTML body embeds the card as an
    inline CID image (``<img src="cid:{card_image_cid}">``).  Otherwise a
    pure-HTML bordeaux card is rendered as fallback.
    """
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

    # ── Card visual block ─────────────────────────────────────────────────────
    if card_image_cid:
        # Inline CID image (best rendering — attached PNG from server)
        card_block = f"""\
            <tr>
              <td style="padding:0 16px 6px 16px;">
                <img
                  src="cid:{html.escape(card_image_cid)}"
                  alt="La tua tessera {safe_club}"
                  style="display:block;width:100%;max-width:608px;border-radius:18px;border:0;"
                />
              </td>
            </tr>"""
    else:
        # Fallback: pure-HTML bordeaux card (same fields, no external images needed)
        card_bg = (
            "border-radius:20px;overflow:hidden;"
            "background:linear-gradient(135deg,#3a0015 0%,#5a0828 40%,#2d0015 100%);"
            "box-shadow:0 16px 40px rgba(40,0,10,0.30);"
        )
        if is_oasi2_card:
            card_bg = (
                "border-radius:20px;overflow:hidden;background:#3a0015;"
                "box-shadow:0 16px 40px rgba(40,0,10,0.30);"
            )

        org_logo_header = ""
        if safe_org_logo_url:
            logo_height = "56px" if is_oasi2_card else "44px"
            logo_max_width = "240px" if is_oasi2_card else "220px"
            org_logo_header = f"""\
                  <tr>
                    <td align="center" style="padding:14px 24px 2px 24px;">
                      <img src="{safe_org_logo_url}" alt="Logo" style="height:{logo_height};max-width:{logo_max_width};object-fit:contain;" />
                    </td>
                  </tr>"""

        top_border_style = "1px solid rgba(198,160,79,0.55)" if is_oasi2_card else "3px solid #c6a04f"

        card_block = f"""\
            <tr>
              <td style="padding:0 16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="{card_bg}">
                  {org_logo_header}
                  <tr>
                    <td style="padding:18px 22px;border-top:{top_border_style};border-bottom:1px solid rgba(198,160,79,0.20);">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td valign="top">
                            <p style="margin:0;font-size:10px;letter-spacing:2px;color:#c9a8b0;text-transform:uppercase;">Tessera socio</p>
                            <p style="margin:4px 0 0;font-size:28px;font-weight:700;color:#d4b45c;">{safe_card_year}</p>
                          </td>
                          <td align="right" valign="top">
                            <img src="{safe_assonam_logo_url}" alt="ASSONAM" style="height:50px;max-width:170px;object-fit:contain;" />
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 22px 10px 22px;">
                      <p style="margin:0;font-size:10px;letter-spacing:1.5px;color:#c9a8b0;text-transform:uppercase;">Nome e cognome</p>
                      <p style="margin:8px 0 0;font-size:28px;line-height:1.15;color:#ffffff;font-weight:700;">{safe_name}</p>
                      <p style="margin:16px 0 0;font-size:10px;letter-spacing:1.5px;color:#c9a8b0;text-transform:uppercase;">Associazione</p>
                      <p style="margin:6px 0 0;font-size:15px;color:#fdf6e3;">{safe_association}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:12px 22px 22px 22px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid rgba(198,160,79,0.20);padding-top:12px;">
                        <tr>
                          <td valign="bottom">
                            <p style="margin:0;font-size:10px;letter-spacing:1.5px;color:#c9a8b0;text-transform:uppercase;">N. Tessera</p>
                            <p style="margin:6px 0 0;font-family:Courier New,monospace;font-size:22px;font-weight:700;letter-spacing:2px;color:#d4b45c;">{safe_card_number}</p>
                          </td>
                          <td align="right">
                            <span style="display:inline-block;width:52px;height:34px;border-radius:7px;background:linear-gradient(145deg,#d4b45c 0%,#a8883a 50%,#d4b45c 100%);"></span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>"""

    # ── Plain text ─────────────────────────────────────────────────────────────
    text_body = (
        "La tua tessera digitale e pronta.\n\n"
        f"Club: {club_display_name}\n"
        f"Socio: {member_full_name}\n"
        f"Associazione: {association_label or organization_name}\n"
        f"Tessera n.: {card_number}\n"
        f"Anno: {card_year}\n\n"
        f"Scarica tessera (PDF): {download_url}\n"
        f"Accedi area riservata: {magic_link_url}\n"
        f"Verifica tessera: {verification_url}\n"
    )

    # ── HTML body ─────────────────────────────────────────────────────────────
    html_body = f"""\
<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>La tua tessera socio</title>
  </head>
  <body style="margin:0;padding:0;background:#1a0009;font-family:Arial,sans-serif;color:#fdf6e3;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;">

            <!-- Header -->
            <tr>
              <td style="padding:0 16px 14px 16px;text-align:center;">
                <p style="margin:0;font-size:22px;font-weight:700;color:#d4b45c;">{safe_club}</p>
                <p style="margin:8px 0 0;font-size:14px;color:#c9a8b0;">La tua tessera digitale &egrave; pronta.</p>
              </td>
            </tr>

            <!-- Card visual -->
            {card_block}

            <!-- QR + actions -->
            <tr>
              <td style="padding:16px 16px 0 16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                       style="background:#2a0010;border-radius:16px;border:1px solid rgba(198,160,79,0.20);">
                  <tr>
                    <td align="center" style="padding:20px 20px 10px 20px;">
                      <img src="{safe_qr_url}" alt="QR verifica tessera"
                           style="width:160px;height:160px;border-radius:12px;background:#fff;padding:8px;border:1px solid #3d0018;" />
                      <p style="margin:10px 0 0;font-size:12px;color:#c9a8b0;">Scansiona il QR per verificare la validit&agrave; della tessera.</p>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding:8px 24px 24px 24px;">
                      <a href="{safe_download_url}"
                         style="display:inline-block;padding:12px 22px;border-radius:10px;background:#7a1535;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;margin:0 6px 10px 6px;">
                        Scarica tessera (PDF)
                      </a>
                      <a href="{safe_magic_link_url}"
                         style="display:inline-block;padding:12px 22px;border-radius:10px;background:#0b3c75;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;margin:0 6px 10px 6px;">
                        Accedi area riservata
                      </a>
                      <a href="{safe_verification_url}"
                         style="display:inline-block;padding:12px 22px;border-radius:10px;background:#1a0009;border:1px solid rgba(198,160,79,0.35);color:#d4b45c;text-decoration:none;font-size:14px;font-weight:700;margin:0 6px 10px 6px;">
                        Verifica tessera
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Footer note -->
            <tr>
              <td style="padding:16px 20px 0 20px;text-align:center;">
                <p style="margin:0;font-size:12px;color:#7a5565;">
                  Se non riesci ad aprire il PDF, usa il pulsante &ldquo;Verifica tessera&rdquo; dal browser.
                </p>
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

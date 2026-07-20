from __future__ import annotations

import base64
import io


def generate_qr_png_bytes(
    value: str,
    *,
    box_size: int = 8,
    border: int = 2,
) -> bytes:
    """Generate a deterministic PNG QR code without contacting third parties."""
    normalized_value = (value or "").strip()
    if not normalized_value:
        raise ValueError("QR value is required")

    import qrcode

    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
    )
    qr.add_data(normalized_value)
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def build_qr_data_uri(value: str) -> str:
    encoded = base64.b64encode(generate_qr_png_bytes(value)).decode("ascii")
    return f"data:image/png;base64,{encoded}"

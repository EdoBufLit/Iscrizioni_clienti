from __future__ import annotations

from datetime import date

from app.services.fiscal_code import calculate_fiscal_code


def build_join_submit_data(
    *,
    first_name: str = "Mario",
    last_name: str = "Rossi",
    email: str,
    phone: str = "3331112222",
    birth_date: date = date(1990, 1, 1),
    gender: str = "M",
    birth_place: str = "Roma",
    birth_place_code: str = "H501",
    fiscal_code: str | None = None,
    payment_method: str = "CASH",
    accept_statute: str = "true",
    accept_privacy: str = "true",
) -> dict[str, str]:
    resolved_fiscal_code = fiscal_code or calculate_fiscal_code(
        first_name=first_name,
        last_name=last_name,
        birth_date=birth_date,
        gender=gender,
        birth_place_code=birth_place_code,
    )
    return {
        "first_name": first_name,
        "last_name": last_name,
        "birth_date": birth_date.isoformat(),
        "birth_place": birth_place,
        "birth_place_code": birth_place_code,
        "gender": gender,
        "email": email,
        "phone": phone,
        "fiscal_code": resolved_fiscal_code,
        "payment_method": payment_method,
        "accept_statute": accept_statute,
        "accept_privacy": accept_privacy,
    }

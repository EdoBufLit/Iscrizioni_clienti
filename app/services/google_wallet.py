from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, timedelta
import json
import logging
import os
import re
from typing import Any
from urllib.parse import quote, urlparse

import requests

from app.config import settings
from app.models import Member, Organization
from app.services.card_verification import build_card_verification_token
from app.services.member_activity import is_member_active
from app.services.member_membership import (
    membership_type_label,
    resolve_member_membership_type,
    resolve_member_valid_until,
)
from app.services.org_branding import (
    resolve_assonam_logo_url,
    resolve_card_logo_url,
    resolve_club_display_name,
    resolve_wallet_bg_color,
    resolve_wallet_hero_image_url,
    resolve_wallet_logo_url,
    resolve_wallet_title_override,
)

logger = logging.getLogger(__name__)

_WALLET_SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer"
_WALLET_BASE_URL = "https://walletobjects.googleapis.com/walletobjects/v1"
_GOOGLE_SAVE_URL_PREFIX = "https://pay.google.com/gp/v/save/"
_DEFAULT_CLASS_SUFFIX = "assonam_membership_v1"


class GoogleWalletConfigError(RuntimeError):
    pass


class GoogleWalletApiError(RuntimeError):
    def __init__(self, *, status_code: int, message: str, response_body: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body or ""


@dataclass(frozen=True)
class GoogleWalletSaveLinkResult:
    url: str
    class_id: str
    object_id: str


def _env(name: str, default: str = "") -> str:
    value = os.getenv(name)
    if value is not None:
        return value
    return str(getattr(settings, name, default) or default)


def _require_google_wallet_issuer_id() -> str:
    issuer_id = _env("GOOGLE_WALLET_ISSUER_ID").strip()
    if issuer_id:
        return issuer_id
    raise GoogleWalletConfigError("Missing GOOGLE_WALLET_ISSUER_ID")


def load_google_wallet_service_account_info() -> dict[str, Any]:
    credentials_path = _env("GOOGLE_APPLICATION_CREDENTIALS").strip()
    if credentials_path:
        if not os.path.exists(credentials_path):
            raise GoogleWalletConfigError(
                f"Google Wallet credentials file not found: {credentials_path}"
            )
        try:
            with open(credentials_path, "r", encoding="utf-8") as handle:
                info = json.load(handle)
        except Exception as exc:
            raise GoogleWalletConfigError(
                f"Invalid Google Wallet credentials JSON file: {credentials_path}"
            ) from exc
        _validate_service_account_info(info)
        return info

    sa_b64 = _env("GOOGLE_WALLET_SA_B64").strip()
    if sa_b64:
        try:
            decoded = base64.b64decode(sa_b64, validate=False)
            info = json.loads(decoded.decode("utf-8"))
        except Exception as exc:
            raise GoogleWalletConfigError(
                "Invalid GOOGLE_WALLET_SA_B64 (base64 decode or JSON parse failed)"
            ) from exc
        _validate_service_account_info(info)
        return info

    raise GoogleWalletConfigError(
        "Google Wallet credentials not configured. Set GOOGLE_APPLICATION_CREDENTIALS "
        "or GOOGLE_WALLET_SA_B64."
    )


def _validate_service_account_info(info: dict[str, Any]) -> None:
    if not isinstance(info, dict):
        raise GoogleWalletConfigError("Google Wallet service account JSON must be an object")
    required_keys = {"client_email", "private_key", "token_uri"}
    missing = [key for key in required_keys if not str(info.get(key) or "").strip()]
    if missing:
        raise GoogleWalletConfigError(
            f"Google Wallet service account JSON missing required keys: {', '.join(missing)}"
        )


def _load_google_auth_service_account_module():
    try:
        from google.oauth2 import service_account  # type: ignore
    except ImportError as exc:
        raise GoogleWalletConfigError(
            "Missing dependency 'google-auth'. Install requirements before using Google Wallet."
        ) from exc
    return service_account


def _load_google_auth_request():
    try:
        from google.auth.transport.requests import Request as GoogleAuthRequest  # type: ignore
    except ImportError as exc:
        raise GoogleWalletConfigError(
            "Missing dependency 'google-auth' transport support. Install requirements."
        ) from exc
    return GoogleAuthRequest


def _load_pyjwt_module():
    try:
        import jwt  # type: ignore
    except ImportError as exc:
        raise GoogleWalletConfigError(
            "Missing dependency 'PyJWT'. Install requirements before using Google Wallet."
        ) from exc
    return jwt


def build_google_wallet_credentials_from_info(service_account_info: dict[str, Any]):
    service_account = _load_google_auth_service_account_module()
    return service_account.Credentials.from_service_account_info(
        service_account_info,
        scopes=[_WALLET_SCOPE],
    )


def _get_google_wallet_access_token(service_account_info: dict[str, Any]) -> str:
    credentials = build_google_wallet_credentials_from_info(service_account_info)
    request_cls = _load_google_auth_request()
    auth_request = request_cls()
    credentials.refresh(auth_request)
    token = str(credentials.token or "").strip()
    if token:
        return token
    raise GoogleWalletConfigError("Unable to obtain Google Wallet access token")


def _wallet_request(
    *,
    method: str,
    path: str,
    access_token: str,
    payload: dict[str, Any] | None = None,
) -> requests.Response:
    timeout = int(getattr(settings, "GOOGLE_WALLET_HTTP_TIMEOUT_SECONDS", 15) or 15)
    url = f"{_WALLET_BASE_URL}{path}"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    }
    if payload is not None:
        headers["Content-Type"] = "application/json"
    response = requests.request(
        method=method.upper(),
        url=url,
        headers=headers,
        json=payload,
        timeout=timeout,
    )
    return response


def _raise_google_wallet_api_error(response: requests.Response, *, action: str) -> None:
    body_text = (response.text or "").strip()
    body_preview = body_text[:1500]
    logger.error(
        "Google Wallet API error during %s status=%s body=%s",
        action,
        response.status_code,
        body_preview,
    )
    raise GoogleWalletApiError(
        status_code=int(response.status_code),
        message=f"Google Wallet API {action} failed ({response.status_code})",
        response_body=body_preview,
    )


def _localized_string(value: str, language: str = "it-IT") -> dict[str, Any]:
    return {"defaultValue": {"language": language, "value": value}}


def _sanitize_wallet_id_component(value: str, *, fallback: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", (value or "").strip().lower())
    cleaned = cleaned.strip(".-") or fallback
    return cleaned


def _build_wallet_ids(*, issuer_id: str, member: Member) -> tuple[str, str]:
    card_year = int(member.card_year or datetime.utcnow().year)
    org_slug = _sanitize_wallet_id_component(
        getattr(member.organization, "slug", "") or "assonam",
        fallback="assonam",
    )
    class_id = f"{issuer_id}.{_DEFAULT_CLASS_SUFFIX}"
    object_id = f"{issuer_id}.{org_slug}.{member.id}.{card_year}"
    return class_id, object_id


def _build_backend_base_url() -> str:
    return (_env("BASE_URL", "http://localhost:8000") or "http://localhost:8000").rstrip("/")


def _build_frontend_base_url() -> str:
    frontend = _env("FRONTEND_URL").strip().rstrip("/")
    if frontend:
        return frontend
    return _build_backend_base_url()


def _build_allowed_origins() -> list[str]:
    candidates = [_build_frontend_base_url(), _build_backend_base_url()]
    origins: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        parsed = urlparse(candidate)
        if not parsed.scheme or not parsed.netloc:
            continue
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin not in seen:
            seen.add(origin)
            origins.append(origin)
    return origins


def _is_public_wallet_image_url(url: str) -> bool:
    candidate = (url or "").strip()
    if not candidate:
        return False
    parsed = urlparse(candidate)
    hostname = (parsed.hostname or "").strip().lower()
    if parsed.scheme not in {"http", "https"}:
        return False
    if not hostname:
        return False
    if hostname in {"localhost", "127.0.0.1", "::1"}:
        return False
    return True


def _build_member_verify_url(member: Member, backend_base_url: str) -> str:
    if member.card_no is None or member.card_year is None:
        raise GoogleWalletConfigError("Member has no assigned card for Google Wallet")
    token = build_card_verification_token(
        member_id=member.id,
        org_id=member.org_id,
        card_number=member.card_no,
        card_year=member.card_year,
    )
    return f"{backend_base_url}/api/cards/verify/{token}"


def _build_member_login_url() -> str:
    return f"{_build_frontend_base_url()}/login"


def _member_full_name(member: Member) -> str:
    full_name = f"{(member.first_name or '').strip()} {(member.last_name or '').strip()}".strip()
    return full_name or (member.email or f"Socio #{member.id}")


def _member_state(member: Member) -> str:
    return "ACTIVE" if is_member_active(member, now=datetime.utcnow()) else "INACTIVE"


def _wallet_demo_mode_enabled() -> bool:
    return bool(getattr(settings, "WALLET_DEMO_MODE", False))


def _wallet_test_prefix(org: Organization | None) -> str:
    if not _wallet_demo_mode_enabled():
        return ""
    if org is None:
        return ""
    if bool(getattr(org, "wallet_is_test_prefix", False)):
        return "[SOLO TEST] "
    return ""


def _organization_label(org: Organization | None) -> str:
    if org is None:
        return "ASSONAM"
    return resolve_club_display_name(org) or org.name or "ASSONAM"


def _build_generic_class_payload(*, class_id: str) -> dict[str, Any]:
    return {
        "id": class_id,
        "issuerName": "ASSO.N.A.M.",
        "reviewStatus": "UNDER_REVIEW",
    }


def _build_generic_object_payload(*, member: Member, class_id: str, object_id: str) -> dict[str, Any]:
    org = member.organization
    backend_base_url = _build_backend_base_url()
    frontend_base_url = _build_frontend_base_url()
    verify_url = _build_member_verify_url(member, backend_base_url)
    login_url = _build_member_login_url()
    organization_label = _organization_label(org)
    full_name = _member_full_name(member)
    card_year = int(member.card_year or datetime.utcnow().year)
    card_number = int(member.card_no or 0)
    member_state = _member_state(member)
    membership_type = resolve_member_membership_type(member)
    membership_label = membership_type_label(membership_type)
    valid_until = resolve_member_valid_until(member)
    validity_label = (
        valid_until.strftime("%d/%m/%Y %H:%M")
        if valid_until is not None
        else str(card_year)
    )

    assonam_logo_url = resolve_assonam_logo_url(
        frontend_base_url=frontend_base_url,
        backend_base_url=backend_base_url,
    )
    org_wallet_logo_url = resolve_wallet_logo_url(org, base_url=backend_base_url)
    org_wallet_hero_url = resolve_wallet_hero_image_url(org, base_url=backend_base_url)
    # If no dedicated wallet logo is configured, re-use the card/org logo before falling back to ASSONAM.
    card_logo_fallback_url = resolve_card_logo_url(org, base_url=backend_base_url) if org_wallet_logo_url is None else None
    logo_url = org_wallet_logo_url or card_logo_fallback_url or assonam_logo_url
    logo_description = "Logo associazione" if (org_wallet_logo_url or card_logo_fallback_url) else "Logo ASSO.N.A.M."
    # Google defines cardTitle as the business/program name. Keep the title
    # aligned with the association logo instead of giving every unconfigured
    # tenant the same generic label.
    card_title = resolve_wallet_title_override(org) or organization_label or "ASSO.N.A.M."
    card_title = f"{_wallet_test_prefix(org)}{card_title}".strip()

    payload: dict[str, Any] = {
        "id": object_id,
        "classId": class_id,
        "genericType": "GENERIC_OTHER",
        "state": member_state,
        "cardTitle": _localized_string(card_title),
        "header": _localized_string(full_name),
        "subheader": _localized_string("Tessera socio"),
        "hexBackgroundColor": resolve_wallet_bg_color(org),
        "textModulesData": [
            {
                "id": "membership",
                "header": "Tessera",
                "body": f"N. {card_number} · {card_year} · {membership_label}",
            },
            {
                "id": "validity",
                "header": "Validità",
                "body": (
                    f"Attiva · fino al {validity_label}"
                    if member_state == "ACTIVE"
                    else f"Non attiva · {validity_label}"
                ),
            },
        ],
        "barcode": {
            "type": "QR_CODE",
            "value": verify_url,
            "alternateText": f"Tessera n. {card_number}",
        },
        "linksModuleData": {
            "uris": [
                {
                    "uri": verify_url,
                    "description": "Verifica tessera",
                },
                {
                    "uri": login_url,
                    "description": "Area riservata ASSONAM",
                },
            ]
        },
    }

    if _is_public_wallet_image_url(logo_url):
        payload["logo"] = {
            "sourceUri": {"uri": logo_url},
            "contentDescription": _localized_string(logo_description),
        }
    elif logo_url:
        logger.info(
            "Skipping Google Wallet logo because URL is not publicly reachable url=%s",
            logo_url,
        )

    if org_wallet_hero_url and _is_public_wallet_image_url(org_wallet_hero_url):
        payload["heroImage"] = {
            "sourceUri": {"uri": org_wallet_hero_url},
            "contentDescription": _localized_string(f"Hero {organization_label}"),
        }
    elif org_wallet_hero_url:
        logger.info(
            "Skipping Google Wallet hero image because URL is not publicly reachable url=%s",
            org_wallet_hero_url,
        )
    return payload


def ensure_google_wallet_generic_class(*, class_id: str, access_token: str) -> None:
    encoded_id = quote(class_id, safe="")
    get_response = _wallet_request(
        method="GET",
        path=f"/genericClass/{encoded_id}",
        access_token=access_token,
    )
    if get_response.status_code == 200:
        logger.info("Google Wallet generic class exists class_id=%s", class_id)
        return
    if get_response.status_code != 404:
        _raise_google_wallet_api_error(get_response, action="get_generic_class")

    create_payload = _build_generic_class_payload(class_id=class_id)
    create_response = _wallet_request(
        method="POST",
        path="/genericClass",
        access_token=access_token,
        payload=create_payload,
    )
    if create_response.status_code in {200, 201}:
        logger.info("Google Wallet generic class created class_id=%s", class_id)
        return
    if create_response.status_code == 409:
        logger.info(
            "Google Wallet generic class already exists after create attempt (race/idempotent) class_id=%s",
            class_id,
        )
        return
    if create_response.status_code not in {200, 201}:
        _raise_google_wallet_api_error(create_response, action="create_generic_class")


def ensure_google_wallet_generic_object(
    *,
    member: Member,
    class_id: str,
    object_id: str,
    access_token: str,
) -> dict[str, Any]:
    object_payload = _build_generic_object_payload(member=member, class_id=class_id, object_id=object_id)
    encoded_id = quote(object_id, safe="")

    get_response = _wallet_request(
        method="GET",
        path=f"/genericObject/{encoded_id}",
        access_token=access_token,
    )
    if get_response.status_code == 404:
        create_response = _wallet_request(
            method="POST",
            path="/genericObject",
            access_token=access_token,
            payload=object_payload,
        )
        if create_response.status_code in {200, 201}:
            logger.info("Google Wallet generic object created object_id=%s member_id=%s", object_id, member.id)
            return object_payload
        if create_response.status_code == 409:
            logger.info(
                "Google Wallet generic object already exists after create attempt (race/idempotent), patching object_id=%s member_id=%s",
                object_id,
                member.id,
            )
            patch_after_conflict = _wallet_request(
                method="PATCH",
                path=f"/genericObject/{encoded_id}",
                access_token=access_token,
                payload=object_payload,
            )
            if patch_after_conflict.status_code not in {200, 201}:
                _raise_google_wallet_api_error(patch_after_conflict, action="patch_generic_object_after_conflict")
            logger.info(
                "Google Wallet generic object patched after create conflict object_id=%s member_id=%s",
                object_id,
                member.id,
            )
            return object_payload
        _raise_google_wallet_api_error(create_response, action="create_generic_object")

    if get_response.status_code != 200:
        _raise_google_wallet_api_error(get_response, action="get_generic_object")

    patch_response = _wallet_request(
        method="PATCH",
        path=f"/genericObject/{encoded_id}",
        access_token=access_token,
        payload=object_payload,
    )
    if patch_response.status_code not in {200, 201}:
        _raise_google_wallet_api_error(patch_response, action="patch_generic_object")
    logger.info("Google Wallet generic object patched object_id=%s member_id=%s", object_id, member.id)
    return object_payload


def build_google_wallet_save_link(*, service_account_info: dict[str, Any], object_payload: dict[str, Any]) -> str:
    jwt_module = _load_pyjwt_module()
    now = datetime.utcnow()
    claims = {
        "iss": str(service_account_info.get("client_email") or "").strip(),
        "aud": "google",
        "typ": "savetowallet",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=1)).timestamp()),
        "origins": _build_allowed_origins(),
        "payload": {
            "genericObjects": [object_payload],
        },
    }
    private_key = str(service_account_info.get("private_key") or "").strip()
    if not private_key:
        raise GoogleWalletConfigError("Google Wallet credentials missing private_key")
    key_id = str(service_account_info.get("private_key_id") or "").strip() or None
    encoded = jwt_module.encode(
        claims,
        private_key,
        algorithm="RS256",
        headers={"kid": key_id} if key_id else None,
    )
    token = encoded.decode("utf-8") if isinstance(encoded, bytes) else str(encoded)
    return f"{_GOOGLE_SAVE_URL_PREFIX}{token}"


def generate_google_wallet_save_link_for_member(member: Member) -> GoogleWalletSaveLinkResult:
    if member is None:
        raise GoogleWalletConfigError("Member not found")
    if member.card_no is None or member.card_year is None:
        raise GoogleWalletConfigError("Member has no active card assigned")
    if member.organization is None:
        raise GoogleWalletConfigError("Member organization not found")

    issuer_id = _require_google_wallet_issuer_id()
    service_account_info = load_google_wallet_service_account_info()
    access_token = _get_google_wallet_access_token(service_account_info)
    class_id, object_id = _build_wallet_ids(issuer_id=issuer_id, member=member)

    ensure_google_wallet_generic_class(class_id=class_id, access_token=access_token)
    object_payload = ensure_google_wallet_generic_object(
        member=member,
        class_id=class_id,
        object_id=object_id,
        access_token=access_token,
    )
    save_url = build_google_wallet_save_link(
        service_account_info=service_account_info,
        object_payload=object_payload,
    )
    return GoogleWalletSaveLinkResult(url=save_url, class_id=class_id, object_id=object_id)

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

import stripe
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.integrations.stripe_connect_demo.client import get_stripe_client
from app.integrations.stripe_connect_demo.config import (
    StripeConnectDemoConfigError,
    get_demo_page_config,
    require_stripe_billing_webhook_secret,
    require_stripe_connect_demo_enabled,
    require_stripe_platform_price_id,
    require_stripe_thin_webhook_secret,
    resolve_demo_base_url,
)
from app.models import Organization, StripeWebhookEvent

logger = logging.getLogger(__name__)

DEMO_PRODUCT_LIST_LIMIT = 20
DEMO_PLATFORM_FEE_BPS = 1000

# The sample only needs to be safe for the countries organizations are likely to
# use in ASSONAM. If a value is present but we cannot map it to a known ISO-2
# country code, we fail explicitly instead of creating the account with a wrong
# country.
KNOWN_COUNTRY_NAME_MAP = {
    "italia": "IT",
    "italy": "IT",
    "italie": "IT",
    "italien": "IT",
    "united states": "US",
    "united states of america": "US",
    "usa": "US",
    "germany": "DE",
    "deutschland": "DE",
    "france": "FR",
    "spain": "ES",
    "espana": "ES",
    "españa": "ES",
    "united kingdom": "GB",
    "uk": "GB",
    "great britain": "GB",
    "ireland": "IE",
    "portugal": "PT",
    "netherlands": "NL",
    "belgium": "BE",
    "austria": "AT",
    "switzerland": "CH",
    "romania": "RO",
    "poland": "PL",
}

ISO_COUNTRY_CODES = {
    "AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ",
    "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS",
    "BT","BV","BW","BY","BZ","CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN",
    "CO","CR","CU","CV","CW","CX","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE",
    "EG","EH","ER","ES","ET","FI","FJ","FK","FM","FO","FR","GA","GB","GD","GE","GF",
    "GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY","HK","HM",
    "HN","HR","HT","HU","ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT","JE","JM",
    "JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC",
    "LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MF","MG","MH","MK",
    "ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ","NA",
    "NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF","PG",
    "PH","PK","PL","PM","PN","PR","PS","PT","PW","PY","QA","RE","RO","RS","RU","RW",
    "SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS",
    "ST","SV","SX","SY","SZ","TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO",
    "TR","TT","TV","TW","TZ","UA","UG","UM","US","UY","UZ","VA","VC","VE","VG","VI",
    "VN","VU","WF","WS","YE","YT","ZA","ZM","ZW",
}


class StripeConnectDemoError(RuntimeError):
    """Application-facing demo error surfaced to the admin UI."""


def _as_dict(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    to_dict = getattr(value, "to_dict_recursive", None)
    if callable(to_dict):
        return to_dict()
    if hasattr(value, "__dict__"):
        return {
            key: item
            for key, item in value.__dict__.items()
            if not key.startswith("_")
        }
    return {}


def _get_nested(value: Any, *path: str) -> Any:
    current = value
    for key in path:
        if current is None:
            return None
        if isinstance(current, dict):
            current = current.get(key)
        else:
            current = getattr(current, key, None)
    return current


def _normalize_country(org: Organization) -> str:
    raw = (org.country or "").strip()
    if not raw:
        return "IT"
    if len(raw) == 2 and raw.upper() in ISO_COUNTRY_CODES:
        return raw.upper()

    mapped = KNOWN_COUNTRY_NAME_MAP.get(raw.casefold())
    if mapped:
        return mapped

    raise StripeConnectDemoError(
        "Organization.country non valido per Stripe Connect demo. "
        "Imposta un paese ISO-2 valido oppure un nome mappabile, ad esempio 'IT' o 'Italy'."
    )


def _organization_display_name(org: Organization) -> str:
    value = (org.club_display_name or org.name or "").strip()
    if value:
        return value
    raise StripeConnectDemoError(
        "L'associazione non ha un nome valido. Imposta il nome associazione prima di creare l'account Stripe demo."
    )


def _organization_contact_email(org: Organization) -> str:
    value = (org.email or "").strip().lower()
    if value:
        return value
    raise StripeConnectDemoError(
        "L'associazione non ha una email di contatto valida. Imposta l'email associazione prima di creare l'account Stripe demo."
    )


def _connected_account_options(account_id: str) -> dict[str, str]:
    # Requests that create/read resources on behalf of a connected account must
    # send Stripe-Account, otherwise Stripe would operate on the platform account.
    return {"stripe_account": account_id}


def _serialize_product(product: Any) -> dict[str, Any]:
    payload = _as_dict(product)
    default_price = payload.get("default_price") or {}
    if not isinstance(default_price, dict):
        default_price = _as_dict(default_price)
    return {
        "id": payload.get("id"),
        "name": payload.get("name"),
        "description": payload.get("description"),
        "active": bool(payload.get("active", True)),
        "default_price": {
            "id": default_price.get("id"),
            "unit_amount": default_price.get("unit_amount"),
            "currency": default_price.get("currency"),
        },
    }


def _account_requirements_status(account: Any) -> str | None:
    summary = _get_nested(account, "requirements", "summary") or {}
    if isinstance(summary, dict):
        minimum_deadline = summary.get("minimum_deadline") or {}
        if isinstance(minimum_deadline, dict):
            status = minimum_deadline.get("status")
            if status:
                return str(status)
        for key in ("status", "current_deadline_status"):
            value = summary.get(key)
            if value:
                return str(value)
    return None


def _card_payments_status(account: Any) -> str | None:
    for path in [
        ("configuration", "merchant", "capabilities", "card_payments", "status"),
        ("configuration", "merchant", "capabilities", "card_payments"),
    ]:
        value = _get_nested(account, *path)
        if isinstance(value, str):
            return value
        if isinstance(value, dict):
            status = value.get("status")
            if status:
                return str(status)
    return None


def _serialize_account_status(account: Any) -> dict[str, Any]:
    account_dict = _as_dict(account)
    requirements_status = _account_requirements_status(account_dict)
    card_payments_status = _card_payments_status(account_dict)
    return {
        "id": account_dict.get("id"),
        "display_name": account_dict.get("display_name"),
        "contact_email": account_dict.get("contact_email"),
        "country": _get_nested(account_dict, "identity", "country"),
        "dashboard": account_dict.get("dashboard"),
        "requirements_status": requirements_status,
        "card_payments_status": card_payments_status,
        # We intentionally compute readiness from the live Stripe response rather
        # than caching it locally so the demo screen always reflects current
        # onboarding requirements/capabilities.
        "ready_to_process_payments": card_payments_status == "active",
        "onboarding_complete": requirements_status not in {"currently_due", "past_due"},
        "raw": account_dict,
    }


def get_org_demo_page_state(org: Organization) -> dict[str, Any]:
    page_config = get_demo_page_config()
    return {
        "enabled": True,
        "publishable_key": page_config.publishable_key,
        "base_url": page_config.base_url,
        "connected_account_id": org.stripe_connected_account_id,
        "subscription_status": org.stripe_platform_subscription_status,
        "subscription_id": org.stripe_platform_subscription_id,
    }


def create_or_get_connected_account(db: Session, org: Organization) -> dict[str, Any]:
    require_stripe_connect_demo_enabled()
    if org.stripe_connected_account_id:
        account = retrieve_connected_account(org.stripe_connected_account_id)
        return {
            "created": False,
            "connected_account_id": org.stripe_connected_account_id,
            "account": _serialize_account_status(account),
        }

    client = get_stripe_client()
    params = {
        "display_name": _organization_display_name(org),
        "contact_email": _organization_contact_email(org),
        "identity": {"country": _normalize_country(org)},
        "dashboard": "full",
        "defaults": {
            "responsibilities": {
                "fees_collector": "stripe",
                "losses_collector": "stripe",
            }
        },
        # Accounts v2 lets this sample use one connected account both as the
        # merchant destination for direct charges and as customer_account for the
        # platform subscription demo. We intentionally do not send any legacy
        # top-level type such as express/standard/custom.
        "configuration": {
            "customer": {},
            "merchant": {
                "capabilities": {
                    "card_payments": {
                        "requested": True,
                    }
                }
            },
        },
    }
    account = client.v2.core.accounts.create(params=params)
    account_id = str(_get_nested(account, "id") or "")
    if not account_id:
        raise StripeConnectDemoError(
            "Stripe non ha restituito un account id valido durante la creazione dell'account demo."
        )

    org.stripe_connected_account_id = account_id
    db.add(org)
    db.commit()
    db.refresh(org)
    return {
        "created": True,
        "connected_account_id": account_id,
        "account": _serialize_account_status(account),
    }


def retrieve_connected_account(account_id: str) -> Any:
    client = get_stripe_client()
    return client.v2.core.accounts.retrieve(
        account_id,
        params={
            "include": ["configuration.merchant", "requirements"],
        },
    )


def get_connected_account_status(org: Organization) -> dict[str, Any]:
    require_stripe_connect_demo_enabled()
    get_demo_page_config()
    if not org.stripe_connected_account_id:
        return {
            "connected_account_id": None,
            "account": None,
        }
    account = retrieve_connected_account(org.stripe_connected_account_id)
    return {
        "connected_account_id": org.stripe_connected_account_id,
        "account": _serialize_account_status(account),
    }


def create_onboarding_link(db: Session, org: Organization) -> dict[str, Any]:
    require_stripe_connect_demo_enabled()
    client = get_stripe_client()
    account_id = org.stripe_connected_account_id
    if not account_id:
        account_id = create_or_get_connected_account(db, org)["connected_account_id"]

    base_url = resolve_demo_base_url()
    link = client.v2.core.account_links.create(
        params={
            "account": account_id,
            "refresh_url": f"{base_url}/org-admin/billing?onboarding=refresh",
            "return_url": f"{base_url}/org-admin/billing?onboarding=return&accountId={account_id}",
            "use_case": {
                "type": "account_onboarding",
                "account_onboarding": {
                    "configurations": ["merchant", "customer"],
                },
            },
        }
    )
    return {
        "url": _get_nested(link, "url"),
        "expires_at": _get_nested(link, "expires_at"),
        "connected_account_id": account_id,
    }


def require_connected_account(org: Organization) -> str:
    account_id = (org.stripe_connected_account_id or "").strip()
    if account_id:
        return account_id
    raise StripeConnectDemoError(
        "Current org has no connected Stripe account yet. Create/connect an account before onboarding, creating products, or opening billing portal."
    )


def list_demo_products_for_org(org: Organization) -> list[dict[str, Any]]:
    require_stripe_connect_demo_enabled()
    account_id = require_connected_account(org)
    client = get_stripe_client()
    products = client.v1.products.list(
        params={
            "active": True,
            "limit": DEMO_PRODUCT_LIST_LIMIT,
            "expand": ["data.default_price"],
        },
        options=_connected_account_options(account_id),
    )
    return [_serialize_product(item) for item in list(getattr(products, "data", []) or [])]


def create_demo_product_for_org(
    org: Organization,
    *,
    name: str,
    description: str | None,
    price_in_cents: int,
    currency: str,
) -> dict[str, Any]:
    require_stripe_connect_demo_enabled()
    account_id = require_connected_account(org)
    client = get_stripe_client()
    product = client.v1.products.create(
        params={
            "name": name,
            "description": description,
            "default_price_data": {
                "unit_amount": price_in_cents,
                "currency": currency.lower(),
            },
        },
        options=_connected_account_options(account_id),
    )
    return _serialize_product(product)


def list_demo_storefront_products(account_id: str) -> list[dict[str, Any]]:
    require_stripe_connect_demo_enabled()
    client = get_stripe_client()
    products = client.v1.products.list(
        params={
            "active": True,
            "limit": DEMO_PRODUCT_LIST_LIMIT,
            "expand": ["data.default_price"],
        },
        options=_connected_account_options(account_id),
    )
    return [_serialize_product(item) for item in list(getattr(products, "data", []) or [])]


def _application_fee_amount(unit_amount: int, quantity: int) -> int:
    gross = max(unit_amount, 0) * max(quantity, 1)
    return int(round(gross * DEMO_PLATFORM_FEE_BPS / 10000))


def create_demo_storefront_checkout(
    account_id: str,
    *,
    product_id: str,
    quantity: int,
) -> dict[str, Any]:
    require_stripe_connect_demo_enabled()
    client = get_stripe_client()
    product = client.v1.products.retrieve(
        product_id,
        params={"expand": ["default_price"]},
        options=_connected_account_options(account_id),
    )
    default_price = _as_dict(_get_nested(product, "default_price"))
    price_id = str(default_price.get("id") or "")
    unit_amount = int(default_price.get("unit_amount") or 0)
    if not price_id:
        raise StripeConnectDemoError(
            "Il prodotto demo non ha un default price valido sul connected account."
        )

    base_url = resolve_demo_base_url()
    # This is a direct charge: Checkout is created in the connected-account
    # context, so the payment lands on the connected account and the platform
    # monetizes through application_fee_amount.
    session = client.v1.checkout.sessions.create(
        params={
            "mode": "payment",
            "line_items": [{"price": price_id, "quantity": max(quantity, 1)}],
            "payment_intent_data": {
                "application_fee_amount": _application_fee_amount(unit_amount, quantity),
            },
            "success_url": (
                f"{base_url}/stripe-demo/storefront/success"
                f"?session_id={{CHECKOUT_SESSION_ID}}&account_id={account_id}"
            ),
            "cancel_url": f"{base_url}/stripe-demo/storefront/{account_id}",
        },
        options=_connected_account_options(account_id),
    )
    return {
        "url": _get_nested(session, "url"),
        "id": _get_nested(session, "id"),
    }


def create_platform_subscription_checkout(org: Organization) -> dict[str, Any]:
    require_stripe_connect_demo_enabled()
    account_id = require_connected_account(org)
    price_id = require_stripe_platform_price_id()
    base_url = resolve_demo_base_url()
    session = get_stripe_client().v1.checkout.sessions.create(
        params={
            "customer_account": account_id,
            "mode": "subscription",
            "line_items": [{"price": price_id, "quantity": 1}],
            # For Accounts v2 demos we intentionally map the connected account id
            # as customer_account instead of introducing legacy customer ids.
            "success_url": (
                f"{base_url}/org-admin/billing"
                f"?session_id={{CHECKOUT_SESSION_ID}}"
            ),
            "cancel_url": f"{base_url}/org-admin/billing?subscription=cancel",
        }
    )
    return {
        "url": _get_nested(session, "url"),
        "id": _get_nested(session, "id"),
    }


def create_platform_billing_portal(org: Organization) -> dict[str, Any]:
    require_stripe_connect_demo_enabled()
    account_id = require_connected_account(org)
    session = get_stripe_client().v1.billing_portal.sessions.create(
        params={
            "customer_account": account_id,
            "return_url": f"{resolve_demo_base_url()}/org-admin/billing",
        }
    )
    return {
        "url": _get_nested(session, "url"),
        "id": _get_nested(session, "id"),
    }


def _extract_account_id_from_event(event_payload: Any) -> str | None:
    for path in [
        ("related_object", "id"),
        ("data", "object", "id"),
        ("data", "related_object", "id"),
    ]:
        value = _get_nested(event_payload, *path)
        if value:
            return str(value)
    return None


def _find_org_by_connected_account(db: Session, account_id: str | None) -> Organization | None:
    if not account_id:
        return None
    return (
        db.query(Organization)
        .filter(Organization.stripe_connected_account_id == account_id)
        .first()
    )


def _is_duplicate_event(db: Session, event_id: str) -> bool:
    return (
        db.query(StripeWebhookEvent)
        .filter(StripeWebhookEvent.event_id == event_id)
        .first()
        is not None
    )


def _record_processed_event(
    db: Session, *, event_id: str, event_type: str, livemode: bool
) -> bool:
    row = StripeWebhookEvent(
        event_id=event_id,
        event_type=event_type,
        livemode=livemode,
        processed_at=datetime.utcnow(),
    )
    db.add(row)
    try:
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False


def handle_thin_account_webhook(
    db: Session,
    *,
    raw_payload: bytes,
    signature_header: str,
) -> dict[str, Any]:
    require_stripe_connect_demo_enabled()
    secret = require_stripe_thin_webhook_secret()
    # Thin webhook verification and every subsequent Stripe API lookup in this
    # demo flow go through the dedicated StripeClient helper.
    client = get_stripe_client()
    thin_event = client.parse_event_notification(raw_payload, signature_header, secret)
    event_id = str(getattr(thin_event, "id", "") or "")
    event_type = str(getattr(thin_event, "type", "") or "")
    livemode = bool(getattr(thin_event, "livemode", False))
    if event_id and _is_duplicate_event(db, event_id):
        return {"received": True, "duplicate": True}

    retrieve_options = {}
    event_context = getattr(thin_event, "context", None)
    if event_context:
        retrieve_options["stripe_context"] = str(event_context)

    full_event = client.v2.core.events.retrieve(
        event_id,
        options=retrieve_options or None,
    )
    account_id = _extract_account_id_from_event(full_event)
    org = _find_org_by_connected_account(db, account_id)

    if event_type in {
        "v2.core.account[requirements].updated",
        "v2.core.account[configuration.merchant].capability_status_updated",
        "v2.core.account[configuration.customer].capability_status_updated",
    } and account_id:
        # Thin events intentionally carry a compact payload. We fetch the full
        # v2 event and then pull the latest account state from Stripe so this
        # demo reflects current requirements/capabilities instead of trusting
        # stale event snapshots.
        latest_account = retrieve_connected_account(account_id)
        logger.info(
            "Stripe thin account event processed",
            extra={
                "event_id": event_id,
                "event_type": event_type,
                "connected_account_id": account_id,
                "org_id": org.id if org else None,
                "requirements_status": _account_requirements_status(latest_account),
                "card_payments_status": _card_payments_status(latest_account),
            },
        )
        # TODO: Persist a richer account requirements/capabilities audit trail if
        # the demo graduates into a real billing subsystem.
    else:
        logger.info(
            "Ignoring unsupported thin Stripe demo event",
            extra={"event_id": event_id, "event_type": event_type},
        )

    if event_id:
        _record_processed = _record_processed_event(
            db,
            event_id=event_id,
            event_type=event_type or "unknown",
            livemode=livemode,
        )
        if not _record_processed:
            return {"received": True, "duplicate": True}
    return {"received": True, "duplicate": False}


def handle_billing_webhook(
    db: Session,
    *,
    raw_payload: bytes,
    signature_header: str,
) -> dict[str, Any]:
    require_stripe_connect_demo_enabled()
    secret = require_stripe_billing_webhook_secret()
    # construct_event verifies the signed raw payload locally. It is not a
    # Stripe API request, so it is the only Stripe SDK usage here that does not
    # go through StripeClient.
    event = stripe.Webhook.construct_event(raw_payload, signature_header, secret)
    event_id = str(getattr(event, "id", "") or "")
    event_type = str(getattr(event, "type", "") or "")
    livemode = bool(getattr(event, "livemode", False))
    if event_id and _is_duplicate_event(db, event_id):
        return {"received": True, "duplicate": True}

    data_object = _as_dict(_get_nested(event, "data", "object"))
    if event_type in {"customer.subscription.updated", "customer.subscription.deleted"}:
        customer_account = data_object.get("customer_account")
        org = _find_org_by_connected_account(db, customer_account)
        if org:
            org.stripe_platform_subscription_id = str(data_object.get("id") or "") or None
            org.stripe_platform_subscription_status = (
                str(data_object.get("status") or "") or None
            )
            db.add(org)
            db.commit()
    elif event_type == "invoice.paid":
        logger.info(
            "Stripe billing invoice paid",
            extra={"event_id": event_id, "customer_account": data_object.get("customer_account")},
        )
    elif event_type == "customer.updated":
        logger.info(
            "Stripe billing customer.updated received; treating as billing profile change only.",
            extra={"event_id": event_id},
        )
    elif event_type in {
        "payment_method.attached",
        "payment_method.detached",
        "customer.tax_id.created",
        "customer.tax_id.deleted",
        "customer.tax_id.updated",
        "billing_portal.configuration.created",
        "billing_portal.configuration.updated",
        "billing_portal.session.created",
    }:
        logger.info("Stripe billing event received", extra={"event_id": event_id, "event_type": event_type})
    # TODO: Handle application_fee.created here when platform-fee reconciliation
    # becomes a real business requirement outside this sample integration.

    if event_id:
        _record_processed = _record_processed_event(
            db,
            event_id=event_id,
            event_type=event_type or "unknown",
            livemode=livemode,
        )
        if not _record_processed:
            return {"received": True, "duplicate": True}
    return {"received": True, "duplicate": False}

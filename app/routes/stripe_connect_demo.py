from __future__ import annotations

import logging

import stripe
from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.integrations.stripe_connect_demo.config import (
    StripeConnectDemoConfigError,
    stripe_connect_demo_enabled,
)
from app.integrations.stripe_connect_demo.service import (
    StripeConnectDemoError,
    create_demo_product_for_org,
    create_demo_storefront_checkout,
    create_onboarding_link,
    create_or_get_connected_account,
    create_platform_billing_portal,
    create_platform_subscription_checkout,
    get_connected_account_status,
    get_org_demo_page_state,
    list_demo_products_for_org,
    list_demo_storefront_products,
)
from app.models import AdminRole, AdminUser, Organization

logger = logging.getLogger(__name__)

router = APIRouter()


class DemoProductCreateBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    priceInCents: int = Field(gt=0, le=10_000_000)
    currency: str = Field(min_length=3, max_length=3)


class StorefrontCheckoutBody(BaseModel):
    productId: str = Field(min_length=1)
    quantity: int = Field(default=1, ge=1, le=99)


def _org_admin_or_401(request: Request, db: Session) -> AdminUser:
    admin_id = request.session.get("org_admin_id")
    if not admin_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    admin = (
        db.query(AdminUser)
        .filter(
            AdminUser.id == admin_id,
            AdminUser.role == AdminRole.ORG_ADMIN,
            AdminUser.is_active.is_(True),
            AdminUser.deleted_at.is_(None),
        )
        .first()
    )
    if admin is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return admin


def _current_org_or_404(request: Request, db: Session) -> Organization:
    admin = _org_admin_or_401(request, db)
    org = (
        db.query(Organization)
        .filter(
            Organization.id == admin.org_id,
            Organization.deleted_at.is_(None),
        )
        .first()
    )
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _raise_demo_error(exc: Exception) -> None:
    if isinstance(exc, StripeConnectDemoConfigError):
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if isinstance(exc, StripeConnectDemoError):
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if isinstance(exc, stripe.StripeError):
        message = getattr(exc, "user_message", None) or str(exc)
        raise HTTPException(
            status_code=502,
            detail=message or "Stripe Connect demo request failed.",
        ) from exc
    raise exc


@router.get("/api/org-admin/stripe-demo")
def org_admin_stripe_demo_state(request: Request, db: Session = Depends(get_db)):
    org = _current_org_or_404(request, db)
    if not stripe_connect_demo_enabled():
        return {
            "enabled": False,
            "message": "Stripe Connect demo non attivo in questo ambiente.",
        }
    try:
        return {
            **get_org_demo_page_state(org),
            **get_connected_account_status(org),
        }
    except Exception as exc:  # pragma: no cover - routed to consistent HTTP error
        _raise_demo_error(exc)


@router.post("/api/stripe/connect/account")
def org_admin_create_connected_account(
    request: Request,
    db: Session = Depends(get_db),
):
    org = _current_org_or_404(request, db)
    try:
        return create_or_get_connected_account(db, org)
    except Exception as exc:  # pragma: no cover - routed to consistent HTTP error
        _raise_demo_error(exc)


@router.get("/api/stripe/connect/account/status")
def org_admin_connected_account_status(
    request: Request,
    db: Session = Depends(get_db),
):
    org = _current_org_or_404(request, db)
    try:
        return get_connected_account_status(org)
    except Exception as exc:  # pragma: no cover - routed to consistent HTTP error
        _raise_demo_error(exc)


@router.post("/api/stripe/connect/account/onboarding-link")
def org_admin_connected_account_onboarding_link(
    request: Request,
    db: Session = Depends(get_db),
):
    org = _current_org_or_404(request, db)
    try:
        return create_onboarding_link(db, org)
    except Exception as exc:  # pragma: no cover - routed to consistent HTTP error
        _raise_demo_error(exc)


@router.get("/api/stripe/connect/demo-products")
def org_admin_demo_products(request: Request, db: Session = Depends(get_db)):
    org = _current_org_or_404(request, db)
    try:
        return {"items": list_demo_products_for_org(org)}
    except Exception as exc:  # pragma: no cover - routed to consistent HTTP error
        _raise_demo_error(exc)


@router.post("/api/stripe/connect/demo-products")
def org_admin_create_demo_product(
    request: Request,
    body: DemoProductCreateBody,
    db: Session = Depends(get_db),
):
    org = _current_org_or_404(request, db)
    try:
        product = create_demo_product_for_org(
            org,
            name=body.name.strip(),
            description=(body.description or "").strip() or None,
            price_in_cents=body.priceInCents,
            currency=body.currency.strip().lower(),
        )
        return {"product": product}
    except Exception as exc:  # pragma: no cover - routed to consistent HTTP error
        _raise_demo_error(exc)


@router.post("/api/stripe/platform-subscription/checkout")
def org_admin_platform_subscription_checkout(
    request: Request,
    db: Session = Depends(get_db),
):
    org = _current_org_or_404(request, db)
    try:
        return create_platform_subscription_checkout(org)
    except Exception as exc:  # pragma: no cover - routed to consistent HTTP error
        _raise_demo_error(exc)


@router.post("/api/stripe/platform-subscription/portal")
def org_admin_platform_subscription_portal(
    request: Request,
    db: Session = Depends(get_db),
):
    org = _current_org_or_404(request, db)
    try:
        return create_platform_billing_portal(org)
    except Exception as exc:  # pragma: no cover - routed to consistent HTTP error
        _raise_demo_error(exc)


@router.get("/api/stripe/connect-demo/storefront/{account_id}/products")
def demo_storefront_products(account_id: str):
    # This demo uses the Stripe connected account ID in the URL for simplicity.
    # In production, replace this with a safer public business identifier such
    # as an organization slug or storefront token.
    try:
        return {"items": list_demo_storefront_products(account_id)}
    except Exception as exc:  # pragma: no cover - routed to consistent HTTP error
        _raise_demo_error(exc)


@router.post("/api/stripe/connect-demo/storefront/{account_id}/checkout")
def demo_storefront_checkout(
    account_id: str,
    body: StorefrontCheckoutBody = Body(...),
):
    try:
        return create_demo_storefront_checkout(
            account_id,
            product_id=body.productId,
            quantity=body.quantity,
        )
    except Exception as exc:  # pragma: no cover - routed to consistent HTTP error
        _raise_demo_error(exc)

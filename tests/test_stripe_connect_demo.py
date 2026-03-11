from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace
import uuid

import stripe
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models import AdminRole, AdminUser, OrgAdminToken, Organization, StripeWebhookEvent
from app.utils import hash_token


def _login_org_admin(client, db: Session, admin_id: int) -> None:
    token_str = f"org-stripe-demo-{admin_id}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)


def _create_org_admin(
    db: Session,
    *,
    country: str = "Italy",
    email: str = "club@example.com",
) -> tuple[Organization, AdminUser]:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Stripe Demo Club {suffix}",
        slug=f"stripe-demo-{suffix}",
        country=country,
        email=email,
        is_active=True,
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    admin = AdminUser(
        email=f"stripe-demo-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return org, admin


class FakeAccountsService:
    def __init__(self, state: dict[str, object]):
        self.state = state

    def create(self, params=None, options=None):
        self.state["account_create_params"] = params
        account_id = str(self.state.get("account_id", "acct_demo_123"))
        account = {
            "id": account_id,
            "display_name": params["display_name"],
            "contact_email": params["contact_email"],
            "identity": {"country": params["identity"]["country"]},
            "dashboard": params["dashboard"],
            "configuration": {
                "merchant": {
                    "capabilities": {
                        "card_payments": {"status": "active"},
                    }
                }
            },
            "requirements": {"summary": {"minimum_deadline": {"status": "clear"}}},
        }
        self.state["account"] = account
        return account

    def retrieve(self, account_id, params=None, options=None):
        self.state["account_retrieve_params"] = params
        return self.state.get("account") or {
            "id": account_id,
            "display_name": "Demo Club",
            "contact_email": "club@example.com",
            "identity": {"country": "IT"},
            "dashboard": "full",
            "configuration": {
                "merchant": {
                    "capabilities": {
                        "card_payments": {"status": "active"},
                    }
                }
            },
            "requirements": {"summary": {"minimum_deadline": {"status": "clear"}}},
        }


class FakeAccountLinksService:
    def __init__(self, state: dict[str, object]):
        self.state = state

    def create(self, params=None, options=None):
        self.state["account_link_params"] = params
        return {"url": "https://connect.stripe.test/onboarding", "expires_at": "2099-01-01T00:00:00Z"}


class FakeEventsService:
    def __init__(self, state: dict[str, object]):
        self.state = state

    def retrieve(self, event_id, params=None, options=None):
        self.state["event_retrieve_options"] = options
        return {
            "id": event_id,
            "type": "v2.core.account[requirements].updated",
            "related_object": {"id": str(self.state.get("account_id", "acct_demo_123"))},
        }


class FakeProductsService:
    def __init__(self, state: dict[str, object]):
        self.state = state

    def create(self, params=None, options=None):
        self.state["product_create_params"] = params
        self.state["product_create_options"] = options
        return {
            "id": "prod_demo_123",
            "name": params["name"],
            "description": params.get("description"),
            "active": True,
            "default_price": {
                "id": "price_demo_123",
                "unit_amount": params["default_price_data"]["unit_amount"],
                "currency": params["default_price_data"]["currency"],
            },
        }

    def list(self, params=None, options=None):
        self.state["product_list_params"] = params
        self.state["product_list_options"] = options
        return SimpleNamespace(
            data=[
                {
                    "id": "prod_demo_123",
                    "name": "Cena demo",
                    "description": "Prodotto demo",
                    "active": True,
                    "default_price": {
                        "id": "price_demo_123",
                        "unit_amount": 1990,
                        "currency": "eur",
                    },
                }
            ]
        )

    def retrieve(self, product_id, params=None, options=None):
        self.state["product_retrieve_params"] = params
        self.state["product_retrieve_options"] = options
        return {
            "id": product_id,
            "default_price": {
                "id": "price_demo_123",
                "unit_amount": 1990,
                "currency": "eur",
            },
        }


class FakeCheckoutSessionsService:
    def __init__(self, state: dict[str, object]):
        self.state = state

    def create(self, params=None, options=None):
        if params.get("mode") == "subscription":
            self.state["subscription_checkout_params"] = params
        else:
            self.state["storefront_checkout_params"] = params
            self.state["storefront_checkout_options"] = options
        return {"id": "cs_demo_123", "url": "https://checkout.stripe.test/session"}


class FakeBillingPortalSessionsService:
    def __init__(self, state: dict[str, object]):
        self.state = state

    def create(self, params=None, options=None):
        self.state["billing_portal_params"] = params
        return {"id": "bps_demo_123", "url": "https://billing.stripe.test/session"}


class FakeStripeClient:
    def __init__(self, state: dict[str, object]):
        self.state = state
        self.v2 = SimpleNamespace(
            core=SimpleNamespace(
                accounts=FakeAccountsService(state),
                account_links=FakeAccountLinksService(state),
                events=FakeEventsService(state),
            )
        )
        self.v1 = SimpleNamespace(
            products=FakeProductsService(state),
            checkout=SimpleNamespace(sessions=FakeCheckoutSessionsService(state)),
            billing_portal=SimpleNamespace(sessions=FakeBillingPortalSessionsService(state)),
        )

    def parse_event_notification(self, raw, sig_header, secret, tolerance=300):
        self.state["thin_event_secret"] = secret
        self.state["thin_event_sig"] = sig_header
        return SimpleNamespace(
            id=str(self.state.get("thin_event_id", "evt_thin_demo_123")),
            type="v2.core.account[requirements].updated",
            livemode=False,
            context=str(self.state.get("account_id", "acct_demo_123")),
        )


def test_stripe_demo_account_products_storefront_and_subscription_flow(client, monkeypatch):
    state: dict[str, object] = {"account_id": "acct_demo_123", "thin_event_id": "evt_thin_demo_account_flow"}
    db = SessionLocal()
    try:
        org, admin = _create_org_admin(db)
        _login_org_admin(client, db, admin.id)

        monkeypatch.setattr(settings, "ENABLE_STRIPE_CONNECT_DEMO", True)
        monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_test_demo")
        monkeypatch.setattr(settings, "STRIPE_PUBLISHABLE_KEY", "pk_test_demo")
        monkeypatch.setattr(settings, "STRIPE_PLATFORM_PRICE_ID", "price_platform_demo")
        monkeypatch.setattr(
            "app.integrations.stripe_connect_demo.service.get_stripe_client",
            lambda: FakeStripeClient(state),
        )

        initial_res = client.get("/api/org-admin/stripe-demo")
        assert initial_res.status_code == 200, initial_res.text
        assert initial_res.json()["enabled"] is True
        assert initial_res.json()["connected_account_id"] is None

        account_res = client.post("/api/stripe/connect/account")
        assert account_res.status_code == 200, account_res.text
        assert account_res.json()["connected_account_id"] == "acct_demo_123"
        create_params = state["account_create_params"]
        assert create_params["identity"]["country"] == "IT"
        assert "type" not in create_params

        product_res = client.post(
            "/api/stripe/connect/demo-products",
            json={
                "name": "Cena demo",
                "description": "Prodotto demo",
                "priceInCents": 1990,
                "currency": "eur",
            },
        )
        assert product_res.status_code == 200, product_res.text
        assert state["product_create_options"]["stripe_account"] == "acct_demo_123"

        list_res = client.get("/api/stripe/connect/demo-products")
        assert list_res.status_code == 200, list_res.text
        assert list_res.json()["items"][0]["id"] == "prod_demo_123"

        onboarding_res = client.post("/api/stripe/connect/account/onboarding-link")
        assert onboarding_res.status_code == 200, onboarding_res.text
        assert state["account_link_params"]["use_case"]["account_onboarding"]["configurations"] == [
            "merchant",
            "customer",
        ]

        storefront_res = client.get("/api/stripe/connect-demo/storefront/acct_demo_123/products")
        assert storefront_res.status_code == 200, storefront_res.text
        checkout_res = client.post(
            "/api/stripe/connect-demo/storefront/acct_demo_123/checkout",
            json={"productId": "prod_demo_123", "quantity": 2},
        )
        assert checkout_res.status_code == 200, checkout_res.text
        assert state["storefront_checkout_options"]["stripe_account"] == "acct_demo_123"
        assert state["storefront_checkout_params"]["payment_intent_data"]["application_fee_amount"] == 398

        subscription_res = client.post("/api/stripe/platform-subscription/checkout")
        assert subscription_res.status_code == 200, subscription_res.text
        assert state["subscription_checkout_params"]["customer_account"] == "acct_demo_123"
        assert state["subscription_checkout_params"]["line_items"][0]["price"] == "price_platform_demo"
        assert "/org-admin/billing" in state["subscription_checkout_params"]["success_url"]

        portal_res = client.post("/api/stripe/platform-subscription/portal")
        assert portal_res.status_code == 200, portal_res.text
        assert state["billing_portal_params"]["customer_account"] == "acct_demo_123"
        assert state["billing_portal_params"]["return_url"].endswith("/org-admin/billing")
    finally:
        db.close()


def test_stripe_demo_webhooks_are_idempotent_and_update_subscription_status(client, monkeypatch):
    state: dict[str, object] = {"account_id": "acct_demo_webhook_123", "thin_event_id": "evt_thin_demo_webhook_flow"}
    db = SessionLocal()
    try:
        db.query(StripeWebhookEvent).delete()
        db.commit()
        org, _admin = _create_org_admin(db)
        org.stripe_connected_account_id = "acct_demo_webhook_123"
        db.add(org)
        db.commit()

        monkeypatch.setattr(settings, "ENABLE_STRIPE_CONNECT_DEMO", True)
        monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_test_demo")
        monkeypatch.setattr(settings, "STRIPE_THIN_WEBHOOK_SECRET", "whsec_thin_demo")
        monkeypatch.setattr(settings, "STRIPE_BILLING_WEBHOOK_SECRET", "whsec_billing_demo")
        monkeypatch.setattr(
            "app.integrations.stripe_connect_demo.service.get_stripe_client",
            lambda: FakeStripeClient(state),
        )
        monkeypatch.setattr(
            stripe.Webhook,
            "construct_event",
                lambda payload, signature, secret: SimpleNamespace(
                    id="evt_billing_demo_webhook_flow",
                type="customer.subscription.updated",
                livemode=False,
                data=SimpleNamespace(
                    object={
                        "id": "sub_demo_123",
                        "status": "active",
                        "customer_account": "acct_demo_webhook_123",
                    }
                ),
            ),
        )

        thin_res = client.post(
            "/api/webhooks/stripe/thin",
            data=b"{}",
            headers={"Stripe-Signature": "t=1,v1=test"},
        )
        assert thin_res.status_code == 200, thin_res.text
        assert thin_res.json()["duplicate"] is False

        thin_duplicate_res = client.post(
            "/api/webhooks/stripe/thin",
            data=b"{}",
            headers={"Stripe-Signature": "t=1,v1=test"},
        )
        assert thin_duplicate_res.status_code == 200, thin_duplicate_res.text
        assert thin_duplicate_res.json()["duplicate"] is True

        billing_res = client.post(
            "/api/webhooks/stripe/billing",
            data=b"{}",
            headers={"Stripe-Signature": "t=1,v1=test"},
        )
        assert billing_res.status_code == 200, billing_res.text
        assert billing_res.json()["duplicate"] is False

        billing_duplicate_res = client.post(
            "/api/webhooks/stripe/billing",
            data=b"{}",
            headers={"Stripe-Signature": "t=1,v1=test"},
        )
        assert billing_duplicate_res.status_code == 200, billing_duplicate_res.text
        assert billing_duplicate_res.json()["duplicate"] is True

        verification_db = SessionLocal()
        try:
            assert verification_db.query(StripeWebhookEvent).count() == 2
        finally:
            verification_db.close()
    finally:
        db.close()



def test_stripe_demo_state_requires_publishable_key(client, monkeypatch):
    db = SessionLocal()
    try:
        org, admin = _create_org_admin(db)
        _login_org_admin(client, db, admin.id)

        monkeypatch.setattr(settings, "ENABLE_STRIPE_CONNECT_DEMO", True)
        monkeypatch.setattr(settings, "STRIPE_PUBLISHABLE_KEY", None)
        monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_test_demo")

        res = client.get("/api/org-admin/stripe-demo")
        assert res.status_code == 503, res.text
        assert "STRIPE_PUBLISHABLE_KEY" in res.json()["detail"]
    finally:
        db.close()

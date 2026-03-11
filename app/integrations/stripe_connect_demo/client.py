from __future__ import annotations

from stripe import StripeClient

from app.integrations.stripe_connect_demo.config import require_stripe_secret_key


def get_stripe_client() -> StripeClient:
    """Return one StripeClient instance shape used by the demo.

    The sample intentionally centralizes client creation so every Stripe request
    goes through the same SDK surface instead of mixing module-level globals and
    ad-hoc request code. All Stripe API calls in the demo should go through this
    helper; the only exception is local webhook signature verification, which
    does not hit Stripe's API.
    """

    return StripeClient(require_stripe_secret_key())

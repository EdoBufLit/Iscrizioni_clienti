from __future__ import annotations

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.integrations.stripe_connect_demo.config import StripeConnectDemoConfigError
from app.integrations.stripe_connect_demo.service import (
    StripeConnectDemoError,
    handle_billing_webhook,
    handle_thin_account_webhook,
)

router = APIRouter()


def _raise_webhook_error(exc: Exception) -> None:
    if isinstance(exc, StripeConnectDemoConfigError):
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if isinstance(exc, StripeConnectDemoError):
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if isinstance(exc, stripe.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Firma Stripe non valida.") from exc
    if isinstance(exc, ValueError):
        raise HTTPException(status_code=400, detail=str(exc) or "Payload Stripe non valido.") from exc
    raise exc


@router.post("/api/webhooks/stripe/thin")
async def stripe_thin_webhook(request: Request, db: Session = Depends(get_db)):
    raw_payload = await request.body()
    signature_header = request.headers.get("Stripe-Signature", "")
    try:
        return handle_thin_account_webhook(
            db,
            raw_payload=raw_payload,
            signature_header=signature_header,
        )
    except Exception as exc:  # pragma: no cover - routed to consistent HTTP error
        _raise_webhook_error(exc)


@router.post("/api/webhooks/stripe/billing")
async def stripe_billing_webhook(request: Request, db: Session = Depends(get_db)):
    raw_payload = await request.body()
    signature_header = request.headers.get("Stripe-Signature", "")
    try:
        return handle_billing_webhook(
            db,
            raw_payload=raw_payload,
            signature_header=signature_header,
        )
    except Exception as exc:  # pragma: no cover - routed to consistent HTTP error
        _raise_webhook_error(exc)

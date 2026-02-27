from datetime import datetime, timedelta
import uuid

import pytest

from app.db import SessionLocal
from app.models import AdminRole, AdminUser, CardBatch, OrgAdminToken, Organization
from app.routes.org_admin import _compute_org_card_stock
from app.security import get_password_hash
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _login_org_admin(client, db, admin_id: int) -> None:
    token_str = f"org-admin-batch-boolean-{admin_id}-{uuid.uuid4().hex[:6]}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    response = client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)
    assert response.status_code in (302, 307), response.text


def test_org_admin_metrics_and_cards_ignore_disabled_batches(client, db):
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Org batch bool {suffix}",
        slug=f"org-batch-bool-{suffix}",
        privacy_version="v1",
        is_active=True,
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    admin = AdminUser(
        email=f"org-batch-bool-{suffix}@example.com",
        password_hash=get_password_hash("Pass1234!"),
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    current_year = datetime.utcnow().year
    enabled_batch = CardBatch(
        org_id=org.id,
        year=current_year,
        start_no=810000,
        end_no=810009,
        next_no=810000,
        is_enabled=True,
    )
    disabled_batch = CardBatch(
        org_id=org.id,
        year=current_year,
        start_no=820000,
        end_no=820009,
        next_no=820000,
        is_enabled=False,
    )
    db.add_all([enabled_batch, disabled_batch])
    db.commit()

    stock = _compute_org_card_stock(db, org.id, now=datetime.utcnow())
    assert stock == {"total": 10, "used": 0, "remaining": 10}

    _login_org_admin(client, db, admin.id)

    cards_response = client.get("/api/org-admin/cards")
    assert cards_response.status_code == 200, cards_response.text
    assert cards_response.json() == {"total": 10, "used": 0, "remaining": 10}

    metrics_response = client.get("/api/org-admin/metrics")
    assert metrics_response.status_code == 200, metrics_response.text
    metrics_payload = metrics_response.json()
    assert metrics_payload["cards_total"] == 10
    assert metrics_payload["cards_used"] == 0
    assert metrics_payload["cards_remaining"] == 10

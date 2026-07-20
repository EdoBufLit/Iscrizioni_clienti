import pytest
from sqlalchemy import func
from app.db import SessionLocal
from app.models import (
    AdminUser,
    AdminRole,
    AnnualMembershipTerm,
    AnnualMembershipTermStatus,
    Organization,
    Member,
    MemberStatus,
    OrgAdminToken,
    CardBatch,
)
from app.utils import hash_token
from datetime import datetime, timedelta
import uuid

@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()

def test_org_admin_decision(client, db):
    unique_suffix = uuid.uuid4().hex[:8]
    current_year = datetime.utcnow().year

    # Setup: Ensure Org exists
    org = db.query(Organization).filter_by(slug="decision-org").first()
    if not org:
        org = Organization(name="Decision Org", slug="decision-org", is_active=True)
        db.add(org)
        db.commit()
        db.refresh(org)

    batch = db.query(CardBatch).filter(
        CardBatch.org_id == org.id,
        CardBatch.year == current_year,
        CardBatch.released_at.is_(None),
    ).first()
    if not batch:
        max_end_no = db.query(func.max(CardBatch.end_no)).scalar() or 25000
        start_no = int(max_end_no) + 100
        batch = CardBatch(
            org_id=org.id,
            year=current_year,
            start_no=start_no,
            end_no=start_no + 50,
            next_no=start_no,
        )
        db.add(batch)
        db.commit()

    # Setup: Create Org Admin
    admin_email = "decision_admin@example.com"
    admin = db.query(AdminUser).filter_by(email=admin_email).first()
    if not admin:
        admin = AdminUser(
            email=admin_email,
            role=AdminRole.ORG_ADMIN,
            org_id=org.id,
            is_active=True
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

    # Setup: Member to Approve
    member_approve = Member(
        org_id=org.id,
        first_name="To",
        last_name="Approve",
        email=f"approve-{unique_suffix}@example.com",
        status=MemberStatus.PENDING_DOCS
    )
    db.add(member_approve)

    # Setup: Member to Reject
    member_reject = Member(
        org_id=org.id,
        first_name="To",
        last_name="Reject",
        email=f"reject-{unique_suffix}@example.com",
        status=MemberStatus.PENDING_DOCS
    )
    db.add(member_reject)
    db.commit()
    db.refresh(member_approve)
    db.refresh(member_reject)

    # Authenticate Org Admin
    token_str = f"decisiontoken-{unique_suffix}"
    expiry = datetime.utcnow() + timedelta(minutes=15)
    token = OrgAdminToken(
        admin_id=admin.id,
        token_hash=hash_token(token_str),
        expires_at=expiry
    )
    db.add(token)
    db.commit()

    # Login
    client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)

    # Test Approve
    resp = client.post(
        f"/api/org-admin/members/{member_approve.id}/decision",
        json={"decision": "approve", "notes": "Approved via test"}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"

    # Verify DB
    db.refresh(member_approve)
    assert member_approve.status == MemberStatus.ACTIVE
    assert member_approve.decision_by_admin_id == admin.id
    assert member_approve.decision_notes == "Approved via test"
    assert member_approve.decision_at is not None

    annual_term = db.query(AnnualMembershipTerm).filter_by(member_id=member_approve.id).one()
    assert annual_term.status == AnnualMembershipTermStatus.ACTIVE.value

    # Rejecting an already active member must invalidate the historical term.
    resp = client.post(
        f"/api/org-admin/members/{member_approve.id}/decision",
        json={"decision": "reject", "notes": "Active membership revoked"},
    )
    assert resp.status_code == 200
    db.refresh(annual_term)
    assert annual_term.status == AnnualMembershipTermStatus.CANCELLED.value

    # Test Reject
    resp = client.post(
        f"/api/org-admin/members/{member_reject.id}/decision",
        json={"decision": "reject", "notes": "Rejected via test"}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"

    # Verify DB
    db.refresh(member_reject)
    assert member_reject.status == MemberStatus.REJECTED
    assert member_reject.decision_by_admin_id == admin.id

    # Test Cross-Org Access (Forbidden)
    other_org = Organization(name="Other Org", slug=f"other-org-{unique_suffix}", is_active=True)
    db.add(other_org)
    db.commit()
    other_member = Member(
        org_id=other_org.id,
        first_name="Other",
        last_name="Guy",
        email=f"other-{unique_suffix}@example.com",
        status=MemberStatus.PENDING_DOCS
    )
    db.add(other_member)
    db.commit()

    resp = client.post(
        f"/api/org-admin/members/{other_member.id}/decision",
        json={"decision": "approve"}
    )
    assert resp.status_code == 403

    # Test Invalid Decision
    resp = client.post(
        f"/api/org-admin/members/{member_approve.id}/decision",
        json={"decision": "invalid"}
    )
    assert resp.status_code == 400

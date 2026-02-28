import uuid
from datetime import datetime

import pytest

from app.db import SessionLocal
from app.models import Member, MemberStatus, Organization
from app.services.member_cleanup import cleanup_deleted_member_traces
from tests.signup_payloads import build_join_submit_data


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _create_org(db, slug: str) -> Organization:
    org = Organization(
        name=f"Cleanup Org {slug}",
        slug=slug,
        privacy_version="v1",
        is_active=True,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _create_legacy_deleted_member(
    db,
    *,
    org_id: int,
    email: str,
    fiscal_code: str,
    card_no: int,
) -> Member:
    member = Member(
        org_id=org_id,
        first_name="Legacy",
        last_name="Deleted",
        email=email,
        phone="3331112222",
        fiscal_code=fiscal_code,
        password_hash="legacy-hash",
        status=MemberStatus.REJECTED,
        card_no=card_no,
        card_year=2026,
        external_customer_id=f"legacy-{uuid.uuid4().hex[:6]}",
        deleted_at=datetime.utcnow(),
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def test_cleanup_deleted_member_traces_global_sanitizes_all_associations(db):
    suffix = uuid.uuid4().hex[:8]
    org_a = _create_org(db, f"cleanup-global-a-{suffix}")
    org_b = _create_org(db, f"cleanup-global-b-{suffix}")

    old_a = _create_legacy_deleted_member(
        db,
        org_id=org_a.id,
        email=f"legacy-a-{suffix}@example.com",
        fiscal_code=f"GLBAAA{suffix[:5].upper()}",
        card_no=91001,
    )
    old_b = _create_legacy_deleted_member(
        db,
        org_id=org_b.id,
        email=f"legacy-b-{suffix}@example.com",
        fiscal_code=f"GLBBB{suffix[:5].upper()}",
        card_no=91002,
    )

    cleaned = cleanup_deleted_member_traces(db)
    db.commit()
    assert cleaned >= 2

    db.refresh(old_a)
    db.refresh(old_b)
    assert old_a.email is None
    assert old_a.fiscal_code is None
    assert old_a.card_no is None
    assert old_a.external_customer_id is None
    assert old_b.email is None
    assert old_b.fiscal_code is None
    assert old_b.card_no is None
    assert old_b.external_customer_id is None


def test_join_submit_cleans_deleted_legacy_traces_per_association(client, db):
    suffix = uuid.uuid4().hex[:8]
    org_a = _create_org(db, f"cleanup-join-a-{suffix}")
    org_b = _create_org(db, f"cleanup-join-b-{suffix}")

    email_a = f"legacy.join.a.{suffix}@example.com"
    email_b = f"legacy.join.b.{suffix}@example.com"
    fiscal_a = f"JNA{suffix[:8].upper()}"
    fiscal_b = f"JNB{suffix[:8].upper()}"

    old_a = _create_legacy_deleted_member(
        db,
        org_id=org_a.id,
        email=email_a,
        fiscal_code=fiscal_a,
        card_no=92001,
    )
    old_a_id = old_a.id
    old_b = _create_legacy_deleted_member(
        db,
        org_id=org_b.id,
        email=email_b,
        fiscal_code=fiscal_b,
        card_no=92002,
    )
    old_b_id = old_b.id

    res_a = client.post(
        f"/api/join/{org_a.slug}/submit",
        data=build_join_submit_data(
            first_name="Nuovo",
            last_name="SocioA",
            email=email_a,
            phone="3330001111",
            payment_method="CASH",
            accept_statute="false",
            accept_privacy="true",
        ),
    )
    assert res_a.status_code == 200, res_a.text

    res_b = client.post(
        f"/api/join/{org_b.slug}/submit",
        data=build_join_submit_data(
            first_name="Nuovo",
            last_name="SocioB",
            email=email_b,
            phone="3330002222",
            payment_method="BONIFICO",
            accept_statute="false",
            accept_privacy="true",
        ),
    )
    assert res_b.status_code == 200, res_b.text

    old_a_after = db.query(Member).filter(Member.id == old_a_id).first()
    old_b_after = db.query(Member).filter(Member.id == old_b_id).first()
    assert old_a_after is None
    assert old_b_after is None

    new_a = (
        db.query(Member)
        .filter(Member.org_id == org_a.id, Member.email == email_a, Member.deleted_at.is_(None))
        .order_by(Member.id.desc())
        .first()
    )
    new_b = (
        db.query(Member)
        .filter(Member.org_id == org_b.id, Member.email == email_b, Member.deleted_at.is_(None))
        .order_by(Member.id.desc())
        .first()
    )
    assert new_a is not None and new_a.id != old_a_id
    assert new_b is not None and new_b.id != old_b_id


def test_register_is_scoped_to_org_and_not_blocked_by_other_org_deleted_member(client, db):
    suffix = uuid.uuid4().hex[:8]
    org_a = _create_org(db, f"cleanup-reg-a-{suffix}")
    org_b = _create_org(db, f"cleanup-reg-b-{suffix}")
    email = f"legacy.register.{suffix}@example.com"

    old_a = _create_legacy_deleted_member(
        db,
        org_id=org_a.id,
        email=email,
        fiscal_code=f"RGA{suffix[:8].upper()}",
        card_no=93001,
    )

    res = client.post(
        "/api/auth/register",
        data={
            "email": email,
            "password": "Password123!",
            "first_name": "Nuovo",
            "last_name": "Registro",
            "phone": "3334445555",
            "fiscal_code": f"RGB{suffix[:8].upper()}",
            "org_slug": org_b.slug,
        },
    )
    assert res.status_code == 200, res.text

    new_b = (
        db.query(Member)
        .filter(Member.org_id == org_b.id, Member.email == email, Member.deleted_at.is_(None))
        .order_by(Member.id.desc())
        .first()
    )
    assert new_b is not None
    assert new_b.id != old_a.id

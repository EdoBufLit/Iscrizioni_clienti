from datetime import datetime
import uuid

import pytest
from sqlalchemy import func

from app.config import settings
from app.db import SessionLocal
from app.models import (
    CardBatch,
    Member,
    MemberStatus,
    Organization,
    PaymentMethod,
    SignupSource,
)
from app.utils import clear_captured_emails, get_captured_emails
from tests.signup_payloads import build_join_submit_data


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _ensure_org(db, slug: str, *, with_batch: bool) -> Organization:
    org = db.query(Organization).filter_by(slug=slug).first()
    if not org:
        org = Organization(
            name=f"Join Auto Issue {slug}",
            slug=slug,
            statute_version="v1",
            privacy_version="v1",
            statute_pdf_path=f"{slug}/statute.pdf",
            is_active=True,
            auto_approve_signup=(slug == "t-a-g-culture"),
        )
        db.add(org)
        db.commit()
        db.refresh(org)
    else:
        org.is_active = True
        org.deleted_at = None
        org.privacy_version = org.privacy_version or "v1"
        org.statute_version = org.statute_version or "v1"
        org.statute_pdf_path = org.statute_pdf_path or f"{slug}/statute.pdf"
        setattr(org, "auto_approve_signup", slug == "t-a-g-culture")
        db.commit()
        db.refresh(org)

    if with_batch:
        current_year = datetime.utcnow().year
        available_batch = (
            db.query(CardBatch)
            .filter(
                CardBatch.org_id == org.id,
                CardBatch.year == current_year,
                CardBatch.is_enabled.is_(True),
                CardBatch.released_at.is_(None),
                CardBatch.next_no <= CardBatch.end_no,
            )
            .order_by(CardBatch.id.desc())
            .first()
        )
        if available_batch is None:
            max_end_no = db.query(func.max(CardBatch.end_no)).scalar() or 30000
            start_no = int(max_end_no) + 100
            batch = CardBatch(
                org_id=org.id,
                year=current_year,
                start_no=start_no,
                end_no=start_no + 25,
                next_no=start_no,
            )
            db.add(batch)
            db.commit()

    return org


def _join_submit(client, slug: str, email: str):
    return client.post(
        f"/api/join/{slug}/submit",
        data=build_join_submit_data(
            first_name="Tag",
            last_name="Culture",
            email=email,
            payment_method="BONIFICO",
            accept_statute="true",
            accept_privacy="true",
        ),
    )


def test_tag_signup_auto_issues_active_card_and_returns_active_page(client, db):
    org = _ensure_org(db, "t-a-g-culture", with_batch=True)
    email = f"tag-auto-{uuid.uuid4().hex[:8]}@example.com"

    previous_email_mode = settings.EMAIL_MODE
    settings.EMAIL_MODE = "test"
    clear_captured_emails()
    try:
        response = _join_submit(client, str(org.slug), email)
        assert response.status_code == 200, response.text

        payload = response.json()
        assert payload["status"] == "issued"
        assert payload["active_card_page_url"]
        assert (
            f"/associazioni/{org.slug}/tessera?card_token="
            in payload["active_card_page_url"]
        )
        assert "status=issued" in payload["active_card_page_url"]
        assert payload["email_sent"] is True
        assert payload["card_verification_token"]
        assert payload["card_verification_url"].endswith(
            f"/api/cards/verify/{payload['card_verification_token']}"
        )
        assert payload["card_download_url"].endswith(
            f"/api/cards/{payload['card_verification_token']}/download.pdf"
        )

        member = (
            db.query(Member)
            .filter(Member.org_id == org.id, Member.email == email)
            .order_by(Member.id.desc())
            .first()
        )
        assert member is not None
        assert member.status == MemberStatus.ACTIVE
        assert member.card_no is not None
        assert member.card_year == datetime.utcnow().year
        assert member.payment_method == PaymentMethod.BONIFICO
        assert member.signup_source == SignupSource.ASSONAM_FORM.value
        assert member.external_customer_id == f"email:{email}"
        assert member.birth_place == "Roma"
        assert member.birth_place_code == "H501"
        assert member.gender == "M"
        assert member.decision_notes == "Auto-approved via web signup"
        assert member.card_email_sent_at is not None
        assert member.card_delivered_at is not None

        captured = get_captured_emails()
        assert len(captured) == 1
        text_body = captured[0]["text_body"] or ""
        html_body = captured[0]["html_body"] or ""
        assert payload["active_card_page_url"] in text_body
        assert payload["card_download_url"] in text_body
        assert payload["card_verification_url"] in text_body
        assert "/wallet/google/add" in text_body
        assert "Apri tessera" in text_body
        assert "Apri tessera" in html_body
        assert "Un amministratore li verificherà a breve" not in text_body
    finally:
        settings.EMAIL_MODE = previous_email_mode
        clear_captured_emails()


def test_other_org_signup_stays_pending_review(client, db):
    org = _ensure_org(db, f"manual-review-{uuid.uuid4().hex[:6]}", with_batch=False)
    email = f"manual-review-{uuid.uuid4().hex[:8]}@example.com"

    response = _join_submit(client, str(org.slug), email)
    assert response.status_code == 200, response.text

    payload = response.json()
    assert payload["status"] == "received"
    assert payload.get("active_card_page_url") is None

    member = (
        db.query(Member)
        .filter(Member.org_id == org.id, Member.email == email)
        .order_by(Member.id.desc())
        .first()
    )
    assert member is not None
    assert member.status == MemberStatus.PENDING_VERIFICATION
    assert member.card_no is None
    assert member.card_year is None


def test_org_with_auto_approve_signup_true_auto_issues_card(client, db):
    slug = f"auto-approve-{uuid.uuid4().hex[:6]}"
    org = _ensure_org(db, slug, with_batch=True)
    setattr(org, "auto_approve_signup", True)
    db.commit()
    db.refresh(org)

    email = f"{slug}-{uuid.uuid4().hex[:8]}@example.com"
    response = _join_submit(client, str(org.slug), email)
    assert response.status_code == 200, response.text

    payload = response.json()
    assert payload["status"] == "issued"
    assert payload.get("active_card_page_url")

    member = (
        db.query(Member)
        .filter(Member.org_id == org.id, Member.email == email)
        .order_by(Member.id.desc())
        .first()
    )
    assert member is not None
    assert member.status == MemberStatus.ACTIVE
    assert member.card_no is not None


def test_org_with_auto_approve_signup_false_stays_pending(client, db):
    slug = f"manual-approve-{uuid.uuid4().hex[:6]}"
    org = _ensure_org(db, slug, with_batch=True)
    setattr(org, "auto_approve_signup", False)
    db.commit()
    db.refresh(org)

    email = f"{slug}-{uuid.uuid4().hex[:8]}@example.com"
    response = _join_submit(client, str(org.slug), email)
    assert response.status_code == 200, response.text

    payload = response.json()
    assert payload["status"] == "received"
    assert payload.get("active_card_page_url") is None

    member = (
        db.query(Member)
        .filter(Member.org_id == org.id, Member.email == email)
        .order_by(Member.id.desc())
        .first()
    )
    assert member is not None
    assert member.status == MemberStatus.PENDING_VERIFICATION
    assert member.card_no is None


def test_join_submit_ignores_soft_deleted_status_member_for_existing_active_card(
    client, db
):
    org = _ensure_org(db, f"join-soft-delete-{uuid.uuid4().hex[:6]}", with_batch=True)
    setattr(org, "auto_approve_signup", True)
    db.commit()
    db.refresh(org)
    email = f"soft-delete-{uuid.uuid4().hex[:8]}@example.com"
    current_year = datetime.utcnow().year
    batch = (
        db.query(CardBatch)
        .filter(
            CardBatch.org_id == org.id,
            CardBatch.year == current_year,
            CardBatch.is_enabled.is_(True),
            CardBatch.released_at.is_(None),
        )
        .order_by(CardBatch.id.desc())
        .first()
    )
    assert batch is not None

    legacy_member = Member(
        org_id=org.id,
        first_name="Legacy",
        last_name="Deleted",
        email=email,
        phone="3330001111",
        fiscal_code=f"SD{uuid.uuid4().hex[:14].upper()}",
        status=MemberStatus.ACTIVE,
        deleted_at=datetime.utcnow(),
        card_no=max(int(batch.start_no) - 1, 1),
        card_year=current_year,
        signup_source=SignupSource.ASSONAM_FORM.value,
        external_customer_id=f"email:{email}",
    )
    db.add(legacy_member)
    db.commit()
    db.refresh(legacy_member)
    legacy_card_no = legacy_member.card_no

    response = _join_submit(client, str(org.slug), email)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "issued"

    db.expire_all()
    new_member = (
        db.query(Member)
        .filter(Member.org_id == org.id, Member.email == email)
        .order_by(Member.id.desc())
        .first()
    )
    assert new_member is not None
    assert new_member.status == MemberStatus.ACTIVE
    assert new_member.card_no is not None
    assert new_member.card_no != legacy_card_no
    assert new_member.external_customer_id == f"email:{email}"

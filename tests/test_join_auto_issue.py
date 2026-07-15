from datetime import datetime, timedelta
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func

from app.config import settings
from app.db import SessionLocal
from app.main import app
from app.models import (
    CardBatch,
    EmailOutbox,
    Member,
    MemberDocument,
    MemberStatus,
    Organization,
    PaymentMethod,
    SignupSource,
    Token,
    TokenType,
)
from app.security import get_password_hash, verify_password
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


def test_tag_signup_auto_issues_active_card_and_returns_active_page(client, db, drain_email_outbox):
    client.post("/api/auth/logout")
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
        assert payload["email_sent"] is False
        assert payload["email_status"] == "queued"
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
        assert member.card_email_sent_at is None
        assert member.card_delivered_at is None

        registration = client.post(
            "/api/auth/register",
            data={
                "email": email,
                "password": "AutoIssuePass123!",
                "first_name": "Tag",
                "last_name": "Culture",
                "phone": member.phone or "",
                "fiscal_code": member.fiscal_code or "",
                "payment_method": "BONIFICO",
                "org_slug": org.slug,
            },
        )
        assert registration.status_code == 200, registration.text
        assert registration.json()["authenticated"] is True

        db.refresh(member)
        assert verify_password("AutoIssuePass123!", member.password_hash)
        assert member.status == MemberStatus.ACTIVE
        assert member.card_no is not None

        me = client.get("/api/auth/me")
        assert me.status_code == 200, me.text
        assert me.json()["id"] == member.id
        assert me.json()["card_no"] == member.card_no

        drain_email_outbox()
        db.refresh(member)
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


def test_join_submit_uses_active_card_status_when_card_already_exists(client, db):
    org = _ensure_org(db, f"join-existing-card-{uuid.uuid4().hex[:6]}", with_batch=True)
    setattr(org, "auto_approve_signup", True)
    db.commit()
    db.refresh(org)

    email = f"existing-card-{uuid.uuid4().hex[:8]}@example.com"
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

    member = Member(
        org_id=org.id,
        first_name="Reuse",
        last_name="Card",
        email=email,
        phone="3331112222",
        fiscal_code=f"RC{uuid.uuid4().hex[:14].upper()}",
        password_hash=get_password_hash("ExistingCardPass123!"),
        status=MemberStatus.PENDING_VERIFICATION,
        card_no=int(batch.start_no),
        card_year=current_year,
        signup_source=SignupSource.ASSONAM_FORM.value,
        external_customer_id=f"email:{email}",
    )
    db.add(member)
    db.commit()

    existing_card_payload = build_join_submit_data(
        first_name="Reuse",
        last_name="Card",
        email=email,
        payment_method="BONIFICO",
        accept_statute="true",
        accept_privacy="true",
    )
    existing_card_payload["password"] = "ExistingCardPass123!"
    response = client.post(
        f"/api/join/{org.slug}/submit",
        data=existing_card_payload,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "issued"
    assert payload["active_card_page_url"] is not None
    assert "status=active_card" in payload["active_card_page_url"]


def test_auto_approve_signup_uses_card_active_email_template(client, db, drain_email_outbox):
    org = _ensure_org(db, f"join-template-auto-{uuid.uuid4().hex[:6]}", with_batch=True)
    setattr(org, "auto_approve_signup", True)
    db.commit()
    db.refresh(org)

    email = f"template-auto-{uuid.uuid4().hex[:8]}@example.com"
    previous_email_mode = settings.EMAIL_MODE
    settings.EMAIL_MODE = "test"
    clear_captured_emails()
    try:
        response = _join_submit(client, str(org.slug), email)

        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["status"] == "issued"
        assert payload["email_status"] == "queued"

        queued = (
            db.query(EmailOutbox)
            .filter(
                EmailOutbox.to_email == email,
                EmailOutbox.email_type == "member_card_active",
            )
            .order_by(EmailOutbox.created_at.desc())
            .first()
        )
        assert queued is not None

        drain_email_outbox()
        captured = get_captured_emails()
        assert len(captured) == 1
        assert "Aggiungi a Google Wallet (Android)" in (captured[0]["html_body"] or "")
        assert "Scarica tessera" in (captured[0]["html_body"] or "")
    finally:
        settings.EMAIL_MODE = previous_email_mode
        clear_captured_emails()


def test_manual_review_signup_uses_manual_review_email_template(client, db, drain_email_outbox):
    org = _ensure_org(
        db, f"join-template-manual-{uuid.uuid4().hex[:6]}", with_batch=False
    )
    setattr(org, "auto_approve_signup", False)
    db.commit()
    db.refresh(org)

    email = f"template-manual-{uuid.uuid4().hex[:8]}@example.com"
    previous_email_mode = settings.EMAIL_MODE
    settings.EMAIL_MODE = "test"
    clear_captured_emails()
    try:
        response = _join_submit(client, str(org.slug), email)

        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["status"] == "received"
        assert payload["email_status"] == "queued"

        queued = (
            db.query(EmailOutbox)
            .filter(
                EmailOutbox.to_email == email,
                EmailOutbox.email_type == "manual_review_received",
            )
            .order_by(EmailOutbox.created_at.desc())
            .first()
        )
        assert queued is not None

        drain_email_outbox()
        captured = get_captured_emails()
        assert len(captured) == 1
        assert "Un amministratore li verifichera a breve." in (
            captured[0]["text_body"] or ""
        )
    finally:
        settings.EMAIL_MODE = previous_email_mode
        clear_captured_emails()


def test_public_signup_can_issue_temporary_membership_when_enabled(client, db):
    slug = f"temp-signup-{uuid.uuid4().hex[:8]}"
    org = _ensure_org(db, slug, with_batch=True)
    org.custom_membership_types_enabled = True
    org.membership_fee_amount = 30
    org.temporary_membership_fee_amount = 10
    org.temporary_membership_duration_value = 4
    org.temporary_membership_duration_unit = "hours"
    db.commit()
    db.refresh(org)

    detail_res = client.get(f"/api/organizations/{org.slug}")
    assert detail_res.status_code == 200, detail_res.text
    detail_payload = detail_res.json()
    assert detail_payload["membership_config"]["custom_types_enabled"] is True
    assert detail_payload["membership_config"]["temporary_duration_value"] == 4
    assert detail_payload["membership_config"]["temporary_duration_unit"] == "hours"

    email = f"temp-signup-{uuid.uuid4().hex[:8]}@example.com"
    payload = build_join_submit_data(
        first_name="Tessa",
        last_name="Temp",
        email=email,
        payment_method="BONIFICO",
        accept_statute="true",
        accept_privacy="true",
    )
    payload["membership_type"] = "temporary"
    response = client.post(
        f"/api/join/{org.slug}/submit",
        data=payload,
    )
    assert response.status_code == 200, response.text

    member = (
        db.query(Member)
        .filter(Member.org_id == org.id, Member.email == email)
        .order_by(Member.id.desc())
        .first()
    )
    assert member is not None
    assert member.membership_type == "temporary"
    assert float(member.membership_fee_snapshot) == 10.0
    assert member.valid_from is not None
    assert member.valid_until is not None
    assert member.valid_until - member.valid_from == timedelta(hours=4)


def test_pending_signup_cannot_be_taken_over_from_a_second_browser(client, db):
    client.cookies.clear()
    org = _ensure_org(db, f"join-owner-{uuid.uuid4().hex[:6]}", with_batch=False)
    org.auto_approve_signup = False
    db.commit()

    email = f"join-owner-{uuid.uuid4().hex[:8]}@example.com"
    signup = build_join_submit_data(
        first_name="Mario",
        last_name="Rossi",
        email=email,
        phone="3331112222",
    )
    signup["password"] = "OwnerPass123!"
    first = client.post(
        f"/api/join/{org.slug}/submit",
        data=signup,
        files={
            "id_document": (
                "owner-id.pdf",
                b"%PDF-1.4 owner identity",
                "application/pdf",
            )
        },
    )
    assert first.status_code == 200, first.text

    db.expire_all()
    member = db.query(Member).filter(Member.org_id == org.id, Member.email == email).one()
    original_document = (
        db.query(MemberDocument)
        .filter(
            MemberDocument.member_id == member.id,
            MemberDocument.doc_type == "identity",
        )
        .one()
    )
    original_document_id = original_document.id
    original_document_path = original_document.rel_path
    continuation_count = (
        db.query(Token)
        .filter(
            Token.member_id == member.id,
            Token.purpose == TokenType.REGISTRATION_CONTINUATION,
        )
        .count()
    )

    attack = dict(signup)
    attack["phone"] = "3999999999"
    attack["password"] = "AttackerPass123!"
    with TestClient(app) as attacker:
        attacked = attacker.post(
            f"/api/join/{org.slug}/submit",
            data=attack,
            files={
                "id_document": (
                    "attacker-id.pdf",
                    b"%PDF-1.4 attacker identity",
                    "application/pdf",
                )
            },
        )

    assert attacked.status_code == 409, attacked.text
    assert attacked.json()["detail"] == "Esiste già una iscrizione associata a questi dati."
    db.expire_all()
    protected_member = db.query(Member).filter(Member.id == member.id).one()
    protected_document = (
        db.query(MemberDocument)
        .filter(MemberDocument.member_id == member.id)
        .one()
    )
    assert protected_member.phone == "3331112222"
    assert protected_member.status == MemberStatus.PENDING_VERIFICATION
    assert protected_member.card_no is None
    assert protected_document.id == original_document_id
    assert protected_document.rel_path == original_document_path
    assert (
        db.query(Token)
        .filter(
            Token.member_id == member.id,
            Token.purpose == TokenType.REGISTRATION_CONTINUATION,
        )
        .count()
        == continuation_count
    )


def test_same_browser_can_retry_after_auto_issue_fails_post_commit(
    client,
    db,
    monkeypatch,
):
    client.cookies.clear()
    slug = f"join-retry-{uuid.uuid4().hex[:6]}"
    org = _ensure_org(db, slug, with_batch=True)
    org.auto_approve_signup = True
    db.commit()

    from app.routes import join as join_routes

    real_issuer = join_routes.issue_member_from_integration
    issuer_calls = 0

    def flaky_issuer(session, command):
        nonlocal issuer_calls
        issuer_calls += 1
        if issuer_calls == 1:
            raise RuntimeError("simulated post-prepare-commit failure")
        return real_issuer(session, command)

    monkeypatch.setattr(join_routes, "issue_member_from_integration", flaky_issuer)

    email = f"join-retry-{uuid.uuid4().hex[:8]}@example.com"
    signup = build_join_submit_data(email=email, payment_method="BONIFICO")
    signup["password"] = "RetryPass123!"

    failed = client.post(f"/api/join/{org.slug}/submit", data=signup)
    assert failed.status_code == 500, failed.text
    db.expire_all()
    member = db.query(Member).filter(Member.org_id == org.id, Member.email == email).one()
    assert member.status == MemberStatus.PENDING_VERIFICATION
    assert member.card_no is None
    continuation = (
        db.query(Token)
        .filter(
            Token.member_id == member.id,
            Token.purpose == TokenType.REGISTRATION_CONTINUATION,
            Token.used_at.is_(None),
        )
        .one()
    )
    assert continuation.expires_at > datetime.utcnow()

    with TestClient(app) as attacker:
        blocked = attacker.post(f"/api/join/{org.slug}/submit", data=signup)
    assert blocked.status_code == 409, blocked.text

    retried = client.post(f"/api/join/{org.slug}/submit", data=signup)
    assert retried.status_code == 200, retried.text
    assert retried.json()["status"] == "issued"
    assert retried.json()["active_card_page_url"]
    assert retried.json()["card_verification_token"]

    registered = client.post(
        "/api/auth/register",
        data={
            "email": email,
            "password": "RetryPass123!",
            "first_name": "Mario",
            "last_name": "Rossi",
            "org_slug": org.slug,
        },
    )
    assert registered.status_code == 200, registered.text
    assert registered.json()["authenticated"] is True

    db.expire_all()
    issued_member = db.query(Member).filter(Member.id == member.id).one()
    used_continuation = db.query(Token).filter(Token.id == continuation.id).one()
    assert issuer_calls == 2
    assert issued_member.status == MemberStatus.ACTIVE
    assert issued_member.card_no is not None
    assert verify_password("RetryPass123!", issued_member.password_hash)
    assert used_continuation.used_at is not None


def test_existing_pending_signup_can_resume_with_its_valid_password(client, db):
    client.cookies.clear()
    org = _ensure_org(db, f"join-password-{uuid.uuid4().hex[:6]}", with_batch=False)
    org.auto_approve_signup = False
    db.commit()

    email = f"join-password-{uuid.uuid4().hex[:8]}@example.com"
    payload = build_join_submit_data(email=email, phone="3331112222")
    member = Member(
        org_id=org.id,
        first_name="Existing",
        last_name="Pending",
        email=email,
        phone="3330000000",
        fiscal_code=payload["fiscal_code"],
        password_hash=get_password_hash("ExistingPass123!"),
        status=MemberStatus.PENDING_VERIFICATION,
        signup_source=SignupSource.ASSONAM_FORM.value,
    )
    db.add(member)
    db.commit()

    payload["password"] = "ExistingPass123!"
    resumed = client.post(f"/api/join/{org.slug}/submit", data=payload)

    assert resumed.status_code == 200, resumed.text
    db.refresh(member)
    assert member.phone == "3331112222"
    assert verify_password("ExistingPass123!", member.password_hash)

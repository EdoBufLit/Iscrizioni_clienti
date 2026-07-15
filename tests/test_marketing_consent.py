from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
import re
from urllib.parse import urlsplit
import uuid

import pytest
from sqlalchemy import func

from app.config import settings
from app.db import SessionLocal
from app.models import (
    CardBatch,
    EmailCampaign,
    EmailCampaignRecipient,
    EmailOutbox,
    EmailOutboxStatus,
    MarketingConsentEvent,
    Member,
    MemberStatus,
    MembershipPayment,
    MembershipPaymentStatus,
    Organization,
)
from app.services.email_campaigns import (
    AUDIENCE_ALL_ACTIVE,
    RECIPIENT_MODE_SELECTED_MEMBERS,
    resolve_audience_recipients,
    resolve_selected_member_recipients,
    send_campaign,
    serialize_selected_member_ids,
)
from app.services.email_outbox import (
    build_email_payload,
    enqueue_email,
    process_outbox_once,
)
from app.services.email_sender import build_sender_payload
from app.services.marketing_consent import (
    MARKETING_ACTION_GRANTED,
    MARKETING_ACTION_REVOKED,
    MARKETING_NOTICE_VERSION,
    marketing_subject_reference,
)
from app.services.membership_payments import encrypt_sumup_api_key
from app.services.privacy_notice import PRIVACY_NOTICE_SHA256, PRIVACY_NOTICE_VERSION
from app.utils import clear_captured_emails, get_captured_emails
from tests.signup_payloads import build_join_submit_data


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _create_org(
    db,
    *,
    auto_approve: bool = False,
    communications_enabled: bool = False,
    sumup: bool = False,
) -> Organization:
    slug = f"marketing-{uuid.uuid4().hex[:10]}"
    org = Organization(
        name=f"Associazione Marketing {slug}",
        slug=slug,
        is_active=True,
        auto_approve_signup=auto_approve,
        communications_enabled=communications_enabled,
        statute_version="statute-v1",
        privacy_version="privacy-v1",
        statute_pdf_path=f"{slug}/statute.pdf",
        sender_email_local_part="associazione-marketing",
    )
    if sumup:
        org.payment_provider = "sumup"
        org.payment_required_before_card = True
        org.membership_payment_label = "Quota associativa annuale"
        org.membership_fee_amount = Decimal("25.00")
        org.membership_fee_currency = "EUR"
        org.payment_button_label = "Paga con carta"
        org.sumup_enabled = True
        org.sumup_api_key_encrypted = encrypt_sumup_api_key("sumup-marketing-test-key")
        org.sumup_api_key_last4 = "-key"
        org.sumup_api_key_configured_at = datetime.utcnow()
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _add_available_batch(db, org: Organization) -> None:
    max_end = db.query(func.max(CardBatch.end_no)).scalar() or 50000
    start = int(max_end) + 100
    db.add(
        CardBatch(
            org_id=org.id,
            year=datetime.utcnow().year,
            start_no=start,
            end_no=start + 10,
            next_no=start,
            is_enabled=True,
        )
    )
    db.commit()


def _active_member(
    db,
    *,
    org: Organization,
    email: str,
    card_no: int,
    consent: bool,
) -> Member:
    member = Member(
        org_id=org.id,
        first_name="Mario",
        last_name="Rossi",
        email=email,
        status=MemberStatus.ACTIVE,
        card_no=card_no,
        card_year=datetime.utcnow().year,
        joined_at=datetime.utcnow(),
        marketing_email_consent=consent,
        marketing_email_consent_at=datetime.utcnow() if consent else None,
        marketing_email_consent_version=MARKETING_NOTICE_VERSION if consent else None,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def test_ordinary_auto_approved_signup_defaults_marketing_off_and_keeps_card_flow(
    client,
    db,
):
    client.cookies.clear()
    org = _create_org(db, auto_approve=True)
    _add_available_batch(db, org)
    email = f"auto-off-{uuid.uuid4().hex[:8]}@example.com"

    response = client.post(
        f"/api/join/{org.slug}/submit",
        data=build_join_submit_data(email=email),
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "issued"
    assert payload["card_verification_url"]
    assert payload["active_card_page_url"]
    member = db.query(Member).filter(Member.org_id == org.id, Member.email == email).one()
    assert member.status == MemberStatus.ACTIVE
    assert member.card_no is not None
    assert member.marketing_email_consent is False
    assert member.marketing_email_consent_at is None
    assert member.accepted_privacy_version == org.privacy_version
    assert member.accepted_privacy_notice_version == PRIVACY_NOTICE_VERSION
    assert member.accepted_privacy_notice_sha256 == PRIVACY_NOTICE_SHA256
    subject_ref = marketing_subject_reference(org_id=org.id, member_id=member.id)
    assert (
        db.query(MarketingConsentEvent)
        .filter(MarketingConsentEvent.subject_ref_hash == subject_ref)
        .count()
        == 0
    )
    assert (
        db.query(EmailOutbox)
        .filter(
            EmailOutbox.to_email == email,
            EmailOutbox.email_type == "member_card_active",
        )
        .count()
        == 1
    )


def test_explicit_grant_is_minimized_and_cannot_opt_in_an_unproven_existing_member(
    client,
    db,
):
    client.cookies.clear()
    org = _create_org(db)
    email = f"grant-{uuid.uuid4().hex[:8]}@example.com"
    signup = build_join_submit_data(email=email)
    signup["marketing_email_consent"] = "true"
    response = client.post(f"/api/join/{org.slug}/submit", data=signup)

    assert response.status_code == 200, response.text
    member = db.query(Member).filter(Member.org_id == org.id, Member.email == email).one()
    assert member.marketing_email_consent is True
    assert member.marketing_email_consent_at is not None
    assert member.marketing_email_consent_version == MARKETING_NOTICE_VERSION
    event = (
        db.query(MarketingConsentEvent)
        .filter(
            MarketingConsentEvent.subject_ref_hash
            == marketing_subject_reference(org_id=org.id, member_id=member.id)
        )
        .one()
    )
    assert event.event_action == MARKETING_ACTION_GRANTED
    assert len(event.email_hash) == 64
    assert len(event.ip_hash) == 64
    assert len(event.user_agent_hash) == 64
    stored_proof = " ".join(
        str(getattr(event, field) or "")
        for field in (
            "subject_ref_hash",
            "email_hash",
            "ip_hash",
            "user_agent_hash",
            "source",
        )
    ).lower()
    assert email.lower() not in stored_proof
    assert "testclient" not in stored_proof

    retry_email = f"existing-{uuid.uuid4().hex[:8]}@example.com"
    retry_payload = build_join_submit_data(email=retry_email)
    existing = Member(
        org_id=org.id,
        first_name="Existing",
        last_name="Pending",
        email=retry_email,
        phone=retry_payload["phone"],
        fiscal_code=retry_payload["fiscal_code"],
        status=MemberStatus.PENDING_DOCS,
        marketing_email_consent=False,
    )
    db.add(existing)
    db.commit()
    db.refresh(existing)
    retry_payload["marketing_email_consent"] = "true"

    retry = client.post(f"/api/join/{org.slug}/submit", data=retry_payload)

    assert retry.status_code == 409, retry.text
    assert retry.json()["detail"] == "Esiste già una iscrizione associata a questi dati."
    db.refresh(existing)
    assert existing.marketing_email_consent is False
    retry_subject_ref = marketing_subject_reference(org_id=org.id, member_id=existing.id)
    assert (
        db.query(MarketingConsentEvent)
        .filter(MarketingConsentEvent.subject_ref_hash == retry_subject_ref)
        .count()
        == 0
    )

    rejected_email = f"privacy-required-{uuid.uuid4().hex[:8]}@example.com"
    rejected_payload = build_join_submit_data(
        email=rejected_email,
        accept_privacy="false",
    )
    rejected_payload["marketing_email_consent"] = "true"
    rejected = client.post(f"/api/join/{org.slug}/submit", data=rejected_payload)
    assert rejected.status_code == 400
    assert db.query(Member).filter(Member.email == rejected_email).count() == 0

def test_paid_signup_persists_explicit_consent_without_changing_checkout_status(
    client,
    db,
    monkeypatch,
):
    client.cookies.clear()
    org = _create_org(db, sumup=True)
    monkeypatch.setattr(
        "app.routes.membership_payments.create_sumup_hosted_checkout",
        lambda **kwargs: {
            "id": f"checkout-{uuid.uuid4().hex[:8]}",
            "hosted_checkout_url": "https://sumup.example/marketing-consent",
        },
    )
    email = f"paid-{uuid.uuid4().hex[:8]}@example.com"
    signup = build_join_submit_data(email=email)
    signup["password"] = "CheckoutPass123!"
    signup["marketing_email_consent"] = "true"

    checkout = client.post(
        f"/api/public/orgs/{org.slug}/membership-payment/create-checkout",
        data=signup,
    )

    assert checkout.status_code == 200, checkout.text
    assert checkout.json()["hosted_checkout_url"] == "https://sumup.example/marketing-consent"
    payment_id = checkout.json()["payment_id"]
    payment = db.query(MembershipPayment).filter(MembershipPayment.id == payment_id).one()
    member = db.query(Member).filter(Member.id == payment.socio_id).one()
    assert payment.status == MembershipPaymentStatus.PENDING.value
    assert member.card_no is None
    assert member.marketing_email_consent is True
    assert member.marketing_email_consent_version == MARKETING_NOTICE_VERSION
    assert member.accepted_privacy_notice_version == PRIVACY_NOTICE_VERSION
    assert member.accepted_privacy_notice_sha256 == PRIVACY_NOTICE_SHA256
    status = client.get(f"/api/public/membership-payments/{payment_id}/status")
    assert status.status_code == 200, status.text
    assert status.json()["payment_status"] == MembershipPaymentStatus.PENDING.value

    rejected_email = f"paid-privacy-required-{uuid.uuid4().hex[:8]}@example.com"
    rejected_signup = build_join_submit_data(
        email=rejected_email,
        accept_privacy="false",
    )
    rejected_signup["password"] = "CheckoutPass123!"
    rejected_signup["marketing_email_consent"] = "true"
    rejected = client.post(
        f"/api/public/orgs/{org.slug}/membership-payment/create-checkout",
        data=rejected_signup,
    )
    assert rejected.status_code == 400
    assert db.query(Member).filter(Member.email == rejected_email).count() == 0

    existing_email = f"paid-existing-{uuid.uuid4().hex[:8]}@example.com"
    existing_signup = build_join_submit_data(
        first_name="Luigi",
        last_name="Bianchi",
        birth_date=date(1985, 2, 2),
        email=existing_email,
    )
    existing_member = Member(
        org_id=org.id,
        first_name="Luigi",
        last_name="Bianchi",
        email=existing_email,
        phone=existing_signup["phone"],
        fiscal_code=existing_signup["fiscal_code"],
        status=MemberStatus.PENDING_DOCS,
        marketing_email_consent=False,
    )
    db.add(existing_member)
    db.commit()
    db.refresh(existing_member)
    existing_signup["password"] = "CheckoutPass123!"
    existing_signup["marketing_email_consent"] = "true"
    existing_checkout = client.post(
        f"/api/public/orgs/{org.slug}/membership-payment/create-checkout",
        data=existing_signup,
    )
    assert existing_checkout.status_code == 200, existing_checkout.text
    db.refresh(existing_member)
    assert existing_member.marketing_email_consent is False
    assert (
        db.query(MarketingConsentEvent)
        .filter(
            MarketingConsentEvent.subject_ref_hash
            == marketing_subject_reference(
                org_id=org.id,
                member_id=existing_member.id,
            )
        )
        .count()
        == 0
    )


def test_campaign_filters_all_and_selected_adds_unsubscribe_and_suppresses_after_revoke(
    client,
    db,
):
    client.cookies.clear()
    original_email_mode = settings.EMAIL_MODE
    settings.EMAIL_MODE = "test"
    clear_captured_emails()
    try:
        org = _create_org(db, communications_enabled=True)
        base_card = int(db.query(func.max(Member.card_no)).scalar() or 70000) + 100
        allowed = _active_member(
            db,
            org=org,
            email=f"allowed-{uuid.uuid4().hex[:8]}@example.com",
            card_no=base_card,
            consent=True,
        )
        denied = _active_member(
            db,
            org=org,
            email=f"denied-{uuid.uuid4().hex[:8]}@example.com",
            card_no=base_card + 1,
            consent=False,
        )

        all_recipients = resolve_audience_recipients(
            db,
            association_id=org.id,
            audience_type=AUDIENCE_ALL_ACTIVE,
        )
        assert [item.member.id for item in all_recipients] == [allowed.id]
        selected_recipients = resolve_selected_member_recipients(
            db,
            association_id=org.id,
            member_ids=[allowed.id, denied.id],
        )
        assert [item.member.id for item in selected_recipients] == [allowed.id]

        campaign = EmailCampaign(
            association_id=org.id,
            template_type="newsletter",
            subject="Comunicazione promozionale",
            body_html="<html><body><p>Novità</p></body></html>",
            body_text="Novità",
            audience_type=AUDIENCE_ALL_ACTIVE,
            recipient_mode=RECIPIENT_MODE_SELECTED_MEMBERS,
            selected_member_ids_json=serialize_selected_member_ids(
                [allowed.id, denied.id]
            ),
            status="draft",
        )
        db.add(campaign)
        db.flush()
        _campaign, count = send_campaign(db, campaign=campaign, organization=org)
        db.commit()
        assert count == 1

        outbox = (
            db.query(EmailOutbox)
            .filter(EmailOutbox.email_type == "association_campaign")
            .one()
        )
        meta = outbox.payload_json["meta"]
        assert meta["member_id"] == allowed.id
        assert meta["communication_purpose"] == "promotional"
        assert meta["campaign_template_type"] == "newsletter"
        text_body = outbox.payload_json["text_body"]
        html_body = outbox.payload_json["html_body"]
        match = re.search(
            r"http://localhost:8000/email-preferences/unsubscribe/[A-Za-z0-9._-]+",
            text_body,
        )
        assert match is not None
        unsubscribe_path = urlsplit(match.group(0)).path
        assert "Disattiva le email promozionali" in html_body
        assert html_body.index("Disattiva le email promozionali") < html_body.lower().rfind("</body>")

        confirmation = client.get(unsubscribe_path)
        assert confirmation.status_code == 200, confirmation.text
        tampered = client.get(f"{unsubscribe_path[:-1]}x")
        assert tampered.status_code == 400
        db.refresh(allowed)
        assert allowed.marketing_email_consent is True

        revoked = client.post(unsubscribe_path)
        assert revoked.status_code == 200, revoked.text
        assert "Email promozionali disattivate" in revoked.text
        db.expire_all()
        allowed = db.query(Member).filter(Member.id == allowed.id).one()
        assert allowed.marketing_email_consent is False
        assert allowed.marketing_email_consent_withdrawn_at is not None
        assert (
            db.query(MarketingConsentEvent)
            .filter(
                MarketingConsentEvent.subject_ref_hash
                == marketing_subject_reference(org_id=org.id, member_id=allowed.id),
                MarketingConsentEvent.event_action == MARKETING_ACTION_REVOKED,
            )
            .count()
            == 1
        )

        delivery = process_outbox_once(limit=10)
        assert delivery["sent"] == 0
        assert delivery["suppressed"] == 1
        assert get_captured_emails() == []
        db.expire_all()
        outbox = db.query(EmailOutbox).filter(EmailOutbox.id == outbox.id).one()
        assert outbox.status == EmailOutboxStatus.SUPPRESSED.value
        assert outbox.last_error == "marketing_consent_withdrawn"
        recipient = (
            db.query(EmailCampaignRecipient)
            .filter(EmailCampaignRecipient.campaign_id == campaign.id)
            .one()
        )
        assert recipient.delivery_status == "failed"

        # Service/transactional messages are purpose-distinct and remain deliverable.
        enqueue_email(
            db,
            email_type="manual_review_received",
            to_email=denied.email,
            subject="Richiesta ricevuta",
            payload=build_email_payload(
                text_body="La tua richiesta è stata ricevuta.",
                sender=build_sender_payload(mode="association", association=org),
                meta={"member_id": denied.id},
            ),
            priority=5,
        )
        db.commit()
        transactional_delivery = process_outbox_once(limit=10)
        assert transactional_delivery["sent"] == 1
        assert transactional_delivery["suppressed"] == 0
        assert [item["to"] for item in get_captured_emails()] == [denied.email]

        assert (
            resolve_audience_recipients(
                db,
                association_id=org.id,
                audience_type=AUDIENCE_ALL_ACTIVE,
            )
            == []
        )
    finally:
        settings.EMAIL_MODE = original_email_mode
        clear_captured_emails()


def test_service_campaign_and_legacy_queue_do_not_require_marketing_consent(
    db,
):
    original_email_mode = settings.EMAIL_MODE
    settings.EMAIL_MODE = "test"
    clear_captured_emails()
    try:
        org = _create_org(db, communications_enabled=True)
        card_no = int(db.query(func.max(Member.card_no)).scalar() or 71000) + 100
        member = _active_member(
            db,
            org=org,
            email=f"service-{uuid.uuid4().hex[:8]}@example.com",
            card_no=card_no,
            consent=False,
        )

        campaign = EmailCampaign(
            association_id=org.id,
            template_type="renewal_reminder",
            subject="Promemoria rinnovo tessera",
            body_html="<html><body><p>La tessera sta per scadere.</p></body></html>",
            body_text="La tessera sta per scadere.",
            audience_type=AUDIENCE_ALL_ACTIVE,
            recipient_mode=RECIPIENT_MODE_SELECTED_MEMBERS,
            selected_member_ids_json=serialize_selected_member_ids([member.id]),
            status="draft",
        )
        db.add(campaign)
        db.flush()
        _campaign, count = send_campaign(db, campaign=campaign, organization=org)
        db.commit()
        assert count == 1

        queued_service = (
            db.query(EmailOutbox)
            .filter(
                EmailOutbox.email_type == "association_campaign",
                EmailOutbox.dedupe_key == f"campaign:{campaign.id}:{member.email}",
            )
            .one()
        )
        assert queued_service.payload_json["meta"]["communication_purpose"] == "service"
        assert queued_service.payload_json["meta"]["campaign_template_type"] == "renewal_reminder"
        assert "Disattiva le email promozionali" not in queued_service.payload_json["text_body"]
        assert "Disattiva le email promozionali" not in queued_service.payload_json["html_body"]

        delivery = process_outbox_once(limit=10)
        assert delivery["sent"] == 1
        assert delivery["suppressed"] == 0
        assert [item["to"] for item in get_captured_emails()] == [member.email]

        # Compatibility for jobs queued before the purpose marker existed.
        clear_captured_emails()
        enqueue_email(
            db,
            email_type="association_campaign",
            to_email=member.email,
            subject="Avviso operativo legacy",
            payload=build_email_payload(
                text_body="Avviso di servizio.",
                sender=build_sender_payload(mode="association", association=org),
                meta={"member_id": member.id, "org_id": org.id},
            ),
            priority=4,
            dedupe_key=f"legacy-service:{org.id}:{member.id}",
        )
        db.commit()
        legacy_delivery = process_outbox_once(limit=10)
        assert legacy_delivery["sent"] == 1
        assert legacy_delivery["suppressed"] == 0
        assert [item["to"] for item in get_captured_emails()] == [member.email]
    finally:
        settings.EMAIL_MODE = original_email_mode
        clear_captured_emails()

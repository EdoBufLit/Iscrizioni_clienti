"""Audited paper imports preserve digital identities, stock and card history."""

from __future__ import annotations

import base64
from datetime import date, datetime
from decimal import Decimal
from io import BytesIO
import re
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import HTTPException
import pytest
from PIL import Image, ImageDraw
from reportlab.pdfgen import canvas
from starlette.requests import Request

from app.db import SessionLocal
from app.models import (AnnualMembershipTerm, CardBatch, EmailOutbox, Member, MemberDocument,
                        MemberPayment, MemberStatus, MembershipPayment, NumberingScope, Organization)
from app.security import get_password_hash
from app.services.annual_memberships import sync_annual_membership_term
from app.services.card_allocation import allocate_next_card
from app.services.card_availability import card_batch_availability, occupied_card_numbers
from app.services.card_verification import build_card_verification_token, parse_card_verification_token
from app.services.member_accounts import ensure_member_account


PERSONAL_PASSWORD = "PaperOwnerPersonal123!"
OTHER_PASSWORD = "OtherDigitalOwner123!"


@pytest.fixture
def paper_case(client):
    client.cookies.clear()
    suffix = uuid4().hex
    year = datetime.utcnow().year
    with SessionLocal() as db:
        scope = NumberingScope(name=f"paper-shared-{suffix}", scope_type="shared", is_system=False)
        db.add(scope)
        db.flush()
        golden = Organization(name=f"Golden digital {suffix}", slug=f"paper-golden-{suffix}", is_active=True,
                              numbering_scope_id=scope.id, membership_fee_amount=Decimal("25"))
        frutta = Organization(name=f"Frutta paper {suffix}", slug=f"paper-frutta-{suffix}", is_active=True,
                              numbering_scope_id=scope.id, membership_fee_amount=Decimal("35"))
        db.add_all([golden, frutta])
        db.flush()
        golden_lot = CardBatch(org_id=golden.id, numbering_scope_id=scope.id, year=year,
                               start_no=27630, end_no=28700, next_no=28701)
        frutta_lot = CardBatch(org_id=frutta.id, numbering_scope_id=scope.id, year=year,
                               start_no=28696, end_no=28710, next_no=28711)
        db.add_all([golden_lot, frutta_lot])
        db.flush()
        owner = Member(org_id=golden.id, first_name="Socio", last_name="Prova",
                       email=f"paper-owner-{suffix}@example.com", password_hash=get_password_hash(PERSONAL_PASSWORD),
                       card_no=27635, card_year=year, status=MemberStatus.ACTIVE, membership_type="annual",
                       numbering_scope_id=scope.id, batch_id=golden_lot.id, joined_at=datetime(year, 1, 5))
        other = Member(org_id=golden.id, first_name="Altro", last_name="Titolare",
                       email=f"paper-other-{suffix}@example.com", password_hash=get_password_hash(OTHER_PASSWORD),
                       card_no=28696, card_year=year, status=MemberStatus.ACTIVE, membership_type="annual",
                       numbering_scope_id=scope.id, batch_id=golden_lot.id, joined_at=datetime(year, 1, 5))
        db.add_all([owner, other])
        db.flush()
        account = ensure_member_account(db, owner)
        sync_annual_membership_term(db, owner, source="synthetic-digital")
        sync_annual_membership_term(db, other, source="synthetic-digital")
        db.commit()
        data = {"owner_id": owner.id, "other_id": other.id, "account_id": account.id,
                "golden_id": golden.id, "frutta_id": frutta.id, "frutta_slug": frutta.slug,
                "golden_lot": golden_lot.id, "frutta_lot": frutta_lot.id, "scope_id": scope.id,
                "email": owner.email, "other_email": other.email, "year": year}
    yield data
    client.cookies.clear()


def _import(db, case, *, account_id=None):
    from app.models import MemberAccount
    from app.services.paper_card_exceptions import import_paper_card_exception

    return import_paper_card_exception(db, account=db.get(MemberAccount, account_id or case["account_id"]),
        org=db.get(Organization, case["frutta_id"]), card_number=28696, card_year=case["year"],
        first_name="Socio", last_name="Prova", email=case["email"],
        audit_reason="Eccezione cartacea autorizzata; dati sintetici di collaudo")


def _digital_snapshot(db, case):
    return [(member.id, member.org_id, member.card_no, member.card_year, member.numbering_scope_id,
             member.batch_id, member.email, member.joined_at, member.password_hash)
            for member in db.query(Member).filter(Member.id.in_([case["owner_id"], case["other_id"]])).order_by(Member.id)]


def _stock_snapshot(db, case):
    lots = [db.get(CardBatch, case[name]) for name in ("golden_lot", "frutta_lot")]
    return [(lot.id, lot.next_no, card_batch_availability(db, [lot])[lot.id]) for lot in lots]


def _proof_counts(db):
    return {model.__tablename__: db.query(model).count()
            for model in (EmailOutbox, MemberDocument, MemberPayment, MembershipPayment)}


def _login(client, email, password):
    client.cookies.clear()
    response = client.post("/api/auth/login", data={"email": email, "password": password})
    assert response.status_code == 200, response.text
    assert response.json().get("authenticated") is True, response.text


def test_trusted_paper_import_is_idempotent_and_does_not_change_digital_cards_stock_or_evidence(client, paper_case):
    from app.services.card_identity import card_number_label

    with SessionLocal() as db:
        digital_before = _digital_snapshot(db, paper_case)
        stock_before = _stock_snapshot(db, paper_case)
        evidence_before = _proof_counts(db)
        original_scope = db.get(Organization, paper_case["frutta_id"]).numbering_scope_id
        paper = _import(db, paper_case)
        db.commit()
        paper_id = paper.id
        assert paper.card_no == 28696
        assert paper.card_year == paper_case["year"]
        assert paper.card_namespace == "paper_exception"
        assert card_number_label(paper) == "28696*"
        assert paper.account_id == paper_case["account_id"]
        assert paper.batch_id is None and paper.numbering_scope_id is None
        assert paper.membership_fee_snapshot == Decimal("0")
        assert paper.accepted_statute_at is None and paper.accepted_privacy_at is None
        assert paper.marketing_email_consent is not True
        term = db.query(AnnualMembershipTerm).filter_by(member_id=paper.id, membership_year=paper_case["year"]).one()
        assert (term.card_no, term.card_namespace, term.fee_amount) == (28696, "paper_exception", Decimal("0"))
        assert term.batch_id is None and term.numbering_scope_id is None
        again = _import(db, paper_case)
        db.commit()
        assert again.id == paper_id
        assert db.query(AnnualMembershipTerm).filter_by(member_id=paper.id).count() == 1
        assert _digital_snapshot(db, paper_case) == digital_before
        assert _stock_snapshot(db, paper_case) == stock_before
        assert _proof_counts(db) == evidence_before
        assert db.get(Organization, paper_case["frutta_id"]).numbering_scope_id == original_scope


def test_paper_number_is_not_an_occupied_digital_number_or_a_stock_assignment(paper_case):
    with SessionLocal() as db:
        before = _stock_snapshot(db, paper_case)
        paper = _import(db, paper_case)
        db.commit()
        assert 28696 not in occupied_card_numbers(db, org_id=paper.org_id, scope_id=None,
                                                 start_no=28696, end_no=28710, year=paper_case["year"])
        assert _stock_snapshot(db, paper_case) == before
        # The genuine digital owner still protects the shared digital pool.
        assert 28696 in occupied_card_numbers(db, org_id=paper.org_id, scope_id=paper_case["scope_id"],
                                              start_no=28696, end_no=28710, year=paper_case["year"])


def test_paper_exception_can_coexist_with_a_future_digital_card_of_same_number_and_club(paper_case):
    with SessionLocal() as db:
        paper = _import(db, paper_case)
        # Remove the independent shared-pool collision in this synthetic
        # scenario: only the paper card now carries 28696 in this pool.
        other = db.get(Member, paper_case["other_id"])
        other.card_no = 28697
        sync_annual_membership_term(db, other)
        db.commit()
        allocation = allocate_next_card(db, paper_case["frutta_id"], paper_case["year"])
        assert allocation.card_no == 28696
        digital = Member(org_id=paper_case["frutta_id"], first_name="Futuro", last_name="Digitale",
                         email=f"future-{uuid4().hex}@example.com", status=MemberStatus.ACTIVE,
                         membership_type="annual", card_no=allocation.card_no, card_year=allocation.year,
                         card_namespace="digital", batch_id=allocation.batch_id,
                         numbering_scope_id=allocation.numbering_scope_id, joined_at=datetime.utcnow())
        db.add(digital)
        db.flush()
        sync_annual_membership_term(db, digital)
        db.commit()
        assert digital.id != paper.id
        assert db.query(Member).filter(Member.org_id == paper.org_id, Member.card_no == 28696).count() == 2
        assert db.query(AnnualMembershipTerm).filter(AnnualMembershipTerm.org_id == paper.org_id,
                                                   AnnualMembershipTerm.card_no == 28696).count() == 2
        assert card_batch_availability(db, [db.get(CardBatch, paper_case["frutta_lot"])])[paper_case["frutta_lot"]].assigned == 2


def test_duplicate_paper_number_cannot_be_reassigned_to_another_account(paper_case):
    with SessionLocal() as db:
        paper = _import(db, paper_case)
        db.commit()
        other_account = ensure_member_account(db, db.get(Member, paper_case["other_id"]))
        db.commit()
        with pytest.raises(HTTPException) as failure:
            _import(db, paper_case, account_id=other_account.id)
        assert failure.value.status_code == 409
        db.rollback()
        assert db.get(Member, paper.id).account_id == paper_case["account_id"]


def test_paper_card_is_visible_separately_and_its_namespaced_qr_cannot_match_another_holder(client, paper_case):
    with SessionLocal() as db:
        paper = _import(db, paper_case)
        db.commit()
        paper_id = paper.id
        genuine = db.get(Member, paper_case["other_id"])
        digital_token = build_card_verification_token(genuine.id, genuine.org_id, genuine.card_no, genuine.card_year)
        assert "card_namespace" not in parse_card_verification_token(digital_token)
    _login(client, paper_case["email"], PERSONAL_PASSWORD)
    cards = client.get("/api/member/cards")
    assert cards.status_code == 200, cards.text
    assert {item["id"] for item in cards.json()["items"]} == {paper_case["owner_id"], paper_id}
    paper_item = next(item for item in cards.json()["items"] if item["id"] == paper_id)
    assert (paper_item["card_no"], paper_item["card_namespace"], paper_item["card_number_label"]) == (28696, "paper_exception", "28696*")
    paper_token = urlsplit(paper_item["card_verification_url"]).path.rsplit("/", 1)[-1]
    paper_payload = parse_card_verification_token(paper_token)
    assert paper_payload["card_namespace"] == "paper_exception"
    assert paper_payload["member_id"] == paper_id
    for token, expected_first_name in ((paper_token, "Socio"), (digital_token, "Altro")):
        result = client.get(f"/api/cards/verify/{token}?format=json")
        assert result.status_code == 200, result.text
        assert result.json()["valid"] is True
        assert result.json()["card"]["number"] == 28696
        assert result.json()["member"]["first_name"] == expected_first_name
        if token == paper_token:
            assert result.json()["payment"] == {"status": "not_required", "is_paid": False, "label": "Nessun nuovo addebito"}
    display = client.get(f"/api/cards/verify/{paper_token}", headers={"Accept": "text/html"})
    assert display.status_code == 200, display.text
    assert "28696*" in display.text


def test_forged_digital_v1_token_for_paper_membership_is_not_valid(client, paper_case):
    with SessionLocal() as db:
        paper = _import(db, paper_case)
        db.commit()
        digital_token = build_card_verification_token(paper.id, paper.org_id, paper.card_no, paper.card_year)
    response = client.get(f"/api/cards/verify/{digital_token}?format=json")
    assert response.status_code in (200, 404)
    if response.status_code == 200:
        assert response.json()["valid"] is False


def test_digital_renewal_replaces_current_namespace_but_preserves_old_paper_snapshot(client, paper_case, monkeypatch):
    from app.services.card_identity import card_number_label
    from app.services.card_verification import resolve_card_verification_membership
    from app.services.renewals import promote_renewal_term

    with SessionLocal() as db:
        paper = _import(db, paper_case)
        db.commit()
        old = db.query(AnnualMembershipTerm).filter_by(member_id=paper.id).one()
        year = paper_case["year"] + 1
        renewed = AnnualMembershipTerm(member_id=paper.id, org_id=paper.org_id, membership_year=year,
                                      starts_on=date(year, 1, 1), valid_through=date(year + 1, 1, 1),
                                      card_no=39001, card_year=year, card_namespace="digital", status="scheduled",
                                      fee_amount=Decimal("35"), currency="EUR", source="member_renewal")
        db.add(renewed)
        db.commit()
        assert promote_renewal_term(db, term=renewed, now=datetime(year, 1, 2, 12)) is True
        db.commit()
        assert (paper.card_no, paper.card_namespace, card_number_label(paper)) == (39001, "digital", "39001")
        assert (old.card_no, old.card_namespace, card_number_label(old)) == (28696, "paper_exception", "28696*")
        payload = {"member_id": paper.id, "org_id": paper.org_id, "card_number": 28696,
                   "card_year": paper_case["year"], "card_namespace": "paper_exception"}
        resolved, snapshot, reason = resolve_card_verification_membership(db, payload=payload,
                                                checked_at=datetime(year, 1, 2, 12))
        assert resolved.id == paper.id and snapshot.id == old.id
        assert reason == "expired"
        imported_again = _import(db, paper_case)
        assert imported_again.id == paper.id
        assert (imported_again.card_no, imported_again.card_namespace) == (39001, "digital")
        # A payment recorded for the new digital card cannot attest payment
        # of the older paper reference when its historical QR is checked.
        paper.payment_status = "manual_completed"
        paper.card_is_paid = True
        db.commit()
        old_token = build_card_verification_token(paper.id, paper.org_id, 28696, paper_case["year"],
                                                  card_namespace="paper_exception")
    from app.routes import public as public_routes

    class RenewedDateTime(datetime):
        @classmethod
        def utcnow(cls):
            return datetime(year, 1, 2, 12)

    monkeypatch.setattr(public_routes, "datetime", RenewedDateTime)
    response = client.get(f"/api/cards/verify/{old_token}?format=json")
    assert response.status_code == 200, response.text
    assert response.json()["valid"] is False
    assert response.json()["reason"] == "expired"
    assert response.json()["card"]["number_label"] == "28696*"
    assert response.json()["payment"] == {"status": "not_required", "is_paid": False, "label": "Nessun nuovo addebito"}


def test_deleted_paper_exception_never_rewinds_a_digital_lot(paper_case):
    from app.services.member_cleanup import cleanup_deleted_member_traces

    with SessionLocal() as db:
        paper = _import(db, paper_case)
        db.commit()
        before = {identifier: db.get(CardBatch, identifier).next_no for identifier in (paper_case["golden_lot"], paper_case["frutta_lot"])}
        paper.deleted_at = datetime.utcnow()
        db.commit()
        cleanup_deleted_member_traces(db, org_id=paper.org_id, email=paper.email)
        db.commit()
        assert {identifier: db.get(CardBatch, identifier).next_no for identifier in before} == before


def test_paper_wallet_uses_separate_existing_member_identity_and_explicit_label(paper_case, monkeypatch):
    from app.services import google_wallet

    monkeypatch.setattr(google_wallet, "_build_backend_base_url", lambda: "https://cards.example.test")
    monkeypatch.setattr(google_wallet, "_build_frontend_base_url", lambda: "https://cards.example.test")
    monkeypatch.setattr(google_wallet, "_require_google_wallet_issuer_id", lambda: "123456789")
    with SessionLocal() as db:
        genuine = db.get(Member, paper_case["other_id"])
        digital_identity = google_wallet._build_wallet_ids(issuer_id="123456789", member=genuine)
        paper = _import(db, paper_case)
        db.commit()
        paper_identity = google_wallet._build_wallet_ids(issuer_id="123456789", member=paper)
        assert paper_identity != digital_identity
        assert google_wallet._build_wallet_ids(issuer_id="123456789", member=genuine) == digital_identity
        payload = google_wallet._build_generic_object_payload(member=paper,
                                      class_id=paper_identity[0], object_id=paper_identity[1])
        assert payload["id"] == paper_identity[1]
        assert payload["barcode"]["alternateText"] == "Tessera n. 28696*"
        token = urlsplit(payload["barcode"]["value"]).path.rsplit("/", 1)[-1]
        assert parse_card_verification_token(token)["card_namespace"] == "paper_exception"


def test_org_and_super_admin_show_paper_label_without_changing_the_numeric_identifier(paper_case, monkeypatch):
    from app.models import AdminRole, AdminUser
    from app.routes import org_admin, super_admin

    request = Request({"type": "http", "method": "GET", "path": "/synthetic-members", "scheme": "https",
                       "server": ("qa.example.test", 443), "headers": [], "session": {}})
    with SessionLocal() as db:
        paper = _import(db, paper_case)
        admin = AdminUser(org_id=paper_case["frutta_id"], email=f"paper-admin-{uuid4().hex}@example.com",
                          role=AdminRole.ORG_ADMIN, is_active=True, password_hash="synthetic")
        db.add(admin)
        db.commit()
        monkeypatch.setattr(org_admin, "_get_current_org_admin", lambda *args: admin)
        monkeypatch.setattr(super_admin, "_require_super_admin", lambda *args: None)
        org_profile = org_admin.get_member_detail(request=request, member_id=paper.id, db=db)
        super_profile = super_admin.super_admin_member_detail(request=request, member_id=paper.id, db=db)
        for result in (org_profile, super_profile):
            assert result["card_no"] == 28696
            assert result["card_namespace"] == "paper_exception"
            assert result["card_number_label"] == "28696*"
        with pytest.raises(HTTPException) as denied:
            org_admin.get_member_detail(request=request, member_id=paper_case["other_id"], db=db)
        assert denied.value.status_code == 404


def test_real_paper_png_and_pdf_render_the_starred_reference_and_remain_downloadable(client, paper_case, monkeypatch):
    png_text = []
    pdf_text = []
    pdf_images = []
    original_image_text = ImageDraw.ImageDraw.text
    original_pdf_text = canvas.Canvas.drawString
    original_pdf_image = canvas.Canvas.drawImage

    def record_image_text(self, xy, text, *args, **kwargs):
        png_text.append(str(text))
        return original_image_text(self, xy, text, *args, **kwargs)

    def record_pdf_text(self, x, y, text, *args, **kwargs):
        pdf_text.append(str(text))
        return original_pdf_text(self, x, y, text, *args, **kwargs)

    def record_pdf_image(self, image, *args, **kwargs):
        pdf_images.append(image)
        return original_pdf_image(self, image, *args, **kwargs)

    # These spies delegate to the real Pillow/ReportLab renderer. The endpoint
    # must return a valid artifact and actually draw the paper reference.
    monkeypatch.setattr(ImageDraw.ImageDraw, "text", record_image_text)
    monkeypatch.setattr(canvas.Canvas, "drawString", record_pdf_text)
    monkeypatch.setattr(canvas.Canvas, "drawImage", record_pdf_image)
    with SessionLocal() as db:
        paper = _import(db, paper_case)
        db.commit()
        token = build_card_verification_token(paper.id, paper.org_id, paper.card_no, paper.card_year,
                                              card_namespace="paper_exception")
    image_response = client.get(f"/api/cards/{token}/image.png")
    assert image_response.status_code == 200, image_response.text
    assert image_response.headers["content-type"].startswith("image/png")
    image = Image.open(BytesIO(image_response.content))
    assert image.size == (856, 540)
    image.verify()
    assert "28696*" in png_text
    png_text.clear()
    pdf_response = client.get(f"/api/cards/{token}/download.pdf")
    assert pdf_response.status_code == 200, pdf_response.text
    assert pdf_response.headers["content-type"].startswith("application/pdf")
    assert pdf_response.content.startswith(b"%PDF-")
    assert len(re.findall(rb"/Type /Page\b", pdf_response.content)) == 2
    # Standard PDFs embed their freshly rendered PNG faces; legacy designs
    # draw native PDF text. Either path must actually render the starred label.
    assert "28696*" in pdf_text or ("28696*" in png_text and len(pdf_images) == 2)


def test_explicit_paper_email_payload_uses_real_inline_png_and_namespaced_qr_without_sending(paper_case):
    from app.services.member_card_delivery import queue_member_card_email

    request = Request({"type": "http", "method": "POST", "path": "/synthetic-send", "scheme": "https",
                       "server": ("qa.example.test", 443), "headers": [], "session": {}})
    with SessionLocal() as db:
        paper = _import(db, paper_case)
        db.commit()
        assert db.query(EmailOutbox).filter(EmailOutbox.to_email == paper.email).count() == 0
        result = queue_member_card_email(db, request, paper.id)
        assert result["queued"] is True and result["sent"] is False
        message = db.get(EmailOutbox, result["outbox_id"])
        assert "28696*" in message.payload_json["text_body"]
        token = re.search(r"/api/cards/verify/([A-Za-z0-9_.-]+)", message.payload_json["text_body"]).group(1)
        assert parse_card_verification_token(token)["card_namespace"] == "paper_exception"
        images = {item["cid"]: item for item in message.payload_json["inline_images"]}
        inline_card = Image.open(BytesIO(base64.b64decode(images["card_front@assonam"]["data_b64"])))
        assert inline_card.size == (856, 540)
        inline_card.verify()
        assert images["card_verification_qr@assonam"]["content_type"] == "image/png"

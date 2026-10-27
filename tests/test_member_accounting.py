from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from decimal import Decimal
import uuid

import pytest
from fastapi import HTTPException, Request
from sqlalchemy import event

from app.db import SessionLocal, engine
from app.main import app
from app.models import (
    AccountingAllocation, AccountingEvent, AccountingReceipt, AdminRole, AdminUser,
    AnnualMembershipTerm, CardBatch, Member, MemberPayment, MemberStatus,
    MembershipPayment, OperationLog, Organization, OrgAdminToken,
    TemporaryMembershipPurchase,
)
from app.services.annual_memberships import as_rome_datetime
from app.services.member_accounting import member_year_balance
from app.utils import hash_token

PREFIX = "/api/org-admin/accounting"


@pytest.fixture
def accounting(client):
    def explain_database_failure(context):
        print("Synthetic accounting database diagnostic:", context.original_exception)
    event.listen(engine, "handle_error", explain_database_failure)
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:10]
    org = Organization(name="Incassi locale", slug=f"receipts-{suffix}", is_active=True,
                       membership_fee_amount=Decimal("30.00"), membership_fee_currency="EUR",
                       require_membership_document=False, auto_approve_signup=True)
    db.add(org)
    db.flush()
    admin = AdminUser(email=f"receipts-admin-{suffix}@example.com", org_id=org.id,
                      role=AdminRole.ORG_ADMIN, is_active=True)
    db.add(admin)
    db.flush()
    raw = uuid.uuid4().hex
    db.add(OrgAdminToken(admin_id=admin.id, token_hash=hash_token(raw),
                         expires_at=datetime.utcnow() + timedelta(minutes=15)))
    db.commit()
    assert client.get(f"/api/org-admin/auth/verify?token={raw}", follow_redirects=False).status_code in (302, 303)
    yield db, org, admin
    db.close()
    event.remove(engine, "handle_error", explain_database_failure)


def make_member(db, org, *, card=True, **changes):
    data = dict(org_id=org.id, first_name="Socio", last_name=uuid.uuid4().hex[:8],
                email=f"receipt-{uuid.uuid4().hex[:10]}@example.com", status=MemberStatus.ACTIVE,
                membership_type="annual", membership_fee_snapshot=Decimal("30.00"),
                card_year=as_rome_datetime().year, joined_at=datetime.utcnow(),
                decision_at=datetime.utcnow(), valid_until=datetime.utcnow() + timedelta(days=100))
    data.update(changes)
    member = Member(**data)
    db.add(member)
    db.flush()
    if card:
        member.card_no = 900000 + member.id
    db.commit()
    return member


def receipt(client, amount=3000, **changes):
    body = dict(request_key=uuid.uuid4().hex, amount_cents=amount, currency="EUR",
                method="bank_transfer", paid_on=as_rome_datetime().date().isoformat(),
                payer="Versamento locale", reference=uuid.uuid4().hex)
    body.update(changes)
    response = client.post(f"{PREFIX}/receipts", json=body)
    assert response.status_code == 200, response.text
    return response.json(), body


def target(member, year=None):
    return f"initial:{member.id}:{year or as_rome_datetime().year}"


def allocate(client, detail, items, *, key=None):
    body = dict(request_key=key or uuid.uuid4().hex, expected_version=detail["receipt"]["version"],
                items=[dict(target_key=key, amount_cents=cents) for key, cents in items])
    return client.post(f"{PREFIX}/receipts/{detail['receipt']['id']}/allocations", json=body)


def paid_payment(db, org, member, *, source="manual", amount=30, **changes):
    data = dict(org_id=org.id, socio_id=member.id, membership_year=as_rome_datetime().year,
                payment_kind="initial", source=source, provider="none" if source == "manual" else "sumup",
                amount=Decimal(str(amount)), currency="EUR",
                status="manual_completed" if source == "manual" else "completed",
                confirmed_at=datetime.utcnow(), created_at=datetime.utcnow())
    data.update(changes)
    payment = MembershipPayment(**data)
    db.add(payment)
    db.commit()
    return payment


def sync(client):
    response = client.post(f"{PREFIX}/receipts/sync", json={"request_key": uuid.uuid4().hex})
    assert response.status_code == 200, response.text
    return response.json()


def test_receipt_create_idempotent_and_payload_bound(client, accounting):
    db, org, admin = accounting
    detail, body = receipt(client)
    assert client.post(f"{PREFIX}/receipts", json=body).json() == detail
    assert client.post(f"{PREFIX}/receipts", json={**body, "amount_cents": 4000}).status_code == 409
    assert db.query(AccountingReceipt).filter_by(org_id=org.id).count() == 1
    record = db.query(AccountingEvent).filter_by(receipt_id=detail["receipt"]["id"]).one()
    assert record.action == "created" and record.actor_admin_id == admin.id
    assert record.after_json["receipt"]["amount_cents"] == 3000


def test_sixty_euro_allocates_two_members_and_preserves_cards(client, accounting):
    db, org, _ = accounting
    members = [make_member(db, org) for _ in range(2)]
    cards = [(member.card_no, member.valid_until) for member in members]
    detail, _ = receipt(client, 6000)
    key = uuid.uuid4().hex
    response = allocate(client, detail, [(target(member), 3000) for member in members], key=key)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["receipt"]["status"] == "matched" and result["receipt"]["unallocated_cents"] == 0
    assert len(result["allocations"]) == 2
    assert allocate(client, detail, [(target(member), 3000) for member in members], key=key).json() == result
    db.expire_all()
    for index, member in enumerate(members):
        assert member_year_balance(db, member=member, year=as_rome_datetime().year)["outstanding_cents"] == 0
        assert (member.card_no, member.valid_until) == cards[index]
    assert db.query(MembershipPayment).filter_by(org_id=org.id).count() == 2
    assert db.query(MemberPayment).filter_by(org_id=org.id).count() == 2


def test_partial_receipts_complete_once_and_legacy_endpoint_is_blocked(client, accounting):
    db, org, _ = accounting
    member = make_member(db, org)
    first, _ = receipt(client, 1000)
    result = allocate(client, first, [(target(member), 1000)])
    assert result.status_code == 200, result.text
    db.expire_all()
    assert member.payment_status == "manual_partial" and not member.card_is_paid
    assert db.query(MembershipPayment).filter_by(socio_id=member.id).count() == 0
    assert member_year_balance(db, member=member, year=as_rome_datetime().year)["outstanding_cents"] == 2000
    rejected = client.post(f"/api/org-admin/members/{member.id}/payments/manual", json={
        "amount": 30, "method": "contanti", "paid_at": as_rome_datetime().date().isoformat(),
    })
    assert rejected.status_code == 409, rejected.text
    second, _ = receipt(client, 2000)
    result = allocate(client, second, [(target(member), 2000)])
    assert result.status_code == 200, result.text
    db.expire_all()
    assert member.card_is_paid and member.payment_status == "manual_completed"
    payment = db.query(MembershipPayment).filter_by(socio_id=member.id).one()
    assert payment.amount == Decimal("30.00")
    assert db.query(MemberPayment).filter_by(membership_payment_id=payment.id).one().amount_cents == 3000
    assert sync(client)["created"] == 0  # projections are not imported again as real money
    listing = client.get("/api/org-admin/members?status=all").json()
    assert next(item for item in listing["items"] if item["id"] == member.id)["is_paid"] is True


def test_reverse_reopens_balance_without_revoking_and_new_receipt_can_settle(client, accounting):
    db, org, _ = accounting
    member = make_member(db, org)
    original_card = member.card_no
    detail, _ = receipt(client)
    first = allocate(client, detail, [(target(member), 3000)]).json()
    allocation = first["allocations"][0]
    response = client.post(f"{PREFIX}/receipts/{detail['receipt']['id']}/allocations/{allocation['id']}/reverse", json={
        "request_key": uuid.uuid4().hex, "expected_version": first["receipt"]["version"], "reason": "Abbinamento registrato per errore",
    })
    assert response.status_code == 200, response.text
    reversed_detail = response.json()
    assert reversed_detail["receipt"]["unallocated_cents"] == 3000
    db.expire_all()
    assert member.card_no == original_card and member.status == MemberStatus.ACTIVE
    assert member.payment_status == "manual_reversed" and not member.card_is_paid
    assert member_year_balance(db, member=member, year=as_rome_datetime().year)["outstanding_cents"] == 3000
    listing = client.get("/api/org-admin/members?status=all").json()
    assert next(item for item in listing["items"] if item["id"] == member.id)["is_paid"] is False
    other, _ = receipt(client)
    assert allocate(client, other, [(target(member), 3000)]).status_code == 200
    assert db.query(AccountingEvent).filter_by(receipt_id=detail["receipt"]["id"]).count() == 3


def test_adjustment_is_versioned_preserves_original_and_propagates_method(client, accounting):
    db, org, _ = accounting
    member = make_member(db, org)
    detail, _ = receipt(client, method="cash")
    matched = allocate(client, detail, [(target(member), 3000)]).json()
    response = client.post(f"{PREFIX}/receipts/{detail['receipt']['id']}/adjustments", json={
        "request_key": uuid.uuid4().hex, "expected_version": matched["receipt"]["version"],
        "reason": "Ricevuto via bonifico, non in contanti", "method": "bank_transfer", "payer": "Nome corretto",
    })
    assert response.status_code == 200, response.text
    corrected = response.json()
    assert corrected["receipt"]["method"] == "bank_transfer"
    assert corrected["events"][0]["after"]["receipt"]["method"] == "cash"
    assert corrected["events"][-1]["before"]["receipt"]["method"] == "cash"
    db.expire_all()
    assert db.query(MemberPayment).filter_by(member_id=member.id).one().method == "bank_transfer"
    for extra in ({"method": "other"}, {"amount_cents": 2999}):
        bad = client.post(f"{PREFIX}/receipts/{detail['receipt']['id']}/adjustments", json={
            "request_key": uuid.uuid4().hex, "expected_version": matched["receipt"]["version"],
            "reason": "Correzione obsoleta", **extra,
        })
        assert bad.status_code == 409
    assert client.post(f"{PREFIX}/receipts/{detail['receipt']['id']}/adjustments", json={
        "request_key": uuid.uuid4().hex, "expected_version": corrected["receipt"]["version"],
        "reason": "Importo inferiore al già abbinato", "amount_cents": 2999,
    }).status_code == 409


def test_void_receipt_keeps_history_and_zeroes_net_kpis(client, accounting):
    db, org, _ = accounting
    member = make_member(db, org)
    detail, _ = receipt(client)
    matched = allocate(client, detail, [(target(member), 3000)]).json()
    body = {"request_key": uuid.uuid4().hex, "expected_version": matched["receipt"]["version"], "reason": "Movimento inserito due volte"}
    response = client.post(f"{PREFIX}/receipts/{detail['receipt']['id']}/void", json=body)
    assert response.status_code == 200, response.text
    assert response.json()["receipt"]["status"] == "voided"
    assert response.json()["allocations"][0]["net_cents"] == 0
    assert client.post(f"{PREFIX}/receipts/{detail['receipt']['id']}/void", json=body).json() == response.json()
    kpis = client.get(f"{PREFIX}/receipts").json()["kpis"]
    assert kpis["total_cents"] == kpis["allocated_cents"] == kpis["unallocated_cents"] == 0
    assert kpis["unmatched_count"] == 0


def test_residual_kpi_includes_unmatched_and_partially_allocated_receipts(client, accounting):
    db, org, _ = accounting
    member = make_member(db, org)
    detail, _ = receipt(client, 6000)
    receipt(client, 1550)
    assert allocate(client, detail, [(target(member), 1000)]).status_code == 200
    data = client.get(f"{PREFIX}/receipts").json()
    assert data["kpis"] == {"total_cents": 7550, "allocated_cents": 1000,
                            "unallocated_cents": 6550, "unmatched_count": 2}
    assert {item["status"] for item in data["items"]} == {"unmatched", "partial"}


def test_target_tenant_guard_and_atomic_overallocation(client, accounting):
    db, org, _ = accounting
    member = make_member(db, org)
    other = Organization(name="Altro", slug=uuid.uuid4().hex, is_active=True)
    db.add(other)
    db.commit()
    alien = make_member(db, other)
    detail, _ = receipt(client, 6000)
    assert allocate(client, detail, [(target(member), 3000), (target(alien), 3000)]).status_code == 404
    assert allocate(client, detail, [(target(member), 3001)]).status_code == 409
    assert db.query(AccountingAllocation).filter_by(receipt_id=detail["receipt"]["id"]).count() == 0
    assert allocate(client, detail, [(target(member), 1500), (target(member), 1500)]).status_code == 422


def test_provider_evidence_is_readonly_and_sync_does_not_infer_unlinked_receipts(client, accounting, monkeypatch):
    db, org, _ = accounting
    member = make_member(db, org)
    payment = paid_payment(db, org, member, source="online")
    db.add(MemberPayment(org_id=org.id, member_id=member.id, amount_cents=1000, method="cash", paid_at=datetime.utcnow()))
    db.commit()
    monkeypatch.setattr("app.services.membership_payments._sumup_request", lambda **kwargs: pytest.fail("No provider request expected"))
    assert sync(client)["created"] == 1
    assert sync(client)["created"] == 0
    data = client.get(f"{PREFIX}/receipts").json()
    assert data["total"] == 1
    item = data["items"][0]
    assert item["source"] == "provider" and item["permissions"]["can_adjust"] is False
    for suffix, fields in (("adjustments", {"method": "cash"}), ("void", {})):
        response = client.post(f"{PREFIX}/receipts/{item['id']}/{suffix}", json={
            "request_key": uuid.uuid4().hex, "expected_version": item["version"], "reason": "Verifica pagamento online", **fields,
        })
        assert response.status_code == 409
    db.refresh(payment)
    assert payment.status == "completed" and payment.amount == Decimal("30.00")


def test_csv_preview_import_duplicates_conflicts_and_no_partial_commit(client, accounting):
    db, org, _ = accounting
    paid = as_rome_datetime().strftime("%d/%m/%Y")
    csv_text = f"Data;Importo;Ordinante;Riferimento;Descrizione\n{paid};60,00;Socio Test;TRN-1;Due quote\n{paid};15,50;Socio Due;TRN-2;Acconto\n"
    before = client.post(f"{PREFIX}/receipts/import/preview", json={"csv_text": csv_text})
    assert before.status_code == 200, before.text
    assert before.json()["valid_count"] == 2
    assert db.query(AccountingReceipt).filter_by(org_id=org.id).count() == 0
    imported = client.post(f"{PREFIX}/receipts/import", json={"request_key": uuid.uuid4().hex, "csv_text": csv_text})
    assert imported.status_code == 200, imported.text
    assert imported.json()["created"] == 2
    duplicate = client.post(f"{PREFIX}/receipts/import", json={"request_key": uuid.uuid4().hex, "csv_text": csv_text})
    assert duplicate.json()["created"] == 0 and duplicate.json()["duplicates"] == 2
    conflict = csv_text.replace("60,00", "61,00")
    assert client.post(f"{PREFIX}/receipts/import/preview", json={"csv_text": conflict}).json()["invalid_count"] == 1
    bad = csv_text.replace("TRN-1", "TRN-3").replace("15,50", "NaN")
    assert client.post(f"{PREFIX}/receipts/import", json={"request_key": uuid.uuid4().hex, "csv_text": bad}).status_code == 422
    assert db.query(AccountingReceipt).filter_by(org_id=org.id).count() == 2


@pytest.mark.parametrize("amount", [True, 10.5, "1000", -1, 0, 1_000_000_001])
def test_money_is_strict_positive_integer_cents(client, accounting, amount):
    response = client.post(f"{PREFIX}/receipts", json=dict(
        request_key=uuid.uuid4().hex, amount_cents=amount, method="cash", paid_on=as_rome_datetime().date().isoformat(),
    ))
    assert response.status_code == 422


def test_missing_reason_future_date_and_inactive_org_are_rejected(client, accounting):
    db, org, _ = accounting
    detail, _ = receipt(client)
    assert client.post(f"{PREFIX}/receipts/{detail['receipt']['id']}/void", json={
        "request_key": uuid.uuid4().hex, "expected_version": 1, "reason": "   ",
    }).status_code == 422
    assert client.post(f"{PREFIX}/receipts", json={
        "request_key": uuid.uuid4().hex, "amount_cents": 100, "method": "cash", "paid_on": (date.today() + timedelta(days=2)).isoformat(),
    }).status_code == 422
    org.deleted_at = datetime.utcnow()
    db.commit()
    assert client.get(f"{PREFIX}/receipts").status_code == 403


def test_pending_online_checkout_blocks_another_collection(client, accounting):
    db, org, _ = accounting
    member = make_member(db, org)
    paid_payment(db, org, member, source="online", status="pending", checkout_reference=uuid.uuid4().hex)
    detail, _ = receipt(client)
    assert allocate(client, detail, [(target(member), 3000)]).status_code == 409


def test_partial_initial_quota_cannot_open_full_online_checkout(client, accounting, monkeypatch):
    from app.routes import membership_payments as checkout_routes

    db, org, _ = accounting
    member = make_member(db, org, card=False, status=MemberStatus.PENDING_CARDS)
    detail, _ = receipt(client, 1000)
    assert allocate(client, detail, [(target(member), 1000)]).status_code == 200
    monkeypatch.setattr(checkout_routes, "organization_requires_membership_payment", lambda org: True)
    monkeypatch.setattr(checkout_routes, "organization_has_sumup_config", lambda org: True)
    # Existing signup validation has its own coverage; exercise the boundary
    # before a new payment/reservation or any external checkout can be created.
    monkeypatch.setattr(checkout_routes, "_upsert_member_for_checkout",
                        lambda **kw: (kw["db"].get(Member, member.id), True))
    monkeypatch.setattr(checkout_routes, "create_sumup_hosted_checkout",
                        lambda **kw: pytest.fail("Partial quota must not contact the provider"))
    response = client.post(f"/api/public/orgs/{org.slug}/membership-payment/create-checkout", data={
        "first_name": member.first_name, "last_name": member.last_name, "email": member.email,
        "birth_date": "1990-01-01", "birth_place": "Roma", "birth_place_code": "H501",
        "gender": "M", "phone": "0000000000", "fiscal_code": "SYNTHETIC-LOCAL",
        "accept_statute": "true", "accept_privacy": "true",
    })
    assert response.status_code == 409, response.text
    assert "parzialmente" in response.json()["detail"]
    assert db.query(MembershipPayment).filter_by(socio_id=member.id).count() == 0


def test_partial_renewal_cannot_open_full_online_checkout(client, accounting, monkeypatch):
    from app.services import renewals

    db, org, _ = accounting
    member = make_member(db, org)
    year = as_rome_datetime().year + 1
    db.add(AnnualMembershipTerm(org_id=org.id, member_id=member.id, membership_year=year - 1,
                                starts_on=date(year - 1, 1, 1), valid_through=date(year, 1, 1),
                                status="active", fee_amount=Decimal("30.00"), currency="EUR",
                                card_no=member.card_no, card_year=year - 1))
    term = AnnualMembershipTerm(org_id=org.id, member_id=member.id, membership_year=year,
                                starts_on=date(year, 1, 1), valid_through=date(year + 1, 1, 1),
                                status="payment_pending", fee_amount=Decimal("30.00"), currency="EUR")
    db.add(term)
    db.commit()
    detail, _ = receipt(client, 1000)
    response = allocate(client, detail, [(f"renewal:{member.id}:{year}", 1000)])
    assert response.status_code == 200, response.text
    monkeypatch.setattr(renewals, "create_sumup_hosted_checkout",
                        lambda **kw: pytest.fail("Partial renewal must not contact the provider"))
    with pytest.raises(HTTPException) as blocked:
        renewals.create_renewal_checkout(db, member=member, term=term,
                                        request=Request({"type": "http", "headers": []}))
    assert blocked.value.status_code == 409 and "parzialmente" in blocked.value.detail
    assert db.query(MembershipPayment).filter_by(socio_id=member.id).count() == 0


def test_receipt_and_suggestions_cannot_cross_tenants(client, accounting):
    db, org, _ = accounting
    detail, _ = receipt(client)
    other = Organization(name="Altro registro", slug=uuid.uuid4().hex, is_active=True)
    db.add(other)
    db.flush()
    admin = AdminUser(email=f"other-{uuid.uuid4().hex}@example.com", org_id=other.id, role=AdminRole.ORG_ADMIN, is_active=True)
    db.add(admin)
    db.flush()
    raw = uuid.uuid4().hex
    db.add(OrgAdminToken(admin_id=admin.id, token_hash=hash_token(raw), expires_at=datetime.utcnow() + timedelta(minutes=15)))
    db.commit()
    client.get(f"/api/org-admin/auth/verify?token={raw}", follow_redirects=False)
    assert client.get(f"{PREFIX}/receipts/{detail['receipt']['id']}").status_code == 404
    assert client.get(f"{PREFIX}/receipts/{detail['receipt']['id']}/suggestions").status_code == 404


def test_new_member_is_issued_once_only_when_fully_covered(client, accounting):
    db, org, _ = accounting
    member = make_member(db, org, card=False, status=MemberStatus.PENDING_CARDS)
    start = 2_000_000 + org.id * 100
    db.add(CardBatch(org_id=org.id, year=as_rome_datetime().year, start_no=start, end_no=start+10, next_no=start))
    db.commit()
    partial, _ = receipt(client, 1000)
    assert allocate(client, partial, [(target(member), 1000)]).status_code == 200
    db.expire_all()
    assert member.card_no is None
    rest, _ = receipt(client, 2000)
    response = allocate(client, rest, [(target(member), 2000)])
    assert response.status_code == 200, response.text
    db.expire_all()
    assert member.card_no == start and member.status == MemberStatus.ACTIVE
    assert db.query(MembershipPayment).filter_by(socio_id=member.id).count() == 1
    assert db.query(AnnualMembershipTerm).filter_by(member_id=member.id).count() == 1


def test_adjusted_event_cannot_be_overwritten_through_orm(client, accounting):
    db, _, _ = accounting
    detail, _ = receipt(client)
    stored = db.query(AccountingEvent).filter_by(receipt_id=detail["receipt"]["id"]).one()
    stored.reason = "Overwrite original"
    with pytest.raises(ValueError, match="immutable"):
        db.flush()
    db.rollback()


def test_competing_allocations_cannot_collect_one_quota_twice(client, accounting):
    db, org, _ = accounting
    member = make_member(db, org)
    receipts = [receipt(client)[0] for _ in range(2)]
    target_key = target(member)  # Never share a lazy-loading ORM session between threads.
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda detail: allocate(client, detail, [(target_key, 3000)]), receipts))
    assert sorted(response.status_code for response in responses) == [200, 409]
    assert db.query(MembershipPayment).filter_by(socio_id=member.id).count() == 1
    assert db.query(AccountingAllocation).filter_by(member_id=member.id).count() == 1


def test_concurrent_same_request_has_one_accounting_effect(client, accounting):
    db, org, _ = accounting
    member = make_member(db, org)
    detail, _ = receipt(client)
    key = uuid.uuid4().hex
    target_key = target(member)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: allocate(client, detail, [(target_key, 3000)], key=key), range(2)))
    assert all(response.status_code == 200 for response in responses), [response.text for response in responses]
    assert responses[0].json() == responses[1].json()
    assert db.query(AccountingAllocation).filter_by(member_id=member.id).count() == 1


def test_provider_payment_remains_paid_when_duplicate_manual_receipt_is_voided(client, accounting):
    db, org, _ = accounting
    member = make_member(db, org, card_is_paid=True, payment_status="manual_completed")
    provider = paid_payment(db, org, member, source="online")
    paid_payment(db, org, member)
    assert sync(client)["created"] == 2
    entries = client.get(f"{PREFIX}/receipts").json()["items"]
    manual = next(item for item in entries if item["source"] == "legacy_manual")
    response = client.post(f"{PREFIX}/receipts/{manual['id']}/void", json={
        "request_key": uuid.uuid4().hex, "expected_version": manual["version"], "reason": "Elimina la duplicazione manuale del pagamento online",
    })
    assert response.status_code == 200, response.text
    db.expire_all()
    assert provider.status == "completed" and provider.amount == Decimal("30.00")
    assert member.card_is_paid and member.payment_status == "completed"
    assert member.payment_completed_at is not None
    assert member_year_balance(db, member=member, year=as_rome_datetime().year)["paid_cents"] == 3000


def test_old_temporary_receipt_does_not_change_payment_flags_of_current_card(client, accounting):
    db, org, _ = accounting
    member = make_member(db, org, membership_type="temporary", card_is_paid=True, payment_status="manual_completed")
    current_no, current_expiry = member.card_no, member.valid_until
    old = TemporaryMembershipPurchase(org_id=org.id, member_id=member.id, status="expired", method="contanti",
                                      amount=10, duration_value=4, duration_unit="hours", card_no=700000+member.id,
                                      card_year=as_rome_datetime().year, issued_at=datetime.utcnow()-timedelta(days=3))
    db.add(old)
    db.commit()
    paid_payment(db, org, member, amount=10, payment_kind="temporary", temporary_purchase_id=old.id)
    sync(client)
    item = client.get(f"{PREFIX}/receipts").json()["items"][0]
    response = client.post(f"{PREFIX}/receipts/{item['id']}/void", json={
        "request_key": uuid.uuid4().hex, "expected_version": item["version"], "reason": "Rettifica vecchia emissione temporanea",
    })
    assert response.status_code == 200, response.text
    db.expire_all()
    assert member.card_is_paid and member.payment_status == "manual_completed"
    assert (member.card_no, member.valid_until) == (current_no, current_expiry)


@pytest.mark.parametrize("bulk", [False, True])
def test_purged_profile_is_detached_from_financial_history_even_if_id_is_reused(client, accounting, bulk):
    db, org, _ = accounting
    member = make_member(db, org)
    member_id = member.id
    detail, _ = receipt(client, 1000)
    assert allocate(client, detail, [(target(member), 1000)]).status_code == 200
    if bulk:
        db.query(Member).filter(Member.id == member_id).delete(synchronize_session=False)
    else:
        db.delete(member)
    db.commit()
    db.expire_all()
    allocation = db.query(AccountingAllocation).filter_by(receipt_id=detail["receipt"]["id"]).one()
    assert allocation.member_id is None
    replacement = make_member(db, org, id=member_id)
    assert member_year_balance(db, member=replacement, year=as_rome_datetime().year)["paid_cents"] == 0
    response = client.post(f"{PREFIX}/receipts/{detail['receipt']['id']}/adjustments", json={
        "request_key": uuid.uuid4().hex, "expected_version": 2, "reason": "Correzione causale storica", "description": "Profilo eliminato, ricevuta conservata",
    })
    assert response.status_code == 200, response.text


def test_sync_is_bounded_and_roman_date_is_preserved_for_provider_evidence(client, accounting):
    db, org, _ = accounting
    member = make_member(db, org)
    for index in range(105):
        paid_payment(db, org, member, source="online", amount=1, confirmed_at=datetime(2026, 1, 1, 23, 30))
    first = sync(client)
    assert first == {"created": 100, "has_more": True}
    second = sync(client)
    assert second == {"created": 5, "has_more": False}
    assert sync(client)["created"] == 0
    stored = db.query(AccountingReceipt).filter_by(org_id=org.id).first()
    assert stored.paid_on == date(2026, 1, 2)


@pytest.mark.parametrize("old_cents,new_cents", [(3000, 1000), (1000, 2000)])
def test_new_acconto_after_profile_id_reuse_never_reprojects_orphaned_money(client, accounting, old_cents, new_cents):
    from app.services.member_cleanup import purge_deleted_members_permanently

    db, org, _ = accounting
    original = make_member(db, org)
    member_id, org_id = original.id, org.id
    old_receipt, _ = receipt(client, old_cents)
    assert allocate(client, old_receipt, [(target(original), old_cents)]).status_code == 200
    db.expire_all()
    old_allocation = db.query(AccountingAllocation).filter_by(receipt_id=old_receipt["receipt"]["id"]).one()
    original_payment_id = old_allocation.payment_id
    original.deleted_at = datetime.utcnow()
    db.commit()
    assert purge_deleted_members_permanently(db, org_id=org.id) == 1
    db.commit()
    db.expunge_all()

    org = db.get(Organization, org_id)
    replacement = make_member(db, org, id=member_id, card=False, status=MemberStatus.PENDING_CARDS)
    start = 2_100_000 + org.id * 100
    db.add(CardBatch(org_id=org.id, year=as_rome_datetime().year, start_no=start, end_no=start + 5, next_no=start))
    db.commit()
    new_receipt, _ = receipt(client, new_cents)
    response = allocate(client, new_receipt, [(target(replacement), new_cents)])
    assert response.status_code == 200, response.text
    db.expire_all()
    assert replacement.card_no is None and not replacement.card_is_paid
    assert replacement.payment_status == "manual_partial"
    assert member_year_balance(db, member=replacement, year=as_rome_datetime().year)["outstanding_cents"] == 3000 - new_cents
    assert db.query(MembershipPayment).filter_by(socio_id=member_id).count() == 0
    old_allocation = db.query(AccountingAllocation).filter_by(receipt_id=old_receipt["receipt"]["id"]).one()
    assert old_allocation.member_id is None and old_allocation.payment_id == original_payment_id
    if original_payment_id is not None:
        original_payment = db.get(MembershipPayment, original_payment_id)
        assert original_payment.socio_id is None and original_payment.amount == Decimal(old_cents) / 100


def test_reused_temporary_purchase_id_cannot_inherit_orphaned_money(client, accounting):
    from app.services.member_cleanup import purge_deleted_members_permanently

    db, org, _ = accounting
    original = make_member(db, org, membership_type="temporary")
    member_id, org_id = original.id, org.id
    purchase = TemporaryMembershipPurchase(org_id=org.id, member_id=member_id, status="manual_pending",
                                           method="contanti", amount=30, currency="EUR", duration_value=4, duration_unit="hours")
    db.add(purchase)
    db.commit()
    purchase_id = purchase.id
    old_receipt, _ = receipt(client, 1000)
    assert allocate(client, old_receipt, [(f"temporary:{purchase_id}", 1000)]).status_code == 200
    original.deleted_at = datetime.utcnow()
    db.commit()
    assert purge_deleted_members_permanently(db, org_id=org_id) == 1
    db.commit()
    db.expunge_all()
    org = db.get(Organization, org_id)
    replacement = make_member(db, org, id=member_id, membership_type="temporary")
    replacement_purchase = TemporaryMembershipPurchase(id=purchase_id, org_id=org_id, member_id=member_id,
                                                       status="manual_pending", method="contanti", amount=30,
                                                       currency="EUR", duration_value=4, duration_unit="hours")
    db.add(replacement_purchase)
    db.commit()
    new_receipt, _ = receipt(client, 2000)
    response = allocate(client, new_receipt, [(f"temporary:{purchase_id}", 2000)])
    assert response.status_code == 200, response.text
    db.expire_all()
    assert replacement_purchase.status == "manual_pending" and replacement_purchase.card_no is None
    assert db.query(MembershipPayment).filter_by(socio_id=member_id).count() == 0
    old_allocation = db.query(AccountingAllocation).filter_by(receipt_id=old_receipt["receipt"]["id"]).one()
    assert old_allocation.member_id is None and old_allocation.payment_id is None


def test_huge_csv_number_reports_validation_error_instead_of_server_error(client, accounting):
    csv_text = f"date;amount\n{as_rome_datetime().date().isoformat()};{'9' * 1000}\n"
    response = client.post(f"{PREFIX}/receipts/import/preview", json={"csv_text": csv_text})
    assert response.status_code == 200, response.text
    assert response.json()["invalid_count"] == 1

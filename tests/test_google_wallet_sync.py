from datetime import datetime, timedelta
import uuid

import pytest

from app.db import SessionLocal
from app.models import Member, MemberStatus, Organization, TemporaryMembershipPurchase
from app.models_wallet import GoogleWalletPass, GoogleWalletSyncJob
from app.services import google_wallet_sync as sync_service


@pytest.fixture
def wallet_member(monkeypatch):
    monkeypatch.setenv("GOOGLE_WALLET_ISSUER_ID", "123456")
    with SessionLocal() as db:
        db.query(GoogleWalletSyncJob).delete()
        db.query(GoogleWalletPass).delete()
        db.query(Member).update({Member.google_wallet_object_id: None, Member.google_wallet_class_id: None})
        org = Organization(name="Wallet Sync", slug=f"wallet-sync-{uuid.uuid4().hex}", is_active=True)
        db.add(org)
        db.flush()
        member = Member(org_id=org.id, first_name="Mario", last_name="Prova", email=f"{uuid.uuid4().hex}@example.test",
                        status=MemberStatus.ACTIVE, card_no=987000 + org.id, card_year=datetime.utcnow().year,
                        membership_type="annual", valid_from=datetime.utcnow(), valid_until=datetime.utcnow() + timedelta(days=2))
        db.add(member)
        db.flush()
        class_id, object_id = sync_service.wallet_identity(member)
        member.google_wallet_class_id = class_id
        member.google_wallet_object_id = object_id
        record = sync_service.register_wallet_pass(db, member, class_id=class_id, object_id=object_id)
        db.commit()
        yield member.id, record.id, object_id


def test_delivery_has_no_open_database_transaction_and_renewal_reuses_object(wallet_member, monkeypatch):
    member_id, pass_id, object_id = wallet_member
    sessions = []
    factory = sync_service.SessionLocal
    def tracked_session():
        session = factory()
        sessions.append(session)
        return session
    monkeypatch.setattr(sync_service, "SessionLocal", tracked_session)
    calls = []
    def provider(**kwargs):
        assert all(not session.in_transaction() for session in sessions)
        calls.append(kwargs)
    sync_service.process_wallet_sync_once(sync=provider)
    with SessionLocal() as db:
        member = db.get(Member, member_id)
        member.card_year += 1
        member.card_no += 1
        db.commit()
        assert sync_service.wallet_identity(member)[1] == object_id
        expected_number = member.card_no
    sync_service.process_wallet_sync_once(sync=provider)
    assert calls[-1]["object_id"] == object_id
    assert str(expected_number) in calls[-1]["payload"]["textModulesData"][0]["body"]
    with SessionLocal() as db:
        record = db.get(GoogleWalletPass, pass_id)
        assert record.desired_revision == record.synced_revision


def test_rollback_does_not_enqueue_or_revoke_remote_pass(wallet_member):
    member_id, pass_id, _ = wallet_member
    sync_service.process_wallet_sync_once(sync=lambda **_: None)
    with SessionLocal() as db:
        version = db.get(GoogleWalletPass, pass_id).desired_revision
        db.get(Member, member_id).status = MemberStatus.REJECTED
        db.flush()
        db.rollback()
    with SessionLocal() as db:
        assert db.get(GoogleWalletPass, pass_id).desired_revision == version
        assert db.query(GoogleWalletSyncJob).filter_by(pass_id=pass_id).one().status == "completed"


def test_expiry_is_delivered_without_member_login(wallet_member):
    member_id, pass_id, _ = wallet_member
    sync_service.process_wallet_sync_once(sync=lambda **_: None)
    with SessionLocal() as db:
        # Simulate a bulk maintenance update that bypasses ORM change tracking.
        db.query(Member).filter_by(id=member_id).update({Member.valid_until: datetime.utcnow() - timedelta(seconds=1)})
        db.get(GoogleWalletPass, pass_id).next_check_at = datetime.utcnow() - timedelta(seconds=1)
        db.commit()
    calls = []
    sync_service.process_wallet_sync_once(sync=lambda **values: calls.append(values))
    assert calls[-1]["payload"]["state"] != "ACTIVE"
    assert "validTimeInterval" in calls[-1]["payload"]


def test_provider_failure_retries_latest_state_without_losing_card(wallet_member):
    member_id, pass_id, _ = wallet_member
    def failing(**_):
        raise TimeoutError("sensitive-provider-url-must-not-be-stored")
    assert sync_service.process_wallet_sync_once(sync=failing)["failed"] == 1
    with SessionLocal() as db:
        job = db.query(GoogleWalletSyncJob).filter_by(pass_id=pass_id).one()
        assert job.last_error == "TimeoutError"
        assert job.available_at > datetime.utcnow()
        assert db.get(Member, member_id).card_no is not None
        job.available_at = datetime.utcnow() - timedelta(seconds=1)
        db.get(Member, member_id).last_name = "Aggiornato"
        db.commit()
    calls = []
    sync_service.process_wallet_sync_once(sync=lambda **values: calls.append(values))
    assert calls[-1]["payload"]["header"]["defaultValue"]["value"] == "Mario Aggiornato"


def test_change_during_http_is_not_acknowledged_as_delivered(wallet_member):
    member_id, pass_id, _ = wallet_member
    calls = []
    def provider(**values):
        calls.append(values)
        if len(calls) == 1:
            with SessionLocal() as db:
                db.get(Member, member_id).last_name = "Seconda versione"
                db.commit()
    sync_service.process_wallet_sync_once(sync=provider, limit=2)
    assert len(calls) == 2
    assert calls[-1]["payload"]["header"]["defaultValue"]["value"] == "Mario Seconda versione"
    with SessionLocal() as db:
        record = db.get(GoogleWalletPass, pass_id)
        assert record.desired_revision == record.synced_revision


def test_expired_lease_is_recovered_and_old_ack_cannot_complete_new_job(wallet_member):
    _, pass_id, _ = wallet_member
    first = sync_service.claim_wallet_job()
    with SessionLocal() as db:
        db.query(GoogleWalletSyncJob).filter_by(pass_id=pass_id).update({GoogleWalletSyncJob.lease_expires_at: datetime.utcnow() - timedelta(seconds=1)})
        db.commit()
    second = sync_service.claim_wallet_job()
    assert second is not None and first.lease_token != second.lease_token
    assert sync_service.process_wallet_job(first, sync=lambda **_: None) is False
    assert sync_service.process_wallet_job(second, sync=lambda **_: None) is True


def test_consecutive_temporary_passes_keep_distinct_identity_and_expired_qr(wallet_member):
    member_id, _, annual_object = wallet_member
    sync_service.process_wallet_sync_once(sync=lambda **_: None)
    with SessionLocal() as db:
        member = db.get(Member, member_id)
        member.membership_type = "temporary"
        member.card_no += 2
        member.valid_until = datetime.utcnow() - timedelta(hours=1)
        first = TemporaryMembershipPurchase(member_id=member.id, org_id=member.org_id, method="contanti", status="active",
                 amount=10, currency="EUR", duration_value=4, duration_unit="hours", card_no=member.card_no,
                 card_year=member.card_year, valid_from=datetime.utcnow() - timedelta(hours=5), valid_until=member.valid_until,
                 issued_at=datetime.utcnow() - timedelta(hours=5))
        db.add(first); db.flush()
        first_id = sync_service.wallet_identity(member)[1]
        first_record = sync_service.register_wallet_pass(db, member, class_id=member.google_wallet_class_id, object_id=first_id)
        member.google_wallet_object_id = first_id
        db.commit()
        first_pass_id = first_record.id
    sync_service.process_wallet_sync_once(sync=lambda **_: None)
    with SessionLocal() as db:
        member = db.get(Member, member_id)
        member.card_no += 1
        member.valid_until = datetime.utcnow() + timedelta(hours=4)
        db.add(TemporaryMembershipPurchase(member_id=member.id, org_id=member.org_id, method="contanti", status="active",
               amount=10, currency="EUR", duration_value=4, duration_unit="hours", card_no=member.card_no, card_year=member.card_year,
               valid_from=datetime.utcnow(), valid_until=member.valid_until, issued_at=datetime.utcnow()))
        db.flush()
        second_id = sync_service.wallet_identity(member)[1]
        assert second_id != first_id and ".tmp." in second_id
        sync_service.register_wallet_pass(db, member, class_id=member.google_wallet_class_id, object_id=second_id)
        db.commit()
    calls = []
    sync_service.process_wallet_sync_once(sync=lambda **values: calls.append(values))
    assert any(item["object_id"] == annual_object and item["payload"]["state"] != "ACTIVE" for item in calls)
    with SessionLocal() as db:
        payload, _ = sync_service._payload_for_pass(db, db.get(GoogleWalletPass, first_pass_id))
        assert payload["state"] != "ACTIVE"


def test_rejecting_member_deactivates_issued_temporary_pass(wallet_member):
    member_id, _, _ = wallet_member
    with SessionLocal() as db:
        member = db.get(Member, member_id)
        member.membership_type = "temporary"
        member.card_no += 10
        member.valid_until = datetime.utcnow() + timedelta(hours=4)
        purchase = TemporaryMembershipPurchase(
            member_id=member.id, org_id=member.org_id, method="contanti", status="active",
            amount=10, currency="EUR", duration_value=4, duration_unit="hours",
            card_no=member.card_no, card_year=member.card_year,
            issued_at=datetime.utcnow(), valid_from=datetime.utcnow(), valid_until=member.valid_until,
        )
        db.add(purchase)
        db.flush()
        class_id, object_id = sync_service.wallet_identity(member)
        sync_service.register_wallet_pass(db, member, class_id=class_id, object_id=object_id)
        db.commit()
    sync_service.process_wallet_sync_once(sync=lambda **_: None)
    with SessionLocal() as db:
        db.get(Member, member_id).status = MemberStatus.REJECTED
        db.commit()
    delivered = []
    sync_service.process_wallet_sync_once(sync=lambda **values: delivered.append(values))
    temporary = next(item for item in delivered if item["object_id"] == object_id)
    assert temporary["payload"]["state"] == "INACTIVE"


def test_unlinked_legacy_temporary_pass_never_inherits_a_new_card(wallet_member):
    from app.services.google_wallet import _build_generic_object_payload
    member_id, _, _ = wallet_member
    with SessionLocal() as db:
        member = db.get(Member, member_id)
        member.membership_type = "temporary"
        member.card_no += 10
        member.valid_until = datetime.utcnow() + timedelta(hours=4)
        class_id, object_id = sync_service.wallet_identity(member)
        original_payload = _build_generic_object_payload(member=member, class_id=class_id, object_id=object_id)
        record = sync_service.register_wallet_pass(db, member, class_id=class_id, object_id=object_id,
                                                  payload=original_payload)
        db.commit()
        pass_id = record.id
    with SessionLocal() as db:
        member = db.get(Member, member_id)
        member.card_no += 1
        member.valid_until = datetime.utcnow() + timedelta(hours=6)
        db.add(TemporaryMembershipPurchase(
            member_id=member.id, org_id=member.org_id, method="contanti", status="active",
            amount=10, currency="EUR", duration_value=6, duration_unit="hours",
            card_no=member.card_no, card_year=member.card_year,
            issued_at=datetime.utcnow(), valid_from=datetime.utcnow(), valid_until=member.valid_until,
        ))
        db.commit()
    delivered = []
    sync_service.process_wallet_sync_once(sync=lambda **values: delivered.append(values))
    legacy = next(item for item in delivered if item["object_id"] == object_id)
    assert legacy["payload"]["state"] == "EXPIRED"
    assert legacy["payload"]["barcode"] == original_payload["barcode"]
    with SessionLocal() as db:
        assert db.get(GoogleWalletPass, pass_id).temporary_purchase_id is None


def test_inactive_organization_disables_matching_legacy_temporary_pass(wallet_member):
    from app.services.google_wallet import _build_generic_object_payload
    member_id, _, _ = wallet_member
    with SessionLocal() as db:
        member = db.get(Member, member_id)
        member.membership_type = "temporary"
        member.card_no += 10
        member.valid_until = datetime.utcnow() + timedelta(hours=4)
        class_id, object_id = sync_service.wallet_identity(member)
        payload = _build_generic_object_payload(member=member, class_id=class_id, object_id=object_id)
        sync_service.register_wallet_pass(db, member, class_id=class_id, object_id=object_id, payload=payload)
        db.commit()
        member.organization.is_active = False
        db.commit()
    delivered = []
    sync_service.process_wallet_sync_once(sync=lambda **values: delivered.append(values))
    legacy = next(item for item in delivered if item["object_id"] == object_id)
    assert legacy["payload"]["state"] != "ACTIVE"


def test_first_save_concurrent_hard_delete_keeps_revocation_tombstone(client, wallet_member, monkeypatch):
    import base64
    import json
    from itsdangerous import TimestampSigner
    from app.config import settings
    from app.routes import member as member_routes
    from app.services.google_wallet import GoogleWalletSaveLinkResult

    original_member_id, _, _ = wallet_member
    with SessionLocal() as db:
        original = db.get(Member, original_member_id)
        member = Member(
            org_id=original.org_id, first_name="Race", last_name="Save",
            status=MemberStatus.ACTIVE, card_no=original.card_no + 30,
            card_year=original.card_year, membership_type="annual",
            valid_from=datetime.utcnow(), valid_until=datetime.utcnow() + timedelta(days=3),
        )
        db.add(member)
        db.commit()
        member_id, version = member.id, member.auth_version
        class_id, object_id = sync_service.wallet_identity(member)

    def provision_then_delete(_snapshot):
        with SessionLocal() as db:
            db.delete(db.get(Member, member_id))
            db.commit()
        return GoogleWalletSaveLinkResult(
            url="https://pay.google.com/synthetic", class_id=class_id, object_id=object_id,
        )

    monkeypatch.setattr(member_routes, "generate_google_wallet_save_link_for_member", provision_then_delete)
    encoded = base64.b64encode(json.dumps({"member_id": member_id, "member_auth_version": version}).encode())
    cookie = TimestampSigner(settings.SECRET_KEY).sign(encoded).decode()
    client.cookies.clear()
    client.cookies.set("session", cookie, domain="testserver.local", path="/")
    try:
        response = client.post("/api/me/wallet/google/save-link")
        assert response.status_code == 409, response.text
        with SessionLocal() as db:
            record = db.query(GoogleWalletPass).filter_by(object_id=object_id).one()
            assert record.member_id is None
            assert record.revoked is True
            assert db.query(GoogleWalletSyncJob).filter_by(pass_id=record.id).one().status != "completed"
        delivered = []
        sync_service.process_wallet_sync_once(sync=lambda **values: delivered.append(values))
        tombstone = next(item for item in delivered if item["object_id"] == object_id)
        assert tombstone["payload"]["state"] == "INACTIVE"
    finally:
        client.cookies.clear()


def test_provisioning_not_found_retries_until_remote_creation_is_visible(wallet_member):
    member_id, pass_id, _ = wallet_member
    with SessionLocal() as db:
        db.get(GoogleWalletPass, pass_id).provisioning = True
        db.delete(db.get(Member, member_id))
        db.commit()
        assert db.get(GoogleWalletPass, pass_id).payload_json["state"] == "INACTIVE"
    assert sync_service.process_wallet_sync_once(sync=lambda **_: False)["failed"] == 1
    with SessionLocal() as db:
        job = db.query(GoogleWalletSyncJob).filter_by(pass_id=pass_id).one()
        assert job.status == "failed"
        job.available_at = datetime.utcnow() - timedelta(seconds=1)
        db.commit()
    calls = []
    assert sync_service.process_wallet_sync_once(sync=lambda **data: calls.append(data) or True)["synced"] == 1
    assert calls[0]["payload"]["state"] == "INACTIVE"


def test_bad_legacy_snapshot_does_not_block_other_passes(wallet_member):
    member_id, pass_id, _ = wallet_member
    with SessionLocal() as db:
        member = db.get(Member, member_id)
        broken = GoogleWalletPass(member_id=member.id, org_id=member.org_id, class_id="123456.class",
                                  object_id="123456.corrupt.tmp.legacy", kind="temporary",
                                  payload_json={"validTimeInterval": {"end": {"date": "invalid"}}})
        db.add(broken)
        sync_service._queue(db, broken)
        db.commit()
    calls = []
    result = sync_service.process_wallet_sync_once(sync=lambda **data: calls.append(data))
    assert result == {"claimed": 2, "synced": 1, "failed": 1}
    with SessionLocal() as db:
        assert db.get(GoogleWalletPass, pass_id).last_synced_at is not None


def test_bulk_hard_purge_queues_revocation_and_drops_personal_snapshot(wallet_member):
    from app.services.member_cleanup import purge_deleted_members_permanently
    member_id, pass_id, _ = wallet_member
    sync_service.process_wallet_sync_once(sync=lambda **_: None)
    with SessionLocal() as db:
        member = db.get(Member, member_id)
        org_id = member.org_id
        member.deleted_at = datetime.utcnow()
        db.commit()
        assert purge_deleted_members_permanently(db, org_id=org_id) == 1
        db.commit()
    with SessionLocal() as db:
        record = db.get(GoogleWalletPass, pass_id)
        assert record.member_id is None and record.revoked
        assert record.payload_json == {"id": record.object_id, "state": "INACTIVE"}
        assert db.query(GoogleWalletSyncJob).filter_by(pass_id=pass_id).one().status == "pending"


def test_old_ack_after_deletion_does_not_restore_personal_snapshot(wallet_member):
    member_id, pass_id, _ = wallet_member
    claimed = sync_service.claim_wallet_job()
    def provider(**_):
        with SessionLocal() as db:
            db.delete(db.get(Member, member_id))
            db.commit()
    assert sync_service.process_wallet_job(claimed, sync=provider)
    with SessionLocal() as db:
        record = db.get(GoogleWalletPass, pass_id)
        assert record.payload_json == {"id": record.object_id, "state": "INACTIVE"}
        assert db.query(GoogleWalletSyncJob).filter_by(pass_id=pass_id).one().status == "pending"

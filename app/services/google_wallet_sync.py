"""Deliver the latest committed card state without holding DB transactions over HTTP."""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import logging
from types import SimpleNamespace
import uuid

from sqlalchemy import case, inspect, or_, select, update
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Member, Organization
from app.models_wallet import GoogleWalletPass, GoogleWalletSyncJob

logger = logging.getLogger(__name__)
_MEMBER_FIELDS = {"first_name", "last_name", "status", "deleted_at", "expired_at", "card_no", "card_year", "membership_type", "valid_from", "valid_until", "google_wallet_object_id", "google_wallet_class_id"}
_ORG_FIELDS = {"name", "slug", "club_display_name", "is_active", "card_logo_url", "logo_path", "wallet_bg_color", "wallet_logo_url", "wallet_hero_image_url", "wallet_title_override", "wallet_is_test_prefix"}


def _utc(value):
    return value.astimezone(timezone.utc).replace(tzinfo=None) if value is not None and value.tzinfo else value


def _digest(payload):
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _temporary_purchase(db, member):
    from app.models import TemporaryMembershipPurchase

    pending = [purchase for purchase in db.new | db.dirty
               if isinstance(purchase, TemporaryMembershipPurchase)
               and (purchase.member_id, purchase.card_no, purchase.card_year) == (member.id, member.card_no, member.card_year)]
    if pending:
        return max(pending, key=lambda purchase: purchase.id or 0)
    return (db.query(TemporaryMembershipPurchase)
            .filter(TemporaryMembershipPurchase.member_id == member.id,
                    TemporaryMembershipPurchase.card_no == member.card_no,
                    TemporaryMembershipPurchase.card_year == member.card_year)
            .order_by(TemporaryMembershipPurchase.id.desc()).first())


def wallet_identity(member):
    """The annual identity survives renewal; temporary identities belong to an issuance."""
    from app.services.google_wallet import _DEFAULT_CLASS_SUFFIX, _require_google_wallet_issuer_id, _sanitize_wallet_id_component

    prepared = getattr(member, "_prepared_wallet_identity", None)
    if prepared:
        return prepared
    issuer = _require_google_wallet_issuer_id()
    slug = _sanitize_wallet_id_component(getattr(member.organization, "slug", ""), fallback="assonam")
    kind = "temporary" if member.membership_type == "temporary" else "annual"
    db = inspect(member, raiseerr=False)
    db = db.session if db is not None else None
    if kind == "temporary":
        purchase = _temporary_purchase(db, member) if db is not None else None
        suffix = str(purchase.id) if purchase else f"legacy.{member.card_year}.{member.card_no}"
        object_id = f"{issuer}.{slug}.{member.id}.tmp.{suffix}"
    else:
        persisted = member.google_wallet_object_id
        record = db.query(GoogleWalletPass).filter_by(object_id=persisted).first() if db is not None and persisted else None
        if persisted and ".tmp." not in persisted and (record is None or record.kind == "annual"):
            object_id = persisted
        else:
            record = (db.query(GoogleWalletPass).filter_by(member_id=member.id, kind="annual", revoked=False)
                      .order_by(GoogleWalletPass.id).first()) if db is not None else None
            object_id = record.object_id if record else f"{issuer}.{slug}.{member.id}.{member.card_year}"
    return f"{issuer}.{_DEFAULT_CLASS_SUFFIX}", object_id


def snapshot_wallet_member(db, member):
    """Materialize only renderer inputs before releasing the request's read transaction."""
    from app.services.google_wallet import GoogleWalletConfigError
    try:
        identity = wallet_identity(member)
    except GoogleWalletConfigError:
        # Provisioning reports configuration failures through the API's existing handler.
        identity = None
    fields = ("id", "org_id", "first_name", "last_name", "status", "card_no", "card_year", "membership_type", "valid_from", "valid_until", "joined_at", "deleted_at", "expired_at", "google_wallet_object_id", "google_wallet_class_id")
    organization = member.organization
    org_fields = _ORG_FIELDS | {"id", "card_email_subject", "logo_url", "wallet_test_mode"}
    org_snapshot = SimpleNamespace(**{key: getattr(organization, key, None) for key in org_fields})
    snapshot = SimpleNamespace(**{key: getattr(member, key, None) for key in fields})
    snapshot.organization = org_snapshot
    snapshot._prepared_wallet_identity = identity
    return snapshot


def _queue(db, wallet_pass, *, now=None):
    now = now or datetime.utcnow()
    wallet_pass.next_check_at = now
    if wallet_pass.id is None:
        wallet_pass.desired_revision = 1
        if wallet_pass.job is None:
            wallet_pass.job = GoogleWalletSyncJob(status="pending", available_at=now, attempts=0)
        return
    db.execute(update(GoogleWalletPass).where(GoogleWalletPass.id == wallet_pass.id).values(
        desired_revision=GoogleWalletPass.desired_revision + 1), execution_options={"synchronize_session": False})
    db.expire(wallet_pass, ["desired_revision"])
    table = GoogleWalletSyncJob.__table__
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    statement = insert(table).values(pass_id=wallet_pass.id, status="pending", available_at=now, attempts=0)
    db.execute(statement.on_conflict_do_update(index_elements=[table.c.pass_id], set_={
        "available_at": now,
        "status": case((table.c.status == "processing", "processing"), else_="pending"),
    }))


def register_wallet_pass(db, member, *, class_id, object_id, payload=None, source_member=None):
    source_member = source_member or member
    record = next((p for p in db.new if isinstance(p, GoogleWalletPass) and p.object_id == object_id), None)
    record = record or db.query(GoogleWalletPass).filter_by(object_id=object_id).first()
    if record is None:
        kind = "temporary" if source_member.membership_type == "temporary" else "annual"
        purchase = _temporary_purchase(db, source_member) if kind == "temporary" else None
        record = GoogleWalletPass(member_id=member.id, org_id=member.org_id, class_id=class_id,
                                 object_id=object_id, kind=kind, temporary_purchase_id=purchase.id if purchase else None,
                                 revoked=False, desired_revision=1, synced_revision=0)
        db.add(record)
    if payload is not None:
        record.payload_json = deepcopy(payload)
    _queue(db, record)
    return record


def revoke_provisioned_pass(db, *, class_id, object_id, source_member):
    """Keep a durable revocation even if the member vanished during provisioning."""
    record = db.query(GoogleWalletPass).filter_by(object_id=object_id).first()
    if record is None:
        record = GoogleWalletPass(member_id=None, org_id=None, class_id=class_id, object_id=object_id,
                                 kind="temporary" if source_member.membership_type == "temporary" else "annual")
        db.add(record)
    record.member_id = None
    record.revoked = True
    record.payload_json = {"id": object_id, "state": "INACTIVE"}
    record.provisioning = False
    _queue(db, record)


def revoke_member_wallet_passes(db, member):
    """Bulk purges bypass ORM delete hooks; enqueue revocations before removing FKs."""
    records = db.query(GoogleWalletPass).filter_by(member_id=member.id).all()
    if not records and member.google_wallet_object_id and member.google_wallet_class_id:
        records = [register_wallet_pass(db, member, class_id=member.google_wallet_class_id,
                                       object_id=member.google_wallet_object_id)]
    for record in records:
        record.member_id = None
        record.revoked = True
        record.payload_json = {"id": record.object_id, "state": "INACTIVE"}
        _queue(db, record)


def track_wallet_changes(db):
    if db.info.get("wallet_sync_skip"):
        return
    members = [m for m in db.dirty | db.deleted if isinstance(m, Member)
               and (m in db.deleted or any(inspect(m).attrs[name].history.has_changes() for name in _MEMBER_FIELDS))]
    for member in members:
        records = db.query(GoogleWalletPass).filter_by(member_id=member.id).all()
        if not records:
            previous = db.execute(select(Member.__table__).where(Member.id == member.id)).mappings().first()
            if previous and previous["google_wallet_object_id"] and previous["google_wallet_class_id"]:
                source = SimpleNamespace(**previous)
                records = [register_wallet_pass(db, member, class_id=source.google_wallet_class_id,
                                                object_id=source.google_wallet_object_id, source_member=source)]
            elif member.google_wallet_object_id and member.google_wallet_class_id:
                records = [register_wallet_pass(db, member, class_id=member.google_wallet_class_id,
                                                object_id=member.google_wallet_object_id)]
        for record in records:
            if member in db.deleted:
                record.member_id = None
                record.revoked = True
                record.payload_json = {"id": record.object_id, "state": "INACTIVE"}
            _queue(db, record)
    for organization in db.dirty | db.deleted:
        if not isinstance(organization, Organization):
            continue
        if organization not in db.deleted and not any(inspect(organization).attrs[name].history.has_changes()
                                                      for name in _ORG_FIELDS if name in inspect(organization).attrs):
            continue
        for record in db.query(GoogleWalletPass).filter_by(org_id=organization.id).all():
            if organization in db.deleted:
                record.org_id = None
                record.revoked = True
            _queue(db, record)


def _payload_for_pass(db, record):
    from app.services.google_wallet import _build_generic_object_payload

    member = db.get(Member, record.member_id) if record.member_id is not None else None
    if record.revoked or member is None or member.deleted_at is not None or member.organization is None or not member.organization.is_active:
        return {"id": record.object_id, "state": "INACTIVE"}, datetime.utcnow() + timedelta(days=1)
    status = getattr(member.status, "value", member.status)
    if status not in {"active", "expired"}:
        return {"id": record.object_id, "state": "INACTIVE"}, datetime.utcnow() + timedelta(days=1)
    if record.kind == "temporary":
        from app.models import TemporaryMembershipPurchase

        purchase = db.get(TemporaryMembershipPurchase, record.temporary_purchase_id) if record.temporary_purchase_id else None
        if purchase is not None:
            snapshot = snapshot_wallet_member(db, member)
            for name in ("card_no", "card_year", "valid_from", "valid_until"):
                setattr(snapshot, name, getattr(purchase, name))
            snapshot.membership_type = "temporary"
            snapshot.status = "active" if status == "active" and purchase.status in {"active", "expired"} else "rejected"
            member = snapshot
        else:
            # Unlinked legacy passes must never inherit another issuance's number or QR.
            payload = deepcopy(record.payload_json) if record.payload_json else {"id": record.object_id}
            from app.services.card_verification import parse_card_verification_token
            barcode = payload.get("barcode", {}).get("value", "")
            proof = parse_card_verification_token(barcode.rstrip("/").rsplit("/", 1)[-1])
            end = payload.get("validTimeInterval", {}).get("end", {}).get("date")
            expiry = _utc(datetime.fromisoformat(end.replace("Z", "+00:00"))) if end else None
            matches = proof and (proof["card_number"], proof["card_year"]) == (member.card_no, member.card_year)
            payload["state"] = "ACTIVE" if status == "active" and matches and expiry and expiry > datetime.utcnow() else "EXPIRED"
            return payload, min(expiry, datetime.utcnow() + timedelta(days=1)) if expiry and expiry > datetime.utcnow() else datetime.utcnow() + timedelta(days=1)
    elif member.membership_type == "temporary":
        payload = deepcopy(record.payload_json) if record.payload_json else {"id": record.object_id}
        payload["state"] = "EXPIRED"
        return payload, datetime.utcnow() + timedelta(days=1)
    payload = _build_generic_object_payload(member=member, class_id=record.class_id, object_id=record.object_id)
    if not member.organization.is_active:
        payload["state"] = "INACTIVE"
    from app.services.member_membership import resolve_member_valid_until

    now = datetime.utcnow()
    expiry = _utc(resolve_member_valid_until(member))
    next_check = min(expiry, now + timedelta(days=1)) if expiry and expiry > now else now + timedelta(days=1)
    return payload, next_check


def refresh_due_wallet_passes(*, limit=25):
    """Bounded backstop for time boundaries and bulk database updates."""
    now = datetime.utcnow()
    with SessionLocal() as db:
        db.info["wallet_sync_skip"] = True
        legacy = (db.query(Member).filter(Member.google_wallet_object_id.isnot(None),
                    Member.google_wallet_class_id.isnot(None),
                    ~Member.id.in_(db.query(GoogleWalletPass.member_id).filter(GoogleWalletPass.member_id.isnot(None))))
                  .limit(limit).all())
        for member in legacy:
            register_wallet_pass(db, member, class_id=member.google_wallet_class_id, object_id=member.google_wallet_object_id)
        db.flush()
        records = (db.query(GoogleWalletPass).filter(GoogleWalletPass.next_check_at <= now)
                   .order_by(GoogleWalletPass.next_check_at, GoogleWalletPass.id).limit(limit).all())
        for record in records:
            try:
                payload, next_check = _payload_for_pass(db, record)
            except Exception as exc:
                record.last_error = type(exc).__name__
                record.next_check_at = now + timedelta(minutes=15)
                logger.warning("wallet_snapshot_failed pass_id=%s error_type=%s", record.id, type(exc).__name__)
                continue
            digest = _digest(payload)
            if record.payload_hash != digest:
                record.payload_hash = digest
                _queue(db, record, now=now)
            record.next_check_at = next_check
        db.commit()


@dataclass(frozen=True)
class ClaimedWalletJob:
    id: int
    pass_id: int
    lease_token: str


def claim_wallet_job():
    now = datetime.utcnow()
    with SessionLocal() as db:
        ready = or_(GoogleWalletSyncJob.status.in_(["pending", "failed"]),
                    (GoogleWalletSyncJob.status == "processing") & (GoogleWalletSyncJob.lease_expires_at <= now))
        query = (db.query(GoogleWalletSyncJob).filter(ready, GoogleWalletSyncJob.available_at <= now)
                 .order_by(GoogleWalletSyncJob.available_at, GoogleWalletSyncJob.id))
        if db.get_bind().dialect.name == "postgresql":
            query = query.with_for_update(skip_locked=True)
        job = query.first()
        if job is None:
            return None
        lease = str(uuid.uuid4())
        result = db.execute(update(GoogleWalletSyncJob).where(GoogleWalletSyncJob.id == job.id, ready).values(
            status="processing", lease_token=lease, lease_expires_at=now + timedelta(seconds=300),
            attempts=GoogleWalletSyncJob.attempts + 1))
        if result.rowcount != 1:
            db.rollback()
            return None
        claimed = ClaimedWalletJob(job.id, job.pass_id, lease)
        db.commit()
        return claimed


def process_wallet_job(claimed, *, sync=None):
    from app.services.google_wallet import GoogleWalletApiError, GoogleWalletConfigError, patch_google_wallet_object

    failure = None
    delay = None
    try:
        with SessionLocal() as db:
            db.info["wallet_sync_skip"] = True
            record = db.get(GoogleWalletPass, claimed.pass_id)
            if record is None:
                return False
            revision = record.desired_revision
            payload, next_check = _payload_for_pass(db, record)
            object_id = record.object_id
            provisioning = record.provisioning
            db.commit()
        exists = (sync or patch_google_wallet_object)(object_id=object_id, payload=payload)
        if exists is False and provisioning:
            raise GoogleWalletApiError(status_code=404, message="Provisioning not yet visible")
    except Exception as exc:
        # Provider bodies and credential paths are never stored in delivery errors.
        failure = type(exc).__name__
        delay = 900 if isinstance(exc, GoogleWalletConfigError) else getattr(exc, "retry_after", None)
        logger.warning("wallet_sync_failed pass_id=%s error_type=%s", claimed.pass_id, failure)
    with SessionLocal() as db:
        db.info["wallet_sync_skip"] = True
        record = db.query(GoogleWalletPass).filter_by(id=claimed.pass_id).with_for_update().first()
        if record is None:
            return False
        job = db.query(GoogleWalletSyncJob).filter_by(id=claimed.id, lease_token=claimed.lease_token, status="processing").with_for_update().first()
        if job is None:
            _queue(db, record)
            db.commit()
            return False
        now = datetime.utcnow()
        record.last_error = failure
        job.last_error = failure
        job.lease_token = None
        job.lease_expires_at = None
        if failure:
            job.status = "failed"
            job.available_at = now + timedelta(seconds=delay or min(3600, 30 * 2 ** min(job.attempts - 1, 7)))
        else:
            record.provisioning = False
            record.synced_revision = revision
            record.last_synced_at = now
            record.payload_json = {"id": record.object_id, "state": "INACTIVE"} if record.revoked else payload
            if record.desired_revision == revision:
                record.payload_hash = _digest(payload)
                record.next_check_at = next_check
                job.status = "completed"
            else:
                job.status = "pending"
                job.available_at = now
        db.commit()
        return failure is None


def process_wallet_sync_once(*, limit=25, sync=None, heartbeat=None):
    refresh_due_wallet_passes(limit=limit)
    stats = {"claimed": 0, "synced": 0, "failed": 0}
    for _ in range(limit):
        claimed = claim_wallet_job()
        if claimed is None:
            break
        stats["claimed"] += 1
        ok = process_wallet_job(claimed, sync=sync)
        stats["synced" if ok else "failed"] += 1
        if heartbeat:
            heartbeat()
    return stats

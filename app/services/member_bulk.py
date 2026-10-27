"""Confirmed member operations with frozen selection and atomic outbox receipts.

Preview never sends a message. Every execution processes a bounded batch and
commits each batch together with its idempotency receipt. The existing email
worker owns transport retries; a successful item means queued, not delivered.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from itertools import islice

from fastapi import HTTPException, Request
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app import audit
from app.config import settings
from app.models import AdminRole, AdminUser, EmailOutbox, Member, MemberNotification, MemberNotificationType, MemberStatus, Organization, Token, TokenType
from app.models_member_bulk import MemberBulkItem, MemberBulkRequest, MemberBulkRun
from app.services.annual_memberships import as_rome_datetime
from app.services.email_outbox import build_email_payload, enqueue_email
from app.services.email_sender import build_sender_payload
from app.services.member_activity import is_member_active
from app.services.member_filters import build_org_member_query
from app.services.member_search import iter_member_search_ids, normalize_member_search
from app.services.member_sessions import issue_member_auth_token
from app.services.org_admin_sessions import resolve_org_admin_session
from app.services.system_email_layout import build_system_email_html


logger = logging.getLogger(__name__)
MAX_SELECTION = 10_000
BATCH_SIZE = 25
PREVIEW_TTL = timedelta(minutes=30)
ACCESS_THROTTLE = timedelta(minutes=10)
_email_type = TypeAdapter(EmailStr)
_STATUSES = ("pending", "succeeded", "skipped", "failed")
_ACTION_LABELS = {"export": "Esporta soci", "send_access": "Invia accesso", "quote_reminder": "Sollecita quota"}


def _now(value: datetime | None = None) -> datetime:
    value = value or datetime.now(timezone.utc)
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    return _now(value).isoformat() if value is not None else None


def acquire_sqlite_member_action_lock(db: Session) -> None:
    """SQLite ignores FOR UPDATE: take its writer lock before reading throttle.

    This also serializes the legacy single-member access endpoint against a
    bulk run across processes. PostgreSQL uses the narrower run/member locks.
    """
    if db.get_bind().dialect.name != "sqlite":
        return
    connection = db.connection()
    connection.exec_driver_sql("PRAGMA busy_timeout = 5000")
    if not connection.connection.driver_connection.in_transaction:
        connection.exec_driver_sql("BEGIN IMMEDIATE")


def _actor(db: Session, admin: AdminUser) -> AdminUser:
    current = (
        db.query(AdminUser)
        .join(Organization, Organization.id == AdminUser.org_id)
        .filter(
            AdminUser.id == admin.id, AdminUser.org_id == admin.org_id,
            AdminUser.role == AdminRole.ORG_ADMIN, AdminUser.is_active.is_(True),
            AdminUser.deleted_at.is_(None), Organization.is_active.is_(True),
            Organization.deleted_at.is_(None),
        )
        .populate_existing().first()
    )
    if current is None:
        raise HTTPException(status_code=403, detail="Accesso non disponibile per questa associazione.")
    return current


def _fingerprint(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def _email_hash(member: Member) -> str | None:
    value = (member.email or "").strip().lower()
    return hashlib.sha256(value.encode()).hexdigest() if value else None


def _member_name(member: Member | None, requested_id: int) -> str:
    if member is None:
        return f"Socio #{requested_id}"
    return " ".join(value for value in (member.first_name, member.last_name) if value).strip() or f"Socio #{requested_id}"


def _valid_email(member: Member) -> bool:
    try:
        _email_type.validate_python((member.email or "").strip())
        return True
    except ValidationError:
        return False


def _quote_key(org_id: int, member_id: int, year: int, now: datetime) -> str:
    return f"bulk-quote-reminder:{org_id}:{member_id}:{year}:{as_rome_datetime(now).date().isoformat()}"


def _context(db: Session, members: list[Member], action: str, year: int | None, now: datetime) -> dict:
    ids = [member.id for member in members]
    context: dict = {"last_access": {}, "balances": {}, "reminded": set()}
    if action == "send_access" and ids:
        context["last_access"] = dict(
            db.query(Token.member_id, func.max(Token.created_at))
            .filter(Token.member_id.in_(ids), Token.purpose == TokenType.LOGIN_MAGIC_LINK)
            .group_by(Token.member_id).all()
        )
    elif action == "quote_reminder" and members and year is not None:
        from app.services.member_accounting import member_year_balances

        context["balances"] = member_year_balances(db, members=members, year=year)
        keys = [_quote_key(member.org_id, member.id, year, now) for member in members]
        context["reminded"] = {key for (key,) in db.query(MemberNotification.dedupe_key).filter(MemberNotification.dedupe_key.in_(keys)).all()}
    return context


def _eligibility(member: Member | None, *, action: str, year: int | None, now: datetime, context: dict) -> tuple[str | None, str | None]:
    if member is None or member.deleted_at is not None:
        return "member_unavailable", "Il socio non è più disponibile."
    if action == "export":
        return None, None
    if action == "send_access" and not is_member_active(member, now=now.replace(tzinfo=None)):
        return "member_not_active", "L'accesso è disponibile solo per soci con tessera attiva."
    if action == "quote_reminder":
        status = getattr(member.status, "value", member.status)
        if status not in {MemberStatus.ACTIVE.value, MemberStatus.EXPIRED.value}:
            return "member_not_approved", "Il socio non è approvato o è stato rifiutato."
    if not _valid_email(member):
        return "invalid_email", "Manca un indirizzo email valido."
    if action == "send_access":
        if member.password_hash:
            return "access_already_active", "Il socio ha già un accesso attivo."
        last_access = context["last_access"].get(member.id)
        if last_access is not None and now - _now(last_access) < ACCESS_THROTTLE:
            return "access_recently_queued", "Un accesso è già stato accodato negli ultimi 10 minuti."
    if action == "quote_reminder":
        balance = context["balances"].get(member.id, {})
        if balance.get("currency", "EUR") != "EUR":
            return "unsupported_currency", "Il sollecito richiede una quota in euro."
        if balance.get("expected_cents", 0) <= 0:
            return "no_fee_due", "Non risulta una quota dovuta per questa annualità."
        if balance.get("outstanding_cents", 0) <= 0:
            return "already_paid", "La quota risulta già saldata."
        if _quote_key(member.org_id, member.id, year, now) in context["reminded"]:
            return "reminder_recently_queued", "Un sollecito per questa quota è già stato accodato oggi."
    return None, None


def _selected_ids(db: Session, *, org_id: int, selection: dict) -> list[int]:
    if selection["mode"] == "ids":
        ids = sorted(set(selection["member_ids"]))
        available = set()
        for start in range(0, len(ids), 500):
            available.update(value for (value,) in db.query(Member.id).filter(Member.org_id == org_id, Member.id.in_(ids[start:start + 500])).all())
        if len(available) != len(ids):
            raise HTTPException(status_code=404, detail="Uno o più soci selezionati non sono disponibili.")
        return ids
    filters = dict(selection.get("filters") or {})
    search = normalize_member_search(filters.pop("q", None))
    query = build_org_member_query(db, org_id=org_id, **filters)
    excluded = set(selection.get("excluded_ids") or [])
    ids = list(islice((value for value in iter_member_search_ids(query, search) if value not in excluded), MAX_SELECTION + 1))
    if len(ids) > MAX_SELECTION:
        raise HTTPException(status_code=422, detail="La selezione supera 10.000 soci. Restringi i filtri e riprova.")
    return ids


def _audit(db: Session, *, admin: AdminUser, run: MemberBulkRun, action: str, metadata: dict | None = None) -> None:
    audit.log_operation(
        db, action=f"member_bulk.{action}", entity_type="member_bulk_run",
        actor_admin_id=admin.id, actor_role=AdminRole.ORG_ADMIN.value,
        org_id=admin.org_id, metadata={"run_id": run.id, "action": run.action, "selected_count": run.selected_count, **(metadata or {})},
    )


def preview_run(db: Session, *, admin: AdminUser, payload: dict, now: datetime | None = None) -> MemberBulkRun:
    checked_at = _now(now)
    acquire_sqlite_member_action_lock(db)
    _actor(db, admin)
    fingerprint_payload = {key: value for key, value in payload.items() if key != "request_key"}
    fingerprint_payload["selection"] = dict(fingerprint_payload["selection"])
    for field in ("member_ids", "excluded_ids"):
        fingerprint_payload["selection"][field] = sorted(set(fingerprint_payload["selection"].get(field) or []))
    fingerprint = _fingerprint(fingerprint_payload)
    existing = db.query(MemberBulkRun).filter(MemberBulkRun.org_id == admin.org_id, MemberBulkRun.created_by_admin_id == admin.id, MemberBulkRun.request_key == payload["request_key"]).first()
    if existing is not None:
        if existing.payload_fingerprint != fingerprint:
            raise HTTPException(status_code=409, detail="La chiave di richiesta è già associata a un'altra selezione.")
        db.commit()
        return existing
    ids = _selected_ids(db, org_id=admin.org_id, selection=payload["selection"])
    if not ids:
        raise HTTPException(status_code=422, detail="Seleziona almeno un socio disponibile.")
    run = MemberBulkRun(
        org_id=admin.org_id, created_by_admin_id=admin.id,
        request_key=payload["request_key"], payload_fingerprint=fingerprint,
        action=payload["action"], selection_mode=payload["selection"]["mode"],
        membership_year=payload.get("membership_year"), selected_count=len(ids), eligible_count=0,
        created_at=checked_at, expires_at=checked_at + PREVIEW_TTL, updated_at=checked_at,
    )
    db.add(run)
    try:
        db.flush()
    except IntegrityError:
        # A concurrent preview may have claimed this actor/key while we read
        # the selection. The unique constraint serializes that claim without
        # locking the admin row against unrelated account/security updates.
        db.rollback()
        _actor(db, admin)
        existing = db.query(MemberBulkRun).filter(
            MemberBulkRun.org_id == admin.org_id,
            MemberBulkRun.created_by_admin_id == admin.id,
            MemberBulkRun.request_key == payload["request_key"],
        ).first()
        if existing is None:
            raise
        if existing.payload_fingerprint != fingerprint:
            raise HTTPException(409, "La chiave di richiesta è già associata a un'altra selezione.")
        return existing
    for start in range(0, len(ids), 500):
        page = ids[start:start + 500]
        members = db.query(Member).options(joinedload(Member.organization)).filter(Member.org_id == admin.org_id, Member.id.in_(page)).all()
        by_id = {member.id: member for member in members}
        context = _context(db, members, run.action, run.membership_year, checked_at)
        for member_id in page:
            member = by_id.get(member_id)
            reason, detail = _eligibility(member, action=run.action, year=run.membership_year, now=checked_at, context=context)
            eligible = reason is None
            run.eligible_count += int(eligible)
            db.add(MemberBulkItem(
                run_id=run.id, member_id=member.id if member is not None else None,
                requested_member_id=member_id,
                target_email_hash=_email_hash(member) if member is not None and run.action != "export" else None,
                preview_outstanding_cents=context["balances"].get(member_id, {}).get("outstanding_cents") if eligible and run.action == "quote_reminder" else None,
                preview_eligible=eligible, status="pending" if eligible else "skipped", reason_code=reason, detail=detail,
            ))
        db.flush()
        # SQLAlchemy's weak identity map releases each page; no registry of
        # loaded member entities is retained for the complete selection.
    _audit(db, admin=admin, run=run, action="previewed", metadata={"eligible_count": run.eligible_count})
    db.commit()
    return run


def get_run(db: Session, *, admin: AdminUser, run_id: str, lock: bool = False) -> MemberBulkRun:
    _actor(db, admin)
    query = db.query(MemberBulkRun).filter(MemberBulkRun.id == run_id, MemberBulkRun.org_id == admin.org_id, MemberBulkRun.created_by_admin_id == admin.id)
    if lock:
        query = query.populate_existing().with_for_update()
    run = query.first()
    if run is None:
        raise HTTPException(status_code=404, detail="Operazione non trovata.")
    return run


def serialize_run(db: Session, run: MemberBulkRun, *, offset: int = 0, limit: int = 50, now: datetime | None = None) -> dict:
    checked_at = _now(now)
    counts = dict.fromkeys(_STATUSES, 0)
    total_cents = 0
    for status, count, amount in db.query(MemberBulkItem.status, func.count(MemberBulkItem.id), func.coalesce(func.sum(MemberBulkItem.preview_outstanding_cents), 0)).filter(MemberBulkItem.run_id == run.id).group_by(MemberBulkItem.status).all():
        counts[status] = count
        total_cents += int(amount)
    reasons = dict(db.query(MemberBulkItem.reason_code, func.count(MemberBulkItem.id)).filter(MemberBulkItem.run_id == run.id, MemberBulkItem.reason_code.isnot(None)).group_by(MemberBulkItem.reason_code).all())
    items = db.query(MemberBulkItem).filter(MemberBulkItem.run_id == run.id).order_by(MemberBulkItem.id).offset(offset).limit(limit).all()
    ids = [item.member_id for item in items if item.member_id is not None]
    members = {member.id: member for member in db.query(Member).filter(Member.org_id == run.org_id, Member.id.in_(ids), Member.deleted_at.is_(None)).all()} if ids else {}
    outbox_ids = [item.outbox_id for item in items if item.outbox_id]
    delivery = dict(db.query(EmailOutbox.id, EmailOutbox.status).filter(EmailOutbox.id.in_(outbox_ids)).all()) if outbox_ids else {}
    status = "expired" if run.status == "preview" and _now(run.expires_at) <= checked_at else run.status
    return {
        "id": run.id, "action": run.action, "action_label": _ACTION_LABELS[run.action] + (f" {run.membership_year}" if run.action == "quote_reminder" else ""),
        "membership_year": run.membership_year, "selection_mode": run.selection_mode, "status": status,
        "selected_count": run.selected_count, "eligible_count": run.eligible_count, "counts": counts, "reason_counts": reasons,
        "currency": "EUR", "outstanding_total_cents": total_cents if run.action == "quote_reminder" else None,
        "created_at": _iso(run.created_at), "expires_at": _iso(run.expires_at), "started_at": _iso(run.started_at), "completed_at": _iso(run.completed_at),
        "items": [{
            "member_id": item.requested_member_id,
            "name": _member_name(members.get(item.member_id), item.requested_member_id),
            "status": item.status, "reason_code": item.reason_code, "detail": item.detail,
            "attempts": item.attempts, "delivery_status": delivery.get(item.outbox_id),
            "amount_cents": item.preview_outstanding_cents, "currency": "EUR",
        } for item in items],
        "offset": offset, "limit": limit, "total": run.selected_count, "has_more": offset + len(items) < run.selected_count,
        "can_execute": status in {"preview", "running"} and counts["pending"] > 0,
        "can_retry_failed": status in {"running", "completed"} and counts["failed"] > 0,
        "can_download": run.action == "export" and status == "completed" and counts["succeeded"] > 0,
    }


def _request_seen(db: Session, run: MemberBulkRun, *, request_key: str, operation: str) -> bool:
    existing = db.query(MemberBulkRequest).filter(MemberBulkRequest.run_id == run.id, MemberBulkRequest.request_key == request_key).first()
    if existing is not None:
        if existing.operation != operation:
            raise HTTPException(status_code=409, detail="La chiave di richiesta è già associata a un'altra operazione.")
        return True
    db.add(MemberBulkRequest(run_id=run.id, request_key=request_key, operation=operation))
    return False


def _queue_access(db: Session, *, member: Member, run: MemberBulkRun, request: Request, now: datetime) -> str:
    token_str, _token = issue_member_auth_token(db, member=member, purpose=TokenType.LOGIN_MAGIC_LINK, expires_at=now.replace(tzinfo=None) + timedelta(minutes=settings.LOGIN_TOKEN_EXPIRE_MINUTES))
    frontend = (settings.FRONTEND_URL or settings.BASE_URL or str(request.base_url)).rstrip("/")
    link = f"{frontend}/auth/verify?token={token_str}&role=member"
    return enqueue_email(
        db, email_type="member_magic_link", to_email=member.email.strip(), subject="Accesso Area Riservata - ASSO.N.A.M.",
        payload=build_email_payload(
            text_body=f"Sei stato registrato come socio. Clicca qui per accedere alla tua area riservata: {link}\n\nIl link scade tra {settings.LOGIN_TOKEN_EXPIRE_MINUTES} minuti.",
            sender=build_sender_payload(mode="association", association=member.organization),
            meta={"member_id": member.id, "org_id": member.org_id, "token_purpose": TokenType.LOGIN_MAGIC_LINK.value, "bulk_run_id": run.id, "service_message": True},
        ), priority=1, dedupe_key=f"member-bulk-access:{run.id}:{member.id}",
    )


def _queue_reminder(db: Session, *, member: Member, run: MemberBulkRun, request: Request, balance: dict, now: datetime) -> str:
    cents = int(balance["outstanding_cents"])
    amount = f"{cents // 100},{cents % 100:02d} EUR"
    title = f"Quota associativa {run.membership_year} da completare"
    body = f"Risulta ancora da registrare un saldo di {amount} per la quota {run.membership_year}. Se hai già versato la quota, contatta l'associazione per la verifica."
    frontend = (settings.FRONTEND_URL or settings.BASE_URL or str(request.base_url)).rstrip("/")
    dashboard = f"{frontend}/dashboard"
    key = _quote_key(member.org_id, member.id, run.membership_year, now)
    db.add(MemberNotification(member_id=member.id, org_id=member.org_id, type=MemberNotificationType.RENEWAL.value, title=title, body=body, href="/dashboard", dedupe_key=key))
    return enqueue_email(
        db, email_type="membership_fee_reminder", to_email=member.email.strip(), subject=title,
        payload=build_email_payload(
            text_body=f"{title}\n\n{body}\n\n{dashboard}",
            html_body=build_system_email_html(title=title, eyebrow="Quota associativa", organization_name=member.organization.name or "", body=body, preheader=body, cta_url=dashboard, cta_label="Apri area riservata", details=[("Annualità", str(run.membership_year)), ("Saldo da verificare", amount)]),
            sender=build_sender_payload(mode="association", association=member.organization),
            meta={"member_id": member.id, "org_id": member.org_id, "membership_year": run.membership_year, "bulk_run_id": run.id, "service_message": True},
        ), priority=3, dedupe_key=key,
    )


def execute_run(db: Session, *, admin: AdminUser, run_id: str, request_key: str, request: Request, now: datetime | None = None) -> MemberBulkRun:
    checked_at = _now(now)
    acquire_sqlite_member_action_lock(db)
    run = get_run(db, admin=admin, run_id=run_id, lock=True)
    if run.status == "expired" or (run.status == "preview" and _now(run.expires_at) <= checked_at):
        run.status = "expired"
        db.commit()
        raise HTTPException(status_code=409, detail="L'anteprima è scaduta. Verifica una nuova selezione.")
    if _request_seen(db, run, request_key=request_key, operation="execute"):
        db.commit()
        return run
    if run.status == "completed":
        db.commit()
        return run
    run.status = "running"
    run.started_at = run.started_at or checked_at
    run.updated_at = checked_at
    # The run lock serializes execution. Lock profiles before their item rows:
    # profile purges acquire the member lock before detaching the item FK.
    items = db.query(MemberBulkItem).filter(MemberBulkItem.run_id == run.id, MemberBulkItem.status == "pending").order_by(MemberBulkItem.id).limit(BATCH_SIZE).all()
    for item in items:
        try:
            with db.begin_nested():
                _actor(db, admin)
                authenticated = resolve_org_admin_session(request, db, touch=False)
                if authenticated is None or authenticated.admin.id != admin.id:
                    raise HTTPException(status_code=401, detail="La sessione non è più valida. Accedi nuovamente.")
                member = db.query(Member).join(MemberBulkItem, MemberBulkItem.member_id == Member.id).options(joinedload(Member.organization)).filter(
                    MemberBulkItem.id == item.id, Member.org_id == run.org_id,
                ).populate_existing().with_for_update(of=Member).first()
                item = db.query(MemberBulkItem).filter(MemberBulkItem.id == item.id).populate_existing().with_for_update().one()
                if member is not None and item.member_id != member.id:
                    member = None
                context = _context(db, [member] if member is not None else [], run.action, run.membership_year, checked_at)
                reason, detail = _eligibility(member, action=run.action, year=run.membership_year, now=checked_at, context=context)
                if reason is None and run.action != "export" and _email_hash(member) != item.target_email_hash:
                    reason, detail = "recipient_changed", "L'indirizzo email è cambiato dopo l'anteprima. Crea una nuova selezione."
                balance = context["balances"].get(item.member_id, {})
                if reason is None and run.action == "quote_reminder" and balance.get("outstanding_cents") != item.preview_outstanding_cents:
                    reason, detail = "balance_changed", "Il saldo è cambiato dopo l'anteprima. Verifica una nuova selezione."
                item.attempts += 1
                item.processed_at = checked_at
                if reason is not None:
                    item.status, item.reason_code, item.detail = "skipped", reason, detail
                else:
                    if run.action == "send_access":
                        item.outbox_id = _queue_access(db, member=member, run=run, request=request, now=checked_at)
                    elif run.action == "quote_reminder":
                        item.outbox_id = _queue_reminder(db, member=member, run=run, request=request, balance=balance, now=checked_at)
                    item.status, item.reason_code, item.detail = "succeeded", None, None
                db.flush()
        except HTTPException as error:
            if error.status_code in {401, 403}:
                # An authorization change aborts the whole uncommitted batch.
                db.rollback()
                raise
            logger.warning("member_bulk_item_failed run_id=%s member_id=%s error_type=%s", run.id, item.member_id, type(error).__name__)
            item.status, item.reason_code, item.detail = "failed", "operation_failed", "Operazione non completata. Puoi riprovare questa riga."
            item.attempts += 1
            item.processed_at = checked_at
        except Exception:
            logger.exception("member_bulk_item_failed run_id=%s member_id=%s", run.id, item.member_id)
            item.status, item.reason_code, item.detail = "failed", "operation_failed", "Operazione non completata. Puoi riprovare questa riga."
            item.attempts += 1
            item.processed_at = checked_at
    pending = db.query(MemberBulkItem.id).filter(MemberBulkItem.run_id == run.id, MemberBulkItem.status == "pending").first()
    if pending is None:
        run.status, run.completed_at = "completed", checked_at
    _audit(db, admin=admin, run=run, action="executed", metadata={"batch_count": len(items), "request_key": request_key})
    db.commit()
    return run


def retry_failed_run(db: Session, *, admin: AdminUser, run_id: str, request_key: str, now: datetime | None = None) -> MemberBulkRun:
    acquire_sqlite_member_action_lock(db)
    run = get_run(db, admin=admin, run_id=run_id, lock=True)
    if run.status not in {"running", "completed"}:
        raise HTTPException(status_code=409, detail="Conferma prima l'operazione.")
    if _request_seen(db, run, request_key=request_key, operation="retry_failed"):
        db.commit()
        return run
    changed = db.query(MemberBulkItem).filter(MemberBulkItem.run_id == run.id, MemberBulkItem.status == "failed").update({MemberBulkItem.status: "pending", MemberBulkItem.reason_code: None, MemberBulkItem.detail: None}, synchronize_session=False)
    if changed:
        run.status, run.completed_at, run.updated_at = "running", None, _now(now)
    _audit(db, admin=admin, run=run, action="retry_requested", metadata={"retry_count": changed, "request_key": request_key})
    db.commit()
    return run


def export_run_members(db: Session, *, admin: AdminUser, run_id: str) -> tuple[MemberBulkRun, list[Member]]:
    run = get_run(db, admin=admin, run_id=run_id)
    if run.action != "export" or run.status != "completed":
        raise HTTPException(status_code=409, detail="Conferma e completa l'esportazione prima di scaricare il file.")
    members = (
        db.query(Member).join(MemberBulkItem, MemberBulkItem.member_id == Member.id)
        .filter(MemberBulkItem.run_id == run.id, MemberBulkItem.status == "succeeded", Member.org_id == run.org_id, Member.deleted_at.is_(None))
        .order_by(Member.last_name.asc(), Member.first_name.asc(), Member.id.asc()).all()
    )
    _audit(db, admin=admin, run=run, action="export_downloaded", metadata={"exported_count": len(members)})
    db.commit()
    return run, members


def list_runs(db: Session, *, admin: AdminUser, limit: int = 10, offset: int = 0, now: datetime | None = None) -> dict:
    _actor(db, admin)
    checked_at = _now(now)
    query = db.query(MemberBulkRun).filter(MemberBulkRun.org_id == admin.org_id, MemberBulkRun.created_by_admin_id == admin.id)
    total = query.count()
    runs = query.order_by(MemberBulkRun.created_at.desc(), MemberBulkRun.id.desc()).offset(offset).limit(limit).all()
    counts_by_run = {run.id: dict.fromkeys(_STATUSES, 0) for run in runs}
    if runs:
        for run_id, status, count in db.query(MemberBulkItem.run_id, MemberBulkItem.status, func.count(MemberBulkItem.id)).filter(MemberBulkItem.run_id.in_(counts_by_run)).group_by(MemberBulkItem.run_id, MemberBulkItem.status).all():
            counts_by_run[run_id][status] = count
    return {"items": [{
        "id": run.id, "action": run.action, "action_label": _ACTION_LABELS[run.action] + (f" {run.membership_year}" if run.action == "quote_reminder" else ""),
        "membership_year": run.membership_year,
        "status": "expired" if run.status == "preview" and _now(run.expires_at) <= checked_at else run.status,
        "created_at": _iso(run.created_at), "selected_count": run.selected_count,
        "eligible_count": run.eligible_count, "counts": counts_by_run[run.id],
    } for run in runs], "total": total, "offset": offset, "limit": limit}

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import logging
import re

from fastapi import HTTPException
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session, joinedload

from app import audit
from app.models import (
    AnnualMembershipTerm, CardBatch, CardMovement, Member, MembershipPayment,
    NumberingScope, OperationLog, Organization, RechargeRequest,
)
from app.services.card_allocation import lock_card_allocation
from app.services.card_availability import CardBatchAvailability, card_batch_availability, card_lot_status
from app.services.numbering_scopes import (
    ASSONAM_CENTRAL_SCOPE_NAME,
    NUMBERING_MODE_SHARED_ASSONAM,
    get_assonam_central_scope,
    get_numbering_mode,
)

logger = logging.getLogger(__name__)

EMPTY_SHARED_POOL_BASE = 30000
RECHARGE_REQUEST_STATUS_NEW = "new"
RECHARGE_REQUEST_STATUS_LOT_CREATED = "lot_created"
RECHARGE_REQUEST_STATUS_BLOCKED_NON_SHARED = "blocked_non_shared"
LOT_LOCK_NAMESPACE = 2
MAX_AUTOMATIC_LOT_QUANTITY = 100000
# next_no may be end_no + 1, so leave room for that sentinel in PostgreSQL INTEGER.
MAX_AUTOMATIC_CARD_NUMBER = (1 << 31) - 2
AUTOMATIC_LOT_ACTION = "org.cards.batch_created_from_registry"
_CARD_NUMBER_SANITIZE_RE = re.compile(r"[.\s]")


@dataclass(frozen=True)
class CardLotRegistryRow:
    batch: CardBatch
    organization_name: str | None
    numbering_scope_name: str | None
    recharge_request_id: int | None
    availability: CardBatchAvailability


def parse_card_number(value) -> int:
    if isinstance(value, bool):
        raise ValueError("Card number boolean values are not valid")
    if isinstance(value, int):
        if value <= 0:
            raise ValueError("Card number must be positive")
        return value
    if isinstance(value, str):
        cleaned = _CARD_NUMBER_SANITIZE_RE.sub("", value.strip())
        if not cleaned or not cleaned.isdigit():
            raise ValueError("Card number format is not valid")
        parsed = int(cleaned)
        if parsed <= 0:
            raise ValueError("Card number must be positive")
        return parsed
    raise ValueError("Unsupported card number value")


def format_card_number(n: int) -> str:
    value = parse_card_number(n)
    return f"{value:,}".replace(",", ".")


def compute_next_lot(max_end: int | None, qty: int, *, default_base: int = EMPTY_SHARED_POOL_BASE) -> tuple[int, int]:
    if qty <= 0:
        raise ValueError("Lot quantity must be positive")
    base = int(max_end) if max_end is not None else int(default_base)
    start_no = base + 1
    end_no = start_no + int(qty) - 1
    return start_no, end_no


def _lot_scope_lock_key(scope_id: int, *, namespace: int = LOT_LOCK_NAMESPACE) -> int:
    raw_key = ((namespace & 0xFFFF) << 48) | (scope_id & 0xFFFFFFFFFFFF)
    if raw_key >= (1 << 63):
        raw_key -= (1 << 64)
    return raw_key


def acquire_shared_lot_lock(db: Session, scope_id: int) -> None:
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        db.execute(
            text("SELECT pg_advisory_xact_lock(:lock_key)"),
            {"lock_key": _lot_scope_lock_key(scope_id)},
        )
        return
    if dialect == "sqlite":
        db.execute(text("PRAGMA busy_timeout = 5000"))
        if not db.in_transaction():
            db.execute(text("BEGIN IMMEDIATE"))


def acquire_card_lot_table_lock(db: Session) -> None:
    """Serialize range checks with all manual and automatic batch writers.

    When combined with other locks, acquire organization/allocation scope first,
    recharge scope second, and this table lock last. Never commit in between.
    """
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        db.execute(text("LOCK TABLE card_batches IN SHARE ROW EXCLUSIVE MODE"))
    elif dialect == "sqlite":
        connection = db.connection()
        connection.exec_driver_sql("PRAGMA busy_timeout = 5000")
        if not connection.connection.driver_connection.in_transaction:
            connection.exec_driver_sql("BEGIN IMMEDIATE")


def _automatic_lot_bounds(db: Session, org: Organization, quantity: int) -> tuple[int, int]:
    if org.deleted_at is not None:
        raise HTTPException(status_code=409, detail="L'associazione è archiviata")
    if type(quantity) is not int or not 1 <= quantity <= MAX_AUTOMATIC_LOT_QUANTITY:
        raise HTTPException(status_code=422, detail="Quantità tessere non valida")
    db.flush()
    # Includes all years, disabled and released lots. Null scope retains the
    # historical global legacy-domain overlap rule used by manual creation.
    max_end = (
        db.query(func.max(CardBatch.end_no))
        .filter(CardBatch.numbering_scope_id == org.numbering_scope_id)
        .scalar()
    )
    base = EMPTY_SHARED_POOL_BASE if get_numbering_mode(org) == NUMBERING_MODE_SHARED_ASSONAM else 0
    last_number = int(max_end) if max_end is not None else base
    # Legacy and unlinked assignments can sit beyond the lot history. Protect
    # owned numbers and numbers in the same scope, including linked-batch scope.
    for model, number, scope, batch_id, filters in (
        (Member, Member.card_no, Member.numbering_scope_id, Member.batch_id, []),
        (AnnualMembershipTerm, AnnualMembershipTerm.card_no,
         AnnualMembershipTerm.numbering_scope_id, AnnualMembershipTerm.batch_id,
         [AnnualMembershipTerm.status.notin_(("expired", "cancelled"))]),
        (MembershipPayment, MembershipPayment.reserved_card_no,
         MembershipPayment.reserved_numbering_scope_id, MembershipPayment.reserved_batch_id,
         [MembershipPayment.reservation_state == "held"]),
    ):
        domain = [model.org_id == org.id]
        if org.numbering_scope_id is not None:
            domain.extend((scope == org.numbering_scope_id,
                           CardBatch.numbering_scope_id == org.numbering_scope_id))
        else:
            domain.append(scope.is_(None))
        occupied_max = (
            db.query(func.max(number)).select_from(model)
            .outerjoin(CardBatch, batch_id == CardBatch.id)
            .filter(or_(*domain), *filters).scalar()
        )
        if occupied_max is not None:
            last_number = max(last_number, int(occupied_max))
    start_no, end_no = compute_next_lot(last_number, quantity, default_base=base)
    if end_no > MAX_AUTOMATIC_CARD_NUMBER:
        raise HTTPException(status_code=409, detail="Limite della numerazione tessere raggiunto")
    return start_no, end_no


def preview_automatic_card_lot(
    db: Session, *, org: Organization, quantity: int, year: int
) -> dict[str, object]:
    start_no, end_no = _automatic_lot_bounds(db, org, quantity)
    return {
        "organization_id": org.id,
        "organization_name": org.name,
        "quantity": quantity,
        "year": year,
        "numbering_scope_id": org.numbering_scope_id,
        "numbering_scope_name": getattr(org.numbering_scope, "name", None),
        "range_start": start_no,
        "range_end": end_no,
        "range_start_label": format_card_number(start_no),
        "range_end_label": format_card_number(end_no),
    }


def create_automatic_card_lot(
    db: Session, *, organization_id: int, quantity: int, year: int,
    idempotency_key: str, actor_admin_id: int, ip: str | None = None,
) -> tuple[CardBatch, bool]:
    """Create lot, stock movement and retry receipt in the caller's transaction."""
    org = lock_card_allocation(db, organization_id, year)
    if org.numbering_scope_id is not None:
        acquire_shared_lot_lock(db, org.numbering_scope_id)
    acquire_card_lot_table_lock(db)
    prior = (
        db.query(OperationLog)
        .filter(OperationLog.action == AUTOMATIC_LOT_ACTION,
                OperationLog.actor_admin_id == actor_admin_id,
                OperationLog.request_id == idempotency_key)
        .order_by(OperationLog.id).first()
    )
    if prior is not None:
        metadata = prior.metadata_json or {}
        if any(metadata.get(key) != value for key, value in (
            ("org_id", org.id), ("quantity", quantity), ("year", year)
        )):
            raise HTTPException(status_code=409, detail="Richiesta già utilizzata con dati diversi")
        batch = db.query(CardBatch).filter(CardBatch.id == prior.entity_id).first()
        if batch is None or batch.released_at is not None:
            raise HTTPException(status_code=409, detail="Il lotto di questa richiesta è stato eliminato")
        return batch, True

    start_no, end_no = _automatic_lot_bounds(db, org, quantity)
    batch = CardBatch(
        org_id=org.id, numbering_scope_id=org.numbering_scope_id, year=year,
        start_no=start_no, end_no=end_no, next_no=start_no, is_enabled=True,
        notes="Creato dal Registro lotti",
    )
    db.add(batch)
    db.flush()
    db.add(CardMovement(
        org_id=org.id, admin_id=actor_admin_id, delta=quantity,
        reason="batch_added",
    ))
    audit.log_operation(
        db, action=AUTOMATIC_LOT_ACTION, entity_type="card_batch", entity_id=batch.id,
        actor_admin_id=actor_admin_id, actor_role="super_admin", org_id=org.id,
        request_id=idempotency_key, ip=ip,
        metadata={"org_id": org.id, "quantity": quantity, "year": year,
                  "numbering_scope_id": org.numbering_scope_id,
                  "start_no": start_no, "end_no": end_no},
    )
    db.flush()
    return batch, False


def find_batch_overlap(
    db: Session,
    start_no: int,
    end_no: int,
    *,
    domain_scope_id: int | None,
    exclude_batch_id: int | None = None,
    include_released: bool = True,
) -> CardBatch | None:
    query = db.query(CardBatch).filter(
        CardBatch.start_no <= end_no,
        CardBatch.end_no >= start_no,
    )
    if not include_released:
        query = query.filter(CardBatch.released_at.is_(None))
    if domain_scope_id is None:
        query = query.filter(CardBatch.numbering_scope_id.is_(None))
    else:
        query = query.filter(CardBatch.numbering_scope_id == domain_scope_id)
    if exclude_batch_id is not None:
        query = query.filter(CardBatch.id != exclude_batch_id)
    return query.order_by(CardBatch.start_no.asc(), CardBatch.id.asc()).first()


def get_shared_scope_max_end(db: Session, scope_id: int) -> int | None:
    value = (
        db.query(func.max(CardBatch.end_no))
        .filter(CardBatch.numbering_scope_id == scope_id)
        .scalar()
    )
    return int(value) if value is not None else None


def serialize_card_lot_registry_row(row: CardLotRegistryRow) -> dict[str, object]:
    batch = row.batch
    quantity = int(batch.end_no - batch.start_no + 1)
    return {
        "id": batch.id,
        "batch_id": batch.id,
        "organization_id": batch.org_id,
        "organization_name": row.organization_name,
        "numbering_scope_id": batch.numbering_scope_id,
        "numbering_scope_name": row.numbering_scope_name,
        "year": batch.year,
        "range_start": batch.start_no,
        "range_end": batch.end_no,
        "range_start_label": format_card_number(batch.start_no),
        "range_end_label": format_card_number(batch.end_no),
        "quantity": quantity,
        "assigned": row.availability.assigned,
        "reserved": row.availability.reserved,
        "remaining": row.availability.remaining,
        "status_label": card_lot_status(batch, row.availability),
        "next_no": row.availability.next_no,
        "recharge_request_id": row.recharge_request_id,
        "created_at": batch.created_at.isoformat() if batch.created_at else None,
        "released_at": batch.released_at.isoformat() if batch.released_at else None,
        "notes": batch.notes,
    }


def serialize_card_lot_registry_batch(db: Session, batch: CardBatch) -> dict[str, object]:
    return serialize_card_lot_registry_row(CardLotRegistryRow(
        batch=batch,
        organization_name=getattr(batch.organization, "name", None),
        numbering_scope_name=getattr(batch.numbering_scope, "name", None),
        recharge_request_id=getattr(batch.recharge_request, "id", None),
        availability=card_batch_availability(db, [batch])[batch.id],
    ))


def list_card_lot_registry_rows(db: Session) -> list[CardLotRegistryRow]:
    batches = (
        db.query(CardBatch)
        .options(
            joinedload(CardBatch.organization),
            joinedload(CardBatch.numbering_scope),
            joinedload(CardBatch.recharge_request),
        )
        .order_by(CardBatch.created_at.desc(), CardBatch.id.desc())
        .all()
    )
    availability = card_batch_availability(db, batches)
    return [
        CardLotRegistryRow(
            batch=batch,
            availability=availability[batch.id],
            organization_name=getattr(batch.organization, "name", None),
            numbering_scope_name=getattr(batch.numbering_scope, "name", None),
            recharge_request_id=getattr(getattr(batch, "recharge_request", None), "id", None),
        )
        for batch in batches
    ]


def build_card_lots_workbook(rows: list[CardLotRegistryRow]) -> BytesIO:
    from openpyxl import Workbook
    from openpyxl.styles import Font

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Registro lotti"
    headers = [
        "Organizzazione",
        "ID lotto",
        "Scope numerazione",
        "Range iniziale",
        "Range finale",
        "Quantita",
        "Stato",
        "Recharge request ID",
        "Data creazione",
        "Data rilascio",
        "Anno",
        "Note",
    ]
    sheet.append(headers)
    for cell in sheet[1]:
        cell.font = Font(bold=True)

    ordered_rows = sorted(rows, key=lambda item: (item.batch.start_no, item.batch.id))
    for row in ordered_rows:
        serialized = serialize_card_lot_registry_row(row)
        sheet.append(
            [
                serialized["organization_name"] or "",
                serialized["batch_id"],
                serialized["numbering_scope_name"] or "",
                serialized["range_start_label"],
                serialized["range_end_label"],
                serialized["quantity"],
                serialized["status_label"],
                serialized["recharge_request_id"] or "",
                serialized["created_at"] or "",
                serialized["released_at"] or "",
                serialized["year"],
                serialized["notes"] or "",
            ]
        )

    for column_cells in sheet.columns:
        max_length = 0
        column_letter = column_cells[0].column_letter
        for cell in column_cells:
            value = "" if cell.value is None else str(cell.value)
            max_length = max(max_length, len(value))
        sheet.column_dimensions[column_letter].width = min(max_length + 2, 30)

    payload = BytesIO()
    workbook.save(payload)
    payload.seek(0)
    return payload


def _resolve_recharge_block_status(current_status: str | None) -> str:
    if current_status == RECHARGE_REQUEST_STATUS_LOT_CREATED:
        return current_status
    return RECHARGE_REQUEST_STATUS_BLOCKED_NON_SHARED


def _load_recharge_request_for_update(db: Session, recharge_request_id: int) -> RechargeRequest | None:
    return (
        db.query(RechargeRequest)
        .options(joinedload(RechargeRequest.organization), joinedload(RechargeRequest.card_batch))
        .filter(RechargeRequest.id == recharge_request_id)
        .first()
    )


def _linked_batch_for_request(db: Session, recharge_request: RechargeRequest) -> CardBatch | None:
    if recharge_request.card_batch is not None:
        return recharge_request.card_batch
    if recharge_request.card_batch_id is None:
        return None
    return db.query(CardBatch).filter(CardBatch.id == recharge_request.card_batch_id).first()


def ensure_recharge_request_batch(db: Session, recharge_request_id: int) -> CardBatch | None:
    recharge_request = _load_recharge_request_for_update(db, recharge_request_id)
    if recharge_request is None:
        raise ValueError(f"RechargeRequest {recharge_request_id} not found")

    existing_batch = _linked_batch_for_request(db, recharge_request)
    if existing_batch is not None:
        logger.info(
            "card_lot_registry_idempotent_existing_batch request_id=%s batch_id=%s",
            recharge_request.id,
            existing_batch.id,
        )
        return existing_batch

    if recharge_request.association_id is None:
        logger.error(
            "card_lot_registry_missing_org_id request_id=%s association_name=%s",
            recharge_request.id,
            recharge_request.association_name,
        )
        raise ValueError("RechargeRequest is missing association_id")

    org = (
        db.query(Organization)
        .options(joinedload(Organization.numbering_scope))
        .filter(Organization.id == recharge_request.association_id)
        .first()
    )
    if org is None:
        logger.error(
            "card_lot_registry_org_not_found request_id=%s org_id=%s",
            recharge_request.id,
            recharge_request.association_id,
        )
        raise ValueError("RechargeRequest organization not found")

    central_scope = get_assonam_central_scope(db)
    if central_scope is None:
        logger.error(
            "card_lot_registry_missing_shared_scope request_id=%s org_id=%s expected_scope=%s",
            recharge_request.id,
            org.id,
            ASSONAM_CENTRAL_SCOPE_NAME,
        )
        raise ValueError("ASSONAM shared scope not configured")

    org_mode = get_numbering_mode(org)
    if org.numbering_scope_id != central_scope.id or org_mode != NUMBERING_MODE_SHARED_ASSONAM:
        recharge_request.status = _resolve_recharge_block_status(recharge_request.status)
        logger.warning(
            "card_lot_registry_blocked_non_shared request_id=%s org_id=%s org_scope_id=%s org_mode=%s expected_scope_id=%s",
            recharge_request.id,
            org.id,
            org.numbering_scope_id,
            org_mode,
            central_scope.id,
        )
        audit.log_operation(
            db,
            action="org.cards.batch_auto_create_blocked",
            entity_type="recharge_request",
            entity_id=recharge_request.id,
            actor_role="system",
            metadata={
                "reason": "blocked_non_shared",
                "source": recharge_request.source or "whatsapp",
                "recharge_request_id": recharge_request.id,
                "org_id": org.id,
                "org_scope_id": org.numbering_scope_id,
                "expected_scope_id": central_scope.id,
                "numbering_mode": org_mode,
            },
        )
        return None

    excluded_legacy_count = int(
        db.query(func.count(CardBatch.id))
        .filter(
            CardBatch.org_id == org.id,
            CardBatch.numbering_scope_id.is_(None),
        )
        .scalar()
        or 0
    )
    if excluded_legacy_count > 0:
        logger.warning(
            "card_lot_registry_excluding_legacy_batches request_id=%s org_id=%s excluded_count=%s scope_filter=numbering_scope_id:%s",
            recharge_request.id,
            org.id,
            excluded_legacy_count,
            central_scope.id,
        )

    acquire_shared_lot_lock(db, central_scope.id)
    acquire_card_lot_table_lock(db)

    recharge_request = _load_recharge_request_for_update(db, recharge_request_id)
    if recharge_request is None:
        raise ValueError(f"RechargeRequest {recharge_request_id} disappeared during processing")
    existing_batch = _linked_batch_for_request(db, recharge_request)
    if existing_batch is not None:
        logger.info(
            "card_lot_registry_idempotent_existing_batch_after_lock request_id=%s batch_id=%s",
            recharge_request.id,
            existing_batch.id,
        )
        return existing_batch

    max_end = get_shared_scope_max_end(db, central_scope.id)
    start_no, end_no = compute_next_lot(max_end, recharge_request.requested_cards)

    conflict = find_batch_overlap(
        db,
        start_no,
        end_no,
        domain_scope_id=central_scope.id,
        include_released=True,
    )
    if conflict is not None:
        logger.error(
            "card_lot_registry_overlap_conflict request_id=%s org_id=%s scope_id=%s start_no=%s end_no=%s conflict_batch_id=%s conflict_range=%s-%s",
            recharge_request.id,
            org.id,
            central_scope.id,
            start_no,
            end_no,
            conflict.id,
            conflict.start_no,
            conflict.end_no,
        )
        raise ValueError("Card lot overlap detected in shared ASSONAM scope")

    batch = CardBatch(
        org_id=org.id,
        numbering_scope_id=central_scope.id,
        year=int(recharge_request.requested_year),
        start_no=start_no,
        end_no=end_no,
        next_no=start_no,
        is_enabled=True,
        notes=f"Auto-creato da recharge_request #{recharge_request.id}",
    )
    db.add(batch)
    db.flush()

    recharge_request.card_batch_id = batch.id
    recharge_request.status = RECHARGE_REQUEST_STATUS_LOT_CREATED
    db.flush()

    logger.info(
        "card_lot_registry_created request_id=%s org_id=%s scope_id=%s max_end=%s start_no=%s end_no=%s qty=%s batch_id=%s",
        recharge_request.id,
        org.id,
        central_scope.id,
        max_end,
        start_no,
        end_no,
        recharge_request.requested_cards,
        batch.id,
    )
    audit.log_operation(
        db,
        action="org.cards.batch_auto_created",
        entity_type="card_batch",
        entity_id=batch.id,
        actor_role="system",
        metadata={
            "recharge_request_id": recharge_request.id,
            "source": recharge_request.source or "whatsapp",
            "reason": "recharge_request",
            "created_by": "system",
            "org_id": org.id,
            "numbering_scope_id": central_scope.id,
            "start_no": start_no,
            "end_no": end_no,
            "quantity": recharge_request.requested_cards,
            "requested_year": recharge_request.requested_year,
            "max_end_before_create": max_end,
        },
    )
    return batch

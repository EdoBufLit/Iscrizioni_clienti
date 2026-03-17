from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.models import CardBatch, Member, NumberingScope, NumberingScopeType, Organization

ASSONAM_CENTRAL_SCOPE_NAME = "ASSONAM_CENTRAL"
NUMBERING_MODE_SHARED_ASSONAM = "shared_assonam"
NUMBERING_MODE_DEDICATED = "dedicated"
NUMBERING_MODE_LEGACY = "legacy"


@dataclass(frozen=True)
class NumberingUsageState:
    members_with_cards: int
    real_used_batches: int
    total_batches: int
    batches_with_linked_members: int
    current_mode: str
    current_scope_id: int | None
    current_scope_name: str | None
    current_scope_type: str | None

    @property
    def is_freely_editable(self) -> bool:
        return self.members_with_cards == 0 and self.real_used_batches == 0

    @property
    def is_sensitive(self) -> bool:
        return not self.is_freely_editable

    @property
    def warning_message(self) -> str | None:
        if not self.is_sensitive:
            return None
        return (
            "Questa modifica influira solo sulle future tessere. "
            "Le tessere gia esistenti non verranno modificate."
        )


def get_numbering_mode(org: Organization | None) -> str:
    if org is None or getattr(org, "numbering_scope_id", None) is None:
        return NUMBERING_MODE_LEGACY

    scope = getattr(org, "numbering_scope", None)
    if scope and (
        scope.name == ASSONAM_CENTRAL_SCOPE_NAME
        or getattr(scope, "scope_type", None) == NumberingScopeType.SHARED.value
    ):
        return NUMBERING_MODE_SHARED_ASSONAM
    return NUMBERING_MODE_DEDICATED


def ensure_assonam_central_scope(db: Session) -> NumberingScope:
    scope = (
        db.query(NumberingScope)
        .filter(NumberingScope.name == ASSONAM_CENTRAL_SCOPE_NAME)
        .first()
    )
    if scope:
        return scope

    scope = NumberingScope(
        name=ASSONAM_CENTRAL_SCOPE_NAME,
        scope_type=NumberingScopeType.SHARED.value,
        description="Pool centrale condiviso ASSONAM",
        is_system=True,
    )
    db.add(scope)
    db.flush()
    return scope


def ensure_dedicated_scope(db: Session, org: Organization) -> NumberingScope:
    scope_name = f"ORG_{org.id}"
    scope = None
    if org.id is not None:
        scope = (
            db.query(NumberingScope)
            .filter(
                or_(
                    NumberingScope.owner_org_id == org.id,
                    NumberingScope.name == scope_name,
                )
            )
            .order_by(NumberingScope.id.asc())
            .first()
        )
    if scope:
        if not scope.owner_org_id:
            scope.owner_org_id = org.id
        if scope.scope_type != NumberingScopeType.DEDICATED.value:
            scope.scope_type = NumberingScopeType.DEDICATED.value
        return scope

    scope = NumberingScope(
        name=scope_name,
        scope_type=NumberingScopeType.DEDICATED.value,
        description=f"Scope dedicato per organizzazione {org.slug or org.id}",
        owner_org_id=org.id,
        is_system=False,
    )
    db.add(scope)
    db.flush()
    return scope


def get_target_scope_for_mode(
    db: Session,
    *,
    org: Organization,
    numbering_mode: str,
) -> NumberingScope:
    if numbering_mode == NUMBERING_MODE_SHARED_ASSONAM:
        return ensure_assonam_central_scope(db)
    if numbering_mode == NUMBERING_MODE_DEDICATED:
        return ensure_dedicated_scope(db, org)
    raise ValueError(f"Unsupported numbering_mode={numbering_mode}")


def get_numbering_usage_state(db: Session, org: Organization) -> NumberingUsageState:
    members_with_cards = int(
        db.query(func.count(Member.id))
        .filter(
            Member.org_id == org.id,
            Member.deleted_at.is_(None),
            Member.card_no.isnot(None),
        )
        .scalar()
        or 0
    )

    batch_usage_filters = [
        CardBatch.org_id == org.id,
        or_(
            CardBatch.released_at.isnot(None),
            and_(
                CardBatch.next_no.isnot(None),
                CardBatch.start_no.isnot(None),
                CardBatch.next_no > CardBatch.start_no,
            ),
        ),
    ]
    real_used_batches = int(
        db.query(func.count(CardBatch.id)).filter(*batch_usage_filters).scalar() or 0
    )

    total_batches = int(
        db.query(func.count(CardBatch.id)).filter(CardBatch.org_id == org.id).scalar() or 0
    )

    batches_with_linked_members = int(
        db.query(func.count(func.distinct(CardBatch.id)))
        .outerjoin(Member, Member.batch_id == CardBatch.id)
        .filter(
            CardBatch.org_id == org.id,
            Member.id.isnot(None),
        )
        .scalar()
        or 0
    )

    scope = getattr(org, "numbering_scope", None)
    current_scope_id = getattr(org, "numbering_scope_id", None)
    current_scope_name = getattr(scope, "name", None)
    current_scope_type = getattr(scope, "scope_type", None)

    if batches_with_linked_members > real_used_batches:
        real_used_batches = batches_with_linked_members

    return NumberingUsageState(
        members_with_cards=members_with_cards,
        real_used_batches=real_used_batches,
        total_batches=total_batches,
        batches_with_linked_members=batches_with_linked_members,
        current_mode=get_numbering_mode(org),
        current_scope_id=current_scope_id,
        current_scope_name=current_scope_name,
        current_scope_type=current_scope_type,
    )


def serialize_numbering_config(db: Session, org: Organization) -> dict[str, object]:
    state = get_numbering_usage_state(db, org)
    scope = getattr(org, "numbering_scope", None)
    return {
        "numbering_mode": state.current_mode,
        "numbering_scope_id": state.current_scope_id,
        "numbering_scope_name": state.current_scope_name,
        "numbering_scope_type": state.current_scope_type,
        "numbering_scope_prefix": getattr(scope, "prefix", None),
        "numbering_scope_description": getattr(scope, "description", None),
        "numbering_scope_is_system": bool(getattr(scope, "is_system", False))
        if scope is not None
        else False,
        "is_freely_editable": state.is_freely_editable,
        "is_sensitive": state.is_sensitive,
        "members_with_cards": state.members_with_cards,
        "total_batches": state.total_batches,
        "real_used_batches": state.real_used_batches,
        "batches_with_linked_members": state.batches_with_linked_members,
        "warning_message": state.warning_message,
    }

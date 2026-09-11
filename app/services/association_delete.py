from __future__ import annotations

import logging
from datetime import datetime
from typing import Literal

from fastapi import HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import audit
from app.middleware import get_client_ip
from app.models import (
    AdminRole,
    AdminUser,
    AffiliateCommunication,
    AffiliateCommunicationRead,
    AffiliateCommunicationRecipient,
    Booking,
    CardBatch,
    CardMovement,
    IngestRateLimit,
    IntegrationApiKey,
    Member,
    MemberAttendance,
    MemberDocument,
    MemberPayment,
    OperationLog,
    Organization,
    OrgAdminSession,
    OrgAdminNotification,
    OrgAdminToken,
    RechargeRequest,
    RechargeRequestAccountingEvent,
    Token,
)

logger = logging.getLogger(__name__)

DeleteMode = Literal["archive", "purge"]


def _resolve_org_or_404(db: Session, association_id: int) -> Organization:
    org = db.query(Organization).filter(Organization.id == association_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _collect_dependency_counts(db: Session, org_id: int, org_slug: str) -> dict[str, int]:
    member_ids_query = db.query(Member.id).filter(Member.org_id == org_id)
    admin_ids_query = db.query(AdminUser.id).filter(
        AdminUser.org_id == org_id,
        AdminUser.role == AdminRole.ORG_ADMIN,
    )

    return {
        "members": db.query(Member).filter(Member.org_id == org_id).count(),
        "member_tokens": db.query(Token).filter(Token.member_id.in_(member_ids_query)).count(),
        "member_documents": db.query(MemberDocument).filter(MemberDocument.member_id.in_(member_ids_query)).count(),
        "member_attendances": db.query(MemberAttendance).filter(MemberAttendance.org_id == org_id).count(),
        "member_payments": db.query(MemberPayment).filter(MemberPayment.org_id == org_id).count(),
        "org_admins": db.query(AdminUser).filter(
            AdminUser.org_id == org_id,
            AdminUser.role == AdminRole.ORG_ADMIN,
        ).count(),
        "org_admin_tokens": db.query(OrgAdminToken).filter(OrgAdminToken.admin_id.in_(admin_ids_query)).count(),
        "integration_keys": db.query(IntegrationApiKey).filter(IntegrationApiKey.org_id == org_id).count(),
        "card_movements": db.query(CardMovement).filter(CardMovement.org_id == org_id).count(),
        "card_batches": db.query(CardBatch).filter(CardBatch.org_id == org_id).count(),
        "recharge_requests": db.query(RechargeRequest)
        .filter(RechargeRequest.association_id == org_id)
        .count(),
        "ingest_rate_limits": db.query(IngestRateLimit).filter(IngestRateLimit.org_slug == org_slug).count(),
    }


def _summarize_released_range(batches: list[CardBatch]) -> dict[str, int] | None:
    if not batches:
        return None
    start = min(batch.start_no for batch in batches if batch.start_no is not None)
    end = max(batch.end_no for batch in batches if batch.end_no is not None)
    return {"start": start, "end": end}


def _release_card_ranges(
    db: Session,
    *,
    org_id: int,
    now: datetime,
) -> tuple[list[CardBatch], dict[str, int] | None]:
    batches = (
        db.query(CardBatch)
        .filter(
            CardBatch.org_id == org_id,
            CardBatch.released_at.is_(None),
        )
        .order_by(CardBatch.start_no.asc(), CardBatch.id.asc())
        .all()
    )
    for batch in batches:
        batch.released_at = now
    return batches, _summarize_released_range(batches)


def _purge_association_dependencies(db: Session, *, org: Organization) -> None:
    member_ids = [member_id for (member_id,) in db.query(Member.id).filter(Member.org_id == org.id).all()]
    admin_ids = [
        admin_id
        for (admin_id,) in db.query(AdminUser.id).filter(
            AdminUser.org_id == org.id,
            AdminUser.role == AdminRole.ORG_ADMIN,
        ).all()
    ]
    batch_ids = [
        batch_id
        for (batch_id,) in db.query(CardBatch.id).filter(CardBatch.org_id == org.id).all()
    ]

    if member_ids:
        db.query(OperationLog).filter(OperationLog.actor_member_id.in_(member_ids)).update(
            {OperationLog.actor_member_id: None},
            synchronize_session=False,
        )
    if admin_ids:
        db.query(AffiliateCommunication).filter(
            AffiliateCommunication.created_by_admin_id.in_(admin_ids)
        ).update({AffiliateCommunication.created_by_admin_id: None}, synchronize_session=False)
        db.query(AffiliateCommunicationRead).filter(
            AffiliateCommunicationRead.admin_user_id.in_(admin_ids)
        ).delete(synchronize_session=False)
        db.query(OperationLog).filter(OperationLog.actor_admin_id.in_(admin_ids)).update(
            {OperationLog.actor_admin_id: None},
            synchronize_session=False,
        )
        db.query(RechargeRequest).filter(
            RechargeRequest.requested_by_admin_id.in_(admin_ids)
        ).update({RechargeRequest.requested_by_admin_id: None}, synchronize_session=False)
        db.query(RechargeRequest).filter(
            RechargeRequest.paid_by_admin_id.in_(admin_ids)
        ).update({RechargeRequest.paid_by_admin_id: None}, synchronize_session=False)
        db.query(RechargeRequestAccountingEvent).filter(
            RechargeRequestAccountingEvent.actor_admin_id.in_(admin_ids)
        ).update(
            {RechargeRequestAccountingEvent.actor_admin_id: None},
            synchronize_session=False,
        )

    # Retain the central message's audience snapshot after removing the tenant.
    # Explicit cleanup also supports SQLite installations without FK enforcement.
    db.query(AffiliateCommunicationRecipient).filter(
        AffiliateCommunicationRecipient.organization_id == org.id
    ).update({AffiliateCommunicationRecipient.organization_id: None}, synchronize_session=False)
    db.query(OrgAdminNotification).filter(
        OrgAdminNotification.org_id == org.id
    ).delete(synchronize_session=False)
    if admin_ids:
        db.query(OrgAdminNotification).filter(
            OrgAdminNotification.admin_user_id.in_(admin_ids)
        ).delete(synchronize_session=False)

    # Preserve the immutable accounting snapshot while severing tenant and lot
    # foreign keys before the organization/card batches are purged.
    db.query(RechargeRequest).filter(RechargeRequest.association_id == org.id).update(
        {
            RechargeRequest.association_id: None,
            RechargeRequest.card_batch_id: None,
        },
        synchronize_session=False,
    )
    if batch_ids:
        db.query(RechargeRequest).filter(
            RechargeRequest.card_batch_id.in_(batch_ids)
        ).update({RechargeRequest.card_batch_id: None}, synchronize_session=False)

    if member_ids:
        db.query(MemberAttendance).filter(
            MemberAttendance.member_id.in_(member_ids)
        ).delete(synchronize_session=False)
        db.query(Booking).filter(Booking.member_id.in_(member_ids)).update(
            {Booking.member_id: None},
            synchronize_session=False,
        )
        db.query(Token).filter(Token.member_id.in_(member_ids)).delete(synchronize_session=False)
        db.query(MemberDocument).filter(MemberDocument.member_id.in_(member_ids)).update(
            {MemberDocument.replaces_document_id: None},
            synchronize_session=False,
        )
        db.query(MemberDocument).filter(MemberDocument.member_id.in_(member_ids)).delete(
            synchronize_session=False
        )

    db.query(MemberPayment).filter(MemberPayment.org_id == org.id).delete(synchronize_session=False)
    db.query(Member).filter(Member.org_id == org.id).delete(synchronize_session=False)

    if admin_ids:
        # Persistent login sessions use a legacy FK without ON DELETE CASCADE.
        # Revoke their storage explicitly before removing the administrators.
        db.query(OrgAdminSession).filter(OrgAdminSession.admin_id.in_(admin_ids)).delete(
            synchronize_session=False
        )
        db.query(OrgAdminToken).filter(OrgAdminToken.admin_id.in_(admin_ids)).delete(
            synchronize_session=False
        )

    db.query(AdminUser).filter(
        AdminUser.org_id == org.id,
        AdminUser.role == AdminRole.ORG_ADMIN,
    ).delete(synchronize_session=False)
    db.query(IntegrationApiKey).filter(IntegrationApiKey.org_id == org.id).delete(synchronize_session=False)
    db.query(CardMovement).filter(CardMovement.org_id == org.id).delete(synchronize_session=False)
    db.query(CardBatch).filter(CardBatch.org_id == org.id).delete(synchronize_session=False)
    db.query(IngestRateLimit).filter(IngestRateLimit.org_slug == org.slug).delete(synchronize_session=False)

    db.delete(org)


def delete_association_and_release_range(
    db: Session,
    *,
    request: Request,
    association_id: int,
    mode: DeleteMode = "archive",
    release_range: bool = True,
    force: bool = False,
    actor_admin_id: int,
) -> dict:
    if mode not in {"archive", "purge"}:
        raise HTTPException(status_code=400, detail="Invalid mode. Allowed: archive, purge")

    org = _resolve_org_or_404(db, association_id)
    dependency_counts = _collect_dependency_counts(db, org.id, org.slug)
    has_dependencies = any(value > 0 for value in dependency_counts.values())

    if mode == "purge" and has_dependencies and not force:
        raise HTTPException(
            status_code=409,
            detail=(
                "Dipendenze presenti. Ripeti con force=true per purge. "
                f"(members={dependency_counts['members']}, admins={dependency_counts['org_admins']}, "
                f"batches={dependency_counts['card_batches']})"
            ),
        )

    now = datetime.utcnow()
    released_range: dict[str, int] | None = None

    try:
        if mode == "archive":
            org.is_active = False
            org.deleted_at = org.deleted_at or now

            if release_range:
                _released_batches, released_range = _release_card_ranges(db, org_id=org.id, now=now)

            db.query(AdminUser).filter(
                AdminUser.org_id == org.id,
                AdminUser.role == AdminRole.ORG_ADMIN,
            ).update({AdminUser.is_active: False}, synchronize_session=False)

            db.query(IntegrationApiKey).filter(
                IntegrationApiKey.org_id == org.id,
                IntegrationApiKey.is_active.is_(True),
            ).update({IntegrationApiKey.is_active: False}, synchronize_session=False)

            audit.log_operation(
                db,
                action="organization.archive",
                entity_type="organization",
                entity_id=org.id,
                actor_admin_id=actor_admin_id,
                actor_role=AdminRole.SUPER_ADMIN.value,
                metadata={
                    "mode": mode,
                    "release_range": release_range,
                    "released_range": released_range,
                    "force": force,
                },
                ip=get_client_ip(request),
                user_agent=request.headers.get("user-agent"),
            )
            db.commit()

            return {
                "ok": True,
                "mode": mode,
                "releasedRange": released_range,
                "archivedAssociationId": org.id,
                "purgedAssociationId": None,
            }

        if release_range:
            purge_batches = (
                db.query(CardBatch)
                .filter(
                    CardBatch.org_id == org.id,
                    CardBatch.released_at.is_(None),
                )
                .order_by(CardBatch.start_no.asc(), CardBatch.id.asc())
                .all()
            )
            released_range = _summarize_released_range(purge_batches)

        purged_id = org.id
        purged_slug = org.slug
        _purge_association_dependencies(db, org=org)

        audit.log_operation(
            db,
            action="organization.purge",
            entity_type="organization",
            entity_id=None,
            actor_admin_id=actor_admin_id,
            actor_role=AdminRole.SUPER_ADMIN.value,
            metadata={
                "mode": mode,
                "release_range": release_range,
                "released_range": released_range,
                "force": force,
                "purged_org_id": purged_id,
                "purged_org_slug": purged_slug,
                "dependency_counts": dependency_counts,
            },
            ip=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
        db.commit()

        return {
            "ok": True,
            "mode": mode,
            "releasedRange": released_range,
            "archivedAssociationId": None,
            "purgedAssociationId": purged_id,
        }
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        logger.exception("Association delete failed due to integrity constraints: org_id=%s", association_id)
        raise HTTPException(
            status_code=409,
            detail="Eliminazione non completata per vincoli di integrita. Usa force=true o verifica dipendenze.",
        ) from exc
    except Exception as exc:
        db.rollback()
        logger.exception("Unexpected failure during association delete: org_id=%s", association_id)
        raise HTTPException(
            status_code=500,
            detail="Errore interno durante l'eliminazione dell'associazione.",
        ) from exc

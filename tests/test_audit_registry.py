import csv
import io
import uuid

from app import audit
from app.db import SessionLocal
from app.models import OperationLog, Organization
from app.services.audit_registry import audit_events_csv, list_audit_events


def _organization(db, prefix: str) -> Organization:
    suffix = uuid.uuid4().hex[:10]
    organization = Organization(
        name=f"{prefix} {suffix}",
        slug=f"{prefix.lower()}-{suffix}",
        is_active=True,
    )
    db.add(organization)
    db.flush()
    return organization


def test_audit_registry_is_tenant_scoped_and_redacted():
    db = SessionLocal()
    try:
        first = _organization(db, "AuditFirst")
        second = _organization(db, "AuditSecond")
        audit.log_operation(
            db,
            action="member.profile_updated",
            category="member",
            entity_type="member",
            entity_id=101,
            org_id=first.id,
            actor_role="org_admin",
            metadata={
                "email": "mario.rossi@example.com",
                "phone": "+39 333 1234567",
                "changed_fields": ["email", "phone"],
            },
        )
        audit.log_operation(
            db,
            action="card.batch_added",
            entity_type="card_batch",
            entity_id=202,
            org_id=second.id,
            actor_role="org_admin",
        )
        db.commit()

        page = list_audit_events(db, org_id=first.id, limit=20)
        assert len(page["items"]) == 1
        item = page["items"][0]
        assert item["organization"]["id"] == first.id
        assert item["category"] == "member"
        assert item["metadata"]["email"] != "mario.rossi@example.com"
        assert item["metadata"]["phone"] != "+39 333 1234567"
        assert "example.com" not in str(item["metadata"])
    finally:
        db.rollback()
        db.close()


def test_audit_registry_uses_cursor_and_safe_csv():
    db = SessionLocal()
    try:
        organization = _organization(db, "AuditCursor")
        for index in range(3):
            db.add(
                OperationLog(
                    org_id=organization.id,
                    category="document",
                    outcome="success",
                    action=f"document.action_{index}",
                    entity_type="member_document",
                    entity_id=index + 1,
                    actor_role="org_admin",
                )
            )
        db.commit()

        first_page = list_audit_events(db, org_id=organization.id, limit=2)
        assert len(first_page["items"]) == 2
        assert first_page["has_more"] is True
        second_page = list_audit_events(
            db,
            org_id=organization.id,
            cursor=first_page["next_cursor"],
            limit=2,
        )
        assert len(second_page["items"]) == 1
        assert second_page["items"][0]["id"] < first_page["items"][-1]["id"]

        exported = audit_events_csv(db, org_id=organization.id).getvalue()
        assert exported.startswith("\ufeff")
        assert "document.action_" in exported
        assert "AuditSecond" not in exported
    finally:
        db.rollback()
        db.close()


def test_audit_registry_csv_neutralizes_all_formula_prefixes():
    db = SessionLocal()
    try:
        organization = Organization(
            name="=HYPERLINK(\"https://example.invalid\")",
            slug=f"audit-formula-{uuid.uuid4().hex[:10]}",
            is_active=True,
        )
        db.add(organization)
        db.flush()
        db.add(
            OperationLog(
                org_id=organization.id,
                category="+categoria",
                outcome="-esito",
                action="@azione",
                entity_type="\t=entita",
                entity_id=1,
                actor_role="  +attore",
                request_id="@request",
            )
        )
        db.commit()

        exported = audit_events_csv(db, org_id=organization.id).getvalue()
        rows = list(csv.reader(io.StringIO(exported.lstrip("\ufeff"))))
        values = rows[1]

        assert values[1] == "'+categoria"
        assert values[2] == "'@azione"
        assert values[3] == "'-esito"
        assert values[4] == "'  +attore"
        assert values[5].startswith("'=HYPERLINK")
        assert values[6] == "'\t=entita"
        assert values[8] == "'@request"
    finally:
        db.rollback()
        db.close()

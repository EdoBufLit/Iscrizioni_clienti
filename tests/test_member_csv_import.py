import uuid
from datetime import datetime, timedelta

from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    CardBatch,
    EmailOutbox,
    Member,
    MemberImportBatch,
    MemberStatus,
    OrgAdminToken,
    Organization,
)
from app.utils import hash_token
from app.services.member_imports import commit_member_import, parse_member_import


def _org_admin(db, *, payment_required: bool = False):
    suffix = uuid.uuid4().hex[:10]
    org = Organization(
        name=f"CSV Org {suffix}",
        slug=f"csv-org-{suffix}",
        is_active=True,
        payment_required_before_card=payment_required,
    )
    db.add(org)
    db.flush()
    admin = AdminUser(
        email=f"csv-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(org)
    db.refresh(admin)
    return org, admin


def _login(client, db, admin: AdminUser):
    client.cookies.clear()
    raw = f"csv-admin-token-{admin.id}-{uuid.uuid4().hex}"
    db.add(
        OrgAdminToken(
            admin_id=admin.id,
            token_hash=hash_token(raw),
            expires_at=datetime.utcnow() + timedelta(minutes=15),
        )
    )
    db.commit()
    response = client.get(f"/api/org-admin/auth/verify?token={raw}", follow_redirects=False)
    assert response.status_code in {200, 302, 303, 307}, response.text


def _preview(client, content: str):
    return client.post(
        "/api/org-admin/members/imports/preview",
        files={"upload": ("soci.csv", content.encode("utf-8"), "text/csv")},
    )


def test_csv_preview_valid_only_commit_and_safe_rollback(client):
    db = SessionLocal()
    try:
        org, admin = _org_admin(db)
        _login(client, db, admin)
        email = f"csv-member-{uuid.uuid4().hex[:8]}@example.com"
        content = (
            "nome;cognome;email;data_iscrizione;tipo_tessera\n"
            f"Ada;Valida;{email};2026-07-18;annual\n"
            "Riga;;email-non-valida;2026-99-99;annual\n"
        )
        preview = _preview(client, content)
        assert preview.status_code == 200, preview.text
        payload = preview.json()
        assert payload["total_rows"] == 2
        assert payload["valid_rows"] == 1
        assert payload["error_rows"] == 1
        assert any(row["status"] == "invalid" for row in payload["rows"])

        batch_id = payload["id"]
        blocked = client.post(
            f"/api/org-admin/members/imports/{batch_id}/commit",
            json={
                "policy": "all_or_nothing",
                "activation_mode": "pending",
                "confirmation": "IMPORTA 1 SOCI",
            },
        )
        assert blocked.status_code == 409

        committed = client.post(
            f"/api/org-admin/members/imports/{batch_id}/commit",
            json={
                "policy": "valid_only",
                "activation_mode": "pending",
                "confirmation": "IMPORTA 1 SOCI",
            },
        )
        assert committed.status_code == 200, committed.text
        assert committed.json()["batch"]["imported_rows"] == 1

        member = db.query(Member).filter(Member.org_id == org.id, Member.email == email).one()
        db.refresh(member)
        assert member.status == MemberStatus.PENDING_DOCS
        assert member.card_no is None
        assert member.password_hash is None
        assert member.import_batch_id == batch_id
        assert db.query(EmailOutbox).filter(EmailOutbox.to_email == email).count() == 0

        rolled_back = client.post(f"/api/org-admin/members/imports/{batch_id}/rollback")
        assert rolled_back.status_code == 200, rolled_back.text
        assert rolled_back.json()["removed_rows"] == 1
        db.expire_all()
        assert db.query(Member).filter(Member.org_id == org.id, Member.email == email).first() is None
        assert db.query(MemberImportBatch).filter_by(id=batch_id).one().status == "rolled_back"
    finally:
        client.cookies.clear()
        db.close()


def test_csv_active_import_requires_explicit_phrase_and_assigns_card_without_email(client):
    db = SessionLocal()
    try:
        org, admin = _org_admin(db)
        year = datetime.utcnow().year
        start = 8_000_000 + int(uuid.uuid4().hex[:4], 16)
        db.add(
            CardBatch(
                org_id=org.id,
                year=year,
                start_no=start,
                end_no=start + 2,
                next_no=start,
                is_enabled=True,
            )
        )
        db.commit()
        _login(client, db, admin)
        email = f"csv-active-{uuid.uuid4().hex[:8]}@example.com"
        preview = _preview(
            client,
            "nome,cognome,email,data_iscrizione\n"
            f"Lina,Attiva,{email},{year}-07-18\n",
        )
        assert preview.status_code == 200, preview.text
        batch_id = preview.json()["id"]

        wrong_phrase = client.post(
            f"/api/org-admin/members/imports/{batch_id}/commit",
            json={
                "policy": "all_or_nothing",
                "activation_mode": "active",
                "confirmation": "IMPORTA 1 SOCI",
            },
        )
        assert wrong_phrase.status_code == 422

        committed = client.post(
            f"/api/org-admin/members/imports/{batch_id}/commit",
            json={
                "policy": "all_or_nothing",
                "activation_mode": "active",
                "confirmation": "ATTIVA 1 SOCI",
            },
        )
        assert committed.status_code == 200, committed.text
        db.expire_all()
        member = db.query(Member).filter(Member.org_id == org.id, Member.email == email).one()
        assert member.status == MemberStatus.ACTIVE
        assert member.card_no == start
        assert member.card_year == year
        assert db.query(EmailOutbox).filter(EmailOutbox.to_email == email).count() == 0

        rollback = client.post(f"/api/org-admin/members/imports/{batch_id}/rollback")
        assert rollback.status_code == 409
    finally:
        client.cookies.clear()
        db.close()


def test_csv_import_batch_is_tenant_scoped(client):
    db = SessionLocal()
    try:
        _org_one, admin_one = _org_admin(db)
        _org_two, admin_two = _org_admin(db)
        _login(client, db, admin_one)
        preview = _preview(client, "nome;cognome\nTenant;Uno\n")
        assert preview.status_code == 200, preview.text
        batch_id = preview.json()["id"]

        client.post("/api/org-admin/auth/logout")
        _login(client, db, admin_two)
        assert client.get(f"/api/org-admin/members/imports/{batch_id}").status_code == 404
        assert client.post(
            f"/api/org-admin/members/imports/{batch_id}/commit",
            json={
                "policy": "all_or_nothing",
                "activation_mode": "pending",
                "confirmation": "IMPORTA 1 SOCI",
            },
        ).status_code == 404
    finally:
        client.cookies.clear()
        db.close()


def test_csv_import_commit_is_idempotent_for_stale_batch_without_identifiers():
    setup_db = SessionLocal()
    first_db = SessionLocal()
    stale_db = SessionLocal()
    try:
        org, admin = _org_admin(setup_db)
        batch = parse_member_import(
            setup_db,
            organization=org,
            admin=admin,
            content=b"nome;cognome\nSenza;Identificativi\n",
        )
        setup_db.commit()
        batch_id = batch.id
        admin_id = admin.id

        first_batch = first_db.query(MemberImportBatch).filter_by(id=batch_id).one()
        first_admin = first_db.query(AdminUser).filter_by(id=admin_id).one()
        stale_batch = stale_db.query(MemberImportBatch).filter_by(id=batch_id).one()
        stale_admin = stale_db.query(AdminUser).filter_by(id=admin_id).one()
        # Both requests have materialized the same preview before either writes.
        assert [row.status for row in first_batch.rows] == ["valid"]
        assert [row.status for row in stale_batch.rows] == ["valid"]

        assert commit_member_import(
            first_db,
            batch=first_batch,
            admin=first_admin,
            policy="all_or_nothing",
            activation_mode="pending",
        ) == 1
        first_db.commit()

        assert commit_member_import(
            stale_db,
            batch=stale_batch,
            admin=stale_admin,
            policy="all_or_nothing",
            activation_mode="pending",
        ) == 1
        stale_db.commit()

        setup_db.expire_all()
        assert setup_db.query(Member).filter(Member.import_batch_id == batch_id).count() == 1
        completed = setup_db.query(MemberImportBatch).filter_by(id=batch_id).one()
        assert completed.status == "committed"
        assert completed.imported_rows == 1
    finally:
        setup_db.rollback()
        first_db.rollback()
        stale_db.rollback()
        setup_db.close()
        first_db.close()
        stale_db.close()


def test_csv_import_failed_commit_releases_atomic_claim(client):
    db = SessionLocal()
    try:
        org, admin = _org_admin(db)
        _login(client, db, admin)
        email = f"csv-race-{uuid.uuid4().hex[:8]}@example.com"
        preview = _preview(client, f"nome;cognome;email\nMario;Nuovo;{email}\n")
        assert preview.status_code == 200, preview.text
        batch_id = preview.json()["id"]

        # Simulate a competing write after preview but before confirmation.
        db.add(
            Member(
                org_id=org.id,
                first_name="Socio",
                last_name="Esistente",
                email=email,
                status=MemberStatus.PENDING_DOCS,
            )
        )
        db.commit()

        failed = client.post(
            f"/api/org-admin/members/imports/{batch_id}/commit",
            json={
                "policy": "all_or_nothing",
                "activation_mode": "pending",
                "confirmation": "IMPORTA 1 SOCI",
            },
        )
        assert failed.status_code == 409

        db.expire_all()
        batch = db.query(MemberImportBatch).filter_by(id=batch_id).one()
        assert batch.status == "previewed"
        assert batch.imported_rows == 0
        assert db.query(Member).filter(Member.import_batch_id == batch_id).count() == 0
    finally:
        client.cookies.clear()
        db.rollback()
        db.close()

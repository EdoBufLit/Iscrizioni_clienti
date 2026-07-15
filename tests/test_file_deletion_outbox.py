from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.config import settings
from app.db import SessionLocal
from app.models import (
    AccountingCategory,
    AccountingDocument,
    AccountingFolder,
    AdminRole,
    AdminUser,
    EmailBuilderAsset,
    Member,
    MemberDocument,
    Organization,
    OrgAdminToken,
)
from app.models_affiliation import (
    AffiliationApplication,
    AffiliationApplicationStatus,
    AffiliationDocument,
)
from app.models_file_deletion import FileDeletionStatus, FileDeletionTask
from app.routes.membership_payments import _clear_member_documents
from app.services.file_deletion import (
    UnsafeFileDeletionPath,
    enqueue_file_deletion,
    process_file_deletions_once,
)
from app.utils import hash_token


@pytest.fixture(autouse=True)
def clear_file_deletion_outbox():
    with SessionLocal() as db:
        db.query(FileDeletionTask).delete()
        db.commit()
    yield
    with SessionLocal() as db:
        db.query(FileDeletionTask).delete()
        db.commit()


def _write_upload(relative_path: str, content: bytes = b"file") -> Path:
    target = Path(settings.UPLOAD_DIR) / Path(relative_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    return target


def _login_super_admin(client) -> None:
    response = client.post(
        "/api/super-admin/auth/login",
        json={"email": "admin@assonam.it", "password": "admin"},
    )
    assert response.status_code == 200, response.text


def _login_org_admin(client, db, admin: AdminUser) -> None:
    raw_token = f"file-delete-{admin.id}-{uuid.uuid4().hex}"
    db.add(
        OrgAdminToken(
            admin_id=admin.id,
            token_hash=hash_token(raw_token),
            expires_at=datetime.utcnow() + timedelta(minutes=15),
        )
    )
    db.commit()
    response = client.get(
        f"/api/org-admin/auth/verify?token={raw_token}",
        follow_redirects=False,
    )
    assert response.status_code == 302, response.text


def test_deletion_intent_is_transactional_and_runs_only_after_commit():
    relative_path = f"outbox-tests/{uuid.uuid4().hex}/committed.pdf"
    target = _write_upload(relative_path)
    with SessionLocal() as db:
        task_id = enqueue_file_deletion(db, relative_path)
        assert db.query(FileDeletionTask).filter(FileDeletionTask.id == task_id).count() == 1
        assert target.exists()
        db.commit()

    assert target.exists()
    assert process_file_deletions_once(limit=10) == {
        "claimed": 1,
        "deleted": 1,
        "retry_scheduled": 0,
    }
    assert not target.exists()
    with SessionLocal() as db:
        task = db.query(FileDeletionTask).filter(FileDeletionTask.id == task_id).one()
        assert task.status == FileDeletionStatus.COMPLETED.value
        assert task.relative_path is None


def test_rollback_discards_intent_and_never_deletes_file():
    relative_path = f"outbox-tests/{uuid.uuid4().hex}/rollback.pdf"
    target = _write_upload(relative_path)
    with SessionLocal() as db:
        enqueue_file_deletion(db, relative_path)
        db.rollback()

    assert process_file_deletions_once(limit=10)["claimed"] == 0
    assert target.exists()
    target.unlink()


def test_member_document_replacement_rollback_preserves_record_and_file():
    suffix = uuid.uuid4().hex[:10]
    relative_path = f"members/{suffix}/identity.pdf"
    target = _write_upload(relative_path, b"%PDF-1.4\nidentity\n%%EOF\n")
    with SessionLocal() as db:
        organization = Organization(
            name=f"Member replacement {suffix}",
            slug=f"member-replacement-{suffix}",
            email=f"member-replacement-{suffix}@example.com",
            is_active=True,
        )
        db.add(organization)
        db.flush()
        member = Member(
            org_id=organization.id,
            first_name="Mario",
            last_name="Rossi",
            email=f"member-replacement-{suffix}@example.com",
        )
        db.add(member)
        db.flush()
        document = MemberDocument(
            member_id=member.id,
            doc_type="identity",
            rel_path=relative_path,
            original_filename="identity.pdf",
            mime_type="application/pdf",
        )
        db.add(document)
        db.commit()
        member_id = member.id
        document_id = document.id

        _clear_member_documents(db, member)
        assert target.exists()
        db.rollback()

    with SessionLocal() as db:
        assert db.query(MemberDocument).filter_by(id=document_id).count() == 1
        assert db.query(FileDeletionTask).count() == 0
        member = db.query(Member).filter_by(id=member_id).one()
        _clear_member_documents(db, member)
        db.commit()

    assert target.exists()
    with SessionLocal() as db:
        assert db.query(MemberDocument).filter_by(id=document_id).count() == 0
        assert db.query(FileDeletionTask).count() == 1
    assert process_file_deletions_once(limit=10)["deleted"] == 1
    assert not target.exists()


def test_already_absent_file_is_idempotent_success():
    relative_path = f"outbox-tests/{uuid.uuid4().hex}/already-absent.pdf"
    with SessionLocal() as db:
        task_id = enqueue_file_deletion(db, relative_path)
        db.commit()

    stats = process_file_deletions_once(limit=10)
    assert stats["deleted"] == 1
    with SessionLocal() as db:
        task = db.query(FileDeletionTask).filter(FileDeletionTask.id == task_id).one()
        assert task.status == FileDeletionStatus.COMPLETED.value


def test_failed_delete_is_retried_with_backoff(monkeypatch):
    relative_path = f"outbox-tests/{uuid.uuid4().hex}/retry.pdf"
    target = _write_upload(relative_path)
    with SessionLocal() as db:
        task_id = enqueue_file_deletion(db, relative_path)
        db.commit()

    from app.services import file_deletion as service

    real_delete = service.delete_storage_file

    def fail_once(*, storage_root: str, relative_path: str) -> None:
        del storage_root, relative_path
        raise OSError("simulated filesystem outage")

    monkeypatch.setattr(service, "delete_storage_file", fail_once)
    first_stats = process_file_deletions_once(limit=10)
    assert first_stats == {"claimed": 1, "deleted": 0, "retry_scheduled": 1}
    assert target.exists()
    with SessionLocal() as db:
        task = db.query(FileDeletionTask).filter(FileDeletionTask.id == task_id).one()
        assert task.status == FileDeletionStatus.FAILED.value
        assert task.attempts == 1
        assert task.last_error == "OSError: file_deletion_failed"
        task.next_retry_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()

    monkeypatch.setattr(service, "delete_storage_file", real_delete)
    second_stats = process_file_deletions_once(limit=10)
    assert second_stats == {"claimed": 1, "deleted": 1, "retry_scheduled": 0}
    assert not target.exists()


@pytest.mark.parametrize(
    "unsafe_path",
    [
        "../outside.pdf",
        "nested/../../outside.pdf",
        "/absolute/path.pdf",
        r"C:\\outside.pdf",
        "nested//file.pdf",
        "nested/./file.pdf",
        "nested/file.pdf:stream",
    ],
)
def test_path_traversal_and_ambiguous_paths_are_rejected(unsafe_path):
    with SessionLocal() as db:
        with pytest.raises(UnsafeFileDeletionPath):
            enqueue_file_deletion(db, unsafe_path)
        db.rollback()


def test_symlink_escape_is_rejected_when_supported(tmp_path, monkeypatch):
    uploads = tmp_path / "uploads"
    outside = tmp_path / "outside"
    uploads.mkdir()
    outside.mkdir()
    outside_file = outside / "must-stay.txt"
    outside_file.write_text("keep", encoding="utf-8")
    link = uploads / "escape"
    try:
        os.symlink(outside, link, target_is_directory=True)
    except (OSError, NotImplementedError):
        pytest.skip("symlinks are unavailable in this environment")

    monkeypatch.setattr(settings, "UPLOAD_DIR", str(uploads))
    with SessionLocal() as db:
        with pytest.raises(UnsafeFileDeletionPath):
            enqueue_file_deletion(db, "escape/must-stay.txt")
        db.rollback()
    assert outside_file.read_text(encoding="utf-8") == "keep"


def test_accounting_replace_and_delete_keep_response_contract_and_delete_after_commit(client):
    suffix = uuid.uuid4().hex[:10]
    with SessionLocal() as db:
        organization = Organization(
            name=f"File accounting {suffix}",
            slug=f"file-accounting-{suffix}",
            email=f"file-accounting-{suffix}@example.com",
            accounting_enabled=True,
            is_active=True,
        )
        folder = AccountingFolder(
            name=f"Folder {suffix}",
            slug=f"folder-{suffix}",
            is_default=False,
            is_active=True,
        )
        category = AccountingCategory(
            code=f"file-{suffix}",
            name=f"Category {suffix}",
            is_system=False,
            is_active=True,
        )
        db.add_all([organization, folder, category])
        db.flush()
        old_relative_path = f"accounting/test/{suffix}/old.pdf"
        document = AccountingDocument(
            org_id=organization.id,
            folder_id=folder.id,
            category_id=category.id,
            title="Documento invariato",
            storage_key=old_relative_path,
            original_filename="old.pdf",
            mime_type="application/pdf",
        )
        db.add(document)
        db.commit()
        document_id = document.id

    old_target = _write_upload(old_relative_path, b"%PDF-1.4\nold\n%%EOF\n")
    _login_super_admin(client)
    replace_response = client.patch(
        f"/api/super-admin/accounting/documents/{document_id}",
        files={"file": ("new.pdf", b"%PDF-1.4\nnew\n%%EOF\n", "application/pdf")},
    )
    assert replace_response.status_code == 200, replace_response.text
    assert replace_response.json()["ok"] is True
    assert replace_response.json()["document"]["id"] == document_id
    assert old_target.exists()
    assert process_file_deletions_once(limit=10)["deleted"] == 1
    assert not old_target.exists()

    with SessionLocal() as db:
        document = db.query(AccountingDocument).filter_by(id=document_id).one()
        new_relative_path = document.storage_key
    new_target = Path(settings.UPLOAD_DIR) / new_relative_path
    assert new_target.exists()

    delete_response = client.delete(
        f"/api/super-admin/accounting/documents/{document_id}"
    )
    assert delete_response.status_code == 200, delete_response.text
    assert delete_response.json() == {"ok": True, "deleted_document_id": document_id}
    assert new_target.exists()
    assert process_file_deletions_once(limit=10)["deleted"] == 1
    assert not new_target.exists()


def test_affiliation_draft_and_communication_asset_deletes_keep_endpoint_contracts(client):
    suffix = uuid.uuid4().hex[:10]
    affiliation_relative_path = f"affiliations/{suffix}/draft.pdf"
    asset_relative_path = f"org/{suffix}/email-builder/asset.png"
    affiliation_target = _write_upload(affiliation_relative_path, b"%PDF-1.4\n%%EOF\n")
    asset_target = _write_upload(asset_relative_path, b"png")

    with SessionLocal() as db:
        application = AffiliationApplication(
            public_token=f"legacy-{uuid.uuid4().hex}",
            status=AffiliationApplicationStatus.DRAFT.value,
        )
        db.add(application)
        db.flush()
        db.add(
            AffiliationDocument(
                application_id=application.id,
                doc_type="statuto",
                rel_path=affiliation_relative_path,
                original_filename="draft.pdf",
                mime_type="application/pdf",
            )
        )

        organization = Organization(
            name=f"File communications {suffix}",
            slug=f"file-communications-{suffix}",
            email=f"file-communications-{suffix}@example.com",
            communications_enabled=True,
            is_active=True,
        )
        db.add(organization)
        db.flush()
        admin = AdminUser(
            email=f"file-admin-{suffix}@example.com",
            role=AdminRole.ORG_ADMIN,
            org_id=organization.id,
            is_active=True,
        )
        db.add(admin)
        db.flush()
        asset = EmailBuilderAsset(
            association_id=organization.id,
            created_by_user_id=admin.id,
            name="Asset",
            file_name="asset.png",
            mime_type="image/png",
            size_bytes=3,
            storage_path=asset_relative_path,
            public_url=f"/uploads/{asset_relative_path}",
        )
        db.add(asset)
        db.commit()
        application_id = application.id
        asset_id = asset.id
        _login_org_admin(client, db, admin)

    asset_response = client.delete(f"/api/org-admin/communications/assets/{asset_id}")
    assert asset_response.status_code == 200, asset_response.text
    assert asset_response.json() == {"ok": True, "deleted_asset_id": asset_id}
    assert asset_target.exists()

    _login_super_admin(client)
    affiliation_response = client.delete(
        f"/api/super-admin/affiliations/{application_id}"
    )
    assert affiliation_response.status_code == 200, affiliation_response.text
    assert affiliation_response.json() == {"ok": True, "deleted_id": application_id}
    assert affiliation_target.exists()

    stats = process_file_deletions_once(limit=10)
    assert stats["deleted"] == 2
    assert not asset_target.exists()
    assert not affiliation_target.exists()

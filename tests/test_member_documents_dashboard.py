import pytest
from datetime import datetime
import uuid
import os

from app.config import settings
from app.db import SessionLocal
from app.models import Organization, Member, MemberDocument, MemberStatus, DocStatus
from app.security import get_password_hash


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def test_member_document_reject_and_resubmit(client, db):
    suffix = uuid.uuid4().hex[:8]
    org = Organization(name=f"Member Docs Org {suffix}", slug=f"member-docs-org-{suffix}", is_active=True)
    db.add(org)
    db.commit()
    db.refresh(org)

    email = f"member.docs.{suffix}@example.com"

    member = Member(
        org_id=org.id,
        first_name="Marco",
        last_name="Rossi",
        email=email,
        password_hash=get_password_hash("TestPass123!"),
        status=MemberStatus.ACTIVE,
        card_no=8000 + int(suffix[:2], 16),
        card_year=datetime.utcnow().year,
        joined_at=datetime.utcnow(),
        signup_ip="127.0.0.1",
        signup_user_agent="pytest",
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    doc = MemberDocument(
        member_id=member.id,
        doc_type="identity",
        rel_path="test/path/id.pdf",
        original_filename="id.pdf",
        mime_type="application/pdf",
        size_bytes=1234,
        sha256="deadbeef",
        status=DocStatus.REJECTED.value,
        rejection_note="Documento illeggibile",
        uploaded_at=datetime.utcnow(),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    resp = client.post("/api/auth/login", data={"email": email, "password": "TestPass123!"})
    assert resp.status_code == 200

    resp = client.get("/api/member/documents")
    assert resp.status_code == 200
    data = resp.json()
    assert any(
        item["id"] == doc.id and item["rejection_note"] == "Documento illeggibile"
        for item in data["items"]
    )

    files = {"document": ("id_new.pdf", b"%PDF-1.4 content", "application/pdf")}
    resp = client.post(f"/api/member/documents/{doc.id}/resubmit", files=files)
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending"

    resp = client.get("/api/member/documents")
    assert resp.status_code == 200
    data = resp.json()
    assert any(
        item.get("replaces_document_id") == doc.id and item["status"] == "pending"
        for item in data["items"]
    )


def test_member_can_fetch_and_download_organization_statute(client, db):
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Statute Org {suffix}",
        slug=f"statute-org-{suffix}",
        is_active=True,
        statute_version="v1",
        statute_pdf_path=f"statutes/{suffix}/statuto.pdf",
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    full_path = os.path.join(settings.UPLOAD_DIR, org.statute_pdf_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "wb") as handle:
        handle.write(b"%PDF-1.4\n% test statute\n")

    member = Member(
        org_id=org.id,
        first_name="Anna",
        last_name="Verdi",
        email=f"statute.member.{suffix}@example.com",
        password_hash=get_password_hash("TestPass123!"),
        status=MemberStatus.ACTIVE,
        card_no=7000 + int(suffix[:2], 16),
        card_year=datetime.utcnow().year,
        joined_at=datetime.utcnow(),
        signup_ip="127.0.0.1",
        signup_user_agent="pytest",
    )
    db.add(member)
    db.commit()

    login = client.post("/api/auth/login", data={"email": member.email, "password": "TestPass123!"})
    assert login.status_code == 200

    meta = client.get("/api/me/organization/statute")
    assert meta.status_code == 200, meta.text
    meta_payload = meta.json()
    assert meta_payload["available"] is True
    assert meta_payload["download_url"] == "/api/me/organization/statute/download"
    assert meta_payload["filename"].startswith("statuto_")

    download = client.get(meta_payload["download_url"])
    assert download.status_code == 200
    assert "application/pdf" in download.headers.get("content-type", "")
    assert download.content.startswith(b"%PDF-1.4")

    alias_download = client.get("/api/me/documents/statute")
    assert alias_download.status_code == 200
    assert alias_download.content.startswith(b"%PDF-1.4")


def test_member_statute_endpoint_is_scoped_to_logged_member_org(client, db):
    suffix = uuid.uuid4().hex[:8]
    org_a = Organization(
        name=f"Statute A {suffix}",
        slug=f"statute-a-{suffix}",
        is_active=True,
        statute_version="v1",
        statute_pdf_path=f"statutes/{suffix}/a.pdf",
    )
    org_b = Organization(
        name=f"Statute B {suffix}",
        slug=f"statute-b-{suffix}",
        is_active=True,
        statute_version="v1",
        statute_pdf_path=f"statutes/{suffix}/b.pdf",
    )
    db.add_all([org_a, org_b])
    db.commit()
    db.refresh(org_a)
    db.refresh(org_b)

    path_a = os.path.join(settings.UPLOAD_DIR, org_a.statute_pdf_path)
    path_b = os.path.join(settings.UPLOAD_DIR, org_b.statute_pdf_path)
    os.makedirs(os.path.dirname(path_a), exist_ok=True)
    with open(path_a, "wb") as handle:
        handle.write(b"%PDF-1.4\n% org-a\n")
    with open(path_b, "wb") as handle:
        handle.write(b"%PDF-1.4\n% org-b\n")

    member_a = Member(
        org_id=org_a.id,
        first_name="A",
        last_name="User",
        email=f"member.a.{suffix}@example.com",
        password_hash=get_password_hash("TestPass123!"),
        status=MemberStatus.ACTIVE,
        card_no=6000 + int(suffix[:2], 16),
        card_year=datetime.utcnow().year,
        joined_at=datetime.utcnow(),
        signup_ip="127.0.0.1",
        signup_user_agent="pytest",
    )
    member_b = Member(
        org_id=org_b.id,
        first_name="B",
        last_name="User",
        email=f"member.b.{suffix}@example.com",
        password_hash=get_password_hash("TestPass123!"),
        status=MemberStatus.ACTIVE,
        card_no=6100 + int(suffix[:2], 16),
        card_year=datetime.utcnow().year,
        joined_at=datetime.utcnow(),
        signup_ip="127.0.0.1",
        signup_user_agent="pytest",
    )
    db.add_all([member_a, member_b])
    db.commit()

    login_a = client.post("/api/auth/login", data={"email": member_a.email, "password": "TestPass123!"})
    assert login_a.status_code == 200
    res_a = client.get("/api/me/documents/statute")
    assert res_a.status_code == 200
    assert b"org-a" in res_a.content
    assert b"org-b" not in res_a.content

    client.post("/api/auth/logout")

    login_b = client.post("/api/auth/login", data={"email": member_b.email, "password": "TestPass123!"})
    assert login_b.status_code == 200
    res_b = client.get("/api/me/documents/statute")
    assert res_b.status_code == 200
    assert b"org-b" in res_b.content
    assert b"org-a" not in res_b.content

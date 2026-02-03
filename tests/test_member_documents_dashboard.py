import pytest
from datetime import datetime

from app.db import SessionLocal
from app.models import Organization, Member, MemberDocument, MemberStatus, DocStatus
from app.security import get_password_hash


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def test_member_document_reject_and_resubmit(client, db):
    org = db.query(Organization).filter_by(slug="member-docs-org").first()
    if not org:
        org = Organization(name="Member Docs Org", slug="member-docs-org", is_active=True)
        db.add(org)
        db.commit()
        db.refresh(org)

    email = "member.docs@example.com"
    existing = db.query(Member).filter_by(email=email).first()
    if existing:
        db.delete(existing)
        db.commit()

    member = Member(
        org_id=org.id,
        first_name="Marco",
        last_name="Rossi",
        email=email,
        password_hash=get_password_hash("TestPass123!"),
        status=MemberStatus.PENDING_VERIFICATION,
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

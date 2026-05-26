import pytest
from datetime import datetime, timedelta
import uuid

from app.db import SessionLocal
from app.models import AdminUser, AdminRole, Organization, Member, OrgAdminToken, SignupSource
from app.utils import hash_token


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _login_org_admin(client, db, admin_id: int):
    token_str = f"manualtoken-{admin_id}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)


def test_org_admin_can_create_member(client, db):
    org = db.query(Organization).filter_by(slug="manual-org").first()
    if not org:
        org = Organization(name="Manual Org", slug="manual-org", is_active=True)
        db.add(org)
        db.commit()
        db.refresh(org)

    admin_email = "manual_admin@example.com"
    admin = db.query(AdminUser).filter_by(email=admin_email).first()
    if not admin:
        admin = AdminUser(
            email=admin_email,
            role=AdminRole.ORG_ADMIN,
            org_id=org.id,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

    _login_org_admin(client, db, admin.id)

    existing = db.query(Member).filter_by(email="mario.rossi@example.com", org_id=org.id).first()
    if existing:
        db.delete(existing)
        db.commit()

    payload = {
        "first_name": "Mario",
        "last_name": "Rossi",
        "email": "mario.rossi@example.com",
        "joined_at": "2026-02-02",
        "is_manual": True,
    }
    res = client.post("/api/org-admin/members", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["email"] == "mario.rossi@example.com"
    assert data["is_manual"] is True

    member = db.query(Member).filter(Member.id == data["id"]).first()
    assert member is not None
    assert member.org_id == org.id
    assert member.first_name == "Mario"
    assert member.is_manual is True
    assert member.signup_source == SignupSource.ADMIN.value


def test_org_admin_cannot_override_org_id(client, db):
    org = db.query(Organization).filter_by(slug="manual-org-a").first()
    if not org:
        org = Organization(name="Manual Org A", slug="manual-org-a", is_active=True)
        db.add(org)
        db.commit()
        db.refresh(org)

    other_org = db.query(Organization).filter_by(slug="manual-org-b").first()
    if not other_org:
        other_org = Organization(name="Manual Org B", slug="manual-org-b", is_active=True)
        db.add(other_org)
        db.commit()
        db.refresh(other_org)

    admin_email = "manual_admin_a@example.com"
    admin = db.query(AdminUser).filter_by(email=admin_email).first()
    if not admin:
        admin = AdminUser(
            email=admin_email,
            role=AdminRole.ORG_ADMIN,
            org_id=org.id,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

    _login_org_admin(client, db, admin.id)

    payload = {
        "first_name": "Giulia",
        "last_name": "Verdi",
        "email": "giulia.verdi@example.com",
        "org_id": other_org.id,
    }
    res = client.post("/api/org-admin/members", json=payload)
    assert res.status_code == 422
    assert (
        db.query(Member)
        .filter(Member.email == "giulia.verdi@example.com", Member.org_id == org.id)
        .first()
        is None
    )


def test_super_admin_cannot_create_member(client):
    client.cookies.clear()
    client.post("/api/super-admin/auth/login", json={"email": "admin@assonam.it", "password": "admin"})
    res = client.post(
        "/api/org-admin/members",
        json={"first_name": "Super", "last_name": "Admin"},
    )
    assert res.status_code == 401
    client.post("/api/super-admin/auth/logout")


def test_org_admin_can_manage_membership_settings_and_create_temporary_member(client, db):
    suffix = uuid.uuid4().hex[:8]
    org = Organization(
        name=f"Temporary Org {suffix}",
        slug=f"temporary-org-{suffix}",
        is_active=True,
        membership_fee_amount=30,
        temporary_membership_fee_amount=10,
        custom_membership_types_enabled=True,
        temporary_membership_duration_value=6,
        temporary_membership_duration_unit="hours",
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    admin = AdminUser(
        email=f"temporary-admin-{suffix}@example.com",
        role=AdminRole.ORG_ADMIN,
        org_id=org.id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    _login_org_admin(client, db, admin.id)

    get_res = client.get("/api/org-admin/organization/membership-settings")
    assert get_res.status_code == 200, get_res.text
    assert get_res.json()["custom_membership_types_enabled"] is True
    assert get_res.json()["temporary_membership_duration_value"] == 6

    patch_res = client.patch(
        "/api/org-admin/organization/membership-settings",
        json={
            "membership_fee_amount": 32,
            "temporary_membership_fee_amount": 12,
            "temporary_membership_duration_value": 8,
            "temporary_membership_duration_unit": "hours",
        },
    )
    assert patch_res.status_code == 200, patch_res.text
    patched = patch_res.json()["settings"]
    assert patched["membership_fee_amount"] == 32.0
    assert patched["temporary_membership_fee_amount"] == 12.0
    assert patched["temporary_membership_duration_value"] == 8
    assert patched["temporary_membership_duration_unit"] == "hours"

    style_res = client.patch(
        "/api/org-admin/organization/membership-settings",
        json={
            "card_style": {
                "primary_color": "#660020",
                "secondary_color": "#24000E",
                "accent_color": "#E1B957",
                "text_color": "#FFFFFF",
                "muted_text_color": "#F9D86B",
                "font_family": "classic",
                "surface_pattern": "geometric",
                "logo_mode": "watermark",
                "logo_position": "top-right",
                "logo_opacity": 0.22,
                "logo_blend": "normal",
                "remove_logo_background": False,
                "back_title": "Verifica tessera",
                "back_body": "",
                "back_show_member": True,
            }
        },
    )
    assert style_res.status_code == 200, style_res.text
    styled = style_res.json()["settings"]["card_style"]
    assert styled["primary_color"] == "#660020"
    assert styled["logo_opacity"] == 0.22
    assert styled["back_body"] == ""

    payload = {
        "first_name": "Marta",
        "last_name": "Temporanea",
        "email": f"marta-{suffix}@example.com",
        "joined_at": "2026-04-12",
        "is_manual": True,
        "membership_type": "temporary",
    }
    res = client.post("/api/org-admin/members", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["membership_type"] == "temporary"
    assert data["membership_type_label"] == "Temporanea"
    assert data["membership_fee_snapshot"] == 12.0
    assert data["valid_from"] is not None
    assert data["valid_until"] is not None

    member = db.query(Member).filter(Member.id == data["id"]).first()
    assert member is not None
    assert member.membership_type == "temporary"
    assert float(member.membership_fee_snapshot) == 12.0
    assert member.valid_from is not None
    assert member.valid_until is not None
    assert member.valid_until - member.valid_from == timedelta(hours=8)

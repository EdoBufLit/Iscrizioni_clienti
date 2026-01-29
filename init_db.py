from sqlalchemy.orm import Session
from app.db import SessionLocal, engine
from app.models import Organization, AdminUser, AdminRole, CardBatch
from app.security import get_password_hash

def init_db():
    db = SessionLocal()

    # Check if org exists
    org = db.query(Organization).filter(Organization.slug == "my-association").first()
    if not org:
        print("Creating seed organization...")
        org = Organization(
            name="My Awesome Association",
            slug="my-association",
            statute_version="v1.0",
            privacy_version="v2.023"
        )
        db.add(org)
        db.commit()
        db.refresh(org)
        print(f"Organization '{org.name}' created with slug '{org.slug}'.")
    else:
        print("Organization already exists.")

    # Check if admin exists
    admin = db.query(AdminUser).filter(AdminUser.email == "admin@example.com").first()
    if not admin:
        print("Creating admin user...")
        admin = AdminUser(
            email="admin@example.com",
            password_hash=get_password_hash("admin"),
            role=AdminRole.ORG_ADMIN,
            org_id=org.id
        )
        db.add(admin)
        db.commit()
        print("Admin user created (admin@example.com / admin).")
    else:
        # Check if we need to upgrade to hash (if it was plain "admin")
        # For simplicity in this task, if it exists, we assume it's good or we just update it.
        # Let's update it to ensure it's hashed for this task run.
        print("Updating admin user password...")
        admin.password_hash = get_password_hash("admin")
        db.commit()

    # Check if batch exists
    batch = db.query(CardBatch).filter(CardBatch.org_id == org.id).first()
    if not batch:
        print("Creating seed card batch...")
        batch = CardBatch(
            org_id=org.id,
            start_no=100,
            end_no=200,
            next_no=100
        )
        db.add(batch)
        db.commit()
        print("Card batch created (100-200).")
    else:
        print("Card batch already exists.")

    db.close()

if __name__ == "__main__":
    init_db()

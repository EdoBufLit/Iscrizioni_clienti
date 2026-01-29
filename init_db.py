from sqlalchemy.orm import Session
from app.db import SessionLocal, engine
from app.models import Organization

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
        print(f"Organization '{org.name}' created with slug '{org.slug}'.")
    else:
        print("Organization already exists.")

    db.close()

if __name__ == "__main__":
    init_db()

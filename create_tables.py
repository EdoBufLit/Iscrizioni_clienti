from app.db import engine, Base
from app.models import Organization, Member, MemberDocument, Token

def create_tables():
    print("Creating tables...")
    Base.metadata.create_all(bind=engine)
    print("Tables created.")

if __name__ == "__main__":
    create_tables()

import logging
from sqlalchemy.orm import Session
from datetime import datetime

from app.models import AdminUser, AdminRole
from app.security import get_password_hash
from app.config import settings

logger = logging.getLogger(__name__)

def bootstrap_super_admin(db: Session) -> None:
    """
    Ensures a super admin exists at startup.
    - If ANY super admin exists -> do nothing.
    - If NO super admin exists -> create one using env vars.
    - If env vars missing -> do nothing.
    - If email collision with non-super admin -> do nothing (log warning).
    """
    sa_email = settings.SUPER_ADMIN_EMAIL
    sa_password = settings.SUPER_ADMIN_PASSWORD

    if not sa_email or not sa_password:
        return

    # 1. Check if ANY super admin exists
    # If yes, we assume the system is already bootstrapped/managed.
    existing_sa = db.query(AdminUser).filter(AdminUser.role == AdminRole.SUPER_ADMIN).first()
    if existing_sa:
        logger.info("Super admin already exists, skipping bootstrap")
        return

    # 2. Check if the specific email is already taken (by a non-super admin, implied by step 1)
    existing_user = db.query(AdminUser).filter(AdminUser.email == sa_email).first()
    if existing_user:
        logger.warning(
            "Cannot bootstrap super admin: Email '%s' is already taken by a non-super admin. "
            "Skipping to avoid overwriting existing user.",
            sa_email
        )
        return

    # 3. Create the super admin
    try:
        logger.info("Creating super admin user (%s)...", sa_email)
        new_sa = AdminUser(
            email=sa_email,
            password_hash=get_password_hash(sa_password),
            role=AdminRole.SUPER_ADMIN,
            org_id=None,
            is_active=True,
            created_at=datetime.utcnow()
        )
        db.add(new_sa)
        db.commit()
        logger.info("Super admin created from env")
    except Exception as e:
        logger.error("Failed to bootstrap super admin: %s", e)
        db.rollback()

from fastapi import APIRouter, Depends, HTTPException, Request, Form, UploadFile, File
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.db import get_db
from app.models import Organization, Member, MemberStatus, Token, TokenType, MemberDocument
from app.utils import generate_token, send_email, save_upload_file, hash_token
from app.services.card import assign_next_card
from app.config import settings
from app.middleware import join_limiter, get_client_ip
from app import audit
import logging
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()


# ── Legacy HTML redirects ─────────────────────────────────────────

@router.get("/join/continue")
def join_continue_page(request: Request, token: str, db: Session = Depends(get_db)):
    token_hash = hash_token(token)
    token_entry = db.query(Token).filter(
        Token.token_hash == token_hash,
        Token.purpose == TokenType.SIGNUP_CONTINUE,
        Token.expires_at > datetime.utcnow()
    ).first()

    if not token_entry:
        return RedirectResponse(url="/")

    if token_entry.used_at:
         return RedirectResponse(url="/")

    member = db.query(Member).filter(Member.id == token_entry.member_id).first()
    organization = db.query(Organization).filter(Organization.id == member.org_id).first()

    return RedirectResponse(url="/")


@router.get("/join/{org_slug}")
def join_page(request: Request, org_slug: str, db: Session = Depends(get_db)):
    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    if not org:
        return RedirectResponse(url="/associazioni")

    return RedirectResponse(url=f"/associazioni/{org_slug}/iscrizione")


# ── JSON API ──────────────────────────────────────────────────────

@router.post("/api/join/{org_slug}")
def api_join_start(
    request: Request,
    org_slug: str,
    first_name: str = Form(...),
    last_name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    fiscal_code: str = Form(...),
    accept_statute: bool = Form(...),
    accept_privacy: bool = Form(...),
    db: Session = Depends(get_db)
):
    join_limiter.check(get_client_ip(request))

    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    existing_member = db.query(Member).filter(Member.email == email, Member.org_id == org.id).first()
    if existing_member:
        # Return identical response to prevent email enumeration.
        # Notify the existing member instead.
        if not send_email(
            to_email=email,
            subject=f"Registrazione presso {org.name}",
            body=f"Risulta già una richiesta di iscrizione a {org.name} con questo indirizzo email. "
                 f"Se non hai effettuato questa richiesta, puoi ignorare questo messaggio.",
        ):
             logger.warning("Failed to send existing member notification to %s", email)
        return {"status": "started", "organization": org.name}

    member = Member(
        org_id=org.id,
        first_name=first_name,
        last_name=last_name,
        email=email,
        phone=phone,
        fiscal_code=fiscal_code,
        status=MemberStatus.PENDING_DOCS,
        accepted_statute_at=datetime.utcnow(),
        accepted_statute_version=org.statute_version,
        accepted_privacy_at=datetime.utcnow(),
        accepted_privacy_version=org.privacy_version,
        signup_ip=request.client.host,
        signup_user_agent=request.headers.get("user-agent")
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    # Create Token
    token_str = generate_token()
    token = Token(
        member_id=member.id,
        purpose=TokenType.SIGNUP_CONTINUE,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=settings.JOIN_TOKEN_EXPIRE_MINUTES)
    )
    db.add(token)
    db.commit()

    audit.join_submitted(org_slug=org_slug, org_id=org.id, ip=get_client_ip(request))

    # Send Email
    link = f"{settings.BASE_URL}/join/continue?token={token_str}"
    if not send_email(
        to_email=email,
        subject=f"Complete your registration for {org.name}",
        body=f"Click here to upload documents and complete registration: {link}"
    ):
         logger.warning("Failed to send registration email to %s", email)

    return {"status": "started", "organization": org.name}


@router.post("/api/join/continue")
async def api_join_continue(
    request: Request,
    token: str = Form(...),
    id_document: UploadFile = File(...),
    fiscal_code_document: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # Validate token
    token_hash = hash_token(token)
    token_entry = db.query(Token).filter(
        Token.token_hash == token_hash,
        Token.purpose == TokenType.SIGNUP_CONTINUE,
        Token.expires_at > datetime.utcnow()
    ).first()

    if not token_entry:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    if token_entry.used_at:
        raise HTTPException(status_code=400, detail="Token already used")

    member = db.query(Member).filter(Member.id == token_entry.member_id).first()

    # Process Files with transactional cleanup on failure
    rel_path_id = None
    rel_path_fc = None

    try:
        # Process ID Document
        rel_path_id, size_id, sha_id = await save_upload_file(id_document)
        doc_id = MemberDocument(
            member_id=member.id,
            doc_type="identity",
            rel_path=rel_path_id,
            original_filename=id_document.filename,
            mime_type=id_document.content_type,
            size_bytes=size_id,
            sha256=sha_id
        )
        db.add(doc_id)

        # Process Fiscal Code Document
        rel_path_fc, size_fc, sha_fc = await save_upload_file(fiscal_code_document)
        doc_fc = MemberDocument(
            member_id=member.id,
            doc_type="fiscal_code",
            rel_path=rel_path_fc,
            original_filename=fiscal_code_document.filename,
            mime_type=fiscal_code_document.content_type,
            size_bytes=size_fc,
            sha256=sha_fc
        )
        db.add(doc_fc)

        # Assign Card
        assigned = assign_next_card(db, member.id, member.org_id)

        if assigned:
            member.status = MemberStatus.ACTIVE
            member.joined_at = datetime.utcnow()
        else:
            member.status = MemberStatus.PENDING_CARDS
            logger.warning(f"Member {member.id} completed upload but no cards available.")

        # Mark token used
        token_entry.used_at = datetime.utcnow()

        db.commit()

        audit.join_completed(
            member_id=member.id, org_id=member.org_id, card_assigned=bool(assigned),
        )

        # Send Welcome Email
        org = db.query(Organization).filter(Organization.id == member.org_id).first()
        if not send_email(
            to_email=member.email,
            subject=f"Welcome to {org.name}",
            body=f"Your registration is complete. You can now login at {settings.BASE_URL}/member/login"
        ):
             logger.warning("Failed to send welcome email to %s", member.email)

        return {
            "status": "complete",
            "assigned_card": bool(assigned),
            "member_status": member.status.value,
        }

    except HTTPException:
        raise
    except Exception as e:
        # Cleanup uploads
        for rel_path in (rel_path_id, rel_path_fc):
            if rel_path:
                try:
                    os.remove(os.path.join(settings.UPLOAD_DIR, rel_path))
                except OSError:
                    pass
        db.rollback()
        logger.error(f"Error during file upload: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during upload")

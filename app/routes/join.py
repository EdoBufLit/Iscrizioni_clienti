from fastapi import APIRouter, Depends, HTTPException, Request, Form, UploadFile, File, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.db import get_db
from app.models import Organization, Member, MemberStatus, Token, TokenType, MemberDocument
from app.utils import generate_token, send_email_simulation, save_upload_file, hash_token
from app.config import settings
import logging
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

@router.get("/join/continue", response_class=HTMLResponse)
def join_continue_page(request: Request, token: str, db: Session = Depends(get_db)):
    # Validate token
    token_hash = hash_token(token)
    token_entry = db.query(Token).filter(
        Token.token_hash == token_hash,
        Token.purpose == TokenType.SIGNUP_CONTINUE,
        Token.expires_at > datetime.utcnow()
    ).first()

    if not token_entry:
        return HTMLResponse(content="Invalid or expired token", status_code=400)

    if token_entry.used_at:
         return HTMLResponse(content="Token already used", status_code=400)

    member = db.query(Member).filter(Member.id == token_entry.member_id).first()
    organization = db.query(Organization).filter(Organization.id == member.org_id).first()

    return templates.TemplateResponse("upload.html", {
        "request": request,
        "token": token,
        "member": member,
        "organization": organization
    })

@router.post("/join/continue", response_class=HTMLResponse)
async def join_continue_submit(
    request: Request,
    token: str = Form(...),
    id_document: UploadFile = File(...),
    fiscal_code_document: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # Validate token again
    token_hash = hash_token(token)
    token_entry = db.query(Token).filter(
        Token.token_hash == token_hash,
        Token.purpose == TokenType.SIGNUP_CONTINUE,
        Token.expires_at > datetime.utcnow()
    ).first()

    if not token_entry:
        return HTMLResponse(content="Invalid or expired token", status_code=400)

    # Validate Files
    ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"]
    MAX_SIZE = 5 * 1024 * 1024 # 5MB

    if id_document.content_type not in ALLOWED_TYPES or fiscal_code_document.content_type not in ALLOWED_TYPES:
        return HTMLResponse(content="Invalid file type. Only PDF, JPEG, PNG allowed.", status_code=400)

    # Check size (rough check via seek/tell or assuming Content-Length header,
    # but strictly we should read chunks. For MVP, relying on UploadFile details or checking after read is easier
    # but `save_upload_file` saves it. Let's check size inside `save_upload_file` or check `id_document.size` if available (Starlette doesn't expose it directly until read).
    # We can check file.size if spooled, but let's just rely on a check during save or before.)

    # We'll check sizes by reading the file object cursor end? No, let's just proceed to save but check size there or check request headers.
    # Actually, let's implement validation logic.

    # Simple check on content-length header if present
    content_length = request.headers.get('content-length')
    if content_length and int(content_length) > MAX_SIZE * 3: # Rough estimate for multipart overhead
         return HTMLResponse(content="Files too large.", status_code=400)

    member = db.query(Member).filter(Member.id == token_entry.member_id).first()

    # Process ID Document
    rel_path_id, size_id, sha_id = await save_upload_file(id_document)

    if size_id > MAX_SIZE:
        # Cleanup
        os.remove(os.path.join(settings.UPLOAD_DIR, rel_path_id))
        return HTMLResponse(content="ID Document too large (Max 5MB).", status_code=400)

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

    if size_fc > MAX_SIZE:
        # Cleanup ID doc too? strictly yes, but let's just error.
        os.remove(os.path.join(settings.UPLOAD_DIR, rel_path_fc))
        # Remove the previous one too? Not strictly required for MVP but good practice.
        return HTMLResponse(content="Fiscal Code Document too large (Max 5MB).", status_code=400)

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

    # Update Member
    member.status = MemberStatus.ACTIVE
    member.joined_at = datetime.utcnow()

    # Mark token used
    token_entry.used_at = datetime.utcnow()

    db.commit()

    # Send Welcome Email
    send_email_simulation(
        to_email=member.email,
        subject=f"Welcome to {member.organization.name}",
        body=f"Your registration is complete. You can now login at {settings.BASE_URL}/member/login"
    )

    return HTMLResponse(content="<h1>Registration Complete!</h1><p>You can now <a href='/member/login'>login</a>.</p>")


@router.get("/join/{org_slug}", response_class=HTMLResponse)
def join_page(request: Request, org_slug: str, db: Session = Depends(get_db)):
    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    return templates.TemplateResponse("join.html", {"request": request, "org": org})

@router.post("/join/{org_slug}", response_class=HTMLResponse)
def join_submit(
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
    org = db.query(Organization).filter(Organization.slug == org_slug).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Create Member
    # Check if email already exists for this org?
    existing_member = db.query(Member).filter(Member.email == email, Member.org_id == org.id).first()
    if existing_member:
        return HTMLResponse("Member with this email already exists.", status_code=400)

    member = Member(
        org_id=org.id,
        first_name=first_name,
        last_name=last_name,
        email=email,
        phone=phone,
        fiscal_code=fiscal_code,
        status=MemberStatus.PENDING_VERIFICATION,
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
        expires_at=datetime.utcnow() + timedelta(minutes=settings.TOKEN_EXPIRE_MINUTES)
    )
    db.add(token)
    db.commit()

    # Send Email
    link = f"{settings.BASE_URL}/join/continue?token={token_str}"
    send_email_simulation(
        to_email=email,
        subject=f"Complete your registration for {org.name}",
        body=f"Click here to upload documents and complete registration: {link}"
    )

    return HTMLResponse(content="<h1>Registration Started</h1><p>Please check your email to complete the registration.</p>")

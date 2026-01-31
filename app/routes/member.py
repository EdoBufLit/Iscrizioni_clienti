from fastapi import APIRouter, Depends, HTTPException, Request, Form, status
from fastapi.responses import RedirectResponse, FileResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.db import get_db
from app.models import Member, Token, TokenType, MemberDocument, MemberStatus, Organization
from app.utils import generate_token, send_email_simulation, hash_token
from app.security import get_password_hash, verify_password
from app.config import settings
from app.middleware import auth_limiter, get_client_ip
from app import audit
import os

router = APIRouter()


def get_current_member(request: Request, db: Session):
    member_id = request.session.get("member_id")
    if not member_id:
        return None
    return db.query(Member).filter(Member.id == member_id).first()


# ── Legacy HTML redirects ─────────────────────────────────────────

@router.get("/member/login")
def login_page(request: Request, org: str = None, db: Session = Depends(get_db)):
    return RedirectResponse(url="/app/login")


@router.get("/member/auth")
def auth_magic_link(request: Request, token: str, db: Session = Depends(get_db)):
    auth_limiter.check(get_client_ip(request))
    token_hash = hash_token(token)
    token_entry = db.query(Token).filter(
        Token.token_hash == token_hash,
        Token.purpose == TokenType.LOGIN_MAGIC_LINK,
        Token.expires_at > datetime.utcnow()
    ).first()

    if not token_entry:
        return RedirectResponse(url="/app/login")

    if token_entry.used_at:
        return RedirectResponse(url="/app/login")

    member = db.query(Member).filter(Member.id == token_entry.member_id).first()
    if not member:
        return RedirectResponse(url="/app/login")

    # Mark token used
    token_entry.used_at = datetime.utcnow()
    db.commit()

    # Log user in — allow any member status
    request.session["member_id"] = token_entry.member_id
    audit.member_verified(member_id=token_entry.member_id, ip=get_client_ip(request))

    return RedirectResponse(url="/app/dashboard", status_code=status.HTTP_302_FOUND)


@router.get("/member/portal")
def member_portal(request: Request, db: Session = Depends(get_db)):
    member = get_current_member(request, db)
    if not member:
        if request.session.get("member_id"):
            request.session.clear()
        return RedirectResponse(url="/app/login")

    return RedirectResponse(url="/app/dashboard")


@router.get("/member/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/app/login")


# ── File download (non-HTML, kept as-is) ──────────────────────────

@router.get("/member/download/{doc_id}")
def download_document(request: Request, doc_id: int, db: Session = Depends(get_db)):
    member = get_current_member(request, db)
    if not member:
        raise HTTPException(status_code=401, detail="Not authenticated")

    doc = db.query(MemberDocument).filter(MemberDocument.id == doc_id, MemberDocument.member_id == member.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = os.path.join(settings.UPLOAD_DIR, doc.rel_path)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server")

    return FileResponse(file_path, filename=doc.original_filename, media_type=doc.mime_type)


# ── JSON API ──────────────────────────────────────────────────────

@router.post("/api/auth/login")
def api_auth_login(request: Request, email: str = Form(...), password: str = Form(default=""), db: Session = Depends(get_db)):
    """
    Login: if password is provided, try password auth. Otherwise send a magic-link.
    Always returns 200 for security (no user enumeration).
    """
    auth_limiter.check(get_client_ip(request))
    member = db.query(Member).filter(Member.email == email).first()

    # Password-based login
    if password and member and member.password_hash and verify_password(password, member.password_hash):
        request.session["member_id"] = member.id
        audit.member_verified(member_id=member.id, ip=get_client_ip(request))
        return {"status": "ok", "message": "Login successful.", "authenticated": True}

    # Magic-link fallback
    if member:
        token_str = generate_token()
        token = Token(
            member_id=member.id,
            purpose=TokenType.LOGIN_MAGIC_LINK,
            token_hash=hash_token(token_str),
            expires_at=datetime.utcnow() + timedelta(minutes=settings.LOGIN_TOKEN_EXPIRE_MINUTES)
        )
        db.add(token)
        db.commit()

        link = f"{settings.BASE_URL}/member/auth?token={token_str}"
        send_email_simulation(
            to_email=email,
            subject="Accesso Area Riservata - ASSO.N.A.M.",
            body=f"Clicca qui per accedere alla tua area riservata: {link}\n\nIl link scade tra {settings.LOGIN_TOKEN_EXPIRE_MINUTES} minuti."
        )

    audit.member_magic_link_requested(email=email, ip=get_client_ip(request))
    return {"status": "ok", "message": "If an account exists, a magic link has been sent."}


@router.post("/api/auth/register")
def api_auth_register(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    first_name: str = Form(...),
    last_name: str = Form(...),
    phone: str = Form(default=""),
    fiscal_code: str = Form(default=""),
    org_slug: str = Form(default=""),
    db: Session = Depends(get_db),
):
    """
    Register a new member with password auth.
    Returns 200 always to prevent email enumeration.
    """
    auth_limiter.check(get_client_ip(request))

    # Find org
    org = None
    if org_slug:
        org = db.query(Organization).filter(Organization.slug == org_slug).first()

    # Check if member already exists
    existing = db.query(Member).filter(Member.email == email).first()
    if existing:
        # If existing but no password, allow setting password
        if not existing.password_hash:
            existing.password_hash = get_password_hash(password)
            db.commit()
            request.session["member_id"] = existing.id
            return {"status": "ok", "message": "Account attivato.", "authenticated": True}
        # Already registered — don't reveal
        return {"status": "ok", "message": "Registrazione ricevuta."}

    if not org:
        # Without org, just create member without org_id
        pass

    member = Member(
        org_id=org.id if org else None,
        first_name=first_name,
        last_name=last_name,
        email=email,
        phone=phone,
        fiscal_code=fiscal_code,
        password_hash=get_password_hash(password),
        status=MemberStatus.PENDING_DOCS,
        signup_ip=request.client.host if request.client else "unknown",
        signup_user_agent=request.headers.get("user-agent"),
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    # Automatically log in
    request.session["member_id"] = member.id
    audit.member_verified(member_id=member.id, ip=get_client_ip(request))

    return {"status": "ok", "message": "Registrazione completata.", "authenticated": True}


@router.post("/api/auth/logout")
def api_auth_logout(request: Request):
    request.session.clear()
    return {"status": "ok"}


@router.get("/api/auth/me")
def api_auth_me(request: Request, db: Session = Depends(get_db)):
    member = get_current_member(request, db)
    if not member:
        raise HTTPException(status_code=401, detail="Not authenticated")

    org = member.organization

    return {
        "id": member.id,
        "first_name": member.first_name,
        "last_name": member.last_name,
        "email": member.email,
        "phone": member.phone,
        "fiscal_code": member.fiscal_code,
        "status": member.status.value,
        "card_no": member.card_no,
        "joined_at": member.joined_at.isoformat() if member.joined_at else None,
        "organization": {
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
        } if org else None,
    }

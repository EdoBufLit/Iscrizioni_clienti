from fastapi import APIRouter, Depends, HTTPException, Request, Form, status
from fastapi.responses import RedirectResponse, FileResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.db import get_db
from app.models import Member, Token, TokenType, MemberDocument, MemberStatus, Organization
from app.utils import generate_token, send_email_simulation, hash_token
from app.config import settings
from app.middleware import auth_limiter, get_client_ip
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
    organization = None
    if org:
        organization = db.query(Organization).filter(Organization.slug == org).first()

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
    if not member or member.status != MemberStatus.ACTIVE:
        return RedirectResponse(url="/app/login")

    # Mark token used
    token_entry.used_at = datetime.utcnow()
    db.commit()

    # Log user in
    request.session["member_id"] = token_entry.member_id

    return RedirectResponse(url="/app/dashboard", status_code=status.HTTP_302_FOUND)


@router.get("/member/portal")
def member_portal(request: Request, db: Session = Depends(get_db)):
    member = get_current_member(request, db)
    if not member:
        if request.session.get("member_id"):
            request.session.clear()
        return RedirectResponse(url="/app/login")

    documents = db.query(MemberDocument).filter(MemberDocument.member_id == member.id).all()
    org = member.organization

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
def api_auth_login(request: Request, email: str = Form(...), db: Session = Depends(get_db)):
    """Send a magic-link email. Always returns 200 for security (no user enumeration)."""
    auth_limiter.check(get_client_ip(request))
    member = db.query(Member).filter(Member.email == email).first()

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
            subject="Login to Member Portal",
            body=f"Click here to login: {link}"
        )

    return {"status": "ok", "message": "If an account exists, a magic link has been sent."}


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

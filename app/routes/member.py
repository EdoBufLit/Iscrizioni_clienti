from fastapi import APIRouter, Depends, HTTPException, Request, Form, status
from fastapi.responses import HTMLResponse, RedirectResponse, FileResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.db import get_db
from app.models import Member, Token, TokenType, MemberDocument, MemberStatus
from app.utils import generate_token, send_email_simulation, hash_token
from app.config import settings
import os

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

def get_current_member(request: Request, db: Session):
    member_id = request.session.get("member_id")
    if not member_id:
        return None
    return db.query(Member).filter(Member.id == member_id).first()

@router.get("/member/login", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@router.post("/member/login", response_class=HTMLResponse)
def login_submit(request: Request, email: str = Form(...), db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.email == email).first()

    if member:
        # Generate Magic Link
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

    # Always return same message for security
    return HTMLResponse(content="<h1>Check your email</h1><p>If an account exists, we sent a magic link.</p>")

@router.get("/member/auth")
def auth_magic_link(request: Request, token: str, db: Session = Depends(get_db)):
    token_hash = hash_token(token)
    token_entry = db.query(Token).filter(
        Token.token_hash == token_hash,
        Token.purpose == TokenType.LOGIN_MAGIC_LINK,
        Token.expires_at > datetime.utcnow()
    ).first()

    if not token_entry:
        return HTMLResponse(content="Invalid or expired login link", status_code=400)

    if token_entry.used_at:
        return HTMLResponse(content="Link already used", status_code=400)

    member = db.query(Member).filter(Member.id == token_entry.member_id).first()
    if not member or member.status != MemberStatus.ACTIVE:
        return HTMLResponse(content="Account not active or does not exist", status_code=400)

    # Mark token used
    token_entry.used_at = datetime.utcnow()
    db.commit()

    # Log user in
    request.session["member_id"] = token_entry.member_id

    return RedirectResponse(url="/member/portal", status_code=status.HTTP_302_FOUND)

@router.get("/member/portal", response_class=HTMLResponse)
def member_portal(request: Request, db: Session = Depends(get_db)):
    member = get_current_member(request, db)
    if not member:
        if request.session.get("member_id"):
            request.session.clear()
        return RedirectResponse(url="/member/login")

    documents = db.query(MemberDocument).filter(MemberDocument.member_id == member.id).all()
    org = member.organization

    return templates.TemplateResponse("portal.html", {
        "request": request,
        "member": member,
        "organization": org,
        "documents": documents
    })

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

@router.get("/member/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/member/login")

from fastapi import APIRouter, Depends, File, Form, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.middleware import get_client_ip
from app.services.member_onboarding import (
    StagedOnboardingUpload, cleanup_staged_uploads, complete_onboarding,
    establish_onboarding_session, get_onboarding_context, prepare_onboarding_password,
    serialize_onboarding_context,
)
from app.services.security_rate_limits import enforce_auth_rate_limit
from app.utils import save_upload_file

def private_response_headers(response: Response):
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"


router = APIRouter(prefix="/api/member/onboarding", tags=["member-onboarding"],
    dependencies=[Depends(private_response_headers)])


class OnboardingSessionBody(BaseModel):
    token: str = Field(min_length=20, max_length=4096)


@router.post("/session")
def create_session(request: Request, body: OnboardingSessionBody, db: Session = Depends(get_db)):
    enforce_auth_rate_limit(db, client_ip=get_client_ip(request))
    return establish_onboarding_session(request, db, body.token)


@router.get("")
def get_context(request: Request, db: Session = Depends(get_db)):
    member, scope = get_onboarding_context(request, db)
    return serialize_onboarding_context(db, member, scope)


@router.post("/complete")
async def complete(request: Request, new_password: str | None = Form(default=None),
        identity_document: UploadFile | None = File(default=None),
        fiscal_code_document: UploadFile | None = File(default=None), db: Session = Depends(get_db)):
    # Read-only preflight ends before upload I/O. The final, synchronous write
    # revalidates the member/epoch under a row lock after every file is staged.
    def preflight():
        enforce_auth_rate_limit(db, client_ip=get_client_ip(request))
        member, _scope = get_onboarding_context(request, db)
        prepared = prepare_onboarding_password(member, new_password)
        directory = f"{member.org_id}/{member.id}"
        db.rollback()
        return prepared, directory
    prepared_password, directory = await run_in_threadpool(preflight)
    staged = []
    try:
        for doc_type, upload in (("identity", identity_document), ("fiscal_code", fiscal_code_document)):
            if upload is None:
                continue
            path, size, digest = await save_upload_file(upload, sub_directory=directory)
            staged.append(StagedOnboardingUpload(doc_type, path, size, digest, upload.filename or "documento", upload.content_type or ""))
        return await run_in_threadpool(complete_onboarding, request, db, staged, new_password, prepared_password)
    except Exception:
        await run_in_threadpool(cleanup_staged_uploads, staged)
        raise

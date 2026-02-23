from collections.abc import Mapping

from fastapi import HTTPException, UploadFile

from app.utils import save_upload_file

STATUTE_MAX_FILE_BYTES = 10 * 1024 * 1024
STATUTE_MAX_REQUEST_BYTES = 12 * 1024 * 1024
STATUTE_MAX_FILE_LABEL = "10 MB"

_INVALID_STATUTE_UPLOAD_DETAILS = {
    "Invalid file type.",
    "File extension does not match MIME type.",
    "Invalid PDF file.",
}


def enforce_statute_request_size_from_headers(headers: Mapping[str, str]) -> None:
    raw_content_length = headers.get("content-length")
    if not raw_content_length:
        return

    try:
        content_length = int(raw_content_length)
    except (TypeError, ValueError):
        return

    if content_length <= STATUTE_MAX_REQUEST_BYTES:
        return

    raise HTTPException(
        status_code=413,
        detail=f"File troppo grande. Max {STATUTE_MAX_FILE_LABEL}.",
    )


async def save_statute_pdf(upload_file: UploadFile) -> tuple[str, int, str]:
    try:
        return await save_upload_file(
            upload_file,
            allowed_types=["application/pdf"],
            max_size=STATUTE_MAX_FILE_BYTES,
        )
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else ""

        if detail == "File too large.":
            raise HTTPException(
                status_code=413,
                detail=f"File troppo grande. Max {STATUTE_MAX_FILE_LABEL}.",
            ) from exc

        if detail in _INVALID_STATUTE_UPLOAD_DETAILS:
            raise HTTPException(
                status_code=415,
                detail="Formato non valido: carica un PDF.",
            ) from exc

        if detail == "Empty file.":
            raise HTTPException(
                status_code=422,
                detail="File vuoto.",
            ) from exc

        raise

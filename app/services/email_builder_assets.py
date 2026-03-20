from collections.abc import Mapping

from fastapi import HTTPException, UploadFile

from app.utils import save_upload_file

EMAIL_BUILDER_ASSET_MAX_FILE_BYTES = 4 * 1024 * 1024
EMAIL_BUILDER_ASSET_MAX_REQUEST_BYTES = 8 * 1024 * 1024
EMAIL_BUILDER_ASSET_MAX_LABEL = "4 MB"


def enforce_email_builder_asset_request_size_from_headers(headers: Mapping[str, str]) -> None:
    raw_content_length = headers.get("content-length")
    if not raw_content_length:
        return
    try:
        content_length = int(raw_content_length)
    except (TypeError, ValueError):
        return
    if content_length <= EMAIL_BUILDER_ASSET_MAX_REQUEST_BYTES:
        return
    raise HTTPException(
        status_code=413,
        detail=f"File troppo grande. Max {EMAIL_BUILDER_ASSET_MAX_LABEL} per asset.",
    )


def _translate_upload_error(exc: HTTPException) -> HTTPException:
    detail = exc.detail if isinstance(exc.detail, str) else ""
    if detail == "File too large.":
        return HTTPException(
            status_code=413,
            detail=f"File troppo grande. Max {EMAIL_BUILDER_ASSET_MAX_LABEL} per asset.",
        )
    if detail in {"Invalid file type.", "File extension does not match MIME type."}:
        return HTTPException(status_code=415, detail="Formato asset non valido.")
    if detail == "Empty file.":
        return HTTPException(status_code=422, detail="Asset vuoto.")
    if detail in {"Invalid PNG file.", "Invalid JPEG file.", "Invalid SVG file."}:
        return HTTPException(status_code=415, detail="File immagine non valido.")
    return exc


async def save_email_builder_asset_file(
    upload_file: UploadFile,
    *,
    org_id: int,
) -> tuple[str, int, str]:
    try:
        return await save_upload_file(
            upload_file,
            allowed_types=["image/png", "image/jpeg", "image/svg+xml"],
            max_size=EMAIL_BUILDER_ASSET_MAX_FILE_BYTES,
            sub_directory=f"org/{org_id}/communications",
        )
    except HTTPException as exc:
        raise _translate_upload_error(exc) from exc

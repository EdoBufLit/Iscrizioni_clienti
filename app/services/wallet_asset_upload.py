from collections.abc import Mapping

from fastapi import HTTPException, UploadFile

from app.utils import save_upload_file

WALLET_ASSET_MAX_FILE_BYTES = 2 * 1024 * 1024
WALLET_ASSET_MAX_REQUEST_BYTES = 5 * 1024 * 1024
WALLET_ASSET_MAX_LABEL = "2 MB"


def enforce_wallet_asset_request_size_from_headers(headers: Mapping[str, str]) -> None:
    raw_content_length = headers.get("content-length")
    if not raw_content_length:
        return
    try:
        content_length = int(raw_content_length)
    except (TypeError, ValueError):
        return
    if content_length <= WALLET_ASSET_MAX_REQUEST_BYTES:
        return
    raise HTTPException(
        status_code=413,
        detail=f"File troppo grande. Max {WALLET_ASSET_MAX_LABEL} per asset.",
    )


def _translate_upload_error(exc: HTTPException, *, expected_label: str) -> HTTPException:
    detail = exc.detail if isinstance(exc.detail, str) else ""
    if detail == "File too large.":
        return HTTPException(
            status_code=413,
            detail=f"File troppo grande. Max {WALLET_ASSET_MAX_LABEL} per {expected_label}.",
        )
    if detail in {"Invalid file type.", "File extension does not match MIME type."}:
        return HTTPException(
            status_code=415,
            detail=f"Formato non valido per {expected_label}.",
        )
    if detail == "Empty file.":
        return HTTPException(
            status_code=422,
            detail=f"{expected_label.capitalize()} vuota.",
        )
    if detail in {"Invalid PNG file.", "Invalid JPEG file.", "Invalid SVG file."}:
        return HTTPException(
            status_code=415,
            detail=f"File {expected_label} non valido.",
        )
    return exc


async def save_wallet_logo_file(upload_file: UploadFile, *, org_id: int) -> tuple[str, int, str]:
    try:
        return await save_upload_file(
            upload_file,
            allowed_types=["image/png", "image/jpeg", "image/svg+xml"],
            max_size=WALLET_ASSET_MAX_FILE_BYTES,
            sub_directory=f"org/{org_id}/wallet",
        )
    except HTTPException as exc:
        raise _translate_upload_error(exc, expected_label="logo") from exc


async def save_wallet_hero_image_file(upload_file: UploadFile, *, org_id: int) -> tuple[str, int, str]:
    try:
        return await save_upload_file(
            upload_file,
            allowed_types=["image/png", "image/jpeg"],
            max_size=WALLET_ASSET_MAX_FILE_BYTES,
            sub_directory=f"org/{org_id}/wallet",
        )
    except HTTPException as exc:
        raise _translate_upload_error(exc, expected_label="hero image") from exc

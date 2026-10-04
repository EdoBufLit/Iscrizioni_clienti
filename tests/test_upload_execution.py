import asyncio
import hashlib
import io
from pathlib import Path
from tempfile import SpooledTemporaryFile
from threading import Event
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from starlette.datastructures import Headers, UploadFile

from app.config import settings
from app.services.svg_sanitizer import sanitize_svg_bytes
from app.utils import save_upload_file, save_upload_file_sync


@pytest.fixture(params=["sync", "async"])
def save_upload(request, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))

    def save(upload, **kwargs):
        if request.param == "sync":
            return save_upload_file_sync(upload, **kwargs)
        return asyncio.run(save_upload_file(upload, **kwargs))

    return save


def _upload(payload, *, filename="document.pdf", content_type="application/pdf", file=None):
    upload = UploadFile(
        file if file is not None else io.BytesIO(payload),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )
    # A synchronous endpoint must read the parsed file directly, rather than
    # queueing another threadpool job through UploadFile's async read method.
    upload.read = AsyncMock(side_effect=AssertionError("async read must not be used"))
    return upload


def test_disk_spooled_upload_is_saved_without_nested_async_reads(save_upload, tmp_path):
    payload = b"%PDF-1.7\n" + b"document contents\n" * 70_000
    with SpooledTemporaryFile(max_size=1024 * 1024, mode="w+b") as file:
        file.write(payload)
        file.seek(0)
        assert file._rolled
        upload = _upload(payload, file=file)

        relative_path, size_bytes, sha256 = save_upload(upload, sub_directory="7/42")

        assert (tmp_path / Path(relative_path)).read_bytes() == payload
        assert Path(relative_path).parent == Path("7/42")
        assert size_bytes == len(payload)
        assert sha256 == hashlib.sha256(payload).hexdigest()
        upload.read.assert_not_called()


def test_oversize_upload_removes_partial_file(save_upload, tmp_path):
    upload = _upload(b"%PDF-1.7\n" + b"x" * 8192)

    with pytest.raises(HTTPException) as caught:
        save_upload(upload, max_size=5000)

    assert caught.value.status_code == 400
    assert caught.value.detail == "File too large."
    assert list(tmp_path.rglob("*.pdf")) == []


@pytest.mark.parametrize(
    "payload,filename,content_type,detail",
    [
        (b"", "document.pdf", "application/pdf", "Empty file."),
        (b"not a pdf", "document.pdf", "application/pdf", "Invalid PDF file."),
        (b"not a png", "image.png", "image/png", "Invalid PNG file."),
        (b"not a jpeg", "image.jpg", "image/jpeg", "Invalid JPEG file."),
        (b"%PDF-1.7\n", "document.png", "application/pdf", "File extension does not match MIME type."),
        (b"text", "document.txt", "text/plain", "Invalid file type."),
    ],
)
def test_upload_validation_is_preserved(save_upload, tmp_path, payload, filename, content_type, detail):
    upload = _upload(payload, filename=filename, content_type=content_type)

    with pytest.raises(HTTPException) as caught:
        save_upload(upload)

    assert caught.value.status_code == 400
    assert caught.value.detail == detail
    assert not any(path.is_file() for path in tmp_path.rglob("*"))


def test_svg_upload_keeps_sanitization_and_stored_hash(save_upload, tmp_path):
    payload = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>'
    upload = _upload(payload, filename="brand.svg", content_type="image/svg+xml")

    relative_path, size_bytes, sha256 = save_upload(upload, allowed_types=["image/svg+xml"])

    stored = (tmp_path / relative_path).read_bytes()
    assert stored == sanitize_svg_bytes(payload)
    assert size_bytes == len(stored)
    assert sha256 == hashlib.sha256(stored).hexdigest()


def test_unsafe_svg_is_rejected_without_leaving_file(save_upload, tmp_path):
    upload = _upload(
        b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        filename="brand.svg",
        content_type="image/svg+xml",
    )

    with pytest.raises(HTTPException) as caught:
        save_upload(upload, allowed_types=["image/svg+xml"])

    assert caught.value.detail == "Invalid SVG file."
    assert list(tmp_path.rglob("*.svg")) == []


def test_async_upload_leaves_event_loop_available_during_blocking_read(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    started = Event()
    release = Event()

    class BlockingFile(io.BytesIO):
        def read(self, size=-1):
            started.set()
            if not release.wait(timeout=3):
                raise AssertionError("event loop could not release the upload reader")
            return super().read(size)

    async def run():
        upload = _upload(b"", file=BlockingFile(b"%PDF-1.7\ncontents"))
        task = asyncio.create_task(save_upload_file(upload))
        try:
            async def wait_until_started():
                while not started.is_set():
                    await asyncio.sleep(0.001)

            await asyncio.wait_for(wait_until_started(), timeout=1)
            assert not task.done()
            # The release runs on the event loop while the file reader waits
            # in a worker thread. A blocking read on the loop cannot progress.
            release.set()
            relative_path, _, _ = await asyncio.wait_for(task, timeout=1)
            assert (tmp_path / relative_path).read_bytes() == b"%PDF-1.7\ncontents"
        finally:
            release.set()
            await task

    asyncio.run(run())

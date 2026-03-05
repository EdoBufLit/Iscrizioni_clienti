import subprocess
import uuid
from datetime import datetime
from pathlib import Path

from app.config import settings
from app.db import SessionLocal
from app.models_affiliation import (
    AffiliationApplication,
    AffiliationApplicationStatus,
    AffiliationDocsStatus,
    AffiliationPaymentStatus,
    AffiliationVideoMode,
    VideoJob,
    VideoJobStatus,
)
from app.services import affiliation_video as affiliation_video_service


def test_process_video_job_marks_done_when_file_exists_even_with_non_zero_exit(
    monkeypatch,
    tmp_path,
):
    renderer_dir = tmp_path / "renderer"
    renderer_dir.mkdir(parents=True, exist_ok=True)
    output_dir = tmp_path / "welcome"
    output_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(settings, "AFFILIATION_VIDEO_ENABLED", True, raising=False)
    monkeypatch.setattr(
        settings,
        "AFFILIATION_VIDEO_RENDERER_DIR",
        str(renderer_dir),
        raising=False,
    )
    monkeypatch.setattr(
        settings,
        "AFFILIATION_VIDEO_OUTPUT_DIR",
        str(output_dir),
        raising=False,
    )

    render_script = renderer_dir / "dist" / "renderHud.cjs"
    render_script.parent.mkdir(parents=True, exist_ok=True)
    render_script.write_text("// test renderer", encoding="utf-8")

    monkeypatch.setattr(
        affiliation_video_service,
        "_ensure_renderer_build",
        lambda _renderer_dir: render_script,
    )

    def fake_run(command, cwd=None, capture_output=None, text=None):
        output_path = Path(command[command.index("--output") + 1])
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"synthetic-mp4")
        stdout = f'{{"path": "{str(output_path).replace("\\\\", "\\\\\\\\")}"}}'
        return subprocess.CompletedProcess(
            args=command,
            returncode=23,
            stdout=stdout,
            stderr="renderer warned but produced output",
        )

    monkeypatch.setattr(affiliation_video_service.subprocess, "run", fake_run)

    with SessionLocal() as db:
        application = AffiliationApplication(
            public_token=f"video-worker-{uuid.uuid4().hex[:12]}",
            status=AffiliationApplicationStatus.UNDER_REVIEW.value,
            docs_status=AffiliationDocsStatus.PENDING.value,
            payment_status=AffiliationPaymentStatus.CHECKOUT_PENDING.value,
            payment_amount_cents=9000,
            organization_name="Associazione Video Worker",
            applicant_email=f"video-worker-{uuid.uuid4().hex[:10]}@example.com",
        )
        db.add(application)
        db.flush()

        job = VideoJob(
            application_id=application.id,
            mode=AffiliationVideoMode.REVIEW.value,
            status=VideoJobStatus.QUEUED.value,
            payload_json={"trigger": "test"},
            requested_at=datetime(2000, 1, 1),
        )
        db.add(job)
        db.commit()
        job_id = int(job.id)
        application_id = int(application.id)

    stats = affiliation_video_service.process_video_jobs_once(limit=1)

    assert stats == {"claimed": 1, "done": 1, "failed": 0}

    with SessionLocal() as db:
        updated_job = db.query(VideoJob).filter(VideoJob.id == job_id).first()
        assert updated_job is not None
        assert updated_job.status == VideoJobStatus.DONE.value
        assert updated_job.output_rel_path == f"welcome/{application_id}.mp4"
        assert updated_job.error_text is None

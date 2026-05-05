"""Onboarding tour API routes.

Provides endpoints to manage guided tour state for members and org admins.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    Member,
    MemberStatus,
    OnboardingTour,
)
from app.services.org_admin_sessions import get_current_org_admin_from_request

router = APIRouter(prefix="/api/me/onboarding", tags=["onboarding"])


class TourStatusResponse(BaseModel):
    tour_key: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    skipped_at: Optional[str] = None
    should_show: bool


def _get_user_context(request: Request, db: Session):
    """Returns (user_id, role, tour_key) based on session."""
    # Check org_admin first
    admin = get_current_org_admin_from_request(request, db)
    if admin:
        return admin.id, "org_admin", "org_admin_dashboard_v1"

    # Check member
    member_id = request.session.get("member_id")
    if member_id:
        member = (
            db.query(Member)
            .filter(
                Member.id == member_id,
                Member.deleted_at.is_(None),
                Member.status != MemberStatus.REJECTED,
            )
            .first()
        )
        if member:
            return member.id, "member", "member_dashboard_v1"

    return None, None, None


@router.get("", response_model=TourStatusResponse)
def get_tour_status(request: Request, db: Session = Depends(get_db)):
    """Get the onboarding tour status for the current user."""
    user_id, role, tour_key = _get_user_context(request, db)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    tour = (
        db.query(OnboardingTour)
        .filter(
            OnboardingTour.user_id == user_id,
            OnboardingTour.role == role,
            OnboardingTour.tour_key == tour_key,
        )
        .first()
    )

    if not tour:
        # No record means tour should show
        return TourStatusResponse(
            tour_key=tour_key,
            should_show=True,
        )

    should_show = tour.completed_at is None and tour.skipped_at is None

    return TourStatusResponse(
        tour_key=tour_key,
        started_at=tour.started_at.isoformat() if tour.started_at else None,
        completed_at=tour.completed_at.isoformat() if tour.completed_at else None,
        skipped_at=tour.skipped_at.isoformat() if tour.skipped_at else None,
        should_show=should_show,
    )


@router.post("/start")
def start_tour(request: Request, db: Session = Depends(get_db)):
    """Mark the tour as started."""
    user_id, role, tour_key = _get_user_context(request, db)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    tour = (
        db.query(OnboardingTour)
        .filter(
            OnboardingTour.user_id == user_id,
            OnboardingTour.role == role,
            OnboardingTour.tour_key == tour_key,
        )
        .first()
    )

    if not tour:
        tour = OnboardingTour(
            user_id=user_id,
            role=role,
            tour_key=tour_key,
            started_at=datetime.utcnow(),
            created_at=datetime.utcnow(),
        )
        db.add(tour)
    else:
        tour.started_at = datetime.utcnow()

    db.commit()
    return {"ok": True}


@router.post("/complete")
def complete_tour(request: Request, db: Session = Depends(get_db)):
    """Mark the tour as completed."""
    user_id, role, tour_key = _get_user_context(request, db)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    tour = (
        db.query(OnboardingTour)
        .filter(
            OnboardingTour.user_id == user_id,
            OnboardingTour.role == role,
            OnboardingTour.tour_key == tour_key,
        )
        .first()
    )

    if not tour:
        tour = OnboardingTour(
            user_id=user_id,
            role=role,
            tour_key=tour_key,
            completed_at=datetime.utcnow(),
            created_at=datetime.utcnow(),
        )
        db.add(tour)
    else:
        tour.completed_at = datetime.utcnow()

    db.commit()
    return {"ok": True}


@router.post("/skip")
def skip_tour(request: Request, db: Session = Depends(get_db)):
    """Mark the tour as skipped."""
    user_id, role, tour_key = _get_user_context(request, db)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    tour = (
        db.query(OnboardingTour)
        .filter(
            OnboardingTour.user_id == user_id,
            OnboardingTour.role == role,
            OnboardingTour.tour_key == tour_key,
        )
        .first()
    )

    if not tour:
        tour = OnboardingTour(
            user_id=user_id,
            role=role,
            tour_key=tour_key,
            skipped_at=datetime.utcnow(),
            created_at=datetime.utcnow(),
        )
        db.add(tour)
    else:
        tour.skipped_at = datetime.utcnow()

    db.commit()
    return {"ok": True}


@router.post("/reset")
def reset_tour(request: Request, db: Session = Depends(get_db)):
    """Reset the tour (set completed_at and skipped_at to NULL)."""
    user_id, role, tour_key = _get_user_context(request, db)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    tour = (
        db.query(OnboardingTour)
        .filter(
            OnboardingTour.user_id == user_id,
            OnboardingTour.role == role,
            OnboardingTour.tour_key == tour_key,
        )
        .first()
    )

    if tour:
        tour.completed_at = None
        tour.skipped_at = None
        tour.started_at = None
        db.commit()

    return {"ok": True, "should_show": True}

from __future__ import annotations

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta

from app.services import booking_customer_actions as booking_customer_actions_service
from app.db import SessionLocal
from app.models import (
    AdminRole,
    AdminUser,
    Booking,
    BookingActionToken,
    BookingEvent,
    EmailOutbox,
    OrgAdminNotification,
    Organization,
)
from app.services.booking_customer_actions import (
    consume_booking_action_token,
    create_booking_action_links,
)


def _create_booking_with_links(db, *, with_admin: bool = True) -> dict:
    suffix = uuid.uuid4().hex[:10]
    organization = Organization(
        name=f"Booking capability {suffix}",
        slug=f"booking-capability-{suffix}",
        is_active=True,
        communications_enabled=True,
    )
    db.add(organization)
    db.flush()

    admin_id = None
    if with_admin:
        admin = AdminUser(
            email=f"booking-capability-{suffix}@example.com",
            role=AdminRole.ORG_ADMIN,
            org_id=organization.id,
            is_active=True,
        )
        db.add(admin)
        db.flush()
        admin_id = int(admin.id)

    booking = Booking(
        association_id=organization.id,
        status="pending",
        customer_name=f"Cliente {suffix}",
        customer_email=f"cliente-{suffix}@example.com",
        customer_phone="+393331234567",
        booking_date=date.today(),
        booking_time="20:30",
        party_size=3,
    )
    db.add(booking)
    db.flush()
    links = create_booking_action_links(db, booking=booking)
    db.commit()
    return {
        "booking_id": int(booking.id),
        "admin_id": admin_id,
        "customer_name": booking.customer_name,
        "tokens": {
            action: link.rsplit("/", 1)[-1]
            for action, link in links.items()
        },
    }


def test_booking_action_first_click_and_replay_are_idempotent(client):
    db = SessionLocal()
    try:
        fixture = _create_booking_with_links(db)
        raw_token = fixture["tokens"]["confirm"]
        booking_id = fixture["booking_id"]
        admin_id = fixture["admin_id"]

        before = client.get(f"/b/{raw_token}")
        assert before.status_code == 200, before.text
        assert fixture["customer_name"] in before.text
        assert "booking-action-form" in before.text
        assert "form.submit" not in before.text
        assert "setTimeout" not in before.text
        before_json = client.get(f"/b/{raw_token}/json")
        assert before_json.status_code == 200, before_json.text
        assert before_json.json()["used"] is False

        first = client.post(f"/b/{raw_token}/json")
        assert first.status_code == 200, first.text
        assert first.json()["ok"] is True
        assert first.json()["action"] == "confirm"

        assert db.query(BookingEvent).filter(
            BookingEvent.booking_id == booking_id,
            BookingEvent.event_type == "customer_reconfirmed_from_reminder",
        ).count() == 1
        assert db.query(OrgAdminNotification).filter(
            OrgAdminNotification.admin_user_id == admin_id,
            OrgAdminNotification.type == "booking_customer_confirmed",
        ).count() == 1
        assert db.query(EmailOutbox).filter(
            EmailOutbox.email_type == "booking_customer_confirmed",
        ).count() == 1

        after = client.get(f"/b/{raw_token}")
        assert after.status_code == 200, after.text
        assert fixture["customer_name"] in after.text
        assert "gia' stata registrata" in after.text
        assert "booking-action-form" not in after.text
        after_json = client.get(f"/b/{raw_token}/json")
        assert after_json.status_code == 200, after_json.text
        assert after_json.json()["used"] is True

        replay = client.post(f"/b/{raw_token}/json")
        assert replay.status_code == 200, replay.text
        assert replay.json()["ok"] is False
        assert replay.json()["reason"] == "used"
        assert "registrata" in replay.json()["message"]

        assert db.query(BookingEvent).filter(
            BookingEvent.booking_id == booking_id,
            BookingEvent.event_type == "customer_reconfirmed_from_reminder",
        ).count() == 1
        assert db.query(OrgAdminNotification).filter(
            OrgAdminNotification.admin_user_id == admin_id,
            OrgAdminNotification.type == "booking_customer_confirmed",
        ).count() == 1
        assert db.query(EmailOutbox).filter(
            EmailOutbox.email_type == "booking_customer_confirmed",
        ).count() == 1
    finally:
        db.close()


def test_expired_booking_action_stays_unused_and_shows_summary(client):
    db = SessionLocal()
    try:
        fixture = _create_booking_with_links(db, with_admin=False)
        raw_token = fixture["tokens"]["cancel"]
        booking_id = fixture["booking_id"]
        token = db.query(BookingActionToken).filter(
            BookingActionToken.booking_id == booking_id,
            BookingActionToken.action == "cancel",
        ).one()
        token.expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.commit()

        page = client.get(f"/b/{raw_token}")
        assert page.status_code == 200, page.text
        assert fixture["customer_name"] in page.text
        assert "scaduto" in page.text
        assert "booking-action-form" not in page.text

        payload = client.get(f"/b/{raw_token}/json")
        assert payload.status_code == 200, payload.text
        assert payload.json()["expired"] is True
        assert payload.json()["used"] is False

        response = client.post(f"/b/{raw_token}/json")
        assert response.status_code == 200, response.text
        assert response.json()["ok"] is False
        assert response.json()["reason"] == "expired"
        db.refresh(token)
        assert token.used_at is None
        assert db.query(BookingEvent).filter(
            BookingEvent.booking_id == booking_id,
            BookingEvent.event_type == "customer_cancelled_from_reminder",
        ).count() == 0
    finally:
        db.close()


def test_note_validation_does_not_consume_and_replay_does_not_overwrite(client):
    db = SessionLocal()
    try:
        fixture = _create_booking_with_links(db)
        raw_token = fixture["tokens"]["note"]
        booking_id = fixture["booking_id"]
        admin_id = fixture["admin_id"]

        invalid = client.post(f"/b/{raw_token}", data={"note": "   "})
        assert invalid.status_code == 422, invalid.text
        assert "Inserisci una nota" in invalid.text
        token = db.query(BookingActionToken).filter(
            BookingActionToken.booking_id == booking_id,
            BookingActionToken.action == "note",
        ).one()
        db.refresh(token)
        assert token.used_at is None

        first_note = "Arriveremo dieci minuti dopo."
        first = client.post(f"/b/{raw_token}/json", data={"note": first_note})
        assert first.status_code == 200, first.text
        assert first.json()["ok"] is True

        replay = client.post(
            f"/b/{raw_token}/json",
            data={"note": "Questa seconda nota non deve sostituire la prima."},
        )
        assert replay.status_code == 200, replay.text
        assert replay.json()["ok"] is False
        assert replay.json()["reason"] == "used"

        booking = db.get(Booking, booking_id)
        db.refresh(booking)
        assert booking.customer_note == first_note
        assert db.query(BookingEvent).filter(
            BookingEvent.booking_id == booking_id,
            BookingEvent.event_type == "customer_note_from_reminder",
        ).count() == 1
        assert db.query(OrgAdminNotification).filter(
            OrgAdminNotification.admin_user_id == admin_id,
            OrgAdminNotification.type == "booking_customer_note",
        ).count() == 1
        assert db.query(EmailOutbox).filter(
            EmailOutbox.email_type == "booking_customer_note",
        ).count() == 1

        used_page = client.get(f"/b/{raw_token}")
        assert used_page.status_code == 200, used_page.text
        assert "gia' stata registrata" in used_page.text
        assert "<textarea" not in used_page.text
    finally:
        db.close()


def test_concurrent_booking_action_claim_has_one_winner_and_one_used_replay():
    setup_db = SessionLocal()
    try:
        fixture = _create_booking_with_links(setup_db, with_admin=False)
    finally:
        setup_db.close()

    raw_token = fixture["tokens"]["confirm"]
    booking_id = fixture["booking_id"]
    barrier = threading.Barrier(2)

    def consume_once() -> str:
        worker_db = SessionLocal()
        try:
            barrier.wait(timeout=10)
            result = consume_booking_action_token(worker_db, raw_token=raw_token)
            worker_db.commit()
            return "ok" if result.get("ok") else str(result.get("reason"))
        except Exception:
            worker_db.rollback()
            raise
        finally:
            worker_db.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(lambda _index: consume_once(), range(2)))

    assert sorted(outcomes) == ["ok", "used"]
    verifier = SessionLocal()
    try:
        token = verifier.query(BookingActionToken).filter(
            BookingActionToken.booking_id == booking_id,
            BookingActionToken.action == "confirm",
        ).one()
        assert token.used_at is not None
        assert verifier.query(BookingEvent).filter(
            BookingEvent.booking_id == booking_id,
            BookingEvent.event_type == "customer_reconfirmed_from_reminder",
        ).count() == 1
        assert verifier.query(BookingEvent).filter(
            BookingEvent.booking_id == booking_id,
            BookingEvent.event_type == "status_updated",
        ).count() == 1
    finally:
        verifier.close()


def test_confirm_and_cancel_race_is_serialized_but_loser_can_retry_sequentially(
    monkeypatch,
):
    setup_db = SessionLocal()
    try:
        fixture = _create_booking_with_links(setup_db, with_admin=False)
    finally:
        setup_db.close()

    booking_id = fixture["booking_id"]
    raw_tokens = [fixture["tokens"]["confirm"], fixture["tokens"]["cancel"]]
    start_barrier = threading.Barrier(2)
    snapshot_barrier = threading.Barrier(2)
    thread_state = threading.local()
    real_get_booking_action_token = (
        booking_customer_actions_service.get_booking_action_token
    )

    def synchronized_get_booking_action_token(db, *, raw_token: str):
        token = real_get_booking_action_token(db, raw_token=raw_token)
        if not getattr(thread_state, "initial_lookup_complete", False):
            thread_state.initial_lookup_complete = True
            snapshot_barrier.wait(timeout=10)
        return token

    monkeypatch.setattr(
        booking_customer_actions_service,
        "get_booking_action_token",
        synchronized_get_booking_action_token,
    )

    def consume_once(raw_token: str) -> str:
        worker_db = SessionLocal()
        try:
            start_barrier.wait(timeout=10)
            result = consume_booking_action_token(worker_db, raw_token=raw_token)
            worker_db.commit()
            return str(result.get("action")) if result.get("ok") else str(result.get("reason"))
        except Exception:
            worker_db.rollback()
            raise
        finally:
            worker_db.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(consume_once, raw_tokens))

    assert outcomes.count("conflict") == 1
    assert len({outcome for outcome in outcomes if outcome != "conflict"}) == 1
    losing_index = outcomes.index("conflict")
    losing_token = raw_tokens[losing_index]
    losing_action = "confirm" if losing_index == 0 else "cancel"
    verifier = SessionLocal()
    try:
        terminal_events = verifier.query(BookingEvent).filter(
            BookingEvent.booking_id == booking_id,
            BookingEvent.event_type.in_(
                [
                    "customer_reconfirmed_from_reminder",
                    "customer_cancelled_from_reminder",
                ]
            ),
        ).all()
        assert len(terminal_events) == 1
        tokens = verifier.query(BookingActionToken).filter(
            BookingActionToken.booking_id == booking_id,
            BookingActionToken.action.in_(["confirm", "cancel"]),
        ).all()
        assert len(tokens) == 2
        assert sum(token.used_at is not None for token in tokens) == 1
    finally:
        verifier.close()

    monkeypatch.setattr(
        booking_customer_actions_service,
        "get_booking_action_token",
        real_get_booking_action_token,
    )
    retry_db = SessionLocal()
    try:
        retried = consume_booking_action_token(retry_db, raw_token=losing_token)
        retry_db.commit()
        assert retried["ok"] is True
        assert retried["action"] == losing_action
    finally:
        retry_db.close()

    verifier = SessionLocal()
    try:
        terminal_events = verifier.query(BookingEvent).filter(
            BookingEvent.booking_id == booking_id,
            BookingEvent.event_type.in_(
                [
                    "customer_reconfirmed_from_reminder",
                    "customer_cancelled_from_reminder",
                ]
            ),
        ).all()
        assert len(terminal_events) == 2
        tokens = verifier.query(BookingActionToken).filter(
            BookingActionToken.booking_id == booking_id,
            BookingActionToken.action.in_(["confirm", "cancel"]),
        ).all()
        assert len(tokens) == 2
        assert all(token.used_at is not None for token in tokens)
    finally:
        verifier.close()

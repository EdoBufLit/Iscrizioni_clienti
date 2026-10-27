from datetime import date, datetime, timedelta
from decimal import Decimal
import uuid

import pytest
from sqlalchemy import event

from app.db import SessionLocal, engine
from app.models import (AdminRole, AdminUser, AnnualMembershipTerm, Booking, Form, FormField,
                        FormSubmission, Member, MemberStatus, MembershipPayment, OrgAdminToken, Organization,
                        WhatsAppChat, WhatsAppMessage)
from app.services.renewals import build_quote_center
from app.services.whatsapp_sync import get_or_create_connection, get_messages_for_chat
from app.utils import hash_token


@pytest.fixture
def tenant(client):
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:10]
    org = Organization(name="Performance", slug=f"perf-{suffix}", is_active=True,
                       communications_enabled=True, membership_fee_amount=Decimal("25.00"))
    db.add(org)
    db.flush()
    admin = AdminUser(email=f"perf-{suffix}@example.com", org_id=org.id, role=AdminRole.ORG_ADMIN, is_active=True)
    db.add(admin)
    db.flush()
    token = f"perf-{suffix}"
    db.add(OrgAdminToken(admin_id=admin.id, token_hash=hash_token(token), expires_at=datetime.utcnow() + timedelta(minutes=15)))
    db.commit()
    client.get(f"/api/org-admin/auth/verify?token={token}", follow_redirects=False)
    yield db, org
    db.close()


def test_quote_pages_have_three_queries_and_global_kpis(tenant):
    db, org = tenant
    members = [Member(org_id=org.id, first_name="Nome", last_name=f"Socio {i:03}", email=f"{org.slug}-{i}@example.com")
               for i in range(500)]
    db.add_all(members)
    db.flush()
    terms = [AnnualMembershipTerm(member_id=member.id, org_id=org.id, membership_year=2027,
                                  starts_on=date(2027, 1, 1), valid_through=date(2028, 1, 1),
                                  status="due", fee_amount=Decimal("25.00"), currency="EUR", source="test")
             for member in members]
    db.add_all(terms)
    db.flush()
    # The latest attempt is shown, but a failed retry cannot erase money received.
    for status in ("completed", "failed"):
        db.add(MembershipPayment(org_id=org.id, socio_id=members[0].id, annual_term_id=terms[0].id,
                                 amount=25, currency="EUR", status=status, source="manual", created_at=datetime(2026, 10, 17)))
    db.commit()
    db.refresh(org)
    statements = []
    def capture(_conn, _cursor, statement, _parameters, _context, _executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)
    event.listen(engine, "before_cursor_execute", capture)
    try:
        first = build_quote_center(db, org=org, year=2027, limit=25)
        assert len(statements) == 3
        statements.clear()
        full = build_quote_center(db, org=org, year=2027, limit=500)
        assert len(statements) == 3
        statements.clear()
        filtered = build_quote_center(db, org=org, year=2027, search="Socio 000", limit=25)
        assert len(statements) == 3
    finally:
        event.remove(engine, "before_cursor_execute", capture)
    assert len(first["items"]) == 25 and len(full["items"]) == 500
    assert first["total"] == 500 and filtered["total"] == 1
    assert first["kpis"] == filtered["kpis"]
    assert first["kpis"]["theoretical_total"] == 12500
    assert first["items"][0]["payment"]["status"] == "failed"
    assert first["items"][0]["payment_state"] == "paid"
    assert first["items"][0]["accounting_balance"]["paid_cents"] == 2500
    assert first["kpis"]["collected_total"] == 25
    assert first["kpis"]["outstanding_total"] == 12475


def test_form_collections_are_not_joined_and_statistics_are_global(client, tenant):
    db, org = tenant
    form = Form(association_id=org.id, title="Sondaggio", public_slug=f"survey-{org.slug}", form_type="survey")
    db.add(form)
    db.flush()
    db.add_all([FormField(form_id=form.id, field_key="__survey_rating__score", field_type="radio", label="Voto",
                          options_json=["1", "2", "3", "4", "5"], sort_order=0)] + [
        FormField(form_id=form.id, field_key=f"text_{i}", field_type="short_text", label=f"Commento {i}", sort_order=i + 1)
        for i in range(9)])
    db.add_all([FormSubmission(form_id=form.id, association_id=org.id, status="pending" if i % 2 else "confirmed",
                              payload_json={"__survey_rating__score": 4, "text_0": f"Commento {i}"}) for i in range(1000)])
    db.add_all([Booking(association_id=org.id, form_id=form.id, customer_name=f"Ospite {i}", status="confirmed",
                       booking_date=date(2026, 10, 17), party_size=2) for i in range(1000)])
    db.commit()
    form_id = form.id
    statements = []
    def capture(_conn, _cursor, statement, _parameters, _context, _executemany):
        statements.append(statement.lower())
    event.listen(engine, "before_cursor_execute", capture)
    try:
        summary = client.get("/api/org-admin/forms/summary").json()
        page = client.get(f"/api/org-admin/forms/{form_id}/submissions?limit=25&offset=25").json()
    finally:
        event.remove(engine, "before_cursor_execute", capture)
    assert not any("join form_submissions" in sql for sql in statements)
    row = next(item for item in summary["items"] if item["id"] == form_id)
    assert row["field_count"] == 10 and row["submission_count"] == 1000 and row["booking_count"] == 1000
    assert "fields" not in row
    assert len(page["items"]) == 25 and page["total"] == 1000
    assert page["summary"]["pending"] == 500
    assert len(page["form"]["fields"]) == 10
    stats = client.get(f"/api/org-admin/forms/{form_id}/statistics").json()
    assert stats["total"] == 1000 and stats["ratingAverage"] == 4
    assert stats["scaleStats"][0]["counts"]["4"] == 1000
    assert stats["commentCount"] == 1000 and len(stats["comments"]) == 12
    agenda = client.get("/api/org-admin/bookings/agenda/day?date=2026-10-17&limit=100").json()
    assert agenda["total"] == 1000 and len(agenda["items"]) == 100
    period = client.get("/api/org-admin/bookings/agenda/summary?date_from=2026-10-01&date_to=2026-10-31").json()
    assert period["days"][0]["total"] == 1000 and period["days"][0]["party_size"] == 2000
    assert client.get("/api/org-admin/bookings/agenda/summary?date_from=2026-01-01&date_to=2026-10-31").status_code == 422


def test_message_pages_include_newest_and_update_old_statuses(tenant):
    db, org = tenant
    connection = get_or_create_connection(db, org=org)
    chat = WhatsAppChat(org_id=org.id, connection_id=connection.id, external_chat_id="39123456789@s.whatsapp.net",
                        display_name="Test")
    db.add(chat)
    db.flush()
    messages = [WhatsAppMessage(org_id=org.id, connection_id=connection.id, chat_id=chat.id, direction="outbound",
                                status="pending", dedupe_key=f"{org.slug}-{i}", text_body=f"Messaggio {i}",
                                created_at=datetime(2026, 10, 17) + timedelta(seconds=i)) for i in range(201)]
    db.add_all(messages)
    db.commit()
    latest = get_messages_for_chat(db, chat=chat, limit=100)
    assert len(latest) == 100 and latest[-1].text_body == "Messaggio 200"
    older = get_messages_for_chat(db, chat=chat, limit=100, offset=100)
    assert older[0].text_body == "Messaggio 1"
    messages[50].status = "delivered"
    db.commit()
    refreshed = get_messages_for_chat(db, chat=chat, limit=100, offset=100)
    assert next(item for item in refreshed if item.id == messages[50].id).status == "delivered"


def test_member_metrics_count_expiring_members_across_all_pages(client, tenant):
    db, org = tenant
    now = datetime.utcnow()
    for index in range(35):
        db.add(Member(org_id=org.id, first_name="Socio", last_name=str(index), status=MemberStatus.ACTIVE,
                      card_no=1000 + index, card_year=now.year, valid_until=now + timedelta(days=10)))
    db.add(Member(org_id=org.id, first_name="Scaduto", status=MemberStatus.EXPIRED,
                  card_no=2000, card_year=now.year, valid_until=now - timedelta(days=2)))
    db.commit()
    metrics = client.get("/api/org-admin/metrics").json()
    assert metrics["active_members_count"] == 35
    assert metrics["expiring_members_count"] == 35
    assert metrics["expired_members_count"] == 1
    page = client.get("/api/org-admin/members?limit=25&status=active").json()
    assert len(page["items"]) == 25

from datetime import datetime, timedelta
from html.parser import HTMLParser
from types import SimpleNamespace
import uuid

import pytest
from fastapi import Request
from sqlalchemy import func

from app.config import settings
from app.db import SessionLocal
from app.models import EmailOutbox, Member, MemberStatus, Organization, Token, TokenType
from app.routes.member import _enqueue_member_password_reset
from app.routes.org_admin import _send_member_magic_link
from app.services.email_sender import build_sender_payload
from app.services.member_access_email import build_member_access_email_html
from app.services.member_bulk import _queue_access
from app.services.public_renewals import queue_public_renewal_link


class EmailMarkup(HTMLParser):
    def __init__(self, markup):
        super().__init__()
        self.tags = []
        self.links = []
        self.text = []
        self.feed(markup)

    def handle_starttag(self, tag, attrs):
        self.tags.append(tag)
        if tag == "a":
            self.links.append(dict(attrs).get("href"))

    def handle_data(self, data):
        self.text.append(data)


@pytest.mark.parametrize("purpose,label", [("access", "Accedi all’area socio"), ("reset", "Reimposta la password"), ("renewal", "Continua il rinnovo")])
def test_member_access_email_has_readable_safe_action_and_mobile_layout(purpose, label):
    member = SimpleNamespace(first_name='<img src=x onerror="alert(1)">', organization=SimpleNamespace(name="Club & Soci", slug="test", club_display_name=None))
    url = "https://example.test/auth/verify?token=synthetic-long-secret&role=member"
    markup = build_member_access_email_html(member, url, purpose=purpose)
    parsed = EmailMarkup(markup)
    assert parsed.links == [url, url]
    assert "synthetic-long-secret" not in "".join(parsed.text)
    assert "https://example.test" not in "".join(parsed.text)
    assert label in "".join(parsed.text)
    assert "Club & Soci" in "".join(parsed.text)
    assert "img" not in parsed.tags and "script" not in parsed.tags
    assert parsed.tags.count("h1") == 1 and "table" in parsed.tags
    assert 'name="viewport"' in markup and "max-width: 620px" in markup
    assert "prefers-color-scheme: dark" in markup
    assert f"{settings.LOGIN_TOKEN_EXPIRE_MINUTES} minuti" in "".join(parsed.text)


@pytest.mark.parametrize("producer", ["login", "reset", "admin", "bulk", "renewal"])
def test_every_ordinary_member_access_producer_queues_html_with_unchanged_sender_and_token(client, producer, monkeypatch):
    db = SessionLocal()
    try:
        suffix = uuid.uuid4().hex[:12]
        org = Organization(name="Associazione Collaudo", club_display_name="Circolo Collaudo", slug=f"mail-{suffix}", is_active=True)
        db.add(org); db.flush()
        card = int(db.query(func.max(Member.card_no)).scalar() or 900000) + 1
        member = Member(org_id=org.id, first_name="Anna", last_name="Rossi", email=f"mail-{suffix}@example.test", status=MemberStatus.ACTIVE,
                        card_no=card, card_year=datetime.utcnow().year, membership_type="annual", joined_at=datetime.utcnow())
        db.add(member); db.commit()
        request = Request({"type": "http", "method": "POST", "path": "/", "scheme": "http", "server": ("testserver", 80), "headers": []})
        before = datetime.utcnow()
        if producer == "login":
            response = client.post("/api/auth/login", data={"email": member.email})
            assert response.status_code == 200
        elif producer == "reset":
            _enqueue_member_password_reset(request, db, member, now=before)
        elif producer == "admin":
            _send_member_magic_link(db, request, member)
        elif producer == "bulk":
            _queue_access(db, member=member, run=SimpleNamespace(id=f"synthetic-{suffix}"), request=request, now=before)
        else:
            # Presentation is exercised independently from the separately tested launch calendar.
            monkeypatch.setattr("app.services.public_renewals.require_renewals_open", lambda **kwargs: None)
            queue_public_renewal_link(db, member=member)
        db.commit(); db.expire_all()
        message = db.query(EmailOutbox).filter(EmailOutbox.to_email == member.email).one()
        parsed = EmailMarkup(message.payload_json["html_body"])
        assert len(parsed.links) == 2
        assert parsed.links[0] == parsed.links[1]
        assert parsed.links[0] in message.payload_json["text_body"]
        assert "token=" not in "".join(parsed.text)
        assert "Circolo Collaudo" in "".join(parsed.text)
        assert message.payload_json["sender"] == build_sender_payload(mode="association", association=member.organization)
        assert message.payload_json["meta"]["member_id"] == member.id
        token = db.query(Token).filter(Token.member_id == member.id).one()
        assert token.purpose == (TokenType.PASSWORD_RESET if producer == "reset" else TokenType.LOGIN_MAGIC_LINK)
        assert token.used_at is None
        assert before + timedelta(minutes=settings.LOGIN_TOKEN_EXPIRE_MINUTES - 1) <= token.expires_at <= datetime.utcnow() + timedelta(minutes=settings.LOGIN_TOKEN_EXPIRE_MINUTES)
    finally:
        db.close()

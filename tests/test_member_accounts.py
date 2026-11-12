"""Personal accounts retain separate, explicitly linked club memberships."""

from __future__ import annotations

import base64
from datetime import datetime, timedelta
import json
from types import SimpleNamespace
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import HTTPException
from itsdangerous import TimestampSigner
import pytest
from starlette.requests import Request

from app.config import settings
from app.db import SessionLocal
from app.models import EmailOutbox, Member, MemberDocument, MemberPayment, MemberStatus, Organization, Token, TokenType
from app.security import get_password_hash, verify_password
from app.services.member_sessions import issue_member_auth_token, replace_member_password


PASSWORD_A = "ClubAccountOne123!"
PASSWORD_B = "ClubAccountTwo123!"
PASSWORD_C = "UnrelatedClub123!"


@pytest.fixture
def clubs(client):
    """Two memberships share email, but never acquire links from email equality."""
    client.cookies.clear()
    suffix = uuid4().hex
    with SessionLocal() as db:
        organizations = [Organization(name=f"Club {letter} {suffix}", slug=f"accounts-{letter}-{suffix}", is_active=True)
                         for letter in ("a", "b", "c")]
        db.add_all(organizations)
        db.flush()
        shared_email = f"account-{suffix}@example.test"
        members = []
        documents = []
        payments = []
        for index, (org, password) in enumerate(zip(organizations, (PASSWORD_A, PASSWORD_B, PASSWORD_C))):
            member = Member(org_id=org.id, first_name="Ada", last_name="Account",
                            email=shared_email if index < 2 else f"other-{suffix}@example.test",
                            password_hash=get_password_hash(password), status=MemberStatus.ACTIVE,
                            card_no=810000 + index, card_year=datetime.utcnow().year,
                            joined_at=datetime.utcnow(), membership_type="annual")
            db.add(member)
            db.flush()
            document = MemberDocument(member_id=member.id, doc_type="identity", rel_path=f"synthetic/{suffix}-{index}.pdf",
                                      original_filename=f"Club-{index}.pdf", mime_type="application/pdf", size_bytes=100,
                                      status="approved")
            payment = MemberPayment(member_id=member.id, org_id=org.id, amount_cents=1000 * (index + 1),
                                    method="cash", paid_at=datetime.utcnow(), notes=f"Historical payment {index}")
            db.add_all([document, payment])
            db.flush()
            members.append(member)
            documents.append(document.id)
            payments.append(payment.id)
        db.commit()
        result = {"ids": [member.id for member in members], "org_ids": [org.id for org in organizations],
                  "slugs": [org.slug for org in organizations], "email": shared_email,
                  "other_email": members[2].email, "doc_ids": documents, "payment_ids": payments}
    yield result
    client.cookies.clear()


def _login(client, email, password):
    client.cookies.clear()
    response = client.post("/api/auth/login", data={"email": email, "password": password})
    assert response.status_code == 200, response.text
    assert response.json().get("authenticated") is True, response.text
    return client.cookies.get("session")


def _cards(client):
    response = client.get("/api/member/cards")
    assert response.status_code == 200, response.text
    return response.json()


def _link_b(client, clubs, password=PASSWORD_B):
    response = client.post("/api/member/cards/link", json={"org_slug": clubs["slugs"][1],
                           "card_number": "810001", "password": password})
    assert response.status_code == 200, response.text
    return response


def _set_cookie(client, cookie):
    client.cookies.clear()
    client.cookies.set("session", cookie, domain="testserver.local", path="/")


def _payload(cookie):
    signed = TimestampSigner(settings.SECRET_KEY).unsign(cookie)
    return json.loads(base64.b64decode(signed))


def _signed(payload):
    value = base64.b64encode(json.dumps(payload).encode("utf-8"))
    return TimestampSigner(settings.SECRET_KEY).sign(value).decode("utf-8")


def test_legacy_password_can_select_its_own_membership_without_automatic_email_merge(client, clubs):
    # B has the higher ID. A's existing credential must still find A.
    _login(client, clubs["email"], PASSWORD_A)
    response = _cards(client)
    assert response["account"]["email"] == clubs["email"]
    assert response["selected_member_id"] == clubs["ids"][0]
    assert [item["id"] for item in response["items"]] == [clubs["ids"][0]]
    assert client.get("/api/auth/me").json()["id"] == clubs["ids"][0]

    _login(client, clubs["email"], PASSWORD_B)
    response = _cards(client)
    assert response["selected_member_id"] == clubs["ids"][1]
    assert [item["id"] for item in response["items"]] == [clubs["ids"][1]]


def test_verified_link_preserves_every_membership_card_and_history_row(client, clubs):
    _login(client, clubs["email"], PASSWORD_A)
    account_id = _cards(client)["account"]["id"]
    with SessionLocal() as db:
        before = [(m.id, m.org_id, m.card_no, m.card_year, m.joined_at) for m in db.query(Member).filter(Member.id.in_(clubs["ids"])).order_by(Member.id)]
    _link_b(client, clubs)
    response = _cards(client)
    assert response["account"]["id"] == account_id
    assert {item["id"] for item in response["items"]} == set(clubs["ids"][:2])
    assert {item["organization"]["id"] for item in response["items"]} == set(clubs["org_ids"][:2])
    assert {item["card_no"] for item in response["items"]} == {810000, 810001}
    with SessionLocal() as db:
        after = [(m.id, m.org_id, m.card_no, m.card_year, m.joined_at) for m in db.query(Member).filter(Member.id.in_(clubs["ids"])).order_by(Member.id)]
        assert after == before
        for index, member_id in enumerate(clubs["ids"]):
            assert db.get(MemberDocument, clubs["doc_ids"][index]).member_id == member_id
            payment = db.get(MemberPayment, clubs["payment_ids"][index])
            assert (payment.member_id, payment.org_id, payment.amount_cents) == (member_id, clubs["org_ids"][index], 1000 * (index + 1))


def test_selection_changes_tenant_context_and_documents_stay_private(client, clubs):
    _login(client, clubs["email"], PASSWORD_A)
    _link_b(client, clubs)
    for index in (0, 1):
        response = client.post(f"/api/member/cards/{clubs['ids'][index]}/select")
        assert response.status_code == 200, response.text
        me = client.get("/api/auth/me").json()
        assert (me["id"], me["organization"]["id"], me["card_no"]) == (clubs["ids"][index], clubs["org_ids"][index], 810000 + index)
        docs = client.get("/api/member/documents")
        assert docs.status_code == 200, docs.text
        assert [item["id"] for item in docs.json()["items"]] == [clubs["doc_ids"][index]]
        other_doc = clubs["doc_ids"][1 - index]
        assert client.get(f"/member/download/{other_doc}").status_code == 404
    response = client.post(f"/api/member/cards/{clubs['ids'][2]}/select")
    assert response.status_code in (403, 404)
    assert client.get("/api/auth/me").json()["id"] == clubs["ids"][1]


@pytest.mark.parametrize("password", ["", "Wrong-password-123!"])
def test_link_cannot_be_claimed_by_knowing_club_number_and_shared_email(client, clubs, password):
    _login(client, clubs["email"], PASSWORD_A)
    response = client.post("/api/member/cards/link", json={"org_slug": clubs["slugs"][1],
                           "card_number": "810001", "password": password})
    assert response.status_code in (400, 401, 403, 404, 422)
    assert [item["id"] for item in _cards(client)["items"]] == [clubs["ids"][0]]
    assert clubs["email"] not in response.text
    assert "Ada" not in response.text


def test_anonymous_list_selection_and_link_fail_closed(client, clubs):
    requests = [client.get("/api/member/cards"), client.post(f"/api/member/cards/{clubs['ids'][0]}/select"),
                client.post("/api/member/cards/link", json={"org_slug": clubs["slugs"][0], "card_number": "810000", "password": PASSWORD_A})]
    assert [response.status_code for response in requests] == [401, 401, 401]


def test_password_reset_revokes_all_linked_sessions_and_one_time_proofs(client, clubs):
    from app.models import MemberAccount

    _login(client, clubs["email"], PASSWORD_A)
    _link_b(client, clubs)
    assert client.post(f"/api/member/cards/{clubs['ids'][0]}/select").status_code == 200
    cookie_a = client.cookies.get("session")
    assert client.post(f"/api/member/cards/{clubs['ids'][1]}/select").status_code == 200
    cookie_b = client.cookies.get("session")
    with SessionLocal() as db:
        account_id = db.get(Member, clubs["ids"][0]).account_id
        original_account_epoch = db.get(MemberAccount, account_id).auth_version
        original_epochs = {member_id: db.get(Member, member_id).auth_version for member_id in clubs["ids"][:2]}
        proofs = []
        reset = None
        for member_id in clubs["ids"][:2]:
            for purpose in (TokenType.LOGIN_MAGIC_LINK, TokenType.PASSWORD_RESET, TokenType.REGISTRATION_CONTINUATION):
                raw, token = issue_member_auth_token(db, member=db.get(Member, member_id), purpose=purpose,
                                                    expires_at=datetime.utcnow() + timedelta(minutes=10))
                db.flush()
                proofs.append((raw, token.id))
                if member_id == clubs["ids"][0] and purpose == TokenType.PASSWORD_RESET:
                    reset = raw
        db.commit()
    client.cookies.clear()
    response = client.post("/api/auth/password-reset/confirm", data={"token": reset,
                           "new_password": "UnifiedNewPassword123!", "confirm_password": "UnifiedNewPassword123!"})
    assert response.status_code == 200, response.text
    with SessionLocal() as db:
        account = db.get(MemberAccount, account_id)
        assert account.auth_version == original_account_epoch + 1
        assert verify_password("UnifiedNewPassword123!", account.password_hash)
        for member_id, original_epoch in original_epochs.items():
            assert db.get(Member, member_id).auth_version == original_epoch + 1
        assert all(db.get(Token, token_id).used_at is not None for _, token_id in proofs)
    for cookie in (cookie_a, cookie_b):
        for path in ("/api/auth/me", "/api/member/cards", "/api/member/membership", "/api/member/documents"):
            _set_cookie(client, cookie)
            assert client.get(path).status_code == 401, path
    _login(client, clubs["email"], "UnifiedNewPassword123!")
    assert {item["id"] for item in _cards(client)["items"]} == set(clubs["ids"][:2])
    for old_password in (PASSWORD_A, PASSWORD_B):
        client.cookies.clear()
        stale = client.post("/api/auth/login", data={"email": clubs["email"], "password": old_password})
        assert stale.json().get("authenticated") is not True
        assert client.get("/api/auth/me").status_code == 401


def test_password_change_keeps_current_browser_but_revokes_other_selected_club_cookie(client, clubs):
    _login(client, clubs["email"], PASSWORD_A)
    _link_b(client, clubs)
    assert client.post(f"/api/member/cards/{clubs['ids'][0]}/select").status_code == 200
    stale_cookie = client.cookies.get("session")
    assert client.post(f"/api/member/cards/{clubs['ids'][1]}/select").status_code == 200
    response = client.post("/api/auth/change-password", data={"new_password": "ChangedForAllClubs123!"})
    assert response.status_code == 200, response.text
    assert client.get("/api/auth/me").json()["id"] == clubs["ids"][1]
    _set_cookie(client, stale_cookie)
    assert client.get("/api/auth/me").status_code == 401


def test_deleted_selected_membership_does_not_lock_person_out_of_other_club(client, clubs):
    _login(client, clubs["email"], PASSWORD_A)
    _link_b(client, clubs)
    assert client.post(f"/api/member/cards/{clubs['ids'][1]}/select").status_code == 200
    with SessionLocal() as db:
        member = db.get(Member, clubs["ids"][1])
        member.deleted_at = datetime.utcnow()
        db.commit()
    response = _cards(client)
    assert response["selected_member_id"] == clubs["ids"][0]
    assert [item["id"] for item in response["items"]] == [clubs["ids"][0]]
    _login(client, clubs["email"], PASSWORD_A)
    assert client.get("/api/auth/me").json()["id"] == clubs["ids"][0]


def test_clearing_deleted_member_credential_preserves_other_club_account_password(client, clubs):
    from app.models import MemberAccount

    _login(client, clubs["email"], PASSWORD_A)
    _link_b(client, clubs)
    with SessionLocal() as db:
        member = db.get(Member, clubs["ids"][1])
        member.deleted_at = datetime.utcnow()
        replace_member_password(db, member_id=member.id, expected_version=member.auth_version, password_hash=None)
        db.commit()
        account = db.get(MemberAccount, db.get(Member, clubs["ids"][0]).account_id)
        assert verify_password(PASSWORD_A, account.password_hash)
    _login(client, clubs["email"], PASSWORD_A)
    assert [item["id"] for item in _cards(client)["items"]] == [clubs["ids"][0]]


def test_pending_linked_membership_is_visible_but_cannot_bypass_activation(client, clubs):
    _login(client, clubs["email"], PASSWORD_A)
    _link_b(client, clubs)
    assert client.post(f"/api/member/cards/{clubs['ids'][1]}/select").status_code == 200
    with SessionLocal() as db:
        member = db.get(Member, clubs["ids"][1])
        member.status = MemberStatus.PENDING_DOCS
        db.commit()
    cards = _cards(client)
    assert cards["selected_member_id"] == clubs["ids"][0]
    pending = next(item for item in cards["items"] if item["id"] == clubs["ids"][1])
    assert pending["can_select"] is False
    selected = client.post(f"/api/member/cards/{clubs['ids'][1]}/select")
    assert selected.status_code in (403, 409)
    assert client.get("/api/auth/me").json()["id"] == clubs["ids"][0]


def test_expired_linked_membership_keeps_renewal_access_without_active_services(client, clubs):
    _login(client, clubs["email"], PASSWORD_A)
    _link_b(client, clubs)
    with SessionLocal() as db:
        member = db.get(Member, clubs["ids"][1])
        member.status = MemberStatus.EXPIRED
        member.card_year = datetime.utcnow().year - 1
        db.commit()
    selected = client.post(f"/api/member/cards/{clubs['ids'][1]}/select")
    assert selected.status_code == 200, selected.text
    assert client.get("/api/auth/me").status_code == 200
    assert client.get("/api/member/membership").status_code == 200
    assert client.get("/api/member/documents").status_code == 401


def test_old_request_cannot_rotate_account_after_other_club_password_change(client, clubs):
    _login(client, clubs["email"], PASSWORD_A)
    _link_b(client, clubs)
    with SessionLocal() as stale_db:
        stale = stale_db.get(Member, clubs["ids"][0])
        old_epoch = stale.auth_version
        with SessionLocal() as writer:
            other = writer.get(Member, clubs["ids"][1])
            replace_member_password(writer, member_id=other.id, expected_version=other.auth_version,
                                    password_hash=get_password_hash("ConcurrentWinner123!"))
            writer.commit()
        with pytest.raises(HTTPException) as failure:
            replace_member_password(stale_db, member_id=stale.id, expected_version=old_epoch,
                                    password_hash=get_password_hash("StaleAuthority123!"))
        assert failure.value.status_code == 401
        stale_db.rollback()


def test_account_cookie_cannot_select_membership_owned_by_another_account(client, clubs):
    _login(client, clubs["email"], PASSWORD_A)
    cookie = client.cookies.get("session")
    payload = _payload(cookie)
    with SessionLocal() as db:
        other = db.get(Member, clubs["ids"][2])
        payload["member_id"] = other.id
        payload["member_auth_version"] = other.auth_version
    _set_cookie(client, _signed(payload))
    response = client.get("/api/auth/me")
    assert response.status_code in (200, 401)
    if response.status_code == 200:
        # A still-valid account bearer may recover its own selected club, but
        # it must never gain access to the mismatched membership in the cookie.
        assert response.json()["id"] == clubs["ids"][0]
        assert [item["id"] for item in _cards(client)["items"]] == [clubs["ids"][0]]


def test_membership_contact_email_change_does_not_replace_personal_login_email(client, clubs, monkeypatch):
    _login(client, clubs["email"], PASSWORD_A)
    _link_b(client, clubs)
    assert client.post(f"/api/member/cards/{clubs['ids'][1]}/select").status_code == 200
    confirmation = f"accounts-confirm-{uuid4().hex}"
    authorization = f"accounts-authorize-{uuid4().hex}"
    tokens = iter([confirmation, authorization])
    monkeypatch.setattr("app.services.member_contact_changes.generate_token", lambda: next(tokens))
    changed_email = f"club-contact-{uuid4().hex}@example.net"
    request = client.post("/api/member/contact-changes", json={"field": "email", "new_value": changed_email})
    assert request.status_code == 200, request.text
    assert client.post("/api/member/contact-changes/authorize", json={"token": authorization}).status_code == 200
    confirmed = client.post("/api/member/contact-changes/confirm", json={"token": confirmation})
    assert confirmed.status_code == 200, confirmed.text
    assert _cards(client)["account"]["email"] == clubs["email"]
    with SessionLocal() as db:
        assert db.get(Member, clubs["ids"][0]).email == clubs["email"]
        assert db.get(Member, clubs["ids"][1]).email == changed_email
    _login(client, clubs["email"], PASSWORD_A)
    assert {item["id"] for item in _cards(client)["items"]} == set(clubs["ids"][:2])


def test_transferring_proved_single_membership_revokes_its_old_account_cookie(client, clubs):
    old_b_cookie = _login(client, clubs["email"], PASSWORD_B)
    old_b_account = _cards(client)["account"]["id"]
    with SessionLocal() as db:
        raw, token = issue_member_auth_token(db, member=db.get(Member, clubs["ids"][1]),
                                            purpose=TokenType.LOGIN_MAGIC_LINK,
                                            expires_at=datetime.utcnow() + timedelta(minutes=10))
        db.flush()
        old_token_id = token.id
        db.commit()
    _login(client, clubs["email"], PASSWORD_A)
    new_account = _cards(client)["account"]["id"]
    assert new_account != old_b_account
    _link_b(client, clubs)
    assert {item["id"] for item in _cards(client)["items"]} == set(clubs["ids"][:2])
    _set_cookie(client, old_b_cookie)
    assert client.get("/api/auth/me").status_code == 401
    client.cookies.clear()
    response = client.get(f"/member/auth?token={raw}", follow_redirects=False)
    assert response.headers["location"] == "/login"
    with SessionLocal() as db:
        assert db.get(Token, old_token_id).used_at is not None
        assert db.get(Member, clubs["ids"][1]).account_id == new_account


def test_link_refuses_to_move_a_membership_out_of_an_existing_multi_club_account(client, clubs):
    _login(client, clubs["email"], PASSWORD_B)
    linked = client.post("/api/member/cards/link", json={"org_slug": clubs["slugs"][2],
                         "card_number": "810002", "password": PASSWORD_C})
    assert linked.status_code == 200, linked.text
    source_account = _cards(client)["account"]["id"]
    assert {item["id"] for item in _cards(client)["items"]} == set(clubs["ids"][1:])
    _login(client, clubs["email"], PASSWORD_A)
    response = client.post("/api/member/cards/link", json={"org_slug": clubs["slugs"][1],
                           "card_number": "810001", "password": PASSWORD_B})
    assert response.status_code == 409, response.text
    assert [item["id"] for item in _cards(client)["items"]] == [clubs["ids"][0]]
    with SessionLocal() as db:
        assert {db.get(Member, member_id).account_id for member_id in clubs["ids"][1:]} == {source_account}


def test_unknown_paper_card_claim_never_creates_or_renumbers_a_membership(client, clubs):
    _login(client, clubs["email"], PASSWORD_A)
    with SessionLocal() as db:
        before = db.query(Member).count()
    response = client.post("/api/member/cards/link", json={"org_slug": clubs["slugs"][1],
                           "card_number": "999998", "password": PASSWORD_B})
    assert response.status_code in (400, 404)
    with SessionLocal() as db:
        assert db.query(Member).count() == before
        assert [(db.get(Member, member_id).card_no) for member_id in clubs["ids"]] == [810000, 810001, 810002]


def test_adding_a_club_revokes_older_account_cookies_and_proofs_without_logging_out_current_browser(client, clubs):
    stale_cookie = _login(client, clubs["email"], PASSWORD_A)
    with SessionLocal() as db:
        raw, token = issue_member_auth_token(db, member=db.get(Member, clubs["ids"][0]),
                                            purpose=TokenType.LOGIN_MAGIC_LINK,
                                            expires_at=datetime.utcnow() + timedelta(minutes=10))
        db.flush()
        token_id = token.id
        db.commit()
    _link_b(client, clubs)
    assert {item["id"] for item in _cards(client)["items"]} == set(clubs["ids"][:2])
    _set_cookie(client, stale_cookie)
    assert client.get("/api/member/cards").status_code == 401
    client.cookies.clear()
    response = client.get(f"/member/auth?token={raw}", follow_redirects=False)
    assert response.headers["location"] == "/login"
    with SessionLocal() as db:
        assert db.get(Token, token_id).used_at is not None


def test_club_contact_magic_link_cannot_escalate_to_personal_account_or_other_clubs(client, clubs):
    _login(client, clubs["email"], PASSWORD_A)
    linked = client.post("/api/member/cards/link", json={"org_slug": clubs["slugs"][2],
                         "card_number": "810002", "password": PASSWORD_C})
    assert linked.status_code == 200, linked.text
    with SessionLocal() as db:
        member = db.get(Member, clubs["ids"][2])
        assert member.email != member.account.email
        raw, proof = issue_member_auth_token(db, member=member, purpose=TokenType.LOGIN_MAGIC_LINK,
                                            expires_at=datetime.utcnow() + timedelta(minutes=10))
        assert proof.account_id is None
        db.commit()
    client.cookies.clear()
    login = client.get(f"/member/auth?token={raw}", follow_redirects=False)
    assert login.status_code == 302, login.text
    assert client.get("/api/auth/me").json()["id"] == clubs["ids"][2]
    cards = client.get("/api/member/cards")
    assert cards.status_code in (200, 401, 403)
    if cards.status_code == 200:
        assert [item["id"] for item in cards.json()["items"]] == [clubs["ids"][2]]
        assert cards.json().get("account") is None
    denied_select = client.post(f"/api/member/cards/{clubs['ids'][0]}/select")
    assert denied_select.status_code in (401, 403)
    denied_change = client.post("/api/auth/change-password", data={"new_password": "ContactCannotReset123!"})
    assert denied_change.status_code in (401, 403)
    assert client.get("/api/auth/me").json()["id"] == clubs["ids"][2]
    _login(client, clubs["email"], PASSWORD_A)
    assert {item["id"] for item in _cards(client)["items"]} == {clubs["ids"][0], clubs["ids"][2]}


def test_public_renewal_preserves_membership_only_session_scope(client, clubs, monkeypatch):
    from app.services import public_renewals

    _login(client, clubs["email"], PASSWORD_A)
    linked = client.post("/api/member/cards/link", json={"org_slug": clubs["slugs"][2],
                         "card_number": "810002", "password": PASSWORD_C})
    assert linked.status_code == 200, linked.text
    with SessionLocal() as db:
        member = db.get(Member, clubs["ids"][2])
        member.status = MemberStatus.EXPIRED
        member.card_year = datetime.utcnow().year - 1
        raw, _ = issue_member_auth_token(db, member=member, purpose=TokenType.LOGIN_MAGIC_LINK,
                                        expires_at=datetime.utcnow() + timedelta(minutes=10))
        db.commit()
    client.cookies.clear()
    login = client.get(f"/member/auth?token={raw}", follow_redirects=False)
    assert login.status_code == 302, login.text
    scope = _payload(client.cookies.get("session"))
    assert scope.get("member_account_scope") == "membership"
    request = Request({"type": "http", "method": "POST", "path": "/api/join/synthetic", "scheme": "http",
                       "server": ("testserver", 80), "headers": [], "session": scope})
    # Exercise the real renewal authentication/session path while stubbing the
    # economic operation, whose behavior is independently covered elsewhere.
    monkeypatch.setattr(public_renewals, "require_renewals_open", lambda: None)
    monkeypatch.setattr(public_renewals, "request_renewal", lambda *args, **kwargs: SimpleNamespace(
        action="requested", checkout_required=False, term=SimpleNamespace(id=999998, membership_year=datetime.utcnow().year)))
    monkeypatch.setattr(public_renewals, "serialize_annual_term", lambda *args: {"id": 999998})
    with SessionLocal() as db:
        result = public_renewals.submit_existing_cardholder_renewal(db, request=request,
            org=db.get(Organization, clubs["org_ids"][2]), email=clubs["other_email"], password=None)
    assert result["status"] == "renewal_requested"
    assert request.session["member_id"] == clubs["ids"][2]
    assert request.session.get("member_account_scope") == "membership"
    assert "member_account_id" not in request.session


@pytest.mark.parametrize("method", ["password", "magic_link"])
def test_personal_login_remembers_last_selected_club_after_logout(client, clubs, method):
    _login(client, clubs["email"], PASSWORD_A)
    _link_b(client, clubs)
    # A is deliberately older, so default ordering cannot accidentally pass.
    assert client.post(f"/api/member/cards/{clubs['ids'][0]}/select").status_code == 200
    assert client.post("/api/auth/logout").status_code == 200
    if method == "password":
        _login(client, clubs["email"], PASSWORD_A)
    else:
        requested = client.post("/api/auth/login", data={"email": clubs["email"]})
        assert requested.status_code == 200, requested.text
        with SessionLocal() as db:
            email = db.query(EmailOutbox).filter(EmailOutbox.to_email == clubs["email"],
                    EmailOutbox.email_type == "member_magic_link").order_by(EmailOutbox.id.desc()).first()
            assert email is not None
            raw = email.payload_json["text_body"].split("token=", 1)[1].split("&", 1)[0].split()[0]
        confirmed = client.get(f"/member/auth?token={raw}", follow_redirects=False)
        assert confirmed.status_code == 302, confirmed.text
    assert _cards(client)["selected_member_id"] == clubs["ids"][0]


@pytest.mark.parametrize("unavailable", ["other_account", "deleted", "pending"])
def test_saved_preference_is_never_authority_to_open_an_unavailable_membership(client, clubs, unavailable):
    from app.models import MemberAccount

    _login(client, clubs["email"], PASSWORD_A)
    _link_b(client, clubs)
    with SessionLocal() as db:
        member = db.get(Member, clubs["ids"][1])
        account = db.get(MemberAccount, db.get(Member, clubs["ids"][0]).account_id)
        if unavailable == "other_account":
            account.preferred_member_id = clubs["ids"][2]
        else:
            account.preferred_member_id = member.id
            if unavailable == "deleted":
                member.deleted_at = datetime.utcnow()
            else:
                member.status = MemberStatus.PENDING_DOCS
        db.commit()
    _login(client, clubs["email"], PASSWORD_A)
    me = client.get("/api/auth/me")
    assert me.status_code == 200, me.text
    allowed = set(clubs["ids"][:2]) if unavailable == "other_account" else {clubs["ids"][0]}
    assert me.json()["id"] in allowed


def test_listing_legacy_card_does_not_rewrite_it_and_selected_card_keeps_working_qr(client, clubs):
    _login(client, clubs["email"], PASSWORD_A)
    _link_b(client, clubs)
    with SessionLocal() as db:
        member = db.get(Member, clubs["ids"][1])
        member.card_year = None
        member.joined_at = datetime(datetime.utcnow().year, 1, 5)
        db.commit()
    listed = _cards(client)
    other = next(item for item in listed["items"] if item["id"] == clubs["ids"][1])
    assert other["card_no"] == 810001
    with SessionLocal() as db:
        assert db.get(Member, clubs["ids"][1]).card_year is None
    assert client.post(f"/api/member/cards/{clubs['ids'][1]}/select").status_code == 200
    me = client.get("/api/auth/me")
    assert me.status_code == 200, me.text
    verification = client.get(urlsplit(me.json()["card"]["verification_url"]).path)
    assert verification.status_code == 200, verification.text
    assert verification.json()["valid"] is True
    assert verification.json()["card"]["number"] == 810001
    with SessionLocal() as db:
        assert db.get(Member, clubs["ids"][1]).card_year == datetime.utcnow().year

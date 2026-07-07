from __future__ import annotations

from datetime import datetime, timedelta

from app.config import settings
from app.db import SessionLocal
from app.models import AdminRole, AdminUser, OrgAdminToken, Organization
from app.services.email_outbox import build_email_payload, drain_outbox_for_tests, enqueue_email
from app.services.email_sender import (
    build_association_from_email,
    build_association_from_header,
    build_sender_payload,
    generate_email_local_part_from_name,
    sanitize_email_local_part,
)
from app.utils import (
    clear_captured_emails,
    get_captured_emails,
    hash_token,
    PermanentEmailDeliveryError,
    RetryableEmailDeliveryError,
    send_email_via_transport_low_level,
)


def _login_org_admin(client, db, admin_id: int) -> None:
    token_str = f"association-email-{admin_id}"
    token = OrgAdminToken(
        admin_id=admin_id,
        token_hash=hash_token(token_str),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(token)
    db.commit()
    client.get(f"/api/org-admin/auth/verify?token={token_str}", follow_redirects=False)


def test_association_email_helpers_generate_expected_sender() -> None:
    original_domain = settings.MAIL_FROM_DOMAIN
    settings.MAIL_FROM_DOMAIN = "notifiche.assonam.it"
    try:
        assert sanitize_email_local_part("Gólden   Age Club!!!") == "golden-age-club"
        assert generate_email_local_part_from_name("Città d'Argento") == "citta-d-argento"

        association = {
            "id": 17,
            "name": "Golden Age Club",
            "communications_enabled": True,
            "sender_email_local_part": None,
            "email_from_name_override": None,
        }
        assert (
            build_association_from_email(association)
            == "golden-age-club@notifiche.assonam.it"
        )
        assert (
            build_association_from_header(association)
            == "Golden Age Club <golden-age-club@notifiche.assonam.it>"
        )

        fallback_association = {
            "id": 21,
            "name": "!!!",
            "communications_enabled": True,
            "sender_email_local_part": None,
            "email_from_name_override": None,
        }
        assert build_association_from_email(fallback_association) == "org-21@notifiche.assonam.it"
    finally:
        settings.MAIL_FROM_DOMAIN = original_domain


def test_email_outbox_uses_association_sender_and_system_fallback() -> None:
    original_mode = settings.EMAIL_MODE
    original_domain = settings.MAIL_FROM_DOMAIN
    original_email_from = settings.EMAIL_FROM
    settings.EMAIL_MODE = "test"
    settings.MAIL_FROM_DOMAIN = "notifiche.assonam.it"
    settings.EMAIL_FROM = "ASSONAM <noreply@assonam.it>"
    clear_captured_emails()
    try:
        with SessionLocal() as db:
            outbox_id = enqueue_email(
                db,
                email_type="association_sender_test",
                to_email="member@example.com",
                subject="Association sender",
                payload=build_email_payload(
                    text_body="hello",
                    sender=build_sender_payload(
                        mode="association",
                        association={
                            "id": 7,
                            "name": "Golden Age Club",
                            "communications_enabled": True,
                            "sender_email_local_part": "golden age club",
                            "email_from_name_override": "Golden Age Club",
                            "reply_to_email": "segreteria@goldenage.it",
                        },
                    ),
                ),
                priority=1,
            )
            assert outbox_id
            fallback_id = enqueue_email(
                db,
                email_type="association_sender_test_fallback",
                to_email="member2@example.com",
                subject="Fallback sender",
                payload=build_email_payload(
                    text_body="hello fallback",
                    sender=build_sender_payload(
                        mode="association",
                        association={
                            "id": 8,
                            "name": "Disabled Club",
                            "communications_enabled": False,
                            "sender_email_local_part": "disabled-club",
                            "email_from_name_override": None,
                            "reply_to_email": None,
                        },
                    ),
                ),
                priority=1,
            )
            assert fallback_id
            db.commit()

        drain_outbox_for_tests()
        captured = get_captured_emails()
        assert len(captured) == 2

        association_email = next(item for item in captured if item["to"] == "member@example.com")
        assert association_email["selected_mode"] == "association"
        assert association_email["fallback_used"] is False
        assert association_email["transport"] == "mailtrap_api"
        assert association_email["from_email"] == "golden-age-club@notifiche.assonam.it"
        assert association_email["from_header"] == "Golden Age Club <golden-age-club@notifiche.assonam.it>"
        assert association_email["reply_to"] == "segreteria@goldenage.it"

        fallback_email = next(item for item in captured if item["to"] == "member2@example.com")
        assert fallback_email["selected_mode"] == "system"
        assert fallback_email["fallback_used"] is True
        assert fallback_email["transport"] == "smtp"
        assert fallback_email["from_email"] == "noreply@assonam.it"
        assert fallback_email["from_header"] == "ASSONAM <noreply@assonam.it>"
    finally:
        settings.EMAIL_MODE = original_mode
        settings.MAIL_FROM_DOMAIN = original_domain
        settings.EMAIL_FROM = original_email_from
        clear_captured_emails()


def test_mailtrap_transport_is_used_for_association_mode(monkeypatch) -> None:
    original_mode = settings.EMAIL_MODE
    original_domain = settings.MAIL_FROM_DOMAIN
    original_token = settings.ASSOCIATION_MAIL_API_TOKEN
    records: dict[str, object] = {}

    class FakeResponse:
        status_code = 200
        ok = True
        reason = "OK"
        text = ""

        def json(self):
            return {"message_ids": ["mtp-123"]}

    def fake_post(url, *, headers, json, timeout):
        records["url"] = url
        records["headers"] = headers
        records["json"] = json
        records["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr("app.utils.requests.post", fake_post)

    settings.EMAIL_MODE = "normal"
    settings.MAIL_FROM_DOMAIN = "notifiche.assonam.it"
    settings.ASSOCIATION_MAIL_API_TOKEN = "mailtrap-token"

    try:
        provider_message_id = send_email_via_transport_low_level(
            to_email="member@example.com",
            subject="Association sender",
            text_body="hello",
            html_body="<p>hello</p><img src=\"cid:card_front@assonam\" />",
            inline_images=[
                {
                    "cid": "card_front@assonam",
                    "content_type": "image/png",
                    "filename": "tessera.png",
                    "data": b"png-binary",
                }
            ],
            mode="association",
            association={
                "id": 7,
                "name": "Golden Age Club",
                "communications_enabled": True,
                "sender_email_local_part": "golden age club",
                "email_from_name_override": "Golden Age Club",
                "reply_to_email": "segreteria@goldenage.it",
            },
        )

        payload = records["json"]
        assert provider_message_id == "mtp-123"
        assert records["url"] == "https://send.api.mailtrap.io/api/send"
        assert records["timeout"] == 20
        assert records["headers"] == {
            "Authorization": "Bearer mailtrap-token",
            "Content-Type": "application/json",
        }
        assert payload["from"]["email"] == "golden-age-club@notifiche.assonam.it"
        assert payload["from"]["name"] == "Golden Age Club"
        assert payload["to"] == [{"email": "member@example.com"}]
        assert payload["reply_to"] == {"email": "segreteria@goldenage.it"}
        assert payload["attachments"][0]["disposition"] == "inline"
        assert payload["attachments"][0]["content_id"] == "card_front@assonam"
    finally:
        settings.EMAIL_MODE = original_mode
        settings.MAIL_FROM_DOMAIN = original_domain
        settings.ASSOCIATION_MAIL_API_TOKEN = original_token


def test_smtp_transport_still_used_for_system_mode(monkeypatch) -> None:
    original_mode = settings.EMAIL_MODE
    original_email_from = settings.EMAIL_FROM
    original_host = settings.SMTP_HOST
    original_port = settings.SMTP_PORT
    original_user = settings.SMTP_USER
    original_password = settings.SMTP_PASSWORD
    original_use_tls = settings.SMTP_USE_TLS
    records: dict[str, object] = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            records["connect"] = (host, port, timeout)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def ehlo(self):
            records["ehlo"] = True

        def starttls(self):
            records["starttls"] = True

        def login(self, user, password):
            records["login"] = (user, password)

        def sendmail(self, from_addr, to_addrs, message):
            records["from_addr"] = from_addr
            records["to_addrs"] = to_addrs
            records["message"] = message

    monkeypatch.setattr("app.utils.smtplib.SMTP", FakeSMTP)

    settings.EMAIL_MODE = "normal"
    settings.EMAIL_FROM = "ASSONAM <noreply@assonam.it>"
    settings.SMTP_HOST = "smtp.example.test"
    settings.SMTP_PORT = 587
    settings.SMTP_USER = "mailer"
    settings.SMTP_PASSWORD = "secret"
    settings.SMTP_USE_TLS = True

    try:
        provider_message_id = send_email_via_transport_low_level(
            to_email="official@example.com",
            subject="Official sender",
            text_body="hello",
            mode="system",
        )

        assert provider_message_id
        assert records["connect"] == ("smtp.example.test", 587, 15)
        assert records["login"] == ("mailer", "secret")
        assert records["from_addr"] == "noreply@assonam.it"
        assert records["to_addrs"] == ["official@example.com"]
        assert "From: ASSONAM <noreply@assonam.it>" in str(records["message"])
    finally:
        settings.EMAIL_MODE = original_mode
        settings.EMAIL_FROM = original_email_from
        settings.SMTP_HOST = original_host
        settings.SMTP_PORT = original_port
        settings.SMTP_USER = original_user
        settings.SMTP_PASSWORD = original_password
        settings.SMTP_USE_TLS = original_use_tls


def test_smtp_transport_uses_implicit_tls_for_port_465(monkeypatch) -> None:
    original_mode = settings.EMAIL_MODE
    original_email_from = settings.EMAIL_FROM
    original_host = settings.SMTP_HOST
    original_port = settings.SMTP_PORT
    original_user = settings.SMTP_USER
    original_password = settings.SMTP_PASSWORD
    original_use_tls = settings.SMTP_USE_TLS
    records: dict[str, object] = {}

    class FakeSMTPSSL:
        def __init__(self, host, port, timeout):
            records["connect_ssl"] = (host, port, timeout)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def ehlo(self):
            records["ehlo"] = int(records.get("ehlo", 0)) + 1

        def starttls(self):
            records["starttls"] = True

        def login(self, user, password):
            records["login"] = (user, password)

        def sendmail(self, from_addr, to_addrs, message):
            records["from_addr"] = from_addr
            records["to_addrs"] = to_addrs
            records["message"] = message

    def fail_plain_smtp(*args, **kwargs):
        raise AssertionError("Port 465 must use SMTP_SSL")

    monkeypatch.setattr("app.utils.smtplib.SMTP_SSL", FakeSMTPSSL)
    monkeypatch.setattr("app.utils.smtplib.SMTP", fail_plain_smtp)

    settings.EMAIL_MODE = "normal"
    settings.EMAIL_FROM = "ASSONAM <noreply@assonam.it>"
    settings.SMTP_HOST = "smtp.mx.cloudflare.net"
    settings.SMTP_PORT = 465
    settings.SMTP_USER = "api_token"
    settings.SMTP_PASSWORD = "cf-token"
    settings.SMTP_USE_TLS = True

    try:
        provider_message_id = send_email_via_transport_low_level(
            to_email="official@example.com",
            subject="Cloudflare sender",
            text_body="hello",
            mode="system",
        )

        assert provider_message_id
        assert records["connect_ssl"] == ("smtp.mx.cloudflare.net", 465, 15)
        assert records["login"] == ("api_token", "cf-token")
        assert records["from_addr"] == "noreply@assonam.it"
        assert records["to_addrs"] == ["official@example.com"]
        assert "starttls" not in records
    finally:
        settings.EMAIL_MODE = original_mode
        settings.EMAIL_FROM = original_email_from
        settings.SMTP_HOST = original_host
        settings.SMTP_PORT = original_port
        settings.SMTP_USER = original_user
        settings.SMTP_PASSWORD = original_password
        settings.SMTP_USE_TLS = original_use_tls


def test_cloudflare_rest_transport_uses_smtp_password_and_association_sender(monkeypatch) -> None:
    original_mode = settings.EMAIL_MODE
    original_transport = settings.EMAIL_TRANSPORT
    original_account_id = settings.CLOUDFLARE_ACCOUNT_ID
    original_api_token = settings.CLOUDFLARE_EMAIL_API_TOKEN
    original_api_base_url = settings.CLOUDFLARE_EMAIL_API_BASE_URL
    original_smtp_password = settings.SMTP_PASSWORD
    original_domain = settings.MAIL_FROM_DOMAIN
    records: dict[str, object] = {}

    class FakeResponse:
        status_code = 200
        ok = True
        reason = "OK"
        text = ""

        def json(self):
            return {
                "success": True,
                "errors": [],
                "messages": [],
                "result": {
                    "delivered": ["member@example.com"],
                    "permanent_bounces": [],
                    "queued": [],
                },
            }

    def fake_post(url, *, headers, json, timeout):
        records["url"] = url
        records["headers"] = headers
        records["json"] = json
        records["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr("app.utils.requests.post", fake_post)

    settings.EMAIL_MODE = "normal"
    settings.EMAIL_TRANSPORT = "cloudflare_rest"
    settings.CLOUDFLARE_ACCOUNT_ID = "acct_123"
    settings.CLOUDFLARE_EMAIL_API_TOKEN = ""
    settings.CLOUDFLARE_EMAIL_API_BASE_URL = "https://api.cloudflare.com/client/v4"
    settings.SMTP_PASSWORD = "cf-token-from-smtp-password"
    settings.MAIL_FROM_DOMAIN = "assonam.it"

    try:
        provider_message_id = send_email_via_transport_low_level(
            to_email="member@example.com",
            subject="Promo Golden",
            text_body="hello",
            html_body="<p>hello</p><img src=\"cid:card_front@assonam\" />",
            inline_images=[
                {
                    "cid": "card_front@assonam",
                    "content_type": "image/png",
                    "filename": "tessera.png",
                    "data": b"png-binary",
                }
            ],
            mode="association",
            association={
                "id": 7,
                "name": "Golden Age Club",
                "communications_enabled": True,
                "sender_email_local_part": "golden-age-club",
                "email_from_name_override": "Golden Age Club",
                "reply_to_email": "segreteria@goldenage.it",
            },
            idempotency_key="campaign:42:member@example.com",
        )

        payload = records["json"]
        headers = records["headers"]
        assert provider_message_id == "cloudflare:campaign:42:member@example.com"
        assert records["url"] == "https://api.cloudflare.com/client/v4/accounts/acct_123/email/sending/send"
        assert records["timeout"] == 20
        assert headers["Authorization"] == "Bearer cf-token-from-smtp-password"
        assert headers["Idempotency-Key"] == "campaign:42:member@example.com"
        assert payload["from"] == "golden-age-club@assonam.it"
        assert payload["to"] == "member@example.com"
        assert payload["subject"] == "Promo Golden"
        assert payload["headers"]["X-ASSONAM-Outbox-ID"] == "campaign:42:member@example.com"
        assert payload["reply_to"] == "segreteria@goldenage.it"
        assert "Reply-To" not in payload["headers"]
        assert "Message-ID" not in payload["headers"]
        assert payload["attachments"][0]["disposition"] == "inline"
        assert payload["attachments"][0]["content_id"] == "card_front@assonam"
    finally:
        settings.EMAIL_MODE = original_mode
        settings.EMAIL_TRANSPORT = original_transport
        settings.CLOUDFLARE_ACCOUNT_ID = original_account_id
        settings.CLOUDFLARE_EMAIL_API_TOKEN = original_api_token
        settings.CLOUDFLARE_EMAIL_API_BASE_URL = original_api_base_url
        settings.SMTP_PASSWORD = original_smtp_password
        settings.MAIL_FROM_DOMAIN = original_domain


def test_cloudflare_rest_system_sender_defaults_to_no_reply(monkeypatch) -> None:
    original_mode = settings.EMAIL_MODE
    original_transport = settings.EMAIL_TRANSPORT
    original_account_id = settings.CLOUDFLARE_ACCOUNT_ID
    original_api_token = settings.CLOUDFLARE_EMAIL_API_TOKEN
    original_smtp_password = settings.SMTP_PASSWORD
    original_email_from = settings.EMAIL_FROM
    original_smtp_from = settings.SMTP_FROM
    records: dict[str, object] = {}

    class FakeResponse:
        status_code = 200
        ok = True
        reason = "OK"
        text = ""

        def json(self):
            return {"success": True, "result": {"delivered": ["official@example.com"]}}

    def fake_post(url, *, headers, json, timeout):
        records["json"] = json
        return FakeResponse()

    monkeypatch.setattr("app.utils.requests.post", fake_post)

    settings.EMAIL_MODE = "normal"
    settings.EMAIL_TRANSPORT = "cloudflare_rest"
    settings.CLOUDFLARE_ACCOUNT_ID = "acct_123"
    settings.CLOUDFLARE_EMAIL_API_TOKEN = ""
    settings.SMTP_PASSWORD = "cf-token"
    settings.EMAIL_FROM = "ASSONAM <no-reply@assonam.it>"
    settings.SMTP_FROM = ""

    try:
        send_email_via_transport_low_level(
            to_email="official@example.com",
            subject="System",
            text_body="hello",
            mode="system",
            idempotency_key="system:1",
        )

        assert records["json"]["from"] == "no-reply@assonam.it"
        assert "Message-ID" not in records["json"]["headers"]
    finally:
        settings.EMAIL_MODE = original_mode
        settings.EMAIL_TRANSPORT = original_transport
        settings.CLOUDFLARE_ACCOUNT_ID = original_account_id
        settings.CLOUDFLARE_EMAIL_API_TOKEN = original_api_token
        settings.SMTP_PASSWORD = original_smtp_password
        settings.EMAIL_FROM = original_email_from
        settings.SMTP_FROM = original_smtp_from


def test_cloudflare_rest_error_classification(monkeypatch) -> None:
    original_mode = settings.EMAIL_MODE
    original_transport = settings.EMAIL_TRANSPORT
    original_account_id = settings.CLOUDFLARE_ACCOUNT_ID
    original_api_token = settings.CLOUDFLARE_EMAIL_API_TOKEN
    original_smtp_password = settings.SMTP_PASSWORD
    status_code = {"value": 429}

    class FakeResponse:
        ok = False
        reason = "provider error"
        text = ""

        @property
        def status_code(self):
            return status_code["value"]

        def json(self):
            return {
                "success": False,
                "errors": [{"code": 10004, "message": "email.sending.error.throttled"}],
            }

    def fake_post(url, *, headers, json, timeout):
        return FakeResponse()

    monkeypatch.setattr("app.utils.requests.post", fake_post)

    settings.EMAIL_MODE = "normal"
    settings.EMAIL_TRANSPORT = "cloudflare_rest"
    settings.CLOUDFLARE_ACCOUNT_ID = "acct_123"
    settings.CLOUDFLARE_EMAIL_API_TOKEN = ""
    settings.SMTP_PASSWORD = "cf-token"

    try:
        try:
            send_email_via_transport_low_level(
                to_email="member@example.com",
                subject="Retry",
                text_body="hello",
                mode="system",
                idempotency_key="retry:1",
            )
        except RetryableEmailDeliveryError as exc:
            assert "429" in str(exc)
        else:
            raise AssertionError("429 must be retryable")

        status_code["value"] = 401
        try:
            send_email_via_transport_low_level(
                to_email="member@example.com",
                subject="Permanent",
                text_body="hello",
                mode="system",
                idempotency_key="permanent:1",
            )
        except PermanentEmailDeliveryError as exc:
            assert "401" in str(exc)
        else:
            raise AssertionError("401 must be permanent")
    finally:
        settings.EMAIL_MODE = original_mode
        settings.EMAIL_TRANSPORT = original_transport
        settings.CLOUDFLARE_ACCOUNT_ID = original_account_id
        settings.CLOUDFLARE_EMAIL_API_TOKEN = original_api_token
        settings.SMTP_PASSWORD = original_smtp_password


def test_org_admin_patch_organization_email_settings_returns_preview(client) -> None:
    db = SessionLocal()
    original_domain = settings.MAIL_FROM_DOMAIN
    settings.MAIL_FROM_DOMAIN = "notifiche.assonam.it"
    try:
        org = db.query(Organization).filter_by(slug="mail-preview-org").first()
        if not org:
            org = Organization(name="Golden Àge Club", slug="mail-preview-org", is_active=True)
            db.add(org)
            db.commit()
            db.refresh(org)

        org.communications_enabled = True
        db.commit()
        db.refresh(org)

        admin = db.query(AdminUser).filter_by(email="mail.preview.admin@example.com").first()
        if not admin:
            admin = AdminUser(
                email="mail.preview.admin@example.com",
                role=AdminRole.ORG_ADMIN,
                org_id=org.id,
                is_active=True,
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)

        _login_org_admin(client, db, admin.id)

        response = client.put(
            "/api/org-admin/communications/settings",
            json={
                "sender_email_local_part": "Gólden   Age Club!!!",
                "email_from_name_override": "Golden Age Club",
                "reply_to_email": "segreteria@goldenage.it",
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["ok"] is True
        organization = payload["settings"]
        assert organization["communications_enabled"] is True
        assert organization["sender_email_local_part"] == "golden-age-club"
        assert organization["email_from_name_override"] == "Golden Age Club"
        assert organization["reply_to_email"] == "segreteria@goldenage.it"
        assert organization["association_email_sender"]["selected_mode"] == "association"
        assert organization["association_email_sender"]["from_email"] == "golden-age-club@notifiche.assonam.it"
        assert (
            organization["association_email_sender"]["from_header"]
            == "Golden Age Club <golden-age-club@notifiche.assonam.it>"
        )
    finally:
        settings.MAIL_FROM_DOMAIN = original_domain
        db.close()

from app.services import whatsapp_sync


def test_message_dedupe_key_is_stable_non_security_digest():
    first = whatsapp_sync._build_message_dedupe_key(
        instance_name="instance-a",
        external_message_id=None,
        payload={"b": 2, "a": 1},
    )
    second = whatsapp_sync._build_message_dedupe_key(
        instance_name="instance-a",
        external_message_id=None,
        payload={"a": 1, "b": 2},
    )

    assert first == second
    assert first.startswith("message:instance-a:hash:")
    assert len(first.rsplit(":", 1)[-1]) == 40


def test_message_dedupe_key_keeps_provider_id_format():
    key = whatsapp_sync._build_message_dedupe_key(
        instance_name="instance-a",
        external_message_id="provider-message-1",
        payload={"ignored": True},
    )

    assert key == "message:instance-a:provider-message-1"

from pathlib import Path


def test_messages_hub_uses_sandboxed_html_preview():
    source = Path(
        "frontend/src/pages/org-admin/components/communications/MessagesHub.tsx"
    ).read_text(encoding="utf-8")

    assert "dangerouslySetInnerHTML" not in source
    assert "sandbox=\"\"" in source
    assert "srcDoc={html}" in source


def test_grapes_builder_does_not_clear_with_inner_html_assignment():
    source = Path(
        "frontend/src/pages/org-admin/components/communications/GrapesEmailBuilder.tsx"
    ).read_text(encoding="utf-8")

    assert "container.innerHTML" not in source
    assert "container.replaceChildren()" in source


def test_iscrizione_warning_copy_does_not_name_sensitive_fields():
    source = Path("frontend/src/pages/Iscrizione.tsx").read_text(encoding="utf-8")

    assert "Password registration failed" not in source
    assert 'console.warn("Credential setup failed after signup save")' in source

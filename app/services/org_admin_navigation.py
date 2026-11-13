"""Validated local destinations for Org Admin authentication redirects."""

import re


def safe_org_admin_next(raw: str | None) -> str | None:
    if not isinstance(raw, str) or not raw or len(raw) > 2048:
        return None
    if re.search(r"[\x00-\x20\x7f\\]", raw) or re.search(r"%(?:0[0-9a-f]|1[0-9a-f]|7f)", raw, re.I):
        return None
    path = re.split(r"[?#]", raw, maxsplit=1)[0]
    if not re.fullmatch(r"/org-admin(?:/[a-zA-Z0-9_-]+)*/?", path):
        return None
    if re.match(r"/org-admin/(?:login|callback)(?:/|$)", path, re.I):
        return None
    return raw

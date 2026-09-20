from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch
import uuid

import pytest
from starlette.requests import Request

from app.db import SessionLocal
from app.models import Member, MemberDocument, MemberStatus, Organization
from app.routes.org_admin import list_org_members
from app.services.member_search import is_similar_member


@pytest.mark.parametrize("search,email", [
    ("mario.rossi", "mariu.rossi@example.com"),
    ("mario.rossi", "mari.rossi@example.com"),
    ("mario.rossi", "marioo.rossi@example.com"),
    ("mario.rossi", "mairo.rossi@example.com"),
    ("mario.rossi@example.com", "mariu.rossi@example.com"),
    ("mario.rossi@gmail.com", "mario.rossi@gamil.com"),
    ("mario.rossigmail.com", "mario.rossi@gmail.com"),
    ("mario.rossi#gmail.com", "mario.rossi@gmail.com"),
    ("mario", "mariu.rossi@example.com"),
])
def test_similar_email_accepts_one_typo(search, email):
    assert is_similar_member(search, "Socio", "", email)


@pytest.mark.parametrize("search,first,last,email", [
    ("Mariu Rossi", "Mario", "Rossi", None),
    ("Rossi Mariu", "Mario", "Rossi", None),
    ("Maria Anna De Rosi", "Maria Anna", "De Rossi", None),
    ("Mariu Ros", "Mario", "Rossi", None),
])
def test_similar_names_match_in_either_order(search, first, last, email):
    assert is_similar_member(search, first, last, email)


@pytest.mark.parametrize("search,first,last,email", [
    ("mario.rossi@example.com", "Mario", "Rossi", "carlo.bianchi@example.com"),
    ("mario.rossi@gmail.com", "Mario", "Rossi", "mario.rossi@yahoo.com"),
    ("mario.rossi", "Socio", "", "mariu.rassi@example.com"),
    ("Mariu Rassi", "Mario", "Rossi", None),
    ("Lea", "Leo", "Rossi", None),
    ("Mariu Mariu", "Mario", "Rossi", None),
])
def test_similar_search_rejects_unrelated_or_ambiguous_values(search, first, last, email):
    assert not is_similar_member(search, first, last, email)


@pytest.fixture
def search_registry():
    with SessionLocal() as db:
        suffix = uuid.uuid4().hex[:8]
        org = Organization(name="Search QA", slug=f"similarity-{suffix}", is_active=True)
        other = Organization(name="Other QA", slug=f"similarity-other-{suffix}", is_active=True)
        db.add_all([org, other])
        db.flush()
        now = datetime.utcnow()
        members = {}
        for index, (key, email) in enumerate([
            ("exact", "mario.rossi@example.com"),
            ("similar", "mariu.rossi@example.com"),
            ("transposed", "mairo.rossi@example.com"),
            ("unrelated", "carlo.bianchi@example.com"),
            ("two_errors", "mariu.rassi@example.com"),
            ("other", "marioo.rossi@example.com"),
            ("expired", "mari.rossi@example.com"),
            ("deleted", "mari.rossi@example.net"),
            ("name", "elsewhere@example.org"),
        ]):
            member = Member(
                org_id=other.id if key == "other" else org.id,
                first_name="Mario" if key == "name" else "Socio",
                last_name="Rossi" if key == "name" else "",
                email=email,
                status=MemberStatus.ACTIVE,
                card_year=now.year - 1 if key == "expired" else now.year,
                card_no=81000 + index,
                joined_at=now + timedelta(seconds=index),
                deleted_at=now if key == "deleted" else None,
                is_manual=key == "similar",
                password_hash="qa-placeholder" if key == "similar" else None,
            )
            members[key] = member
            db.add(member)
        db.flush()
        db.add(MemberDocument(member_id=members["similar"].id, doc_type="identity", status="approved"))
        db.commit()
        request = Request({"type": "http", "method": "GET", "path": "/api/org-admin/members", "headers": []})
        with patch("app.routes.org_admin._get_current_org_admin", return_value=SimpleNamespace(org_id=org.id, organization=org)):
            def search(q, **kwargs):
                return list_org_members(request, q=q, db=db, **{"status": "active", **kwargs})
            yield db, members, search


def test_similarity_search_paginates_exact_before_newer_suggestions(search_registry):
    db, members, search = search_registry
    before = [(m.id, m.email, m.card_no, m.joined_at) for m in members.values()]
    expected = [("exact", "exact"), ("transposed", "similar"), ("similar", "similar")]
    for offset, (key, match_type) in enumerate(expected):
        result = search("mario.rossi", limit=1, offset=offset)
        assert result["total"] == 3
        assert [(row["id"], row["search_match"]) for row in result["items"]] == [(members[key].id, match_type)]
    combined = search("mario.rossi", limit=2, offset=0)
    assert [row["id"] for row in combined["items"]] == [members["exact"].id, members["transposed"].id]
    assert search("mario.rossi", limit=1, offset=3)["items"] == []
    assert search("nobody.zeta@example.org")["total"] == 0
    db.expire_all()
    assert [(m.id, m.email, m.card_no, m.joined_at) for m in members.values()] == before


def test_similarity_preserves_all_filters_and_name_search(search_registry):
    _, members, search = search_registry
    for filters, expected in [
        ({"source": "manual"}, ["similar"]),
        ({"access": "with"}, ["similar"]),
        ({"docs": "approved"}, ["similar"]),
        ({"status": "expired"}, ["expired"]),
        ({"status": "all", "order": "joined_at_asc"}, ["exact", "similar", "transposed", "expired", "deleted"]),
    ]:
        result = search("mario.rossi", **filters)
        assert result["total"] == len(expected)
        assert [row["id"] for row in result["items"]] == [members[key].id for key in expected]
    result = search("Rossi Mariu")
    assert [(row["id"], row["search_match"]) for row in result["items"]] == [(members["name"].id, "similar")]


def test_similarity_does_not_expand_short_numeric_or_literal_wildcard_queries(search_registry):
    _, members, search = search_registry
    result = search("81001")
    assert [row["id"] for row in result["items"]] == [members["similar"].id]
    assert result["items"][0]["search_match"] == "exact"
    for query in ("Sociu%", "So", "%", "_", " "):
        result = search(query)
        assert all(row.get("search_match") != "similar" for row in result["items"])
    assert search("%")["total"] == 0
    assert search("_")["total"] == 0


def test_email_domain_typos_do_not_match_other_addresses_at_same_provider(search_registry):
    _, members, search = search_registry
    result = search("mariu.rossi@examlpe.com")
    assert [(row["id"], row["search_match"]) for row in result["items"]] == [(members["similar"].id, "similar")]
    without_at = search("mariu.rossiexample.com")
    assert [(row["id"], row["search_match"]) for row in without_at["items"]] == [(members["similar"].id, "similar")]

"""Tenant-filtered member search with conservative, single-typo suggestions.

The caller supplies the authorized, filtered and ordered query. Only scalar
candidate fields are streamed for comparison; full entities are loaded for the
requested page. No database extension or full registry materialization is needed.
"""

from __future__ import annotations

import re

from sqlalchemy import String, and_, cast, func, or_
from sqlalchemy.orm import Query

from app.models import Member


def normalize_member_search(value: str | None) -> str:
    return " ".join((value or "").split())


def _like_literal(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _contains(column, value: str):
    return column.ilike(f"%{_like_literal(value)}%", escape="\\")


def _exact_match(search: str):
    return or_(
        and_(*(
            or_(_contains(Member.first_name, term), _contains(Member.last_name, term))
            for term in search.split()
        )),
        _contains(Member.email, search),
        _contains(Member.fiscal_code, search),
        _contains(cast(Member.card_no, String), search),
        _contains(cast(Member.card_year, String), search),
    )


def _allows_typo(term: str) -> bool:
    return len(term) >= 4 and sum(char.isalpha() for char in term) >= 3


def _one_typo(left: str, right: str) -> bool:
    """One insertion, deletion, substitution or adjacent transposition, O(n)."""
    if abs(len(left) - len(right)) > 1:
        return False
    if left == right:
        return True
    index = 0
    while index < min(len(left), len(right)) and left[index] == right[index]:
        index += 1
    if len(left) == len(right):
        return left[index + 1:] == right[index + 1:] or (
            index + 1 < len(left)
            and left[index] == right[index + 1]
            and left[index + 1] == right[index]
            and left[index + 2:] == right[index + 2:]
        )
    if len(left) > len(right):
        return left[index + 1:] == right[index:]
    return left[index:] == right[index + 1:]


def _word_cost(term: str, word: str) -> int:
    if term in word:
        return 0
    return 1 if _allows_typo(term) and _one_typo(term, word) else 2


def _words_match(terms: list[str], words: list[str]) -> bool:
    # Each query word must match a distinct name word; one typo in total.
    choices = [
        [(index, cost) for index, word in enumerate(words)
         if (cost := _word_cost(term, word)) <= 1]
        for term in terms
    ]
    if any(not options for options in choices):
        return False
    choices.sort(key=len)

    def visit(position: int, used: int, cost: int) -> bool:
        if position == len(choices):
            return True
        return any(
            not used & (1 << index)
            and cost + extra <= 1
            and visit(position + 1, used | (1 << index), cost + extra)
            for index, extra in choices[position]
        )

    return visit(0, 0, 0)


def is_similar_member(search: str, first_name: str | None, last_name: str | None, email: str | None) -> bool:
    search = search.lower()
    email = (email or "").strip().lower()
    if _one_typo(search, email):
        return True
    if "@" in search:
        # Compare the whole address, never only a shared email provider.
        return False
    terms = search.split()
    name_words = f"{first_name or ''} {last_name or ''}".lower().split()
    if _words_match(terms, name_words):
        return True
    if len(terms) != 1:
        return False
    local_part = email.partition("@")[0]
    return any(
        _word_cost(search, word) <= 1
        for word in [local_part, *re.split(r"[._+\-]", local_part)]
        if word
    )


def _candidate_match(search: str):
    """Cheap SQL prefilter without false negatives for a single typo.

    A single edit affects at most two of three fragments (a transposition can
    cross a boundary). At least one fragment must survive unchanged; Python
    checks the full value afterwards to reject unrelated candidates.
    """
    clauses = []
    terms = search.split()
    for term in terms:
        if _allows_typo(term):
            cut1, cut2 = len(term) // 3, 2 * len(term) // 3
            fragments = (term[:cut1], term[cut1:cut2], term[cut2:])
        else:
            fragments = (term,)
        columns = (Member.email,) if "@" in search else (Member.first_name, Member.last_name)
        if len(terms) == 1 and "@" not in search:
            columns += (Member.email,)
        clauses.append(or_(*(_contains(column, part) for column in columns for part in fragments)))
    return and_(*clauses)


def search_member_page(query: Query, search: str, *, limit: int, offset: int) -> tuple[list[Member], int, set[int]]:
    """Exact results first, then suggestions in the caller's stable order."""
    if not search:
        return query.offset(offset).limit(limit).all(), query.order_by(None).count(), set()

    exact = _exact_match(search)
    exact_query = query.filter(exact)
    exact_total = exact_query.order_by(None).count()
    similar_ids = []
    terms = search.split()
    if len(search) <= 254 and len(terms) <= 6 and any(_allows_typo(term) for term in terms):
        candidates = (
            query.filter(~func.coalesce(exact, False), _candidate_match(search))
            .with_entities(Member.id, Member.first_name, Member.last_name, Member.email)
            .yield_per(500)
        )
        for candidate in candidates:
            if is_similar_member(search, candidate.first_name, candidate.last_name, candidate.email):
                similar_ids.append(candidate.id)

    members = exact_query.offset(offset).limit(limit).all() if offset < exact_total else []
    similar_offset = max(0, offset - exact_total)
    page_ids = similar_ids[similar_offset:similar_offset + max(0, limit - len(members))]
    if page_ids:
        # Limit the IN clause to a single page even for a very large result set.
        members.extend(query.filter(Member.id.in_(page_ids)).all())
    return members, exact_total + len(similar_ids), set(page_ids)

from __future__ import annotations

import logging
import re
import time
from collections import defaultdict
from threading import Lock

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Organization, RechargeRequest, WhatsAppSession
from app.services.twilio_notifications import send_admin_sms_notification

logger = logging.getLogger(__name__)

try:
    from openai import OpenAI
except Exception:  # pragma: no cover - dependency missing only outside configured envs
    OpenAI = None

STATE_IDLE = "idle"
STATE_ORDER_ASSOC = "order_assoc"
STATE_ORDER_QTY = "order_qty"
STATE_ORDER_NOTES = "order_notes"

ORDER_KEYWORDS = (
    "ordino",
    "ordinare",
    "ricarica",
    "ricaricare",
    "tessera",
    "tessere",
    "lotto",
    "lotti",
    "nuove tessere",
)
NO_NOTES_VALUES = {"no", "n", "niente", "nulla", "null"}
CANCEL_VALUES = {"annulla", "cancel", "cancella", "reset"}
RESTART_ORDER_VALUES = {
    "ordino tessere",
    "ricarica tessere",
    "ordino lotto",
    "ordino lotti",
}


class DualWindowRateLimiter:
    def __init__(
        self,
        *,
        burst_max_requests: int,
        burst_window_seconds: int,
        sustained_max_requests: int,
        sustained_window_seconds: int,
    ) -> None:
        self._burst_max_requests = burst_max_requests
        self._burst_window_seconds = burst_window_seconds
        self._sustained_max_requests = sustained_max_requests
        self._sustained_window_seconds = sustained_window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        sustained_cutoff = now - self._sustained_window_seconds
        burst_cutoff = now - self._burst_window_seconds
        with self._lock:
            hits = [ts for ts in self._hits[key] if ts > sustained_cutoff]
            burst_hits = [ts for ts in hits if ts > burst_cutoff]
            if len(burst_hits) >= self._burst_max_requests:
                raise ValueError("burst_limit_exceeded")
            if len(hits) >= self._sustained_max_requests:
                raise ValueError("minute_limit_exceeded")
            hits.append(now)
            self._hits[key] = hits


whatsapp_bot_rate_limiter = DualWindowRateLimiter(
    burst_max_requests=1,
    burst_window_seconds=1,
    sustained_max_requests=20,
    sustained_window_seconds=60,
)


def _normalize_text(raw_value: str | None) -> str:
    return re.sub(r"\s+", " ", (raw_value or "").strip())


def _normalized_lower(raw_value: str | None) -> str:
    return _normalize_text(raw_value).lower()


def _slugify(raw_value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "-", _normalized_lower(raw_value)).strip("-")


def _contains_order_keyword(message: str) -> bool:
    normalized = _normalized_lower(message)
    return any(keyword in normalized for keyword in ORDER_KEYWORDS)


def _fallback_static_reply() -> str:
    return (
        "Ciao, sono l'assistente WhatsApp ASSONAM. "
        "Per ordinare tessere scrivi: ordino tessere."
    )


def _openai_fallback_reply(message: str) -> str:
    if not settings.OPENAI_API_KEY or OpenAI is None:
        return _fallback_static_reply()

    try:
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        completion = client.chat.completions.create(
            model=(settings.OPENAI_MODEL or "gpt-4o-mini").strip() or "gpt-4o-mini",
            temperature=0.4,
            max_tokens=300,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Sei l'assistente WhatsApp di ASSONAM. "
                        "Rispondi in italiano, in modo breve e utile. "
                        "Non inventare informazioni. "
                        "Se l'utente vuole ordinare o ricaricare tessere, "
                        "digli di scrivere esattamente: ordino tessere."
                    ),
                },
                {
                    "role": "user",
                    "content": _normalize_text(message),
                },
            ],
        )
        reply = (
            completion.choices[0].message.content
            if completion and getattr(completion, "choices", None)
            else None
        )
        return _normalize_text(reply) or _fallback_static_reply()
    except Exception:
        logger.exception("whatsapp_bot_openai_fallback_failed")
        return _fallback_static_reply()


def _get_or_create_session(db: Session, wa_from: str) -> WhatsAppSession:
    session = (
        db.query(WhatsAppSession)
        .filter(WhatsAppSession.wa_from == wa_from)
        .first()
    )
    if session is not None:
        return session

    session = WhatsAppSession(
        wa_from=wa_from,
        state=STATE_IDLE,
        data={},
    )
    db.add(session)
    db.flush()
    return session


def _reset_session(session: WhatsAppSession) -> None:
    session.state = STATE_IDLE
    session.data = {}


def _touch_session(session: WhatsAppSession) -> None:
    session.updated_at = session.updated_at  # keep SQLAlchemy dirty tracking stable


def _serialize_candidates(candidates: list[Organization]) -> list[dict[str, str | int]]:
    return [
        {
            "id": candidate.id,
            "name": candidate.name,
            "slug": candidate.slug,
        }
        for candidate in candidates[:5]
    ]


def _render_candidates_reply(candidates: list[dict[str, str | int]]) -> str:
    lines = ["Ho trovato piu associazioni. Rispondi con il numero corretto:"]
    for index, candidate in enumerate(candidates, start=1):
        lines.append(f"{index}. {candidate['name']} ({candidate['slug']})")
    return "\n".join(lines)


def _lookup_associations(db: Session, raw_query: str) -> list[Organization]:
    query = _normalize_text(raw_query)
    if not query:
        return []

    normalized_query = query.lower()
    slug_query = _slugify(query)
    base_filters = [
        Organization.deleted_at.is_(None),
    ]

    exact_matches = (
        db.query(Organization)
        .filter(
            *base_filters,
            or_(
                func.lower(Organization.slug) == slug_query,
                func.lower(Organization.name) == normalized_query,
                func.lower(func.coalesce(Organization.club_display_name, "")) == normalized_query,
            ),
        )
        .order_by(Organization.name.asc(), Organization.id.asc())
        .limit(5)
        .all()
    )
    if exact_matches:
        return exact_matches

    pattern = f"%{query}%"
    return (
        db.query(Organization)
        .filter(
            *base_filters,
            or_(
                Organization.slug.ilike(f"%{slug_query}%"),
                Organization.name.ilike(pattern),
                Organization.club_display_name.ilike(pattern),
            ),
        )
        .order_by(Organization.name.asc(), Organization.id.asc())
        .limit(5)
        .all()
    )


def _select_candidate_from_message(
    session: WhatsAppSession,
    message: str,
) -> dict[str, str | int] | None:
    candidates = session.data.get("candidates") if isinstance(session.data, dict) else None
    if not isinstance(candidates, list) or not candidates:
        return None

    match = re.fullmatch(r"\s*(\d+)\s*", message or "")
    if not match:
        return None

    selected_index = int(match.group(1))
    if selected_index < 1 or selected_index > len(candidates):
        return None
    candidate = candidates[selected_index - 1]
    return candidate if isinstance(candidate, dict) else None


def _has_candidate_list(session: WhatsAppSession) -> bool:
    candidates = session.data.get("candidates") if isinstance(session.data, dict) else None
    return isinstance(candidates, list) and bool(candidates)


def _parse_requested_cards(message: str) -> int | None:
    match = re.search(r"(\d{1,4}|\d{5})", message or "")
    if not match:
        return None
    quantity = int(match.group(1))
    if quantity < 1 or quantity > 5000:
        return None
    return quantity


def _store_selected_association(
    session: WhatsAppSession,
    association: Organization | dict[str, str | int],
) -> None:
    if isinstance(association, Organization):
        association_id = association.id
        association_name = association.name
        association_slug = association.slug
    else:
        association_id = int(association["id"])
        association_name = str(association["name"])
        association_slug = str(association["slug"])

    session.data = {
        "association_id": association_id,
        "association_name": association_name,
        "association_slug": association_slug,
    }
    session.state = STATE_ORDER_QTY


def _handle_order_assoc(
    db: Session,
    session: WhatsAppSession,
    message: str,
) -> str:
    selected_candidate = _select_candidate_from_message(session, message)
    if selected_candidate is not None:
        _store_selected_association(session, selected_candidate)
        return (
            f"Perfetto, selezionata {selected_candidate['name']}. "
            "Quante tessere ti servono? Inserisci un numero da 1 a 5000."
        )
    if _has_candidate_list(session) and re.fullmatch(r"\s*\d+\s*", message or ""):
        candidates = session.data.get("candidates") if isinstance(session.data, dict) else []
        return _render_candidates_reply(candidates)

    candidates = _lookup_associations(db, message)
    if not candidates:
        session.data = {}
        return "Non ho trovato l'associazione. Scrivi nome o slug e provo di nuovo."

    if len(candidates) == 1:
        _store_selected_association(session, candidates[0])
        return (
            f"Ho trovato {candidates[0].name}. "
            "Quante tessere ti servono? Inserisci un numero da 1 a 5000."
        )

    serialized_candidates = _serialize_candidates(candidates)
    session.state = STATE_ORDER_ASSOC
    session.data = {"candidates": serialized_candidates}
    return _render_candidates_reply(serialized_candidates)


def _handle_order_qty(session: WhatsAppSession, message: str) -> str:
    quantity = _parse_requested_cards(message)
    if quantity is None:
        return "Indicami un numero valido da 1 a 5000."

    data = dict(session.data or {})
    data["requested_cards"] = quantity
    session.data = data
    session.state = STATE_ORDER_NOTES
    return (
        "Perfetto. Vuoi aggiungere una nota? "
        "Se non serve, rispondi con no."
    )


def _handle_order_notes(
    db: Session,
    session: WhatsAppSession,
    *,
    wa_from: str,
    profile_name: str | None,
    message: str,
) -> str:
    data = dict(session.data or {})
    association_name = _normalize_text(str(data.get("association_name") or ""))
    requested_cards = data.get("requested_cards")
    if not association_name or not isinstance(requested_cards, int):
        _reset_session(session)
        return "Non ho recuperato i dati della richiesta. Scrivi di nuovo: ordino tessere."

    notes = _normalize_text(message)
    if _normalized_lower(message) in NO_NOTES_VALUES:
        notes = None

    recharge_request = RechargeRequest(
        association_id=int(data["association_id"]) if data.get("association_id") else None,
        association_name=association_name,
        requester_whatsapp=wa_from,
        requester_profile_name=_normalize_text(profile_name) or None,
        requested_cards=requested_cards,
        notes=notes,
    )
    db.add(recharge_request)
    db.flush()

    _reset_session(session)

    sms_message = (
        f"Nuovo ordine tessere: {association_name}, {requested_cards} tessere, "
        f"richiedente {wa_from}."
    )
    try:
        sms_sid = send_admin_sms_notification(sms_message)
        if sms_sid:
            logger.info(
                "whatsapp_recharge_request_admin_sms_sent request_id=%s sms_sid=%s",
                recharge_request.id,
                sms_sid,
            )
    except Exception:
        logger.exception(
            "whatsapp_recharge_request_admin_sms_failed request_id=%s",
            recharge_request.id,
        )

    return (
        f"Richiesta registrata: {requested_cards} tessere per {association_name}. "
        "Ti ricontatteremo al piu presto."
    )


def handle_whatsapp_bot_message(
    db: Session,
    *,
    wa_from: str,
    body: str,
    profile_name: str | None = None,
) -> str:
    normalized_from = _normalize_text(wa_from)
    normalized_body = _normalize_text(body)
    lowered_body = _normalized_lower(body)

    try:
        whatsapp_bot_rate_limiter.check(normalized_from)
    except ValueError:
        return "Stai scrivendo troppo velocemente. Riprova tra qualche secondo."

    session = _get_or_create_session(db, normalized_from)

    if lowered_body in CANCEL_VALUES:
        _reset_session(session)
        db.commit()
        return "Operazione annullata. Se vuoi ripartire scrivi: ordino tessere."

    if lowered_body in RESTART_ORDER_VALUES:
        session.state = STATE_ORDER_ASSOC
        session.data = {}
        db.commit()
        return "Va bene. Per quale associazione vuoi ordinare tessere? Scrivi nome o slug."

    if session.state == STATE_IDLE:
        if _contains_order_keyword(normalized_body):
            session.state = STATE_ORDER_ASSOC
            session.data = {}
            db.commit()
            return "Va bene. Per quale associazione vuoi ordinare tessere? Scrivi nome o slug."

        db.commit()
        return _openai_fallback_reply(normalized_body)

    if session.state == STATE_ORDER_ASSOC:
        reply = _handle_order_assoc(db, session, normalized_body)
        db.commit()
        return reply

    if session.state == STATE_ORDER_QTY:
        reply = _handle_order_qty(session, normalized_body)
        db.commit()
        return reply

    if session.state == STATE_ORDER_NOTES:
        reply = _handle_order_notes(
            db,
            session,
            wa_from=normalized_from,
            profile_name=profile_name,
            message=normalized_body,
        )
        db.commit()
        return reply

    logger.warning(
        "whatsapp_bot_unknown_state wa_from=%s state=%s",
        normalized_from,
        session.state,
    )
    _reset_session(session)
    db.commit()
    return "Non ho capito dove eravamo rimasti. Scrivi di nuovo: ordino tessere."

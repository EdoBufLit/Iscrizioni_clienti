from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
import re
import unicodedata
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from cryptography.fernet import Fernet, InvalidToken
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    AdminUser,
    AnnualMembershipTerm,
    Booking,
    FormSubmission,
    Member,
    MemberContactChange,
    MemberDocument,
    MemberImportBatch,
    MemberImportRow,
    MemberPayment,
    MemberNotification,
    MemberStatus,
    MembershipPayment,
    Organization,
    OperationLog,
    SignupSource,
    Token,
)
from app.services.card_inventory import compute_org_card_stock
from app.services.fiscal_code import validate_fiscal_code
from app.services.member_membership import (
    apply_membership_defaults,
    normalize_membership_type,
    organization_allows_custom_membership_types,
)
from app.services.membership_payments import (
    maybe_fulfill_member_card,
    organization_requires_membership_payment,
)


MAX_IMPORT_BYTES = 5 * 1024 * 1024
MAX_IMPORT_ROWS = 5_000
IMPORT_FIELDS = (
    "first_name",
    "last_name",
    "email",
    "phone",
    "fiscal_code",
    "joined_at",
    "membership_type",
    "membership_fee_snapshot",
    "internal_notes",
)
_EMAIL_ADAPTER = TypeAdapter(EmailStr)
_HEADER_ALIASES = {
    "nome": "first_name",
    "first_name": "first_name",
    "cognome": "last_name",
    "last_name": "last_name",
    "email": "email",
    "mail": "email",
    "telefono": "phone",
    "phone": "phone",
    "cellulare": "phone",
    "codice_fiscale": "fiscal_code",
    "codicefiscale": "fiscal_code",
    "fiscal_code": "fiscal_code",
    "data_iscrizione": "joined_at",
    "joined_at": "joined_at",
    "tipo_tessera": "membership_type",
    "membership_type": "membership_type",
    "quota": "membership_fee_snapshot",
    "membership_fee": "membership_fee_snapshot",
    "membership_fee_snapshot": "membership_fee_snapshot",
    "note": "internal_notes",
    "internal_notes": "internal_notes",
}


class MemberImportError(ValueError):
    pass


def _cipher() -> Fernet:
    digest = hashlib.sha256(f"member-import:{settings.SECRET_KEY}".encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _encrypt_payload(payload: dict) -> str:
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return _cipher().encrypt(raw).decode("ascii")


def _decrypt_payload(ciphertext: str) -> dict:
    try:
        raw = _cipher().decrypt(ciphertext.encode("ascii"))
        payload = json.loads(raw.decode("utf-8"))
    except (InvalidToken, UnicodeError, ValueError, json.JSONDecodeError) as exc:
        raise MemberImportError("I dati temporanei dell'importazione non sono più leggibili") from exc
    if not isinstance(payload, dict):
        raise MemberImportError("Riga di importazione non valida")
    return payload


def _normalize_header(value: str) -> str:
    ascii_value = "".join(
        character
        for character in unicodedata.normalize("NFKD", value or "")
        if not unicodedata.combining(character)
    )
    return re.sub(r"[^a-z0-9]+", "_", ascii_value.strip().lower()).strip("_")


def _parse_date(value: str) -> date:
    normalized = value.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(normalized, fmt).date()
        except ValueError:
            continue
    raise ValueError("Usa una data nel formato AAAA-MM-GG o GG/MM/AAAA")


def _row_error(field: str, code: str, message: str) -> dict:
    return {"field": field, "code": code, "message": message}


def _normalize_row(raw: dict[str, str], *, org: Organization) -> tuple[dict, list[dict]]:
    payload = {field: (raw.get(field) or "").strip() for field in IMPORT_FIELDS}
    errors: list[dict] = []
    for field, label in (("first_name", "Nome"), ("last_name", "Cognome")):
        if not payload[field]:
            errors.append(_row_error(field, "required", f"{label} obbligatorio"))
        elif len(payload[field]) > 120:
            errors.append(_row_error(field, "too_long", f"{label} troppo lungo"))

    if payload["email"]:
        try:
            payload["email"] = str(_EMAIL_ADAPTER.validate_python(payload["email"])).lower()
        except ValidationError:
            errors.append(_row_error("email", "invalid", "Indirizzo email non valido"))
    if payload["phone"]:
        digits = re.sub(r"\D+", "", payload["phone"])
        if not 7 <= len(digits) <= 15:
            errors.append(_row_error("phone", "invalid", "Numero di telefono non valido"))

    if payload["fiscal_code"]:
        validation = validate_fiscal_code(fiscal_code=payload["fiscal_code"])
        if not validation.is_formally_valid:
            errors.append(_row_error("fiscal_code", "invalid", "Codice fiscale non valido"))
        else:
            payload["fiscal_code"] = validation.normalized

    if payload["joined_at"]:
        try:
            payload["joined_at"] = _parse_date(payload["joined_at"]).isoformat()
        except ValueError as exc:
            errors.append(_row_error("joined_at", "invalid", str(exc)))
    else:
        payload["joined_at"] = datetime.utcnow().date().isoformat()

    raw_membership_type = (payload["membership_type"] or "annual").strip().lower()
    if raw_membership_type not in {"annual", "temporary"}:
        errors.append(_row_error("membership_type", "invalid", "Tipo tessera non valido"))
        payload["membership_type"] = "annual"
    else:
        payload["membership_type"] = normalize_membership_type(raw_membership_type)
    if (
        payload["membership_type"] == "temporary"
        and not organization_allows_custom_membership_types(org)
    ):
        errors.append(
            _row_error(
                "membership_type",
                "not_enabled",
                "Tessera temporanea non abilitata per l'associazione",
            )
        )

    if payload["membership_fee_snapshot"]:
        try:
            amount = Decimal(payload["membership_fee_snapshot"].replace(",", "."))
            if amount <= 0:
                raise InvalidOperation
            payload["membership_fee_snapshot"] = str(amount.quantize(Decimal("0.01")))
        except (InvalidOperation, ValueError):
            errors.append(_row_error("membership_fee_snapshot", "invalid", "Quota non valida"))
    else:
        payload["membership_fee_snapshot"] = None
    if len(payload["internal_notes"]) > 2_000:
        errors.append(_row_error("internal_notes", "too_long", "Note troppo lunghe"))
    return payload, errors


def parse_member_import(
    db: Session,
    *,
    organization: Organization,
    admin: AdminUser,
    content: bytes,
) -> MemberImportBatch:
    if not content:
        raise MemberImportError("Il file CSV è vuoto")
    if len(content) > MAX_IMPORT_BYTES:
        raise MemberImportError("Il file CSV supera il limite di 5 MB")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise MemberImportError("Salva il file in formato UTF-8") from exc

    sample = text[:16_384]
    try:
        delimiter = csv.Sniffer().sniff(sample, delimiters=",;").delimiter
    except csv.Error:
        delimiter = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    if not reader.fieldnames:
        raise MemberImportError("Intestazione CSV mancante")
    mapped_headers: dict[str, str] = {}
    seen_canonical: set[str] = set()
    for original in reader.fieldnames:
        canonical = _HEADER_ALIASES.get(_normalize_header(original))
        if canonical and canonical not in seen_canonical:
            mapped_headers[original] = canonical
            seen_canonical.add(canonical)
    missing = {"first_name", "last_name"} - seen_canonical
    if missing:
        raise MemberImportError("Il CSV deve contenere almeno le colonne nome e cognome")

    source_rows = list(reader)
    if len(source_rows) > MAX_IMPORT_ROWS:
        raise MemberImportError("Il CSV supera il limite di 5.000 righe")
    if not source_rows:
        raise MemberImportError("Il CSV non contiene righe da importare")

    existing_emails = {
        str(value).strip().lower()
        for (value,) in db.query(Member.email)
        .filter(
            Member.org_id == organization.id,
            Member.deleted_at.is_(None),
            Member.email.isnot(None),
        )
        .all()
        if value
    }
    existing_fiscal_codes = {
        str(value).strip().upper()
        for (value,) in db.query(Member.fiscal_code)
        .filter(
            Member.org_id == organization.id,
            Member.deleted_at.is_(None),
            Member.fiscal_code.isnot(None),
        )
        .all()
        if value
    }
    seen_emails: set[str] = set()
    seen_fiscal_codes: set[str] = set()

    batch = MemberImportBatch(
        org_id=organization.id,
        created_by_admin_id=admin.id,
        file_sha256=hashlib.sha256(content).hexdigest(),
        delimiter=delimiter,
        status="previewed",
        total_rows=len(source_rows),
    )
    db.add(batch)
    db.flush()

    valid_count = 0
    for row_number, raw in enumerate(source_rows, start=2):
        canonical_raw = {
            canonical: raw.get(original, "")
            for original, canonical in mapped_headers.items()
        }
        payload, errors = _normalize_row(canonical_raw, org=organization)
        email = str(payload.get("email") or "").lower()
        fiscal_code = str(payload.get("fiscal_code") or "").upper()
        if email:
            if email in seen_emails:
                errors.append(_row_error("email", "duplicate_file", "Email duplicata nel file"))
            elif email in existing_emails:
                errors.append(_row_error("email", "duplicate_existing", "Email già presente nell'associazione"))
            seen_emails.add(email)
        if fiscal_code:
            if fiscal_code in seen_fiscal_codes:
                errors.append(_row_error("fiscal_code", "duplicate_file", "Codice fiscale duplicato nel file"))
            elif fiscal_code in existing_fiscal_codes:
                errors.append(_row_error("fiscal_code", "duplicate_existing", "Codice fiscale già presente nell'associazione"))
            seen_fiscal_codes.add(fiscal_code)

        status = "invalid" if errors else "valid"
        if status == "valid":
            valid_count += 1
        row_json = json.dumps(canonical_raw, sort_keys=True, ensure_ascii=False)
        db.add(
            MemberImportRow(
                batch_id=batch.id,
                row_number=row_number,
                payload_encrypted=_encrypt_payload(payload),
                row_sha256=hashlib.sha256(row_json.encode("utf-8")).hexdigest(),
                errors_json=errors,
                status=status,
            )
        )
    batch.valid_rows = valid_count
    batch.error_rows = len(source_rows) - valid_count
    db.flush()
    return batch


def serialize_import_batch(
    batch: MemberImportBatch,
    *,
    include_rows: bool = True,
    row_limit: int = 200,
) -> dict:
    payload = {
        "id": batch.id,
        "status": batch.status,
        "total_rows": batch.total_rows,
        "valid_rows": batch.valid_rows,
        "error_rows": batch.error_rows,
        "imported_rows": batch.imported_rows,
        "activation_mode": batch.activation_mode,
        "commit_policy": batch.commit_policy,
        "created_at": batch.created_at.isoformat() if batch.created_at else None,
        "committed_at": batch.committed_at.isoformat() if batch.committed_at else None,
        "rolled_back_at": batch.rolled_back_at.isoformat() if batch.rolled_back_at else None,
    }
    if include_rows:
        rows = []
        visible_rows = list(batch.rows[: max(1, row_limit)])
        for row in visible_rows:
            preview = {}
            if row.status in {"valid", "invalid"} and row.payload_encrypted:
                try:
                    data = _decrypt_payload(row.payload_encrypted)
                    preview = {
                        "first_name": data.get("first_name"),
                        "last_name": data.get("last_name"),
                        "email": data.get("email"),
                        "fiscal_code": data.get("fiscal_code"),
                    }
                except MemberImportError:
                    preview = {}
            rows.append(
                {
                    "id": row.id,
                    "row_number": row.row_number,
                    "status": row.status,
                    "errors": row.errors_json or [],
                    "member_id": row.member_id,
                    "preview": preview,
                }
            )
        payload["rows"] = rows
        payload["rows_truncated"] = len(batch.rows) > len(visible_rows)
    return payload


def _claim_member_import_batch(db: Session, *, batch: MemberImportBatch) -> bool:
    """Atomically reserve a preview for the current transaction.

    ``committing`` remains an in-transaction state: success replaces it with
    ``committed`` before commit, while rollback restores ``previewed``. This
    protects even rows without email or fiscal code, where uniqueness checks
    cannot stop two stale workers from creating duplicate members.

    Return ``False`` when another transaction has already completed the batch,
    preserving the existing idempotent response contract.
    """
    claimed_rows = (
        db.query(MemberImportBatch)
        .filter(
            MemberImportBatch.id == batch.id,
            MemberImportBatch.org_id == batch.org_id,
            MemberImportBatch.status == "previewed",
        )
        .update(
            {MemberImportBatch.status: "committing"},
            synchronize_session=False,
        )
    )
    if claimed_rows == 1:
        batch.status = "committing"
        return True

    # PostgreSQL waits for a concurrent UPDATE before returning zero rows. Read
    # the durable state instead of trusting the stale ORM instance afterwards.
    db.expire(batch)
    db.refresh(batch)
    if batch.status == "committed":
        return False
    raise MemberImportError("Questa importazione è già in elaborazione")


def commit_member_import(
    db: Session,
    *,
    batch: MemberImportBatch,
    admin: AdminUser,
    policy: str,
    activation_mode: str,
) -> int:
    if batch.status == "committed":
        return batch.imported_rows
    if batch.status != "previewed":
        raise MemberImportError("Questa importazione non può essere confermata")
    if policy not in {"all_or_nothing", "valid_only"}:
        raise MemberImportError("Politica di importazione non valida")
    if activation_mode not in {"pending", "active"}:
        raise MemberImportError("Modalità di importazione non valida")
    if policy == "all_or_nothing" and batch.error_rows:
        raise MemberImportError("Correggi tutte le righe non valide oppure scegli Solo righe valide")
    organization = batch.organization
    rows = [row for row in batch.rows if row.status == "valid"]
    if not rows:
        raise MemberImportError("Non ci sono righe valide da importare")
    if activation_mode == "active":
        if organization_requires_membership_payment(organization):
            raise MemberImportError("L'importazione attiva non è disponibile quando il pagamento è obbligatorio")
        stock = compute_org_card_stock(db, organization.id)
        if stock["remaining"] < len(rows):
            raise MemberImportError(
                f"Tessere insufficienti: servono {len(rows)}, disponibili {stock['remaining']}"
            )

    if not _claim_member_import_batch(db, batch=batch):
        return batch.imported_rows

    now = datetime.utcnow()
    created = 0
    for row in rows:
        data = _decrypt_payload(row.payload_encrypted)
        email = data.get("email") or None
        fiscal_code = data.get("fiscal_code") or None
        if email and db.query(Member.id).filter(
            Member.org_id == organization.id,
            Member.deleted_at.is_(None),
            func.lower(Member.email) == str(email).lower(),
        ).first():
            raise MemberImportError(f"Riga {row.row_number}: email già presente; genera una nuova anteprima")
        if fiscal_code and db.query(Member.id).filter(
            Member.org_id == organization.id,
            Member.deleted_at.is_(None),
            func.upper(Member.fiscal_code) == str(fiscal_code).upper(),
        ).first():
            raise MemberImportError(f"Riga {row.row_number}: codice fiscale già presente; genera una nuova anteprima")

        joined_at = datetime.combine(date.fromisoformat(data["joined_at"]), datetime.min.time())
        member = Member(
            org_id=organization.id,
            first_name=data["first_name"],
            last_name=data["last_name"],
            email=email,
            phone=data.get("phone") or None,
            fiscal_code=fiscal_code,
            status=MemberStatus.PENDING_DOCS,
            joined_at=joined_at,
            internal_notes=data.get("internal_notes") or None,
            is_manual=True,
            signup_source=SignupSource.ADMIN.value,
            import_batch_id=batch.id,
        )
        if activation_mode == "active":
            member.decision_at = now
            member.decision_by_admin_id = admin.id
            member.decision_notes = "Approvazione esplicita durante importazione CSV"
        db.add(member)
        db.flush()
        apply_membership_defaults(
            member=member,
            org=organization,
            membership_type=data.get("membership_type") or "annual",
            reference_time=joined_at,
            membership_fee_snapshot=data.get("membership_fee_snapshot"),
        )
        if activation_mode == "active":
            fulfillment = maybe_fulfill_member_card(
                db=db,
                member=member,
                org=organization,
                request=None,
            )
            if not fulfillment.issued_card and member.card_no is None:
                raise MemberImportError(
                    f"Riga {row.row_number}: tessera non assegnabile ({fulfillment.reason})"
                )
        row.member_id = member.id
        row.status = "imported"
        row.payload_encrypted = _encrypt_payload({})
        created += 1

    for invalid_row in (row for row in batch.rows if row.status == "invalid"):
        invalid_row.status = "skipped"
        invalid_row.payload_encrypted = _encrypt_payload({})
    batch.status = "committed"
    batch.imported_rows = created
    batch.activation_mode = activation_mode
    batch.commit_policy = policy
    batch.committed_at = now
    db.flush()
    return created


def rollback_member_import(db: Session, *, batch: MemberImportBatch) -> int:
    if batch.status == "rolled_back":
        return 0
    if batch.status != "committed":
        raise MemberImportError("Solo un'importazione completata può essere annullata")
    if batch.activation_mode != "pending":
        raise MemberImportError("Le importazioni con tessere attive non possono essere annullate in blocco")
    members = db.query(Member).filter(Member.import_batch_id == batch.id).all()
    member_ids = [member.id for member in members]
    if member_ids:
        downstream = any(
            (
                db.query(model.id)
                .filter(getattr(model, foreign_key).in_(member_ids))
                .first()
                is not None
            )
            for model, foreign_key in (
                (MemberDocument, "member_id"),
                (MemberPayment, "member_id"),
                (MembershipPayment, "socio_id"),
                (Token, "member_id"),
                (AnnualMembershipTerm, "member_id"),
                (Booking, "member_id"),
                (FormSubmission, "submitted_by_user_id"),
                (MemberNotification, "member_id"),
                (MemberContactChange, "member_id"),
            )
        )
        audited_change = (
            db.query(OperationLog.id)
            .filter(
                OperationLog.entity_type == "member",
                OperationLog.entity_id.in_(member_ids),
                OperationLog.created_at >= batch.committed_at,
            )
            .first()
            is not None
        )
        if downstream or audited_change or any(member.card_no is not None or member.password_hash for member in members):
            raise MemberImportError("Annullamento bloccato: uno o più soci hanno già attività collegate")
    count = len(members)
    for row in batch.rows:
        row.member_id = None
        row.status = "rolled_back" if row.status == "imported" else row.status
    for member in members:
        db.delete(member)
    batch.status = "rolled_back"
    batch.rolled_back_at = datetime.utcnow()
    db.flush()
    return count


def member_import_template() -> io.StringIO:
    output = io.StringIO()
    output.write("\ufeff")
    writer = csv.writer(output, delimiter=";")
    writer.writerow(
        [
            "nome",
            "cognome",
            "email",
            "telefono",
            "codice_fiscale",
            "data_iscrizione",
            "tipo_tessera",
            "quota",
            "note",
        ]
    )
    writer.writerow(["Mario", "Rossi", "mario.rossi@example.com", "+393331234567", "", "2026-07-18", "annual", "10,00", ""])
    output.seek(0)
    return output

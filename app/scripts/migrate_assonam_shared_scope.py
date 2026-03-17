from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
import sys
from typing import Any

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[2]))

from app.db import SessionLocal
from app.services.shared_scope_migration import run_shared_scope_migration


def _load_allowlist(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Allowlist non trovata: {path}")

    suffix = path.suffix.lower()
    if suffix == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            for key in ("organizations", "orgs", "items"):
                value = payload.get(key)
                if isinstance(value, list):
                    return value
        raise ValueError("JSON allowlist non valido: attesa lista o chiave organizations/orgs/items.")

    if suffix == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            return [dict(row) for row in reader]

    raise ValueError("Formato allowlist non supportato. Usa .json o .csv")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Migrazione operativa controllata delle org storiche ASSONAM verso "
            "lo scope condiviso ASSONAM_CENTRAL."
        )
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Path del file allowlist JSON o CSV con la lista esplicita delle org approvate.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Applica le modifiche. Senza questo flag lo script resta in dry-run.",
    )
    parser.add_argument(
        "--org-id",
        type=int,
        help="Limita l'analisi/apply a una sola organizzazione già presente nell'allowlist.",
    )
    parser.add_argument(
        "--report-out",
        help="Path opzionale per salvare il report JSON completo.",
    )
    parser.add_argument(
        "--fail-on-ambiguous",
        action="store_true",
        help="Esce con errore se trova batch ambigui/sensibili invece di saltarli.",
    )
    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    allowlist_path = Path(args.input)
    allowlist_entries = _load_allowlist(allowlist_path)

    db = SessionLocal()
    try:
        report = run_shared_scope_migration(
            db,
            allowlist_entries=allowlist_entries,
            apply=bool(args.apply),
            org_id=args.org_id,
            fail_on_ambiguous=bool(args.fail_on_ambiguous),
        )
    finally:
        db.close()

    serialized = json.dumps(report, indent=2, ensure_ascii=False, default=str)
    print(serialized)

    if args.report_out:
        report_path = Path(args.report_out)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(serialized + "\n", encoding="utf-8")

    has_blockers = (
        report["summary"]["scope_missing"]
        or report["summary"]["ambiguous_batch_count"] > 0
        or any(
            row.get("blocks_auto_apply")
            for row in report.get("released_sensitive_batches", [])
        )
        or any(not row.get("safe_to_apply", False) for row in report.get("selected_orgs", []))
    )
    if args.fail_on_ambiguous and has_blockers:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Bounded-memory survey aggregates; individual submissions stay paginated."""
import json
import math
from sqlalchemy.orm import Session
from app.models import Form, FormSubmission


def survey_statistics(db: Session, form: Form) -> dict:
    scales, choices, texts = [], [], []
    for field in sorted(form.fields, key=lambda item: (item.sort_order or 0, item.id)):
        kind = field.field_type
        for prefix, virtual in (("__survey_rating__", "rating_1_5"), ("survey_rating_", "rating_1_5"),
                                ("__survey_nps__", "nps_0_10"), ("survey_nps_", "nps_0_10")):
            if field.field_key.startswith(prefix):
                kind = virtual
        if "|||META:" in (field.help_text or ""):
            try:
                meta = json.loads(field.help_text.split("|||META:")[1])
                if meta.get("survey") in {"rating_1_5", "nps_0_10"}:
                    kind = meta["survey"]
            except (ValueError, TypeError, AttributeError):
                pass
        entry = {"key": field.field_key, "label": field.label,
                 "options": [str(value) for value in (field.options_json or [])],
                 "counts": {str(value): 0 for value in (field.options_json or [])}, "total": 0, "max": 0,
                 "kind": kind}
        if kind in {"rating_1_5", "nps_0_10"}:
            scales.append(entry)
        elif kind in {"radio", "checkbox", "select"}:
            choices.append(entry)
        elif kind in {"short_text", "long_text"} and not field.field_key.startswith("__"):
            texts.append(entry)
    totals = {"rating_1_5": [0.0, 0], "nps_0_10": [0.0, 0]}
    count, comment_count, comments = 0, 0, []
    rows = db.query(FormSubmission.id, FormSubmission.submitted_at, FormSubmission.payload_json).filter(
        FormSubmission.form_id == form.id
    ).order_by(FormSubmission.submitted_at.desc(), FormSubmission.id.desc()).yield_per(500)
    for submission_id, submitted_at, payload in rows:
        count += 1
        payload = payload or {}
        for stat in scales + choices:
            value = payload.get(stat["key"])
            if stat in scales:
                # Preserve JS Number(null/empty) semantics used by the previous UI.
                try:
                    numeric = float(0 if value is None or value == "" else value) if stat["key"] in payload else math.nan
                    if math.isfinite(numeric):
                        totals[stat["kind"]][0] += numeric
                        totals[stat["kind"]][1] += 1
                except (ValueError, TypeError):
                    pass
                values = [] if value is None or value == "" else [str(value)]
            else:
                values = [str(item) for item in value] if isinstance(value, list) else ([str(value)] if value else [])
            for option in values:
                stat["counts"][option] = stat["counts"].get(option, 0) + 1
                stat["total"] += 1
        for stat in texts:
            value = str(payload.get(stat["key"]) or "").strip()
            if value:
                comment_count += 1
                if len(comments) < 12:
                    comments.append({"key": f"{submission_id}-{stat['key']}", "label": stat["label"],
                                     "value": value, "submittedAt": submitted_at.isoformat() if submitted_at else None})
    for stat in scales + choices:
        stat["max"] = max(stat["counts"].values(), default=0)
        stat.pop("kind")
    average = lambda kind: totals[kind][0] / totals[kind][1] if totals[kind][1] else None
    return {"total": count, "ratingAverage": average("rating_1_5"), "npsAverage": average("nps_0_10"),
            "scaleStats": scales, "choiceStats": choices, "comments": comments, "commentCount": comment_count,
            "responseRateLabel": "1 risposta ricevuta" if count == 1 else f"{count} risposte ricevute"}

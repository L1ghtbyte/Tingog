"""
Event-triggered mode. All detection is deterministic engine output, never an LLM
judgment (same reasoning as severity scoring itself: a decision that could shape where
limited response attention goes must be reproducible and explainable). Alert messages
are plain deterministic templates too — the critical-path notification must not depend
on an LLM call succeeding.

Four watched conditions, each firing only on the TRANSITION into the condition, not on
every recompute while it's still true:
  - high_severity — a purok newly crosses into severity="high"
  - de_escalation  — a purok newly drops OUT of severity="high" (a coordinator who
                      dispatched attention based on the original alert has no other way
                      to learn it resolved)
  - panic_press    — a purok newly crosses the panic-press threshold, independent of
                      overall severity. 03_inference_rules_spec.md calls this rule
                      trustworthy on its own regardless of which buttons were hit — it
                      deserves to bypass the general severity threshold, not wait for
                      enough other factors to combine past 60
  - new_cluster    — multiple independent puroks newly reporting the same need close
                      together in time. The spec's own framing treats this as the
                      strongest signal available, arguably more urgent to push
                      instantly than any single purok's severity
"""

import logging

import httpx
from sqlalchemy.orm import Session

from app import config
from app.clustering import get_active_clusters
from app.crud import create_escalation_record
from app.inference import recompute_purok
from app.models import EscalationRecord, Purok

logger = logging.getLogger("tanaw.escalation")

# In-memory, process-local — resets on restart, same accepted tradeoff as other
# lightweight state in this project (e.g. the pre-fix ingestion seq_num). A missed
# cluster right after a restart self-corrects on the next sweep that finds it still new.
_last_seen_cluster_keys: set[tuple] = set()


def _is_panic(purok: Purok) -> bool:
    return purok.distinct_buttons_15min >= config.PANIC_PRESS_DISTINCT_BUTTONS


def recompute_and_detect_escalations(db: Session, purok: Purok) -> list[EscalationRecord]:
    """Sync — wraps recompute_purok with before/after transition detection across all
    three per-purok conditions. A single event can fire more than one (e.g. a panic
    press that also happens to push severity over the high threshold)."""
    was_high = purok.severity == "high"
    was_panic = _is_panic(purok)

    recompute_purok(db, purok)

    records: list[EscalationRecord] = []

    now_panic = _is_panic(purok)
    if now_panic and not was_panic:
        records.append(
            create_escalation_record(
                db,
                kind="panic_press",
                message=f"Tingog ALERT: {purok.name} - multiple different buttons pressed rapidly (panic-press pattern).",
                purok_id=purok.id,
                purok_name=purok.name,
                reasons=["multiple different buttons pressed rapidly"],
            )
        )

    now_high = purok.severity == "high"
    if now_high and not was_high:
        reasons = ", ".join(purok.severity_reasons) if purok.severity_reasons else "no reasons recorded"
        records.append(
            create_escalation_record(
                db,
                kind="high_severity",
                message=f"Tingog ALERT: {purok.name} just reached HIGH severity - {reasons}.",
                purok_id=purok.id,
                purok_name=purok.name,
                reasons=purok.severity_reasons,
            )
        )
    elif was_high and not now_high:
        records.append(
            create_escalation_record(
                db,
                kind="de_escalation",
                message=f"Tingog UPDATE: {purok.name} is no longer high severity.",
                purok_id=purok.id,
                purok_name=purok.name,
                reasons=purok.severity_reasons,
            )
        )

    return records


def _cluster_key(cluster: dict) -> tuple:
    return (cluster["need_type"], frozenset(cluster["puroks"]))


def detect_new_clusters(db: Session) -> list[EscalationRecord]:
    """Global, not per-purok — a cluster spans multiple puroks by definition. Compares
    the current set of active clusters against what was seen last check; only a
    genuinely NEW cluster key (need type + exact set of puroks) fires."""
    global _last_seen_cluster_keys

    clusters = get_active_clusters(db)
    current_keys = {_cluster_key(c) for c in clusters}
    new_keys = current_keys - _last_seen_cluster_keys

    records = []
    for cluster in clusters:
        if _cluster_key(cluster) not in new_keys:
            continue
        puroks_text = ", ".join(cluster["puroks"])
        message = (
            f"Tingog ALERT: New cluster - {cluster['need_type']} reported by "
            f"{puroks_text} within {cluster['window_minutes']} minutes."
        )
        records.append(
            create_escalation_record(
                db,
                kind="new_cluster",
                message=message,
                purok_id=None,  # spans multiple puroks — no single FK target
                purok_name=puroks_text,
                reasons=[cluster["need_type"]],
            )
        )

    _last_seen_cluster_keys = current_keys
    return records


async def deliver_webhook(db: Session, record: EscalationRecord) -> None:
    if not config.ESCALATION_WEBHOOK_URL:
        return
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(config.ESCALATION_WEBHOOK_URL, json={"text": record.message})
            resp.raise_for_status()
        record.webhook_delivered = True
        db.commit()
    except httpx.HTTPError as exc:
        logger.warning("Escalation webhook delivery failed: %s", exc)

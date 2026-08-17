from datetime import timedelta

from sqlalchemy.orm import Session

from app import config
from app.models import Event, Purok

NEED_BUTTONS = {"TABANG", "TUBIG", "TAMBAL", "PAGKAON"}


def _needs_for_event(event: Event) -> set[str]:
    buttons = event.combo_buttons if event.button == "COMBO" else [event.button]
    return {b for b in (buttons or []) if b in NEED_BUTTONS}


def get_active_clusters(db: Session) -> list[dict]:
    """
    Groups need-type events across DIFFERENT puroks within a rolling window. A cluster
    requires >=2 distinct puroks — never multiple presses from the same purok, which is
    a severity signal (see inference.py), not a cluster.

    Computed on demand each call, not cached — avoids a whole class of invalidation bugs
    for a dataset this small.
    """
    events = db.query(Event).order_by(Event.received_at.asc()).all()
    rows = []
    for event in events:
        needs = _needs_for_event(event)
        if needs:
            rows.append((event, needs))

    puroks_by_id = {p.id: p for p in db.query(Purok).all()}
    window = timedelta(minutes=config.CLUSTER_WINDOW_MINUTES)

    clusters = []
    cluster_id = 1
    i = 0
    n = len(rows)
    while i < n:
        j = i
        while j + 1 < n and (rows[j + 1][0].received_at - rows[i][0].received_at) <= window:
            j += 1
        window_rows = rows[i : j + 1]

        # Found live 2026-08-17: grouping by "any need, any purok" first and only
        # checking need uniformity afterward let a purok's own SECOND, unrelated need
        # (e.g. a TAMBAL press) corrupt an otherwise-clean same-need cluster into
        # "mixed" — even though only ONE purok ever reported that second need. A
        # cluster is meant to signal "multiple communities converging on the same
        # need," so it must be computed per need type: which DISTINCT puroks reported
        # THAT specific need within the window. "mixed" is now reserved for a genuine
        # case — more than one need type each independently reaching CLUSTER_MIN_PUROKS
        # distinct puroks — not an artifact of one purok pressing two different buttons.
        puroks_by_need: dict[str, set[int]] = {}
        for event, needs in window_rows:
            for need in needs:
                puroks_by_need.setdefault(need, set()).add(event.purok_id)

        qualifying_needs = {need: pids for need, pids in puroks_by_need.items() if len(pids) >= config.CLUSTER_MIN_PUROKS}

        if qualifying_needs:
            if len(qualifying_needs) == 1:
                need_type, distinct_purok_ids = next(iter(qualifying_needs.items()))
            else:
                need_type = "mixed"
                distinct_purok_ids = set().union(*qualifying_needs.values())

            span_minutes = (window_rows[-1][0].received_at - window_rows[0][0].received_at).total_seconds() / 60
            # Confidence heuristic — not a validated model, same "crude placeholder"
            # status as the anomaly rule: more independent puroks in a tighter window
            # reads as more confident, capped for sanity.
            confidence = min(95, 40 + 15 * (len(distinct_purok_ids) - config.CLUSTER_MIN_PUROKS))

            clusters.append(
                {
                    "cluster_id": cluster_id,
                    "need_type": need_type,
                    "puroks": [puroks_by_id[pid].name for pid in distinct_purok_ids if pid in puroks_by_id],
                    "window_minutes": round(span_minutes, 1),
                    "confidence": confidence,
                }
            )
            cluster_id += 1
            i = j + 1
        else:
            i += 1

    return clusters

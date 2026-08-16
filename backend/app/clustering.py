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
        distinct_purok_ids = {r[0].purok_id for r in window_rows}

        if len(distinct_purok_ids) >= config.CLUSTER_MIN_PUROKS:
            all_needs: set[str] = set()
            for _event, needs in window_rows:
                all_needs |= needs
            need_type = next(iter(all_needs)) if len(all_needs) == 1 else "mixed"

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

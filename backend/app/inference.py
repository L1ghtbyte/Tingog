from datetime import timedelta

from sqlalchemy.orm import Session

from app import config
from app.models import DeliveryRecord, Event, Purok
from app.timeutil import utcnow

NEED_BUTTONS = {"TABANG", "TUBIG", "TAMBAL", "PAGKAON"}


# ---------------------------------------------------------------------------
# Pure functions — no DB access, unit-testable with hand-built scalar inputs.
# ---------------------------------------------------------------------------


def compute_severity(
    hours_since_last_event: float,
    neighboring_silent: bool,
    last_press_type: str | None,
    last_press_buttons: list[str],
    distinct_buttons_15min: int,
) -> tuple[int, str, list[str]]:
    # Caller must guard: this assumes hours_since_last_event is a real number.
    # A purok with zero events has no "hours since last event" — recompute_purok
    # skips this function entirely rather than passing None in (see below).
    score = 0
    reasons: list[str] = []

    if hours_since_last_event > config.SILENCE_HOURS_WARN:
        score += 30
        reasons.append("no contact in over 6h")
    if hours_since_last_event > config.SILENCE_HOURS_CRITICAL:
        score += 30
        reasons.append("no contact in over 12h")
    if neighboring_silent:
        score += 20
        reasons.append("neighboring puroks also quiet")
    if last_press_type == "hold" and "TABANG" in last_press_buttons:
        score += 40
        reasons.append("last press was a held TABANG")
    if distinct_buttons_15min >= config.PANIC_PRESS_DISTINCT_BUTTONS:
        score += 40
        reasons.append("multiple different buttons pressed rapidly")

    severity = (
        "high"
        if score >= config.SEVERITY_HIGH_CUTOFF
        else "medium"
        if score >= config.SEVERITY_MEDIUM_CUTOFF
        else "low"
    )
    return score, severity, reasons


def compute_status(hours_since_last_event: float | None, last_event_button: str | None, severity: str) -> str:
    # Checks "was there a RECENT LUWAS" (its own branch below) instead of "was there
    # EVER a LUWAS" — a single stale LUWAS must not permanently block this purok from
    # ever reaching "unknown" again, which is the same silence-as-good-news asymmetry
    # this project's honesty constraints exist to prevent.
    if hours_since_last_event is None:
        return "unknown"
    if last_event_button == "LUWAS" and hours_since_last_event < config.STABLE_LUWAS_HOURS:
        return "stable"
    if hours_since_last_event > config.STATUS_UNKNOWN_HOURS:
        return "unknown"
    if severity in ("medium", "high"):
        return "attention"
    return "stable"


# ---------------------------------------------------------------------------
# DB-facing helpers — gather scalar inputs for the pure functions above.
# ---------------------------------------------------------------------------


def get_hours_since_last_event(db: Session, purok: Purok) -> float | None:
    last_event = db.query(Event).filter(Event.purok_id == purok.id).order_by(Event.received_at.desc()).first()
    if last_event is None:
        return None
    delta = utcnow() - last_event.received_at
    return delta.total_seconds() / 3600


def compute_neighboring_silent(db: Session, purok: Purok) -> bool:
    others = db.query(Purok).filter(Purok.barangay == purok.barangay, Purok.id != purok.id).all()
    if not others:
        return False  # nothing to compare against — vacuously not "silent neighbors"

    silent_count = 0
    for other in others:
        other_hours = get_hours_since_last_event(db, other)
        if other_hours is None or other_hours > config.SILENCE_HOURS_WARN:
            silent_count += 1  # zero-event puroks count as silent, same as long-quiet ones
    return silent_count > len(others) / 2


def get_last_press_info(db: Session, purok: Purok) -> tuple[str, list[str], str]:
    last_event = db.query(Event).filter(Event.purok_id == purok.id).order_by(Event.received_at.desc()).first()
    last_press_buttons = last_event.combo_buttons if last_event.button == "COMBO" else [last_event.button]
    return last_event.press_type, (last_press_buttons or []), last_event.button


def count_distinct_buttons(db: Session, purok: Purok, minutes: int) -> int:
    since = utcnow() - timedelta(minutes=minutes)
    events = (
        db.query(Event.button, Event.combo_buttons)
        .filter(Event.purok_id == purok.id, Event.received_at >= since)
        .all()
    )
    distinct: set[str] = set()
    for button, combo_buttons in events:
        if button == "COMBO":
            distinct.update(combo_buttons or [])
        else:
            distinct.add(button)
    return len(distinct)


def compute_active_needs(db: Session, purok: Purok) -> list[str]:
    # Two independent clear signals, merged into one chronological timeline: a LUWAS
    # press is the purok's own all-or-nothing self-report ("we're fine now"), a
    # DeliveryRecord is a coordinator's targeted confirmation ("this specific item was
    # actually delivered"). Interleaving by timestamp (rather than applying deliveries
    # as a separate pass afterward) matters — a need pressed AFTER a delivery for that
    # same item must stay active, not get wiped by an earlier delivery.
    events = db.query(Event).filter(Event.purok_id == purok.id).all()
    deliveries = db.query(DeliveryRecord).filter(DeliveryRecord.purok_id == purok.id).all()

    timeline = [(e.received_at, "event", e) for e in events] + [
        (d.delivered_at, "delivery", d) for d in deliveries
    ]
    timeline.sort(key=lambda item: item[0])

    needs: set[str] = set()
    for _timestamp, kind, record in timeline:
        if kind == "event":
            buttons = record.combo_buttons if record.button == "COMBO" else [record.button]
            buttons = buttons or []
            if "LUWAS" in buttons:
                needs.clear()
            needs.update(b for b in buttons if b in NEED_BUTTONS)
        else:
            needs.difference_update(record.items)
    return sorted(needs)


# ---------------------------------------------------------------------------
# Orchestration — called after every new event, and by the periodic sweep.
# ---------------------------------------------------------------------------


def recompute_purok(db: Session, purok: Purok) -> None:
    hours_since_last_event = get_hours_since_last_event(db, purok)

    if hours_since_last_event is None:
        # Guarded explicitly: without this, the periodic sweep would throw TypeError
        # comparing None > int inside compute_severity for any purok with no events yet
        # (e.g. the real device's row, which exists from startup). That exception would
        # happen inside a background asyncio task and fail silently — the process keeps
        # running, but the sweep (the only mechanism that catches a purok going silent
        # with no new events) quietly stops.
        purok.severity = "low"
        purok.severity_reasons = []
        purok.status = "unknown"
        purok.active_needs = []
        purok.distinct_buttons_15min = 0
        db.commit()
        return

    neighboring_silent = compute_neighboring_silent(db, purok)
    last_press_type, last_press_buttons, last_event_button = get_last_press_info(db, purok)
    distinct_buttons_15min = count_distinct_buttons(db, purok, minutes=config.PANIC_PRESS_WINDOW_MINUTES)

    _score, severity, reasons = compute_severity(
        hours_since_last_event, neighboring_silent, last_press_type, last_press_buttons, distinct_buttons_15min
    )
    status = compute_status(hours_since_last_event, last_event_button, severity)

    purok.severity = severity
    purok.severity_reasons = reasons
    purok.status = status
    purok.distinct_buttons_15min = distinct_buttons_15min
    purok.active_needs = compute_active_needs(db, purok)
    db.commit()

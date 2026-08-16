from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app import config
from app.crud import insert_event_idempotent
from app.escalation import detect_new_clusters, recompute_and_detect_escalations
from app.models import Event, Purok
from app.timeutil import utcnow

# Barangay is confirmed (config.BARANGAY_NAME = "Lambusan", real centroid coordinates).
# STILL PLACEHOLDER: the offsets below are arbitrary small displacements, not real
# purok-level placements — all puroks are numbered subdivisions within Lambusan
# (config.BARANGAY_NAME), not named after other barangays. Replace these offsets with
# real placements from the teammate who lived through the San Remigio earthquake before
# the actual demo.
#
# (device_id, name, lat_offset, lng_offset, scenario)
SIMULATED_PUROKS = [
    ("101", "Purok 1", +0.003, -0.002, "cluster"),
    ("102", "Purok 2", +0.005, +0.001, "cluster"),
    ("103", "Purok 3", -0.002, +0.004, "cluster"),
    ("104", "Purok 4", -0.004, -0.003, "unaccounted"),
    ("105", "Purok 5", +0.001, +0.001, "stable"),
    ("106", "Purok 6", -0.005, +0.002, "ordinary"),
]


def _make_purok(index: int, device_id: str, name: str, lat_offset: float, lng_offset: float) -> Purok:
    return Purok(
        device_id=device_id,
        name=name,
        barangay=config.BARANGAY_NAME,
        purok_leader=f"{name} Leader (TBD)",  # reasonable hackathon placeholder, not a fabricated identity
        latitude=config.BARANGAY_CENTER_LAT + lat_offset,
        longitude=config.BARANGAY_CENTER_LNG + lng_offset,
        is_simulated=True,
        # Varies the mock baseline count across simulated puroks — uses the list index,
        # not device_id (now a string, no longer usable in a modulo), purely to keep the
        # mock values non-uniform.
        baseline_vulnerable_count=min(3, max(0, index % 4)),
        active_needs=[],
        distinct_buttons_15min=0,
        status="unknown",
        severity="low",
        severity_reasons=[],
    )


def _seed_events_for_scenario(db: Session, purok: Purok, scenario: str, now: datetime) -> None:
    # All timestamps computed relative to `now` (execution time), not hardcoded
    # absolutes — this is what actually makes "safe to re-run" true. A hardcoded
    # absolute timestamp would silently go stale the second time seeding runs.
    seq = 1
    if scenario == "cluster":
        # Staggered offset per purok so the 3 cluster puroks land at different points
        # within the 45-minute window, not all at once. Uses purok.id (the real, always-
        # numeric primary key) rather than device_id, which is a string now.
        offset_minutes = 10 + (purok.id % 3) * 7
        insert_event_idempotent(
            db, purok.device_id, seq, "TUBIG", None, "single", None, purok.id,
            is_simulated=True, received_at=now - timedelta(minutes=offset_minutes),
        )
    elif scenario == "unaccounted":
        insert_event_idempotent(
            db, purok.device_id, seq, "TABANG", None, "hold", None, purok.id,
            is_simulated=True, received_at=now - timedelta(hours=14),
        )
    elif scenario == "stable":
        insert_event_idempotent(
            db, purok.device_id, seq, "LUWAS", None, "single", None, purok.id,
            is_simulated=True, received_at=now - timedelta(minutes=20),
        )
    elif scenario == "ordinary":
        insert_event_idempotent(
            db, purok.device_id, seq, "TUBIG", None, "single", None, purok.id,
            is_simulated=True, received_at=now - timedelta(hours=2),
        )


def run_seed(db: Session) -> list[Purok]:
    """Clears existing simulated puroks/events and reinserts — safe to call repeatedly
    during dev without producing duplicate junk."""
    simulated_purok_ids = [p.id for p in db.query(Purok).filter(Purok.is_simulated.is_(True)).all()]
    if simulated_purok_ids:
        db.query(Event).filter(Event.purok_id.in_(simulated_purok_ids)).delete(synchronize_session=False)
        db.query(Purok).filter(Purok.id.in_(simulated_purok_ids)).delete(synchronize_session=False)
        db.commit()

    now = utcnow()
    created = []
    for index, (device_id, name, lat_offset, lng_offset, scenario) in enumerate(SIMULATED_PUROKS):
        purok = _make_purok(index, device_id, name, lat_offset, lng_offset)
        db.add(purok)
        db.commit()
        db.refresh(purok)

        _seed_events_for_scenario(db, purok, scenario, now)
        created.append(purok)

    # Recompute AFTER every purok/event exists, not per-purok-as-created — otherwise
    # earlier puroks' neighboring_silent (and any other cross-purok signal) reflects an
    # incomplete sibling set from mid-seeding, not the final state. Would self-correct
    # within one severity-sweep interval regardless, but no reason to show a
    # momentarily-wrong reason right after seeding when a second pass is this cheap.
    #
    # Uses the escalation-aware recompute (not the plain one) so the seeded
    # "unaccounted" scenario produces a real, checkable escalation record immediately —
    # deliberately skips webhook delivery here though: seeding is demo SETUP, not a
    # live event, and pushing a real notification for synthetic data would be
    # confusing/noisy for anyone actually watching the webhook channel.
    for purok in created:
        recompute_and_detect_escalations(db, purok)
    detect_new_clusters(db)

    return created
